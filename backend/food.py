"""
Food (rules in data/food-rules.json).

Three kinds:
- Rations (iron ration, fisherman's ration): the carefree adventure
  provisions. A member with one in their bags is provisioned; after the
  adventure their ration is used up with rationLossChance. They don't heal.
- Preserved (jerky, roasted nuts, fig cake, smoked fish, pickled fish):
  stored, eaten any time from the active storage (home when free, camp while
  resting) or the carried bags; each unit heals preservedHealPoints lost
  points in its group (Body or Soul). Carried along, they count as
  provisions too - and all carried preserved food is used up when the
  adventure ends.
- Fresh (cooked fish, roast haunch, bangers, fish skewer, chowder, stew):
  never stored - eaten the moment its craft is collected
  (players.finish_craft), healing freshHealPoints in its group. Each dish
  once per character per freshMealHours - the 3 Body and 3 Soul dishes give
  at most 3 Body + 3 Soul points a day; players.start_craft refuses the same
  dish again and always cooks one at a time.

Provisions don't do anything yet: each member's status (ration / preserved /
none) is only written to the adventure log, for stories to use later.
The character keeps `meals`: {freshAt: {dish familyId: when eaten}, last}.
"""

from __future__ import annotations

import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from backend import condition, items_catalog
from backend.db import get_database, transactional

_RULES = json.loads((Path(__file__).resolve().parent / "data" / "food-rules.json").read_text())

RATIONS: tuple[str, ...] = tuple(_RULES["rations"])
PRESERVED: dict[str, str] = dict(_RULES["preserved"])
FRESH: dict[str, str] = dict(_RULES["fresh"])
RATION_LOSS_CHANCE: float = float(_RULES["rationLossChance"])
PRESERVED_HEAL_POINTS: int = int(_RULES["preservedHealPoints"])
FRESH_HEAL_POINTS: int = int(_RULES["freshHealPoints"])
FRESH_MEAL_INTERVAL = timedelta(hours=float(_RULES["freshMealHours"]))

# Where carried food sits (gear.itemBalances.<bag>), and where it can be eaten from.
BAGS = ("backpack", "saddlepack", "cart")
STORAGE_COLLECTIONS = {"home": "character_homes", "camp": "character_camp"}


def _check_rules() -> None:
    families = items_catalog.ITEM_FAMILIES_BY_ID
    listed = list(RATIONS) + list(PRESERVED) + list(FRESH)
    unknown = [f for f in listed if f not in families]
    twice = {f for f in listed if listed.count(f) > 1}
    groups = set(PRESERVED.values()) | set(FRESH.values())
    if unknown or twice or not groups <= {"body", "soul"}:
        raise ValueError(f"food-rules.json: unknown {unknown}, listed twice {sorted(twice)}, groups {groups}")


_check_rules()


class FoodError(Exception):
    """A refused eat - the message is shown to the player."""

    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def kind_of(family_id: str) -> Optional[str]:
    """"ration", "preserved", "fresh" or None (not food)."""
    if family_id in RATIONS:
        return "ration"
    if family_id in PRESERVED:
        return "preserved"
    if family_id in FRESH:
        return "fresh"
    return None


def feeds(family_id: str) -> Optional[str]:
    """The group a food heals - "body" / "soul" - or None (rations, non-food)."""
    return PRESERVED.get(family_id) or FRESH.get(family_id)


def is_fresh(family_id: Optional[str]) -> bool:
    return bool(family_id) and family_id in FRESH


def _family_of(item_id: str) -> Optional[str]:
    entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(item_id)
    return entry.family_id if entry else None


def next_fresh_meal(doc: dict, family_id: str) -> Optional[datetime]:
    """When the character may have this fresh dish again - None if it may now."""
    last = ((doc.get("meals") or {}).get("freshAt") or {}).get(family_id)
    if not last:
        return None
    ready = datetime.fromisoformat(last) + FRESH_MEAL_INTERVAL
    return ready if ready > datetime.now(timezone.utc) else None


def _meal(family_id: str, item_id: str, healed: dict, now: datetime) -> dict:
    return {"familyId": family_id, "itemId": item_id, "kind": kind_of(family_id), "feeds": feeds(family_id),
            "healed": healed, "at": now.isoformat()}


async def eat_fresh(address: str, character_id: str, family_id: str, item_id: str, db=None) -> dict:
    """The fresh dish a craft just made is eaten on the spot (called inside
    players.finish_craft's transaction): heal its group, start this dish's
    daily wait. Returns the meal record."""
    db = db if db is not None else get_database()
    now = datetime.now(timezone.utc)
    healed = await condition.apply_heal(address, character_id, FRESH[family_id], FRESH_HEAL_POINTS, db)
    meal = _meal(family_id, item_id, healed, now)
    await db.characters.update_one(
        {"address": address, "id": character_id},
        {"$set": {f"meals.freshAt.{family_id}": now.isoformat(), "meals.last": meal}},
    )
    return meal


def eat_locations(doc: dict) -> tuple[str, ...]:
    """Where this character can eat from right now: its active storage (home
    when free, camp while resting on an adventure) and its bags."""
    availability = doc.get("availability") or {}
    if not availability.get("inAdventure"):
        storage: tuple[str, ...] = ("home",)
    elif availability.get("resting"):
        storage = ("camp",)
    else:
        storage = ()
    return storage + BAGS


@transactional
async def eat_preserved(address: str, character_id: str, item_id: str, location: str) -> Optional[dict]:
    """Eat one unit of preserved food from `location` (home / camp /
    backpack / saddlepack / cart): it heals preservedHealPoints in its group.
    Refused for non-preserved food, the dead, a group with nothing to heal,
    a location the character can't reach, or an empty stack. One
    transaction: the unit taken and the points healed land together.
    Returns the meal record."""
    db = get_database()
    doc = await db.characters.find_one({"address": address, "id": character_id})
    if doc is None:
        raise FoodError("Character not found", 404)
    name = doc.get("firstName") or "This character"
    family_id = _family_of(item_id)
    if family_id not in PRESERVED:
        raise FoodError("Only preserved food can be eaten from storage")
    if condition.is_dead(doc):
        raise FoodError(f"{name} lies cold beneath the earth. The dead eat nothing.", 409)
    if location not in eat_locations(doc):
        raise FoodError(f"{name} can't reach {location} storage right now", 409)
    group = PRESERVED[family_id]
    if not condition.healable_in(doc, group):
        raise FoodError(f"{name}'s {group} has nothing to heal - the food is kept", 409)

    if location in STORAGE_COLLECTIONS:
        coll, query, path = db[STORAGE_COLLECTIONS[location]], {"address": address, "characterId": character_id}, f"itemBalances.{item_id}"
    else:
        coll, query, path = db.characters, {"address": address, "id": character_id}, f"gear.itemBalances.{location}.{item_id}"
    res = await coll.update_one({**query, path: {"$gte": 1}}, {"$inc": {path: -1}})
    if res.modified_count != 1:
        raise FoodError(f"No {item_id} left there", 409)
    await coll.update_one({**query, path: {"$lte": 0}}, {"$unset": {path: ""}})

    now = datetime.now(timezone.utc)
    healed = await condition.apply_heal(address, character_id, group, PRESERVED_HEAL_POINTS, db)
    meal = _meal(family_id, item_id, healed, now)
    await db.characters.update_one({"address": address, "id": character_id}, {"$set": {"meals.last": meal}})
    return meal


def adventure_end(doc: dict, rng: Optional[random.Random] = None) -> tuple[dict, Optional[str], str]:
    """What an adventure's end does to one member's carried food, worked out
    from the character as it set off: ($unset paths for every preserved
    stack in its bags, the bag path of a ration to use up - None if kept or
    none carried - and the provisions status "ration" / "preserved" /
    "none")."""
    rng = rng or random.Random()
    bags = (doc.get("gear") or {}).get("itemBalances") or {}
    unset: dict = {}
    ration_path: Optional[str] = None
    has_preserved = False
    for bag in BAGS:
        for item_id, qty in (bags.get(bag) or {}).items():
            if not qty or qty <= 0:
                continue
            family_id = _family_of(item_id)
            if family_id in PRESERVED:
                has_preserved = True
                unset[f"gear.itemBalances.{bag}.{item_id}"] = ""
            elif family_id in RATIONS and ration_path is None:
                ration_path = f"gear.itemBalances.{bag}.{item_id}"
    provisions = "ration" if ration_path else ("preserved" if has_preserved else "none")
    if ration_path and rng.random() >= RATION_LOSS_CHANCE:
        ration_path = None
    return unset, ration_path, provisions
