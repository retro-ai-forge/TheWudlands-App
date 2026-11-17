"""
Trade market: barter between players (rules in data/market-rules.json).

A seller picks goods from a character's home and asks for one thing back
(an item id, a count and, for condition-tracked items, a minimum
condition). Posting holds the goods out of the home in the offer doc
(`market_offers`); another player accepts by paying the ask from their own
character's home. The ask can be paid with the asked tier or any higher
one of the same family - exact tier first, like crafting ingredients
(players._ingredient_tier_ids) - and the seller gets what was actually paid.

Goods (paid ask, cancelled or expired offer) go to the seller's character's
home; if that character is gone, to the home of the character now in the
same soul slot; with the slot empty, to the vault (_deliver).

Home only: a character on an adventure can't post or accept - camp loot is
thrown away at the adventure's end and must not leave through the market.

Clean-up: an offer lasts `offerDays`; overdue open offers are swept lazily
(no background job on Cloud Run) by every market request, which sends the
goods back. Nothing is deleted automatically: a sold, cancelled or expired
offer stays in "My offers" until its seller deletes it, and takes one of the
`maxOpenOffers` slots until then (SLOT_STATUSES).

Every flow that writes runs in one transaction (backend.db.transactional);
the open -> closed status change is an update_one checked on its
modified_count (reliable on Firestore, see CLAUDE.md), so two buyers - or a
buyer and a cancel - never both get the offer.
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional

from backend import item_condition, items_catalog, players
from backend.db import get_database, transactional

RULES = json.loads((Path(__file__).parent / "data" / "market-rules.json").read_text())
OFFER_DAYS: int = int(RULES["offerDays"])
MAX_OPEN_OFFERS: int = int(RULES["maxOpenOffers"])
MAX_ASK_QTY: int = int(RULES["maxAskQty"])
PAGE_SIZE: int = int(RULES["pageSize"])
PAGES_AHEAD: int = int(RULES["pagesAhead"])
SWEEP_BATCH: int = int(RULES["sweepBatch"])

OPEN, TAKEN, CANCELLED, EXPIRED = "open", "taken", "cancelled", "expired"
# Closed offers - each stays in "My offers" until the seller deletes it.
CLOSED_STATUSES = (TAKEN, CANCELLED, EXPIRED)
# Offers that take one of the player's MAX_OPEN_OFFERS slots: all of them.
SLOT_STATUSES = (OPEN, *CLOSED_STATUSES)


class MarketRefused(ValueError):
    """A refusal to show the player (HTTP 400)."""


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime) -> datetime:
    """Motor hands dates back naive (UTC) unless the client is tz-aware."""
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _entry(item_id: str):
    return items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(item_id)


def _instance_level(instance: dict) -> int:
    level = item_condition.level(instance.get("quality"))
    return item_condition.NEW if level is None else level


def _closing(status: str, now: datetime) -> dict:
    """Closing fields. A closed offer stays until its seller deletes it,
    and keeps its slot until then (SLOT_STATUSES)."""
    return {"status": status, "closedAt": now}


async def _character(db, address: str, character_id: str) -> Optional[dict]:
    return await db.characters.find_one({"address": address, "id": character_id})


def _at_home(character: dict) -> None:
    if (character.get("availability") or {}).get("inAdventure", False):
        raise MarketRefused("Only at home - not while on an adventure")


# ── Delivery: home -> same soul slot -> vault ───────────────────────────────

async def _delivery_target(db, address: str, character_id: str, slot: int) -> Optional[str]:
    """The character whose home receives goods for (address, character_id),
    or None for the vault."""
    if await _character(db, address, character_id) is not None:
        return character_id
    if slot and slot > 0:
        cursor = db.characters.find({"address": address, "slotNumber": slot}, {"id": 1})
        holders = [doc["id"] async for doc in cursor]
        if len(holders) == 1:
            return holders[0]
    return None


async def _deliver(db, address: str, character_id: str, slot: int, items: List[dict], balances: Dict[str, int]) -> None:
    target = await _delivery_target(db, address, character_id, slot)
    if target is not None:
        home_items = [{**i, "location": "home", "slotRef": []} for i in items]
        await players._push_storage_items(db, "home", address, target, home_items)
        await players._inc_storage_balances(db, "home", address, target, balances)
        return
    pool_items = [{**i, "location": "pool", "slotRef": []} for i in items]
    if pool_items:
        await db.player_vaults.update_one(
            {"address": address}, {"$push": {"items": {"$each": pool_items}}}, upsert=True
        )
    await players._inc_vault_itembalances(db, address, balances)


# ── Create / cancel / accept ────────────────────────────────────────────────

def _check_ask(ask: dict) -> dict:
    item_id = str(ask.get("itemId") or "")
    entry = _entry(item_id)
    if entry is None:
        raise MarketRefused("Unknown item asked for")
    try:
        qty = int(ask.get("qty") or 0)
    except (TypeError, ValueError):
        qty = 0
    if qty <= 0 or qty > MAX_ASK_QTY:
        raise MarketRefused(f"Ask for 1 to {MAX_ASK_QTY}")
    line = {"itemId": item_id, "familyId": entry.family_id, "tier": entry.tier, "qty": qty, "minCondition": None}
    if players._is_tracked_item(item_id):
        min_condition = int(ask.get("minCondition") or item_condition.BROKEN)
        if not item_condition.BROKEN <= min_condition <= item_condition.NEW:
            raise MarketRefused("Unknown condition")
        line["minCondition"] = min_condition
    return line


@transactional
async def create_offer(
    address: str,
    character_id: str,
    instance_ids: List[str],
    balances: Dict[str, int],
    ask: dict,
) -> Optional[dict]:
    """Holds the given goods out of the character's home in a new offer.
    Returns the offer (public shape), None if the character doesn't exist."""
    db = get_database()
    character = await _character(db, address, character_id)
    if character is None:
        return None
    _at_home(character)
    line = _check_ask(ask)
    wanted_instances = list(dict.fromkeys(instance_ids or []))
    wanted_balances = {k: int(q) for k, q in (balances or {}).items() if int(q) > 0}
    if not wanted_instances and not wanted_balances:
        raise MarketRefused("Choose something to offer")
    # Sold, cancelled and expired offers count too until the player deletes them.
    held = await db.market_offers.count_documents({"sellerAddress": address, "status": {"$in": list(SLOT_STATUSES)}})
    if held >= MAX_OPEN_OFFERS:
        raise MarketRefused(f"At most {MAX_OPEN_OFFERS} offers - delete closed ones to make room")

    home = await players._storage_coll(db, "home").find_one(players._storage_filter(address, character_id))
    chosen_iids, chosen_balances = players._storage_selection(home, wanted_instances, wanted_balances)
    if len(chosen_iids) != len(wanted_instances) or chosen_balances != wanted_balances:
        raise MarketRefused("Some of these goods are no longer at home")
    for item_id in chosen_balances:
        if _entry(item_id) is None:
            raise MarketRefused("This can't be traded")

    held_items = (home or {}).get("items", [])
    give_items = [i for i in held_items if i["instanceId"] in chosen_iids]
    if give_items:
        await players._set_storage_items(
            db, "home", address, character_id, [i for i in held_items if i["instanceId"] not in chosen_iids]
        )
    if chosen_balances:
        await players._inc_storage_balances(
            db, "home", address, character_id, {k: -q for k, q in chosen_balances.items()}
        )

    now = _now()
    give_ids = sorted({i["itemId"] for i in give_items} | set(chosen_balances))
    offer = {
        "_id": uuid.uuid4().hex,
        "status": OPEN,
        "sellerAddress": address,
        "sellerCharacterId": character_id,
        "sellerSlot": int(character.get("slotNumber") or 0),
        "sellerName": f"{character.get('firstName', '')} {character.get('lastName', '')}".strip(),
        "give": {"items": give_items, "balances": chosen_balances},
        "ask": [line],
        "giveIds": give_ids,
        "giveFamilies": sorted({_entry(i).family_id for i in give_ids if _entry(i)}),
        "giveTiers": sorted({_entry(i).tier for i in give_ids if _entry(i)}),
        "askIds": [line["itemId"]],
        "askFamilies": [line["familyId"]],
        "createdAt": now,
        "expiresAt": now + timedelta(days=OFFER_DAYS),
    }
    await db.market_offers.insert_one(offer)
    return public_offer(offer, address)


@transactional
async def cancel_offer(address: str, offer_id: str) -> Optional[bool]:
    """The seller takes an open offer back; the goods are delivered home.
    None when it's not theirs or no longer open."""
    db = get_database()
    offer = await db.market_offers.find_one({"_id": offer_id, "sellerAddress": address, "status": OPEN})
    if offer is None:
        return None
    res = await db.market_offers.update_one(
        {"_id": offer_id, "status": OPEN}, {"$set": _closing(CANCELLED, _now())}
    )
    if res.modified_count != 1:
        return None
    await _deliver(db, address, offer["sellerCharacterId"], offer.get("sellerSlot", 0),
                   offer["give"]["items"], offer["give"]["balances"])
    return True


async def delete_closed_offer(address: str, offer_id: str) -> bool:
    """The seller clears a sold, cancelled or expired offer from their list,
    freeing its slot. Only the record goes - the goods were delivered when
    it closed."""
    db = get_database()
    res = await db.market_offers.delete_one(
        {"_id": offer_id, "sellerAddress": address, "status": {"$in": list(CLOSED_STATUSES)}}
    )
    return res.deleted_count == 1


def _take_payment(line: dict, home: dict) -> tuple:
    """What the buyer's home pays for one ask line: (instances, {id: qty}).
    Asked tier first, then higher ones; raises MarketRefused when short."""
    ids = players._ingredient_tier_ids(line["familyId"], line["tier"])
    if line.get("minCondition") is not None:
        allowed = set(ids)
        candidates = [
            i for i in home.get("items", [])
            if i.get("itemId") in allowed and _instance_level(i) >= line["minCondition"]
        ]
        candidates.sort(key=lambda i: (ids.index(i["itemId"]), _instance_level(i)))
        if len(candidates) < line["qty"]:
            raise MarketRefused("Not enough of what's asked at home")
        return candidates[: line["qty"]], {}
    parts = players._take_across_tiers(ids, line["qty"], home.get("itemBalances", {}), {})
    if parts is None:
        raise MarketRefused("Not enough of what's asked at home")
    return [], {concrete: from_home for concrete, from_home, _ in parts if from_home}


@transactional
async def accept_offer(address: str, character_id: str, offer_id: str) -> Optional[bool]:
    """The buyer's character pays the ask from home and gets the goods home.
    None when the offer is gone, taken or expired (or the character is)."""
    db = get_database()
    character = await _character(db, address, character_id)
    if character is None:
        return None
    _at_home(character)
    now = _now()
    offer = await db.market_offers.find_one({"_id": offer_id, "status": OPEN})
    if offer is None or _aware(offer["expiresAt"]) <= now:
        return None
    if offer["sellerAddress"] == address:
        raise MarketRefused("That's your own offer")

    home = await players._storage_coll(db, "home").find_one(players._storage_filter(address, character_id)) or {}
    paid_items: List[dict] = []
    paid_balances: Dict[str, int] = {}
    for line in offer["ask"]:
        items, balances = _take_payment(line, home)
        paid_items += items
        for k, q in balances.items():
            paid_balances[k] = paid_balances.get(k, 0) + q

    res = await db.market_offers.update_one(
        {"_id": offer_id, "status": OPEN},
        {"$set": {
            **_closing(TAKEN, now),
            "buyerAddress": address,
            "buyerCharacterId": character_id,
            "paid": {"items": paid_items, "balances": paid_balances},
        }},
    )
    if res.modified_count != 1:
        return None

    if paid_items:
        await players._pull_storage_items(db, "home", address, character_id, [i["instanceId"] for i in paid_items])
    await players._inc_storage_balances(db, "home", address, character_id, {k: -q for k, q in paid_balances.items()})
    await players._push_storage_items(
        db, "home", address, character_id,
        [{**i, "location": "home", "slotRef": []} for i in offer["give"]["items"]],
    )
    await players._inc_storage_balances(db, "home", address, character_id, offer["give"]["balances"])
    await _deliver(db, offer["sellerAddress"], offer["sellerCharacterId"], offer.get("sellerSlot", 0),
                   paid_items, paid_balances)
    return True


# ── Expiry sweep ────────────────────────────────────────────────────────────

@transactional
async def _expire_one(offer_id: str) -> Optional[bool]:
    db = get_database()
    now = _now()
    offer = await db.market_offers.find_one({"_id": offer_id, "status": OPEN, "expiresAt": {"$lte": now}})
    if offer is None:
        return None
    res = await db.market_offers.update_one(
        {"_id": offer_id, "status": OPEN}, {"$set": _closing(EXPIRED, now)}
    )
    if res.modified_count != 1:
        return None
    await _deliver(db, offer["sellerAddress"], offer["sellerCharacterId"], offer.get("sellerSlot", 0),
                   offer["give"]["items"], offer["give"]["balances"])
    return True


async def sweep_expired(address: Optional[str] = None, limit: int = SWEEP_BATCH) -> int:
    """Returns the goods of up to `limit` overdue open offers (all sellers,
    or only `address`'s), oldest first. Each in its own transaction, so a
    lost race on one never blocks the rest. Returns how many were closed."""
    db = get_database()
    query: dict = {"status": OPEN, "expiresAt": {"$lte": _now()}}
    if address is not None:
        query["sellerAddress"] = address
    cursor = db.market_offers.find(query, {"_id": 1}).sort("expiresAt", 1).limit(limit)
    overdue = [doc["_id"] async for doc in cursor]
    closed = 0
    for offer_id in overdue:
        if await _expire_one(offer_id):
            closed += 1
    return closed


# ── Reads ───────────────────────────────────────────────────────────────────

def _public_instance(instance: dict) -> dict:
    return {
        "instanceId": instance["instanceId"],
        "itemId": instance["itemId"],
        "familyId": instance.get("familyId"),
        "quality": instance.get("quality"),
    }


def _iso(value) -> Optional[str]:
    return _aware(value).isoformat() if isinstance(value, datetime) else None


def public_offer(offer: dict, viewer: str) -> dict:
    """What the browser sees - no wallet addresses."""
    mine = offer["sellerAddress"] == viewer
    out = {
        "id": offer["_id"],
        "status": offer["status"],
        "mine": mine,
        "sellerName": offer.get("sellerName", ""),
        "give": {
            "items": [_public_instance(i) for i in offer["give"]["items"]],
            "balances": offer["give"]["balances"],
        },
        "ask": [
            {"itemId": a["itemId"], "qty": a["qty"], "minCondition": a.get("minCondition")}
            for a in offer["ask"]
        ],
        "createdAt": _iso(offer.get("createdAt")),
        "expiresAt": _iso(offer.get("expiresAt")),
        "closedAt": _iso(offer.get("closedAt")),
    }
    if mine and offer.get("paid"):
        out["paid"] = {
            "items": [_public_instance(i) for i in offer["paid"]["items"]],
            "balances": offer["paid"]["balances"],
        }
    return out


def _cursor(offer: dict) -> str:
    return f"{_aware(offer['createdAt']).isoformat()}|{offer['_id']}"


def _after_clause(cursor: str) -> Optional[dict]:
    """Matches the offers listed after `cursor`; None if it can't be read."""
    stamp, _, last_id = cursor.partition("|")
    try:
        at = datetime.fromisoformat(stamp)
    except ValueError:
        return None
    return {"$or": [{"createdAt": {"$lt": at}}, {"createdAt": at, "_id": {"$lt": last_id}}]}


async def list_offers(
    address: str,
    family_id: Optional[str] = None,
    after: Optional[str] = None,
    limit: int = PAGE_SIZE,
    tiers: Optional[List[int]] = None,
) -> dict:
    """Other players' open offers, newest first, `limit` per page. `family_id`
    keeps offers giving or asking that family; `tiers` keeps offers giving
    goods of one of those tiers; `after` is a cursor from an earlier answer.
    Returns {offers, next, pages}: `pages` holds the cursors of the following
    pages that exist (at most PAGES_AHEAD), `next` is the first of them."""
    db = get_database()
    clauses: List[dict] = [
        {"status": OPEN},
        {"expiresAt": {"$gt": _now()}},
        {"sellerAddress": {"$ne": address}},
    ]
    if family_id:
        clauses.append({"$or": [{"giveFamilies": family_id}, {"askFamilies": family_id}]})
    if tiers:
        clauses.append({"giveTiers": {"$in": list(tiers)}})
    order = [("createdAt", -1), ("_id", -1)]
    start = _after_clause(after) if after else None
    query = {"$and": clauses + ([start] if start else [])}
    page = [doc async for doc in db.market_offers.find(query).sort(order).limit(limit)]

    # Only the positions of the offers behind this page, to link the next pages.
    pages: List[str] = []
    if page and len(page) == limit:
        behind_query = {"$and": clauses + [_after_clause(_cursor(page[-1]))]}
        wanted = (PAGES_AHEAD - 1) * limit + 1
        cursor = db.market_offers.find(behind_query, {"createdAt": 1}).sort(order).limit(wanted)
        behind = [doc async for doc in cursor]
        # A page starts after the last offer of the one before it.
        ends = [page[-1]] + [behind[i * limit - 1] for i in range(1, PAGES_AHEAD) if i * limit <= len(behind)]
        pages = [_cursor(end) for i, end in enumerate(ends) if len(behind) > i * limit]
    return {
        "offers": [public_offer(d, address) for d in page],
        "next": pages[0] if pages else None,
        "pages": pages,
    }


async def my_offers(address: str) -> List[dict]:
    """The caller's open offers, then closed ones. Each carries the posting
    character (`seller`: id, name, portrait and face crop - null fields once
    that character is deleted), so the list can show whose offer it is."""
    db = get_database()
    cursor = db.market_offers.find({"sellerAddress": address}).sort("createdAt", -1).limit(MAX_OPEN_OFFERS + 50)
    docs = [doc async for doc in cursor]
    docs.sort(key=lambda d: d["status"] != OPEN)
    chars = {
        c["id"]: c
        async for c in db.characters.find(
            {"address": address}, {"id": 1, "firstName": 1, "portraitUrl": 1, "portraitFaceArea": 1}
        )
    }
    out = []
    for d in docs:
        offer = public_offer(d, address)
        c = chars.get(d["sellerCharacterId"])
        offer["seller"] = {
            "characterId": d["sellerCharacterId"],
            "name": (c or {}).get("firstName") or d.get("sellerName", ""),
            "portraitUrl": (c or {}).get("portraitUrl") or None,
            "portraitFaceArea": (c or {}).get("portraitFaceArea") or None,
        }
        out.append(offer)
    return out
