"""
Foraging: timed, profession-flavoured gathering trips that slowly drain a
finite per-slot resource pool.

Each soul slot gets exactly one forage pool, ever (the same once-per-slot rule
as the Trappings starter kit, see backend.soul_slots.has_claimed_starter_kit),
rolled when the slot's first character is created. The pool lives on the
slot, not the character: deleting the character keeps it, and a later
character in the same slot forages from whatever is left - but only from the
families its own professions cover (the rest lie dormant).

Pool size (data/foraging-rules.json):
    total = poolTotalBase x poolMultiplierByProfessionCount[n]   (1.0/1.2/1.5)
split across the character's UNIQUE resource families (union of
data/profession-resource-families.json over its profession categories), each
share randomly varied by +-poolVariation, the shares always summing to the
exact total.

Yield per trip, per family (`count` = trips already made to that family):
    reward = floor(base * 0.5 ** (count / halfLife)),  base = randint(min, max)
capped by what the family still holds. A family is exhausted once even the
lowest base roll would yield 0 (or nothing remains), so every trip a player
can start finds at least one unit. Each unit is rolled into a tier by the
character's profession count (1 -> T1 only, 2 -> T1-T2, 3 -> T1-T3).

Every return carries a sentence fitted to the material and place
(data/foraging-messages.json): "rich" while the family's pool is at least
half full, "thin" once more than half is gone, and "depleted" on the last
trip - the one after which the next trip would find nothing; that site is
then no longer shown or offered.

The finds are rolled when the trip is collected, not when it starts, so a
character deleted mid-trip takes nothing from the pool. They land in the
shared vault (player_vaults.itemBalances).
"""

from __future__ import annotations

import asyncio
import json
import math
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from pymongo import ReturnDocument

from backend.db import get_database
from backend.professions_catalog import PROFESSION_CATEGORIES
from backend.resources_catalog import PROFESSION_RESOURCE_FAMILIES

_DATA = Path(__file__).resolve().parent / "data"
RULES: dict = json.loads((_DATA / "foraging-rules.json").read_text())

POOL_TOTAL_BASE: int = RULES["poolTotalBase"]
POOL_MULTIPLIER: dict[int, float] = {int(k): v for k, v in RULES["poolMultiplierByProfessionCount"].items()}
POOL_VARIATION: float = RULES["poolVariation"]
BASE_YIELD_MIN: int = RULES["baseYieldMin"]
BASE_YIELD_MAX: int = RULES["baseYieldMax"]
HALF_LIFE: float = RULES["halfLife"]
DURATION_HOURS: float = RULES["durationHours"]
TIER_WEIGHTS: dict[int, dict[int, int]] = {
    int(n): {int(tier): w for tier, w in weights.items()}
    for n, weights in RULES["tierWeightsByProfessionCount"].items()
}


@dataclass(frozen=True)
class Mission:
    id: str
    group: str
    headline: str
    activity: str
    family_id: str
    name: str
    place: str
    text: str

    def to_dict(self) -> dict:
        return {"id": self.id, "group": self.group, "headline": self.headline, "activity": self.activity,
                "familyId": self.family_id, "name": self.name, "place": self.place, "text": self.text}


def _load_missions() -> dict[str, Mission]:
    data = json.loads((_DATA / "foraging-missions.json").read_text())
    missions: dict[str, Mission] = {}
    for group, entry in data.items():
        for m in entry["missions"]:
            missions[m["id"]] = Mission(id=m["id"], group=group, headline=entry["headline"],
                                        activity=entry["activities"][m["familyId"]],
                                        family_id=m["familyId"], name=m["name"], place=m["place"],
                                        text=m["text"])
    return missions


def _load_groups() -> dict[str, dict]:
    data = json.loads((_DATA / "foraging-missions.json").read_text())
    return {group: {"group": group, "headline": e["headline"], "activities": e["activities"]}
            for group, e in data.items()}


# Each profession group has a headline and one foraging name per resource
# family (e.g. Rural: "Fields, Folds & Fishponds" - Trapping/Hunting/
# Gleaning/Fishing); each mission has its own name (its headline) and text.
MISSIONS_BY_ID: dict[str, Mission] = _load_missions()
GROUPS: dict[str, dict] = _load_groups()

# Return sentences per family and outcome (data/foraging-messages.json).
_MESSAGES: dict = json.loads((_DATA / "foraging-messages.json").read_text())
DEPLETED_HINT: str = _MESSAGES["depletedHint"]
MESSAGES_BY_FAMILY: dict[str, dict[str, list[str]]] = _MESSAGES["families"]


class ForagingError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


# ── Pure rules ──────────────────────────────────────────────────────────


def chosen_professions(profession_ids: list[str]) -> list[str]:
    """The real professions among (up to) three slots - blanks/"none" dropped."""
    return [p for p in profession_ids if p and p != "none"]


def character_profession_ids(doc: dict) -> list[str]:
    prof = doc.get("profession") or {}
    return chosen_professions([prof.get("prof1"), prof.get("prof2"), prof.get("prof3")])


def profession_groups(profession_ids: list[str]) -> list[str]:
    """Distinct profession categories, in first-seen order."""
    groups: list[str] = []
    for p in profession_ids:
        group = PROFESSION_CATEGORIES.get(p)
        if group and group not in groups:
            groups.append(group)
    return groups


def profession_families(profession_ids: list[str]) -> list[str]:
    """Unique resource families across these professions, in first-seen order."""
    families: list[str] = []
    for group in profession_groups(profession_ids):
        for family in PROFESSION_RESOURCE_FAMILIES.get(group, ()):
            if family not in families:
                families.append(family)
    return families


def pool_total(profession_count: int) -> int:
    return round(POOL_TOTAL_BASE * POOL_MULTIPLIER.get(profession_count, 1.0))


def roll_pool(profession_ids: list[str], rng: random.Random | None = None) -> dict[str, int]:
    """Split the fixed pool total across the unique families, each share
    varied by +-POOL_VARIATION, the shares summing to exactly the total
    (largest-remainder rounding)."""
    rng = rng or random.Random()
    chosen = chosen_professions(profession_ids)
    families = profession_families(chosen)
    if not families:
        return {}
    total = pool_total(len(chosen))
    weights = [1.0 + rng.uniform(-POOL_VARIATION, POOL_VARIATION) for _ in families]
    exact = [total * w / sum(weights) for w in weights]
    shares = [math.floor(x) for x in exact]
    by_remainder = sorted(range(len(families)), key=lambda i: exact[i] - shares[i], reverse=True)
    for i in by_remainder[: total - sum(shares)]:
        shares[i] += 1
    return dict(zip(families, shares))


def decay(count: int) -> float:
    return 0.5 ** (count / HALF_LIFE)


def forage_reward(base: int, count: int) -> int:
    """reward = floor(base * 0.5 ** (forage_count / half_life))"""
    return math.floor(base * decay(count))


def yield_range(count: int, remaining: int) -> tuple[int, int]:
    """(lowest, highest) units the next trip to a family can find."""
    return (min(remaining, forage_reward(BASE_YIELD_MIN, count)),
            min(remaining, forage_reward(BASE_YIELD_MAX, count)))


def is_exhausted(count: int, remaining: int) -> bool:
    return yield_range(count, remaining)[0] <= 0


def roll_tiers(family_id: str, amount: int, profession_count: int,
               rng: random.Random | None = None) -> dict[str, int]:
    """Roll each found unit into a tier - more professions, higher tiers."""
    rng = rng or random.Random()
    weights = TIER_WEIGHTS.get(profession_count) or {1: 1}
    tiers = list(weights)
    found: dict[str, int] = {}
    for tier in rng.choices(tiers, weights=[weights[t] for t in tiers], k=amount):
        item_id = f"{family_id}_{tier}"
        found[item_id] = found.get(item_id, 0) + 1
    return found


def return_outcome(initial: int, remaining_after: int, exhausted_after: bool) -> str:
    """How a trip's return reads: "depleted" if it was the site's last
    trip (the next would find nothing, so the site disappears), "thin" once
    more than half the pool is gone, else "rich"."""
    if exhausted_after:
        return "depleted"
    if remaining_after * 2 < initial:
        return "thin"
    return "rich"


def return_message(outcome: str, family_id: str, character_name: str, place: str, activity: str,
                   rng: random.Random | None = None) -> str:
    """One return sentence fitted to the material, place and foraging name;
    a depleted return also carries DEPLETED_HINT."""
    rng = rng or random.Random()
    templates = (MESSAGES_BY_FAMILY.get(family_id) or {}).get(outcome) or ["{name} returned from {place}."]
    message = rng.choice(templates).format(
        name=character_name, place=place, Place=place[:1].upper() + place[1:], activity=activity.lower(),
    )
    return f"{message} {DEPLETED_HINT}" if outcome == "depleted" else message


def suggested_mission(family_id: str, groups: list[str], seed: str) -> Optional[Mission]:
    """One mission for this family from the character's own profession
    groups - stable for a given seed, so the offer doesn't reshuffle on
    every reload but changes after each trip."""
    options = sorted(
        (m for m in MISSIONS_BY_ID.values() if m.family_id == family_id and m.group in groups),
        key=lambda m: m.id,
    )
    if not options:
        return None
    return random.Random(f"{seed}:{family_id}").choice(options)


def forage_active(doc: dict, now: datetime | None = None) -> bool:
    """Whether the character is out on a trip that hasn't returned yet."""
    active = (doc.get("foraging") or {}).get("activeForage")
    return bool(active) and datetime.fromisoformat(active["readyAt"]) > (now or datetime.now(timezone.utc))


# ── Slot pools (soul_slots.forage_pools.<slot>) ─────────────────────────


async def get_slot_pool(address: str, slot_number: int) -> Optional[dict]:
    db = get_database()
    doc = await db.soul_slots.find_one({"address": address}, {f"forage_pools.{slot_number}": 1})
    return ((doc or {}).get("forage_pools") or {}).get(str(slot_number))


async def ensure_slot_pool(address: str, slot_number: int, profession_ids: list[str]) -> Optional[dict]:
    """Create `slot_number`'s pool from these professions if the slot has
    never had one; otherwise leave the existing pool untouched (inherited).
    Returns the slot's pool, or None for an unassigned slot (0) or a
    character with no professions."""
    if slot_number < 1:
        return None
    existing = await get_slot_pool(address, slot_number)
    if existing is not None:
        return existing
    chosen = chosen_professions(profession_ids)
    families = roll_pool(chosen)
    if not families:
        return None
    pool = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "professionCount": len(chosen),
        "total": sum(families.values()),
        "families": {f: {"initial": n, "remaining": n, "count": 0} for f, n in families.items()},
    }
    db = get_database()
    await db.soul_slots.update_one({"address": address}, {"$setOnInsert": {"address": address}}, upsert=True)
    # Conditional on the slot still having no pool - a concurrent first
    # create can't overwrite one that just landed.
    await db.soul_slots.update_one(
        {"address": address, f"forage_pools.{slot_number}": {"$exists": False}},
        {"$set": {f"forage_pools.{slot_number}": pool}},
    )
    return await get_slot_pool(address, slot_number)


# ── Character-facing state ──────────────────────────────────────────────


async def _load_character(address: str, character_id: str) -> dict:
    doc = await get_database().characters.find_one({"address": address, "id": character_id})
    if doc is None:
        raise ForagingError("Character not found", 404)
    return doc


def _build_state(doc: dict, pool: Optional[dict]) -> dict:
    profession_ids = character_profession_ids(doc)
    groups = profession_groups(profession_ids)
    own_families = profession_families(profession_ids)
    pool_families = (pool or {}).get("families", {})
    trips_made = sum(f.get("count", 0) for f in pool_families.values())
    seed = f"{doc['id']}:{trips_made}"

    sites = []
    for family_id in own_families:
        entry = pool_families.get(family_id)
        if entry is None:
            continue
        remaining, count = entry["remaining"], entry["count"]
        # A site whose next trip would find nothing is no longer shown or
        # offered - its last trip already said so (see return_outcome).
        if is_exhausted(count, remaining):
            continue
        low, high = yield_range(count, remaining)
        mission = suggested_mission(family_id, groups, seed)
        sites.append({
            "familyId": family_id,
            "initial": entry["initial"],
            "remaining": remaining,
            "count": count,
            "yieldMin": low,
            "yieldMax": high,
            "mission": mission.to_dict() if mission else None,
        })

    foraging = doc.get("foraging") or {}
    return {
        "characterId": doc["id"],
        "slotNumber": doc.get("slotNumber", 0),
        "hasPool": pool is not None,
        "durationHours": DURATION_HOURS,
        "groups": [GROUPS[g] for g in groups if g in GROUPS],
        "sites": sites,
        "dormantFamilies": sorted(f for f in pool_families if f not in own_families),
        "activeForage": foraging.get("activeForage"),
        "lastResult": foraging.get("lastResult"),
    }


async def get_foraging_state(address: str, character_id: str) -> dict:
    """Everything the Foraging UI needs for one character. Lazily creates the
    slot's pool for characters made before foraging existed (still once per
    slot - a slot that already has a pool keeps it)."""
    doc = await _load_character(address, character_id)
    pool = await ensure_slot_pool(address, doc.get("slotNumber", 0), character_profession_ids(doc))
    return _build_state(doc, pool)


async def start_forage(address: str, character_id: str, mission_id: str) -> dict:
    db = get_database()
    doc = await _load_character(address, character_id)
    name = doc.get("firstName") or "This character"
    now = datetime.now(timezone.utc)

    mission = MISSIONS_BY_ID.get(mission_id)
    if mission is None:
        raise ForagingError("Unknown foraging mission")
    profession_ids = character_profession_ids(doc)
    if mission.group not in profession_groups(profession_ids):
        raise ForagingError(f"{name}'s professions don't lead to {mission.name}")

    if doc.get("vitalStatus", "alive") != "alive":
        raise ForagingError(f"{name} can't go foraging ({doc.get('vitalStatus')})", 409)
    availability = doc.get("availability") or {}
    if availability.get("inAdventure") or availability.get("adventure"):
        raise ForagingError(f"{name} is out on an adventure", 409)
    active_craft = (doc.get("crafting") or {}).get("activeCraft")
    if active_craft and datetime.fromisoformat(active_craft["readyAt"]) > now:
        raise ForagingError(f"{name} is still crafting", 409)
    if (doc.get("foraging") or {}).get("activeForage"):
        raise ForagingError(f"{name} is already foraging - collect the finds first", 409)

    pool = await ensure_slot_pool(address, doc.get("slotNumber", 0), profession_ids)
    entry = ((pool or {}).get("families") or {}).get(mission.family_id)
    if entry is None:
        raise ForagingError(f"There is no {mission.family_id} left to find for {name}", 409)
    if is_exhausted(entry["count"], entry["remaining"]):
        raise ForagingError(f"The {mission.family_id} sites near {name} are picked clean", 409)

    ready_at = now + timedelta(hours=DURATION_HOURS)
    active = {
        **mission.to_dict(),
        "missionId": mission.id,
        "slotNumber": doc.get("slotNumber", 0),
        "startedAt": now.isoformat(),
        "readyAt": ready_at.isoformat(),
    }
    updated = await db.characters.find_one_and_update(
        {
            "address": address,
            "id": character_id,
            "foraging.activeForage": None,
            "availability.inAdventure": {"$ne": True},
            "availability.adventure": None,
        },
        {"$set": {"foraging.activeForage": active}},
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        raise ForagingError(f"{name} is busy", 409)

    # Imported here: backend.players imports nothing from this module, but
    # keeping the dependency one-way at import time avoids any cycle.
    from backend.players import _add_pc_status, _set_pc_timer
    await asyncio.gather(
        _add_pc_status(db, address, character_id, "foraging"),
        _set_pc_timer(db, address, character_id, "foragingReadyAt", ready_at.isoformat()),
    )
    return _build_state(updated, pool)


async def finish_forage(address: str, character_id: str) -> dict:
    """Collect a returned trip: roll the finds, take them from the slot's
    pool, credit the shared vault. Returns {result, state}."""
    from backend.players import _inc_vault_itembalances, _remove_pc_status, _set_pc_timer

    db = get_database()
    doc = await _load_character(address, character_id)
    active = (doc.get("foraging") or {}).get("activeForage")
    if not active:
        raise ForagingError("Not out foraging", 404)
    if datetime.fromisoformat(active["readyAt"]) > datetime.now(timezone.utc):
        raise ForagingError("Still out foraging", 409)

    # Claim the trip first, so a double-click can't pay out twice.
    claimed = await db.characters.find_one_and_update(
        {"address": address, "id": character_id, "foraging.activeForage.startedAt": active["startedAt"]},
        {"$set": {"foraging.activeForage": None}},
        return_document=ReturnDocument.AFTER,
    )
    if claimed is None:
        raise ForagingError("Already collected", 409)

    slot = active.get("slotNumber") or doc.get("slotNumber", 0)
    family_id = active["familyId"]
    profession_count = len(character_profession_ids(doc))
    path = f"forage_pools.{slot}.families.{family_id}"

    amount, found, entry = 0, {}, None
    for _ in range(3):
        pool = await get_slot_pool(address, slot)
        entry = ((pool or {}).get("families") or {}).get(family_id)
        if entry is None:
            break
        amount = min(entry["remaining"], forage_reward(random.randint(BASE_YIELD_MIN, BASE_YIELD_MAX), entry["count"]))
        amount = max(amount, 0)
        # Conditional on the family being exactly as read - one writer wins.
        res = await db.soul_slots.update_one(
            {"address": address, f"{path}.count": entry["count"], f"{path}.remaining": entry["remaining"]},
            {"$inc": {f"{path}.count": 1, f"{path}.remaining": -amount}},
        )
        if res.modified_count:
            entry = {**entry, "count": entry["count"] + 1, "remaining": entry["remaining"] - amount}
            found = roll_tiers(family_id, amount, profession_count) if amount else {}
            break
        amount = 0

    if found:
        await _inc_vault_itembalances(db, address, found)

    exhausted = entry is None or is_exhausted(entry["count"], entry["remaining"])
    outcome = return_outcome(entry["initial"], entry["remaining"], exhausted) if entry else "depleted"
    mission = MISSIONS_BY_ID.get(active["missionId"])
    place = active.get("place") or (mission.place if mission else active["name"])
    result = {
        "missionId": active["missionId"],
        "name": active["name"],
        "place": place,
        "activity": active["activity"],
        "familyId": family_id,
        "found": found,
        "total": sum(found.values()),
        "exhausted": exhausted,
        "outcome": outcome,
        "message": return_message(outcome, family_id, doc.get("firstName") or "Your character",
                                  place, active["activity"]),
        "returnedAt": datetime.now(timezone.utc).isoformat(),
    }
    updated = await db.characters.find_one_and_update(
        {"address": address, "id": character_id},
        {"$set": {"foraging.lastResult": result}, "$inc": {"stats.forageFinished": 1}},
        return_document=ReturnDocument.AFTER,
    )
    await asyncio.gather(
        _remove_pc_status(db, address, character_id, "foraging"),
        _set_pc_timer(db, address, character_id, "foragingReadyAt", None),
    )
    return {"result": result, "state": _build_state(updated or claimed, await get_slot_pool(address, slot))}
