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

Gathering gear (data/gathering-bonuses-raw-material.json) taken on the trip
boosts the find by the gear's tier: one matching weapon anywhere on the
character (+25% at T1 .. +75% at T6), plus every matching item family
carried (+5% .. +18%) - weaponBonusByTier/itemBonusByTier in the rules.
The base roll is set low enough that only geared trips beat the old yield.
A bow needs a quiver and arrows, a crossbow a bolt girdle and bolts
(weaponRequires). Gear only wears on finds of at least its own tier: a
weapon loses 1 quality per such unit, an item 1 per trip if the trip found
any. A bow/crossbow shoots one arrow/bolt per unit - an arrow covers finds
of its tier or lower - and wears only for uncovered finds at or above its
tier (weaponAmmo). Gear at
quality <= 0 is destroyed. Only gear still on the character at collection
counts.

Every return carries a sentence fitted to the material and place
(data/foraging-messages.json): "rich" while the family's pool is at least
half full, "thin" once more than half is gone, and "depleted" on the last
trip - the one after which the next trip would find nothing; that site is
then no longer shown or offered.

The whole outcome - finds (taken from the pool), ammo shot, gear wear - is
rolled the moment the trip starts, so changing equipment during the trip
changes nothing. It stays hidden until the trip is collected, when the finds
land in the character's home storage (character_homes.itemBalances). A character deleted
mid-trip loses its pending finds.
"""

from __future__ import annotations

import json
import math
import os
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from pymongo import ReturnDocument

from backend import items_catalog
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
# Gathering-gear bonus by the gear's tier - one weapon at most, every item.
WEAPON_BONUS_BY_TIER: dict[int, float] = {int(t): b for t, b in RULES["weaponBonusByTier"].items()}
ITEM_BONUS_BY_TIER: dict[int, float] = {int(t): b for t, b in RULES["itemBonusByTier"].items()}
# A weapon that only counts with its companions on the character too, e.g.
# a bow needs a quiver and at least one arrow; a crossbow a bolt girdle and
# at least one bolt.
WEAPON_REQUIRES: dict[str, tuple[str, ...]] = {w: tuple(r) for w, r in RULES.get("weaponRequires", {}).items()}
# Ammo a weapon shoots on a trip - one per unit found, standing in for the
# weapon's own wear; only what the ammo can't cover comes off its quality.
WEAPON_AMMO: dict[str, str] = dict(RULES.get("weaponAmmo", {}))
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


def trip_duration() -> timedelta:
    """How long a trip takes - durationHours from the rules, unless the
    FORAGING_DURATION_MINUTES env var overrides it (local testing only;
    never set it in the production environment)."""
    override = os.getenv("FORAGING_DURATION_MINUTES")
    if override:
        return timedelta(minutes=float(override))
    return timedelta(hours=DURATION_HOURS)


# Gathering gear per resource family (data/gathering-bonuses-raw-material.json):
# one matching weapon anywhere on the character adds its tier's weapon bonus
# and wears by the units found; every matching item family carried adds its
# tier's item bonus and, if quality-tracked, wears by 1. Gear that reaches
# quality <= 0 is destroyed.
def _load_gathering_gear() -> dict[str, dict[str, tuple[str, ...]]]:
    data = json.loads((_DATA / "gathering-bonuses-raw-material.json").read_text())
    return {family: {"weapons": tuple(info.get("gatheringWeapons", ())),
                     "items": tuple(info.get("gatheringItems", ()))}
            for family, info in data.items()}


GATHERING_GEAR: dict[str, dict[str, tuple[str, ...]]] = _load_gathering_gear()
# Where gear counts as "on the character" (not home, vault, or lent to a craft).
CARRIED_LOCATIONS = ("body", "backpack", "saddlepack", "cart")
CARRIED_BALANCE_BUCKETS = ("backpack", "saddlepack", "cart")


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


def forage_reward(base: int, count: int, multiplier: float = 1.0) -> int:
    """reward = floor(base * 0.5 ** (forage_count / half_life)), times the
    gathering-gear multiplier (1.0 without gear)."""
    return math.floor(base * decay(count) * multiplier + 1e-9)


def yield_range(count: int, remaining: int, multiplier: float = 1.0) -> tuple[int, int]:
    """(lowest, highest) units the next trip to a family can find."""
    return (min(remaining, forage_reward(BASE_YIELD_MIN, count, multiplier)),
            min(remaining, forage_reward(BASE_YIELD_MAX, count, multiplier)))


def is_exhausted(count: int, remaining: int) -> bool:
    """Judged without gear, so a site never vanishes or reappears just
    because the character changed equipment."""
    return yield_range(count, remaining)[0] <= 0


def _item_name(item_id: str, fallback: str) -> str:
    entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(item_id)
    return entry.name if entry else fallback.replace("_", " ")


def _tier(item_id: str) -> int:
    entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(item_id)
    return entry.tier if entry else 1


def _gear_percent(weapon: Optional[dict], items: list[dict]) -> float:
    """Total bonus in percent - the weapon's tier bonus plus each item's."""
    total = WEAPON_BONUS_BY_TIER.get(weapon["tier"], 0) if weapon else 0
    total += sum(ITEM_BONUS_BY_TIER.get(i["tier"], 0) for i in items)
    return round(total * 100, 1)


def _with_bonus(weapon: Optional[dict], items: list[dict]) -> dict:
    if weapon:
        weapon = {**weapon, "percent": round(WEAPON_BONUS_BY_TIER.get(weapon["tier"], 0) * 100, 1)}
    items = [{**i, "percent": round(ITEM_BONUS_BY_TIER.get(i["tier"], 0) * 100, 1)} for i in items]
    return {"weapon": weapon, "items": items, "percent": _gear_percent(weapon, items)}


def _usable(instance: dict) -> bool:
    """Not broken - quality <= 0 is broken; no quality (missing or None,
    e.g. an equipped stack of arrows) is fine. An equipped stack also needs
    at least one unit left."""
    quality = instance.get("quality")
    if quality is not None and quality <= 0:
        return False
    return instance.get("quantity", 1) > 0


def _carries_family(doc: dict, item_family: str) -> bool:
    """Whether at least one usable `item_family` piece is on the character -
    equipped or packed (an instance or a stacked count)."""
    gear = doc.get("gear") or {}
    if any(i.get("familyId") == item_family and i.get("location") in CARRIED_LOCATIONS and _usable(i)
           for i in gear.get("items", [])):
        return True
    for bucket in CARRIED_BALANCE_BUCKETS:
        for item_id, qty in ((gear.get("itemBalances") or {}).get(bucket) or {}).items():
            entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(item_id)
            if qty > 0 and entry and entry.family_id == item_family:
                return True
    return False


def missing_for_weapon(doc: dict, weapon_family: str) -> list[str]:
    """Companions this weapon still needs before it counts (empty = ready)."""
    return [f for f in WEAPON_REQUIRES.get(weapon_family, ()) if not _carries_family(doc, f)]


def _wear_order(piece: dict) -> tuple:
    """Sort key (use max): highest tier first, then the lowest quality -
    pieces without quality (plain stacks) only when nothing else is left."""
    quality = piece.get("quality")
    return (piece["tier"], -quality if quality is not None else -math.inf)


def gathering_gear(doc: dict, family_id: str) -> dict:
    """The gear this character would bring on a trip for `family_id`:
    {"weapon": {...} | None, "items": [{...}], "percent": int}. Each pick is
    {"instanceId" | None, "itemId", "familyId", "name", "quality" | None};
    instanceId None means a plain stacked item (no quality, never wears)."""
    wanted = GATHERING_GEAR.get(family_id) or {"weapons": (), "items": ()}
    gear = doc.get("gear") or {}
    carried = [i for i in gear.get("items", [])
               if i.get("location") in CARRIED_LOCATIONS and _usable(i)]
    balances = gear.get("itemBalances") or {}

    def pick(item_family: str) -> Optional[dict]:
        """The piece of this family used on the trip - highest tier, then
        the LOWEST quality (it's the one that wears, so worn pieces get used
        up first; a stack without quality comes last)."""
        options = [
            {"instanceId": i["instanceId"], "itemId": i.get("itemId", ""), "familyId": item_family,
             "name": _item_name(i.get("itemId", ""), item_family), "quality": i.get("quality"),
             "tier": _tier(i.get("itemId", ""))}
            for i in carried if i.get("familyId") == item_family
        ]
        for bucket in CARRIED_BALANCE_BUCKETS:
            for item_id, qty in (balances.get(bucket) or {}).items():
                entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(item_id)
                if qty > 0 and entry and entry.family_id == item_family:
                    options.append({"instanceId": None, "itemId": item_id, "familyId": item_family,
                                    "name": entry.name, "quality": None, "tier": entry.tier})
        return max(options, key=_wear_order) if options else None

    weapons, blocked = [], []
    for w in (pick(f) for f in wanted["weapons"]):
        if not w:
            continue
        missing = missing_for_weapon(doc, w["familyId"])
        if missing:
            blocked.append({"name": w["name"], "missing": missing})
        else:
            weapons.append(w)
    # Only one weapon counts - the highest tier, then the most worn.
    weapon = max(weapons, key=_wear_order) if weapons else None
    items = [i for i in (pick(f) for f in wanted["items"]) if i]
    return {**_with_bonus(weapon, items), "blockedWeapons": blocked}


def gear_multiplier(gear: dict) -> float:
    return 1 + (gear.get("percent") or 0) / 100


def _still_carried(doc: dict, gear: dict) -> dict:
    """The trip's gear, minus anything no longer on the character (moved
    away or broken while out), with quality refreshed - only what actually
    came back counts."""
    items_by_id = {i["instanceId"]: i for i in (doc.get("gear") or {}).get("items", [])
                   if i.get("location") in CARRIED_LOCATIONS and _usable(i)}
    balances = (doc.get("gear") or {}).get("itemBalances") or {}

    def present(g: Optional[dict]) -> Optional[dict]:
        if not g:
            return None
        if g["instanceId"]:
            inst = items_by_id.get(g["instanceId"])
            return {**g, "quality": inst.get("quality")} if inst else None
        held = any((balances.get(b) or {}).get(g["itemId"], 0) > 0 for b in CARRIED_BALANCE_BUCKETS)
        return g if held else None

    weapon = present(gear.get("weapon"))
    if weapon and missing_for_weapon(doc, weapon["familyId"]):
        weapon = None  # e.g. the arrows were moved away during the trip
    items = [i for i in (present(g) for g in gear.get("items", [])) if i]
    return _with_bonus(weapon, items)


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


def hide_pending_result(active: Optional[dict]) -> Optional[dict]:
    """A trip as the client may see it - its outcome is rolled at the start
    but stays secret until the trip is collected."""
    if not active:
        return active
    return {k: v for k, v in active.items() if k != "result"}


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
        gear = gathering_gear(doc, family_id)
        low, high = yield_range(count, remaining, gear_multiplier(gear))
        mission = suggested_mission(family_id, groups, seed)
        wanted = GATHERING_GEAR.get(family_id) or {"weapons": (), "items": ()}
        sites.append({
            "familyId": family_id,
            "initial": entry["initial"],
            "remaining": remaining,
            "count": count,
            "yieldMin": low,
            "yieldMax": high,
            "gear": gear,
            "helpfulWeapons": list(wanted["weapons"]),
            "helpfulItems": list(wanted["items"]),
            "mission": mission.to_dict() if mission else None,
        })

    foraging = doc.get("foraging") or {}
    return {
        "characterId": doc["id"],
        "slotNumber": doc.get("slotNumber", 0),
        "hasPool": pool is not None,
        "durationMinutes": trip_duration().total_seconds() / 60,
        "groups": [GROUPS[g] for g in groups if g in GROUPS],
        "sites": sites,
        "dormantFamilies": sorted(f for f in pool_families if f not in own_families),
        "activeForage": hide_pending_result(foraging.get("activeForage")),
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

    ready_at = now + trip_duration()
    active = {
        **mission.to_dict(),
        "missionId": mission.id,
        "slotNumber": doc.get("slotNumber", 0),
        "startedAt": now.isoformat(),
        "readyAt": ready_at.isoformat(),
        "gear": gathering_gear(doc, mission.family_id),
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

    # Roll the whole outcome now (finds, ammo, wear) and keep it with the
    # trip - hidden until collected (see hide_pending_result).
    result = await _roll_trip(db, address, character_id, doc, active, active["gear"])
    updated = await db.characters.find_one_and_update(
        {"address": address, "id": character_id, "foraging.activeForage.startedAt": active["startedAt"]},
        {"$set": {"foraging.activeForage.result": result}},
        return_document=ReturnDocument.AFTER,
    ) or updated
    pool = await get_slot_pool(address, doc.get("slotNumber", 0))

    # Status + timer in one write (see _pc_update).
    await _pc_update(db, address, character_id, {
        "$addToSet": {"characters.$.status": "foraging"},
        "$set": {"characters.$.timers.foragingReadyAt": ready_at.isoformat()},
    })
    return _build_state(updated, pool)


async def _pc_update(db, address: str, character_id: str, update: dict) -> None:
    """One update to this character's player_characters entry - status and
    timer changes go together in a single write."""
    await db.player_characters.update_one(
        {"address": address, "characters.characterId": character_id}, update,
    )


def unit_tiers(found: dict[str, int]) -> list[int]:
    """One tier per unit found, e.g. {"ore_1": 2, "ore_2": 1} -> [1, 1, 2]."""
    return [_tier(item_id) for item_id, n in found.items() for _ in range(n)]


def allocate_ammo(pieces: list[dict], tiers: list[int]) -> tuple[dict[str, int], list[int]]:
    """Shoot one arrow/bolt per unit found. An arrow only covers finds of its
    own tier or lower; the highest finds are matched first, each with the
    lowest-tier arrow that still fits (saving better ammo, covering the
    most). `pieces` are [{"itemId", "tier", "left", "order"}] - lower order
    is used first within a tier (equipped stacks before packs); "left" is
    decremented in place. Returns ({item id: used}, tiers left uncovered)."""
    used: dict[str, int] = {}
    uncovered: list[int] = []
    for tier in sorted(tiers, reverse=True):
        fits = [p for p in pieces if p["left"] > 0 and p["tier"] >= tier]
        if not fits:
            uncovered.append(tier)
            continue
        piece = min(fits, key=lambda p: (p["tier"], p["order"]))
        piece["left"] -= 1
        used[piece["itemId"]] = used.get(piece["itemId"], 0) + 1
    return used, uncovered


async def _consume_ammo(db, address: str, character_id: str, ammo_family: str,
                        tiers: list[int]) -> tuple[dict, list[int]]:
    """Use `ammo_family` (arrows/bolts) from the character for the units
    found (see allocate_ammo) - equipped stacks first, then backpack,
    saddlepack, cart. Returns ({item id: used}, tiers left uncovered)."""
    if not tiers:
        return {}, []
    doc = await db.characters.find_one({"address": address, "id": character_id})
    gear = (doc or {}).get("gear") or {}

    pieces: list[dict] = []
    for stack in gear.get("items", []):
        if (stack.get("familyId") == ammo_family and stack.get("location") in CARRIED_LOCATIONS
                and (stack.get("quantity") or 0) > 0):
            pieces.append({"itemId": stack.get("itemId", ""), "tier": _tier(stack.get("itemId", "")),
                           "left": stack["quantity"], "had": stack["quantity"], "order": 0,
                           "instanceId": stack["instanceId"]})
    balances = gear.get("itemBalances") or {}
    for order, bucket in enumerate(CARRIED_BALANCE_BUCKETS, start=1):
        for item_id, qty in (balances.get(bucket) or {}).items():
            entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(item_id)
            if qty > 0 and entry and entry.family_id == ammo_family:
                pieces.append({"itemId": item_id, "tier": entry.tier, "left": qty, "had": qty,
                               "order": order, "bucket": bucket})

    used, uncovered = allocate_ammo(pieces, tiers)

    inc, set_ops, unset, pulls, filters = {}, {}, {}, [], []
    for piece in pieces:
        if piece["left"] == piece["had"]:
            continue
        if "instanceId" in piece:
            if piece["left"] == 0:
                pulls.append(piece["instanceId"])
            else:
                n = len(filters)
                inc[f"gear.items.$[a{n}].quantity"] = piece["left"] - piece["had"]
                filters.append({f"a{n}.instanceId": piece["instanceId"]})
        else:
            path = f"gear.itemBalances.{piece['bucket']}.{piece['itemId']}"
            if piece["left"] == 0:
                unset[path] = ""
            else:
                set_ops[path] = piece["left"]

    update: dict = {}
    if inc:
        update["$inc"] = inc
    if set_ops:
        update["$set"] = set_ops
    if unset:
        update["$unset"] = unset
    if update:
        await db.characters.update_one({"address": address, "id": character_id}, update,
                                       **({"array_filters": filters} if filters else {}))
    if pulls:
        await db.characters.update_one({"address": address, "id": character_id},
                                       {"$pull": {"gear.items": {"instanceId": {"$in": pulls}}}})
    return used, uncovered


async def _wear_gear(db, address: str, character_id: str, gear: dict, weapon_wear: int,
                     top_tier: int) -> tuple[list, list]:
    """Wear the trip's gear: the weapon loses `weapon_wear` quality (see
    _roll_trip); each quality-tracked item loses 1, but only if the trip
    found something of at least its tier (`top_tier`). Anything at quality
    <= 0 afterwards is destroyed. Returns (worn, broken names)."""
    wear: dict[str, int] = {}
    worn: list[dict] = []
    weapon = gear.get("weapon")
    if weapon:
        if weapon["instanceId"] and weapon.get("quality") is not None and weapon_wear > 0:
            wear[weapon["instanceId"]] = weapon_wear
        worn.append({"instanceId": weapon["instanceId"], "name": weapon["name"], "kind": "weapon",
                     "wear": wear.get(weapon["instanceId"] or "", 0), "destroyed": False})
    for item in gear.get("items", []):
        if item["instanceId"] and item.get("quality") is not None and top_tier >= item.get("tier", 1):
            wear[item["instanceId"]] = 1
        worn.append({"instanceId": item["instanceId"], "name": item["name"], "kind": "item",
                     "wear": wear.get(item["instanceId"] or "", 0), "destroyed": False})
    if not wear:
        return worn, []

    ids = list(wear)
    doc = await db.characters.find_one_and_update(
        {"address": address, "id": character_id},
        {"$inc": {f"gear.items.$[g{n}].quality": -wear[iid] for n, iid in enumerate(ids)}},
        array_filters=[{f"g{n}.instanceId": iid} for n, iid in enumerate(ids)],
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return worn, []
    broken_items = [i for i in doc.get("gear", {}).get("items", [])
                    if i.get("instanceId") in wear and (i.get("quality") or 0) <= 0]
    if broken_items:
        await db.characters.update_one(
            {"address": address, "id": character_id},
            {"$pull": {"gear.items": {"instanceId": {"$in": [i["instanceId"] for i in broken_items]}}}},
        )
    broken_ids = {i["instanceId"] for i in broken_items}
    for w in worn:
        w["destroyed"] = w["instanceId"] in broken_ids
    return worn, [_item_name(i.get("itemId", ""), i.get("familyId", "")) for i in broken_items]


async def _roll_trip(db, address: str, character_id: str, doc: dict, active: dict, gear: dict) -> dict:
    """Roll a trip's outcome: the finds (taken from the slot's pool right
    away), the ammo shot and the gear's wear. Everything is settled here, so
    swapping or removing equipment during the trip changes nothing. The
    finds themselves only reach the character's home when the trip is
    collected.
    Returns the result (no returnedAt yet)."""
    slot = active.get("slotNumber") or doc.get("slotNumber", 0)
    family_id = active["familyId"]
    profession_count = len(character_profession_ids(doc))
    path = f"forage_pools.{slot}.families.{family_id}"
    multiplier = gear_multiplier(gear)

    found, entry = {}, None
    for _ in range(3):
        pool = await get_slot_pool(address, slot)
        entry = ((pool or {}).get("families") or {}).get(family_id)
        if entry is None:
            break
        amount = max(0, min(entry["remaining"], forage_reward(
            random.randint(BASE_YIELD_MIN, BASE_YIELD_MAX), entry["count"], multiplier)))
        # Conditional on the family being exactly as read - one writer wins.
        res = await db.soul_slots.update_one(
            {"address": address, f"{path}.count": entry["count"], f"{path}.remaining": entry["remaining"]},
            {"$inc": {f"{path}.count": 1, f"{path}.remaining": -amount}},
        )
        if res.modified_count:
            entry = {**entry, "count": entry["count"] + 1, "remaining": entry["remaining"] - amount}
            found = roll_tiers(family_id, amount, profession_count) if amount else {}
            break

    units_found = sum(found.values())
    tiers = unit_tiers(found)
    weapon = gear.get("weapon")
    ammo_family = WEAPON_AMMO.get(weapon["familyId"]) if weapon else None
    ammo_used, uncovered = (
        await _consume_ammo(db, address, character_id, ammo_family, tiers) if ammo_family else ({}, tiers)
    )
    # Gear only wears on finds of at least its own tier. A bow/crossbow's
    # arrows/bolts cover what they can (their tier or lower); the weapon only
    # wears for the uncovered finds at or above its tier.
    weapon_wear = sum(1 for t in uncovered if weapon and t >= weapon.get("tier", 1))
    ammo_shortfall = len(uncovered) if ammo_family else 0
    worn, broken = await _wear_gear(db, address, character_id, gear, weapon_wear, max(tiers, default=0))

    exhausted = entry is None or is_exhausted(entry["count"], entry["remaining"])
    outcome = return_outcome(entry["initial"], entry["remaining"], exhausted) if entry else "depleted"
    mission = MISSIONS_BY_ID.get(active["missionId"])
    place = active.get("place") or (mission.place if mission else active["name"])
    return {
        "missionId": active["missionId"],
        "name": active["name"],
        "place": place,
        "activity": active["activity"],
        "familyId": family_id,
        "found": found,
        "total": units_found,
        "exhausted": exhausted,
        "outcome": outcome,
        "message": return_message(outcome, family_id, doc.get("firstName") or "Your character",
                                  place, active["activity"]),
        "gearPercent": gear.get("percent", 0),
        "gear": worn,
        "broken": broken,
        "ammoUsed": ammo_used,
        "ammoShortfall": ammo_shortfall,
    }


async def finish_forage(address: str, character_id: str) -> dict:
    """Collect a returned trip: reveal the finds rolled when it started and
    drop them into the character's home storage. Returns {result, state}."""
    from backend.players import _inc_storage_balances

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

    result = active.get("result")
    if result is None:
        # A trip started before outcomes were rolled up front (or whose roll
        # didn't get stored) - roll it now with the gear still on hand.
        result = await _roll_trip(db, address, character_id, doc, active,
                                  _still_carried(doc, active.get("gear") or {}))
    result = {**result, "returnedAt": datetime.now(timezone.utc).isoformat()}

    if result["found"]:
        # The character carries the finds home (character_homes.itemBalances).
        await _inc_storage_balances(db, "home", address, character_id, result["found"])
    updated = await db.characters.find_one_and_update(
        {"address": address, "id": character_id},
        {"$set": {"foraging.lastResult": result},
         "$inc": {"stats.forageFinished": 1, "stats.forageUnits": result["total"]}},
        return_document=ReturnDocument.AFTER,
    )
    await _pc_update(db, address, character_id, {
        "$pull": {"characters.$.status": "foraging"},
        "$unset": {"characters.$.timers.foragingReadyAt": ""},
    })
    slot = active.get("slotNumber") or doc.get("slotNumber", 0)
    return {"result": result, "state": _build_state(updated or claimed, await get_slot_pool(address, slot))}
