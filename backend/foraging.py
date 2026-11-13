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
with each site's own half-life worked out from its size so that it empties
in about size / siteUnitsPerTrip (4) trips, at most siteTrips (18, about 15
days) - every site thins out steadily, small ones are done in a few days,
the biggest last about 15 days (site_trips / site_half_life),
capped by what the family still holds, and at least 1 unit - that is what
leaves the site. Gear's bonus comes on top of it and never leaves the site
(rounded with a chance: +70% on 1 unit gives 2 units 70% of the time);
a penalty (darkness) shrinks the find, and only the smaller find leaves
(plan_trip / dig). A site lasts until it is empty (late trips find a unit
at a time) or the player forgets it (forget_site - what's left is gone for
the slot). Each unit is rolled into a tier by the
character's profession count (1 -> T1 only, 2 -> T1-T2, 3 -> T1-T3).

Gathering gear (data/gathering-bonuses-raw-material.json) taken on the trip
boosts the find by the gear's tier: one matching weapon anywhere on the
character (+25% at T1 .. +75% at T6), plus every matching item family
carried (+5% .. +18%) - weaponBonusByTier/itemBonusByTier in the rules.
The base roll is set low enough that only geared trips beat the old yield.
A bow needs a quiver and arrows, a crossbow a bolt girdle and bolts
(weaponRequires). Gear of any tier wears on any trip that finds something:
once per trip it may drop one condition level (backend.item_condition -
new, used, damaged, broken, then gone; chances in data/item-conditions.json);
a stacked gathering item may lose a unit instead. So better gear finds
more but wears just as fast - cheap tools are the thrifty choice. A
bow/crossbow shoots one arrow/bolt per unit - an arrow covers finds of its
tier or lower - and only risks wear when a find was left uncovered
(weaponAmmo).

Companion charms (companionCharms): the charm worn in the companion's Charm
slot adds its tier's item bonus on the materials that suit its companion
(e.g. a flying charm on a winged companion: feather, meat, hide) - only on a
matching companion - and wears like any item (1 per trip).

Light (lightSources, only with a tinderbox - lightRequires): every unit the
site gives on ore, crystal or clockwork needs lightHoursPerUnit (1) hour of
light - the gear's bonus on top needs none. A
trip burns whole units in order - oil (only with a glass lantern, at the
lower of lantern and oil), then torches, then candles, each lowest tier
first - with the hours per unit from light-source-burn-hours.json (a T1
torch lasts 2h). The best light that burned counts like a weapon
(lightBonusByTier, +25% at T1 .. +75% at T6) for the whole trip. Units the
light can't cover are dug as without it: on ore and crystal (rules
"darkness") with 50%
less, only that leaving the site, plus one accident roll - minor (1-2),
serious (3-5) or hardcore (6-10 temporary Body points, enough to kill;
serious and hardcore also get the character lost), applied on collect. A
trip with any light shows "Light for Xh" (gear.light.hours). Every trip finds
at least one unit while the site holds anything. Only gear still on the
character at collection counts.

A trip spends a night out (rules "nights"): weather is rolled from the ones
possible at the site (rain, fog, storm... anywhere; flood, sandstorm,
blizzard, rockslide only on fitting materials), each mild or severe; without
a tent and bedroll it may cost a temporary Body and/or Soul point
(backend.condition) - none with both, at most one with either.
The night gets its own sentence (foraging-messages.json "nights").

Surprise finds (surprises): each trip rolls a 5% chance of 1-3 units of a
random T1-T3 raw material of any family, and separately a 1% chance of a
single T4-T6 one - a bonus on top, outside the pool, with no gear wear.

Old gear (oldGear): each trip also has a 15% chance of turning up one
forgotten T1 weapon or item from the gathering-gear list of the material
foraged - only condition-tracked pieces, found broken (item-conditions.json
"lostEquipment"). It lands in home storage (character_homes.items).

Every return carries a sentence fitted to the material and place
(data/foraging-messages.json): "rich" while the family's pool is at least
half full, "thin" once more than half is gone, and "depleted" on the last
trip - the one that empties it; that site is then no longer shown or offered.

The whole outcome - finds (taken from the pool), ammo shot, gear wear - is
rolled the moment the trip starts, so changing equipment during the trip
changes nothing. It stays hidden until the trip is collected, when the finds
land in the character's home storage (character_homes.itemBalances). A character deleted
mid-trip loses its pending finds.
"""

from __future__ import annotations

import functools
import json
import math
import os
import random
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from pymongo import ReturnDocument

from backend import condition, item_condition, items_catalog
from backend.db import find_one_and_update_checked, get_database, transactional
from backend.professions_catalog import PROFESSION_CATEGORIES
from backend.resources_catalog import PROFESSION_RESOURCE_FAMILIES, RESOURCE_ITEMS, RESOURCE_ITEMS_BY_ID

_DATA = Path(__file__).resolve().parent / "data"
RULES: dict = json.loads((_DATA / "foraging-rules.json").read_text())

POOL_TOTAL_BASE: int = RULES["poolTotalBase"]
POOL_MULTIPLIER: dict[int, float] = {int(k): v for k, v in RULES["poolMultiplierByProfessionCount"].items()}
POOL_VARIATION: float = RULES["poolVariation"]
BASE_YIELD_MIN: int = RULES["baseYieldMin"]
BASE_YIELD_MAX: int = RULES["baseYieldMax"]
HALF_LIFE: float = RULES["halfLife"]
# Trips a site lasts: about its size / SITE_UNITS_PER_TRIP, at most SITE_TRIPS (site_trips).
SITE_TRIPS: int = int(RULES.get("siteTrips", 0))
SITE_UNITS_PER_TRIP: float = float(RULES.get("siteUnitsPerTrip", 0))
DURATION_HOURS: float = RULES["durationHours"]
# Gathering-gear bonus by the gear's tier - one weapon at most, every item.
WEAPON_BONUS_BY_TIER: dict[int, float] = {int(t): b for t, b in RULES["weaponBonusByTier"].items()}
ITEM_BONUS_BY_TIER: dict[int, float] = {int(t): b for t, b in RULES["itemBonusByTier"].items()}
# A weapon that only counts with its companions on the character too, e.g.
# a bow needs a quiver and at least one arrow; a crossbow a bolt girdle and
# at least one bolt.
WEAPON_REQUIRES: dict[str, tuple[str, ...]] = {w: tuple(r) for w, r in RULES.get("weaponRequires", {}).items()}
# Ammo a weapon shoots on a trip - one per unit found, standing in for the
# weapon's own wear; the weapon only risks wear for what the ammo can't cover.
WEAPON_AMMO: dict[str, str] = dict(RULES.get("weaponAmmo", {}))
# Light sources (ore, crystal, clockwork), burned in LIGHT_SOURCES order -
# a lantern's oil (LIGHT_FUEL), then torches, then candles, lowest tier
# first - only with everything in LIGHT_REQUIRES carried (a tinderbox). Each
# unit dug needs LIGHT_HOURS_PER_UNIT hours; LIGHT_HOURS gives a unit's burn
# time by family and tier (a lantern burns at min(lantern, oil)).
LIGHT_SOURCES: tuple[str, ...] = tuple(RULES.get("lightSources", ()))
LIGHT_REQUIRES: tuple[str, ...] = tuple(RULES.get("lightRequires", ()))
LIGHT_FUEL: dict[str, str] = dict(RULES.get("lightFuel", {}))
LIGHT_HOURS_PER_UNIT: int = int(RULES.get("lightHoursPerUnit", 1))
# A trip burns at most this many hours of light (about a day's work); a dig
# bigger than that still brings everything home without more light.
MAX_LIGHT_HOURS_PER_TRIP: int = int(RULES.get("maxLightHoursPerTrip", 24))
LIGHT_HOURS: dict[str, dict[int, int]] = {
    family: {int(t): int(h) for t, h in hours.items()}
    for family, hours in json.loads((_DATA / "light-source-burn-hours.json").read_text()).items()
    if not family.startswith("_")
}
# The lantern's row in the burn-hours table is "lantern"; its family is glass_lantern.
_LIGHT_HOURS_ROW: dict[str, str] = {"glass_lantern": "lantern"}
# A light counts like a weapon (lightBonusByTier), not like an item.
LIGHT_BONUS_BY_TIER: dict[int, float] = {int(t): b for t, b in RULES["lightBonusByTier"].items()}
# Darkness (rules "darkness"): on these materials a trip without a light
# finds `penalty` less (taken off the gear percent; only the smaller find
# leaves the site) and risks one accident - a band rolled from `accidents`,
# costing that many temporary Body points (backend.condition).
DARKNESS: dict = RULES["darkness"]
DARK_FAMILIES: tuple[str, ...] = tuple(DARKNESS["families"])
DARK_PENALTY: float = float(DARKNESS["penalty"])
DARK_ACCIDENTS: tuple[dict, ...] = tuple(DARKNESS["accidents"])
# A band with "lostDays" also leaves the character lost underground: the trip
# ends that many days later (kept secret - see hide_pending_result), and each
# day costs lostPointsPerDay temporary points in the lostGroup (Soul).
DARK_LOST_PER_DAY: int = int(DARKNESS.get("lostPointsPerDay", 1))
DARK_LOST_GROUP: str = DARKNESS.get("lostGroup", "soul")
# Companion charms (rules "companionCharms"): a charm worn in the companion's
# Charm slot adds its tier's item bonus on the materials that suit its
# companion - only on a matching companion - and wears like any item.
COMPANION_CHARMS: dict[str, dict] = {
    charm: {"companions": tuple(c["companions"]), "families": tuple(c["families"])}
    for charm, c in RULES.get("companionCharms", {}).items()
}
# Surprise finds (rules "surprises"): per trip, each tier band rolls its own
# small chance of an extra raw material of any family - a separate bonus that
# doesn't drain the pool, wear gear, or shoot ammo.
SURPRISES: tuple[dict, ...] = tuple(RULES.get("surprises", ()))
# Old gear (rules "oldGear"): per trip, one chance of a forgotten, damaged
# T1 piece of the foraged material's gathering gear.
OLD_GEAR: dict = dict(RULES.get("oldGear", {}))
# The night out (rules "nights"): a tent and a bedroll keep the weather off;
# without them the night may cost temporary Body/Soul points (backend.condition).
NIGHTS: dict = RULES["nights"]
SHELTER: tuple[str, ...] = tuple(NIGHTS["shelter"])
# Chance (by weather severity) that the night destroys the pitched tent.
TENT_DESTROYED_CHANCE: dict[str, float] = dict(NIGHTS.get("tentDestroyedChance", {}))
TIER_WEIGHTS: dict[int, dict[int, int]] = {
    int(n): {int(tier): w for tier, w in weights.items()}
    for n, weights in RULES["tierWeightsByProfessionCount"].items()
}


@dataclass(frozen=True)
class Mission:
    id: str
    activity: str
    family_id: str
    name: str
    place: str
    text: str

    def to_dict(self) -> dict:
        return {"id": self.id, "activity": self.activity, "familyId": self.family_id, "name": self.name,
                "place": self.place, "text": self.text}


_MISSION_DATA: dict = json.loads((_DATA / "foraging-missions.json").read_text())


def _load_missions() -> dict[str, Mission]:
    """One list per material (foraging-missions.json "materials") - every
    character foraging that material draws from all of it."""
    missions: dict[str, Mission] = {}
    for family_id, entry in _MISSION_DATA["materials"].items():
        for m in entry["missions"]:
            if m.get("familyId", family_id) != family_id:
                raise ValueError(f"foraging mission {m['id']} is {m['familyId']} but listed under {family_id}")
            missions[m["id"]] = Mission(id=m["id"], activity=entry["activity"], family_id=family_id,
                                        name=m["name"], place=m["place"], text=m["text"])
    return missions


# Each mission has its own name and text; its material gives the foraging
# name (e.g. ore: "Mining"). Each profession group has a headline shown above
# the sites (e.g. Rural: "Fields, Folds & Fishponds").
MISSIONS_BY_ID: dict[str, Mission] = _load_missions()
GROUPS: dict[str, dict] = {group: {"group": group, "headline": headline}
                           for group, headline in _MISSION_DATA["headlines"].items()}

# Return sentences per family and outcome (data/foraging-messages.json).
_MESSAGES: dict = json.loads((_DATA / "foraging-messages.json").read_text())
DEPLETED_HINT: str = _MESSAGES["depletedHint"]
MESSAGES_BY_FAMILY: dict[str, dict[str, list[str]]] = _MESSAGES["families"]
NIGHT_MESSAGES: dict = _MESSAGES["nights"]
SURPRISE_MESSAGES: list[str] = _MESSAGES["surprises"]
# Opening line when a surprise holds a rare (T4+) material.
SURPRISE_RARE_INTROS: list[str] = _MESSAGES["surprisesRareIntro"]
OLD_GEAR_MESSAGES: list[str] = _MESSAGES["oldGear"]
RARE_SURPRISE_TIER = 4


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
# and every matching item family carried adds its tier's item bonus; each
# may drop a condition level per trip (see _wear_gear).
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


def _trips_to_empty(initial: int, half_life: float) -> int:
    """Trips a site of `initial` units lasts with the average base roll."""
    base = (BASE_YIELD_MIN + BASE_YIELD_MAX) / 2
    remaining, count = initial, 0
    while remaining > 0 and count < 10 * initial:
        remaining -= min(remaining, max(1, math.floor(base * 0.5 ** (count / half_life) + 1e-9)))
        count += 1
    return count


def site_trips(initial: int) -> int:
    """Trips a site of `initial` units should last: about initial /
    siteUnitsPerTrip (so small sites are done in a few days), at most
    siteTrips (the biggest last about 15 days)."""
    if not SITE_UNITS_PER_TRIP:
        return SITE_TRIPS
    return max(1, min(SITE_TRIPS, round(initial / SITE_UNITS_PER_TRIP)))


@functools.lru_cache(maxsize=None)
def site_half_life(initial: Optional[int]) -> float:
    """A site's half-life, worked out from its size so that it empties in
    about site_trips(initial) trips - every site thins out steadily from the
    first trip's 6-10 units instead of dropping to 1 unit a trip.
    Deterministic (the same site always gets the same), cached per size. A
    site without a known size gets halfLife."""
    if not initial or not SITE_TRIPS:
        return HALF_LIFE
    target = site_trips(initial)
    low, high = 0.2, 500.0
    for _ in range(50):
        mid = (low + high) / 2
        if _trips_to_empty(initial, mid) > target:
            low = mid            # too many trips: decay slower
        else:
            high = mid
    return round(high, 2)


def decay(count: int, half_life: Optional[float] = None) -> float:
    return 0.5 ** (count / (half_life or HALF_LIFE))


def forage_reward(base: int, count: int, multiplier: float = 1.0, half_life: Optional[float] = None) -> int:
    """reward = floor(base * 0.5 ** (forage_count / half_life)), times the
    gathering-gear multiplier (1.0 without gear)."""
    return math.floor(base * decay(count, half_life) * multiplier + 1e-9)


def trip_amount(base: int, count: int, remaining: int, multiplier: float = 1.0,
                half_life: Optional[float] = None) -> int:
    """Units the site gives on one trip (with multiplier 1: the base find,
    gear aside - see plan_trip): the reward, capped by what's left - and at
    least 1 while the site isn't empty, so neither the fading reward nor a
    penalty (darkness) ever turns a trip into nothing. `half_life`: the
    site's own (site_half_life), else the rules' minimum."""
    if is_exhausted(remaining):
        return 0
    return min(remaining, max(1, forage_reward(base, count, multiplier, half_life)))


def site_plans(doc: dict, family_id: str, count: int, remaining: int, gear: dict,
               half_life: Optional[float] = None) -> tuple[dict, dict]:
    """plan_trip for the next trip's lowest and highest base roll, with the
    gear and the light carried."""
    supply, _, lantern = light_supply(doc, family_id)
    plain = [i for i in gear.get("items", []) if not i.get("fuel")]
    # Lowest roll with the bonus rounded down, highest with it rounded up.
    low = plan_trip(BASE_YIELD_MIN, count, remaining, gear.get("weapon"), plain, supply, lantern, family_id, 1.0,
                    half_life=half_life)
    high = plan_trip(BASE_YIELD_MAX, count, remaining, gear.get("weapon"), plain, supply, lantern, family_id, 0.0,
                     half_life=half_life)
    return low, high


def planned_yield_range(doc: dict, family_id: str, count: int, remaining: int,
                        gear: dict, half_life: Optional[float] = None) -> tuple[int, int]:
    """(lowest, highest) units the next trip can find with the gear and the
    light carried - what the light can't cover counted as dug without it."""
    low, high = site_plans(doc, family_id, count, remaining, gear, half_life)
    return low["amount"], high["amount"]


def light_cover(hours: int, low: dict, high: dict) -> dict:
    """How far the light carried reaches on the next trip: the hours the
    lowest and highest site find would need (light is per site unit), and "full" (covers even
    the highest), "partial" (covers the lowest, may run out within the
    range) or "none" (runs out even on the lowest)."""
    need_min = low["lightNeed"] * LIGHT_HOURS_PER_UNIT
    need_max = high["lightNeed"] * LIGHT_HOURS_PER_UNIT
    cover = "full" if hours >= need_max else "partial" if hours >= need_min else "none"
    return {"needMin": need_min, "needMax": need_max, "cover": cover}


def is_exhausted(remaining: int) -> bool:
    """A site is done once it's empty - not when finds get small (every trip
    finds at least 1, see trip_amount). Judged without gear, so a site never
    vanishes or reappears because the character changed equipment."""
    return remaining <= 0


def _item_name(item_id: str, fallback: str) -> str:
    entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(item_id)
    return entry.name if entry else fallback.replace("_", " ")


def _tier(item_id: str) -> int:
    entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(item_id)
    return entry.tier if entry else 1


def _item_bonus(item: dict) -> float:
    """An item's bonus by its tier. A light (it has `fuel`) counts like a
    weapon (LIGHT_BONUS_BY_TIER), a lantern at `bonusTier`, the lower of its
    own and its oil's tier."""
    table = LIGHT_BONUS_BY_TIER if item.get("fuel") else ITEM_BONUS_BY_TIER
    return table.get(item.get("bonusTier", item["tier"]), 0)


def is_dark(family_id: Optional[str], items: list[dict]) -> bool:
    """A trip to a dark material (DARK_FAMILIES) without a light that counts."""
    return family_id in DARK_FAMILIES and not any(i.get("fuel") for i in items)


def _gear_percent(weapon: Optional[dict], items: list[dict], dark: bool = False) -> float:
    """Total in percent - the weapon's tier bonus plus each item's, minus the
    darkness penalty."""
    total = WEAPON_BONUS_BY_TIER.get(weapon["tier"], 0) if weapon else 0
    total += sum(_item_bonus(i) for i in items)
    if dark:
        total -= DARK_PENALTY
    return round(total * 100, 1)


def _with_bonus(weapon: Optional[dict], items: list[dict], family_id: Optional[str] = None) -> dict:
    if weapon:
        weapon = {**weapon, "percent": round(WEAPON_BONUS_BY_TIER.get(weapon["tier"], 0) * 100, 1)}
    items = [{**i, "percent": round(_item_bonus(i) * 100, 1)} for i in items]
    dark = is_dark(family_id, items)
    return {"weapon": weapon, "items": items, "percent": _gear_percent(weapon, items, dark), "dark": dark,
            "darkPercent": -round(DARK_PENALTY * 100, 1) if dark else 0}


def _usable(instance: dict) -> bool:
    """Not gone - a condition level of 0 or below means the item is gone (1
    is broken but still works); no quality (missing or None,
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
    """Sort key (use max): highest tier first, then the lowest condition
    level (most worn) - pieces without condition (plain stacks) only when
    nothing else is left."""
    quality = piece.get("quality")
    return (piece["tier"], -quality if quality is not None else -math.inf)


def _carried_pieces(doc: dict, item_family: str) -> list[dict]:
    """Every usable piece of `item_family` on the character, as gear picks:
    {"instanceId" | None, "itemId", "familyId", "name", "quality" | None, "tier"}."""
    gear = doc.get("gear") or {}
    pieces = [
        {"instanceId": i["instanceId"], "itemId": i.get("itemId", ""), "familyId": item_family,
         "name": _item_name(i.get("itemId", ""), item_family), "quality": i.get("quality"),
         "tier": _tier(i.get("itemId", ""))}
        for i in gear.get("items", [])
        if i.get("familyId") == item_family and i.get("location") in CARRIED_LOCATIONS and _usable(i)
    ]
    balances = gear.get("itemBalances") or {}
    for bucket in CARRIED_BALANCE_BUCKETS:
        for item_id, qty in (balances.get(bucket) or {}).items():
            entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(item_id)
            if qty > 0 and entry and entry.family_id == item_family:
                pieces.append({"instanceId": None, "itemId": item_id, "familyId": item_family,
                               "name": entry.name, "quality": None, "tier": entry.tier})
    return pieces


def _pick(doc: dict, item_family: str) -> Optional[dict]:
    """The piece of this family used on the trip - highest tier, then the
    lowest condition level (worn pieces get used up first; a stack without
    condition comes last)."""
    pieces = _carried_pieces(doc, item_family)
    return max(pieces, key=_wear_order) if pieces else None


def missing_for_light(doc: dict) -> list[str]:
    """What a light still needs before it counts (empty = ready): a tinderbox."""
    return [f for f in LIGHT_REQUIRES if not _carries_family(doc, f)]


def _carried_counts(doc: dict, item_family: str) -> dict[str, int]:
    """{item id: units} of a stacked family on the character - packed counts
    plus equipped stacks (instances with a quantity)."""
    gear = doc.get("gear") or {}
    counts: dict[str, int] = {}
    for i in gear.get("items", []):
        if (i.get("familyId") == item_family and i.get("location") in CARRIED_LOCATIONS
                and (i.get("quantity") or 0) > 0):
            counts[i.get("itemId", "")] = counts.get(i.get("itemId", ""), 0) + i["quantity"]
    for bucket in CARRIED_BALANCE_BUCKETS:
        for item_id, qty in ((gear.get("itemBalances") or {}).get(bucket) or {}).items():
            entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(item_id)
            if qty > 0 and entry and entry.family_id == item_family:
                counts[item_id] = counts.get(item_id, 0) + qty
    return counts


def _burn_hours(light_family: str, tier: int) -> int:
    return LIGHT_HOURS.get(_LIGHT_HOURS_ROW.get(light_family, light_family), {}).get(tier, 0)


def light_supply(doc: dict, family_id: str) -> tuple[list[dict], list[dict], Optional[dict]]:
    """Everything the character can burn on a trip for `family_id`, in burn
    order: a lantern's oil, then torches, then candles - each lowest tier
    first. Entries {"light" (glass_lantern/torch/candle), "familyId" (what
    burns: oil/torch/candle), "itemId", "name", "tier", "bonusTier", "hours"
    (per unit), "count"}. A lantern burns at the lower of lantern and oil
    tier, for its hours and its bonus. Nothing burns without a tinderbox.
    Returns (supply, blocked lights [{"name", "missing"}], lantern pick)."""
    wanted = (GATHERING_GEAR.get(family_id) or {"items": ()})["items"]
    supply: list[dict] = []
    blocked: list[dict] = []
    lantern = None
    for light_family in (f for f in LIGHT_SOURCES if f in wanted):
        fuel_family = LIGHT_FUEL.get(light_family)
        if fuel_family:
            lantern = _pick(doc, light_family)
            if lantern is None:
                continue
            oils = _carried_counts(doc, fuel_family)
            if not oils:
                blocked.append({"name": lantern["name"], "missing": [fuel_family]})
            for item_id, n in sorted(oils.items(), key=lambda kv: _tier(kv[0])):
                tier = min(lantern["tier"], _tier(item_id))
                supply.append({"light": light_family, "familyId": fuel_family, "itemId": item_id,
                               "name": lantern["name"], "tier": _tier(item_id), "bonusTier": tier,
                               "hours": min(_burn_hours(light_family, lantern["tier"]),
                                            _burn_hours(fuel_family, _tier(item_id))),
                               "count": n})
        else:
            for item_id, n in sorted(_carried_counts(doc, light_family).items(), key=lambda kv: _tier(kv[0])):
                supply.append({"light": light_family, "familyId": light_family, "itemId": item_id,
                               "name": _item_name(item_id, light_family), "tier": _tier(item_id),
                               "bonusTier": _tier(item_id), "hours": _burn_hours(light_family, _tier(item_id)),
                               "count": n})
    supply = [u for u in supply if u["hours"] > 0]
    missing = missing_for_light(doc)
    if supply and missing:
        return [], [{"name": supply[0]["name"], "missing": missing}], lantern
    return supply, ([] if supply else blocked), lantern


def light_needed(units: int) -> int:
    """Units of a dig that need light: all of them, up to what
    MAX_LIGHT_HOURS_PER_TRIP covers - the rest needs no more light."""
    return min(units, MAX_LIGHT_HOURS_PER_TRIP // LIGHT_HOURS_PER_UNIT)


def plan_burn(supply: list[dict], units: int) -> tuple[dict[str, int], int, int]:
    """Burn whole units of `supply` in order until `units` units of work are
    lit (LIGHT_HOURS_PER_UNIT hours each; callers cap `units` with
    light_needed). Returns ({item id: burned}, units lit, best bonusTier
    burned - 0 if nothing)."""
    needed = units * LIGHT_HOURS_PER_UNIT
    covered, best = 0, 0
    burned: dict[str, int] = {}
    for unit in supply:
        n = 0
        while n < unit["count"] and covered < needed:
            n += 1
            covered += unit["hours"]
        if n:
            burned[unit["itemId"]] = burned.get(unit["itemId"], 0) + n
            best = max(best, unit["bonusTier"])
        if covered >= needed:
            break
    return burned, min(units, covered // LIGHT_HOURS_PER_UNIT), best


def _light_pick(supply: list[dict], lantern: Optional[dict], bonus_tier: int,
                burned: Optional[dict[str, int]] = None) -> dict:
    """The light as one gear item: named after the best light that burns
    (the first in line before a trip), carrying the whole trip's hours. The
    lantern itself (an item instance, it wears) stands in when its oil
    burned."""
    burned_ids = set(burned) if burned else {supply[0]["itemId"]}
    used = [u for u in supply if u["itemId"] in burned_ids]
    best = max((u for u in used if u["bonusTier"] == bonus_tier), key=lambda u: u["tier"], default=used[0])
    oil_used = any(u["light"] in LIGHT_FUEL for u in used)
    holder = lantern if (lantern and oil_used) else None
    return {"instanceId": holder["instanceId"] if holder else None,
            "itemId": holder["itemId"] if holder else best["itemId"],
            "familyId": best["light"], "name": best["name"],
            "quality": holder.get("quality") if holder else None,
            "tier": bonus_tier, "bonusTier": bonus_tier,
            "fuel": {"familyId": best["familyId"], "itemId": best["itemId"], "tier": best["tier"]}}


def dig(site_units: int, multiplier: float, draw: float = 1.0) -> tuple[int, int]:
    """(taken from the site, brought home) for `site_units` dug with this
    gear multiplier. A bonus is extra on top - it never leaves the site -
    rounded with a chance: its fraction adds one more unit when it beats
    `draw` (a roll in [0, 1): 1.0 always rounds down, 0.0 always up), so
    +70% on 1 unit gives 2 units 70% of the time. A penalty (darkness)
    shrinks the find (rounded down), and only the smaller find leaves."""
    if multiplier >= 1:
        extra = site_units * (multiplier - 1)
        whole = math.floor(extra + 1e-9)
        if extra - whole > 1e-9 and extra - whole > draw:
            whole += 1
        return site_units, site_units + whole
    found = math.floor(site_units * multiplier + 1e-9)
    return found, found


def bonus_draw() -> float:
    """The roll that rounds a trip's gear bonus (see dig) - one per trip."""
    return random.random()


def plan_trip(base: int, count: int, remaining: int, weapon: Optional[dict], items: list[dict],
              supply: list[dict], lantern: Optional[dict], family_id: str, draw: float = 1.0,
              half_life: Optional[float] = None) -> dict:
    """One trip's dig. The site gives the base find (trip_amount without
    gear: decayed, at least 1, at most what's left); gear adds its bonus on
    top without taking more from the site, a penalty (darkness) shrinks the
    find and only the smaller find leaves the site. Light is needed per unit
    the site gives (LIGHT_HOURS_PER_UNIT hours each) - the gear's bonus
    comes on top without more light, so what burns doesn't depend on it. The
    units the light covers are dug with the best light burned as bonus, the
    rest of the site's find as without a light (on ore and crystal: in the
    dark). `items` without lights; `draw` rounds the gear bonus (see dig -
    1.0 rounds down, 0.0 up). Returns {"amount" (brought home), "taken"
    (from the site), "litUnits", "darkUnits" (brought home lit / unlit),
    "inDark" (any of it dug in the dark on a dark material), "burned" {item
    id: units}, "lightHours" (burned), "lightNeed" (units that need light),
    "gear" (as _with_bonus, the light that counted among its items)}."""
    no_light = _with_bonus(weapon, items, family_id)
    site = trip_amount(base, count, remaining, half_life=half_life)   # the base find, gear aside
    if not supply:
        mult = gear_multiplier(no_light)
        if mult < 1:
            # The whole find shrinks - and only the smaller find leaves.
            found = trip_amount(base, count, remaining, mult, half_life)
            taken, home = found, found
        else:
            taken, home = dig(site, mult, draw)
        return {"amount": home, "taken": taken, "litUnits": 0, "darkUnits": home,
                "inDark": no_light["dark"] and home > 0, "burned": {}, "lightHours": 0,
                "lightNeed": 0, "gear": no_light}
    need = light_needed(site)
    burned, lit_site, best = plan_burn(supply, need)
    if not burned:
        # Nothing dug, nothing burned - a light only counts once it burns.
        return {"amount": 0, "taken": 0, "litUnits": 0, "darkUnits": 0, "inDark": False,
                "burned": {}, "lightHours": 0, "lightNeed": 0, "gear": no_light}
    if lit_site >= need:
        lit_site = site            # past MAX_LIGHT_HOURS_PER_TRIP the dig goes on without more light
    # Only a light that actually burned sets the bonus (carried, unburned
    # light never counts).
    lit_gear = _with_bonus(weapon, items + [_light_pick(supply, lantern, best, burned)], family_id)
    _, lit_home = dig(lit_site, gear_multiplier(lit_gear), draw)
    dark_site = site - lit_site
    dark_taken, dark_home = dig(dark_site, gear_multiplier(no_light), draw) if dark_site else (0, 0)
    hours = sum(u["hours"] * burned[u["itemId"]] for u in supply if u["itemId"] in burned)
    return {"amount": lit_home + dark_home, "taken": lit_site + dark_taken, "litUnits": lit_home,
            "darkUnits": dark_home, "inDark": dark_site > 0 and family_id in DARK_FAMILIES,
            "burned": burned, "lightHours": hours, "lightNeed": need, "gear": lit_gear}


def gathering_gear(doc: dict, family_id: str) -> dict:
    """The gear this character would bring on a trip for `family_id`:
    {"weapon": {...} | None, "items": [{...}], "percent": int, "light":
    {"hours"} | None}. Each pick is {"instanceId" | None, "itemId",
    "familyId", "name", "quality" | None}; instanceId None means a plain
    stacked item (no quality, never wears). At most one light is among the
    items (it has "fuel"; see light_supply)."""
    wanted = GATHERING_GEAR.get(family_id) or {"weapons": (), "items": ()}

    def pick(item_family: str) -> Optional[dict]:
        return _pick(doc, item_family)

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
    items = [i for i in (pick(f) for f in wanted["items"] if f not in LIGHT_SOURCES) if i]

    charm, blocked_charm = _companion_charm(doc, family_id)
    if charm:
        items.append(charm)
    # The light: shown as the first one in line (it always burns), with the
    # hours everything carried would last (see light_supply / plan_trip).
    supply, blocked_lights, lantern = light_supply(doc, family_id)
    light = None
    if supply:
        items.append(_light_pick(supply, lantern, supply[0]["bonusTier"]))
        light = {"hours": sum(u["hours"] * u["count"] for u in supply)}
    return {**_with_bonus(weapon, items, family_id), "light": light, "blockedWeapons": blocked,
            "blockedLights": blocked_lights, "blockedItems": [blocked_charm] if blocked_charm else []}


def _equipped_in(doc: dict, slot: str) -> Optional[dict]:
    """The usable item worn in this body slot, if any."""
    return next((i for i in (doc.get("gear") or {}).get("items", [])
                 if i.get("location") == "body" and slot in (i.get("slotRef") or []) and _usable(i)), None)


def _companion_charm(doc: dict, family_id: str) -> tuple[Optional[dict], Optional[dict]]:
    """The charm worn by the character's companion, if it helps with
    `family_id`: (gear pick, None), or (None, a hint) when it would help but
    sits on the wrong kind of companion."""
    worn = _equipped_in(doc, "Charm")
    rule = COMPANION_CHARMS.get((worn or {}).get("familyId", ""))
    if not worn or not rule or family_id not in rule["families"]:
        return None, None
    item_id = worn.get("itemId", "")
    pick = {"instanceId": worn.get("instanceId"), "itemId": item_id, "familyId": worn["familyId"],
            "name": _item_name(item_id, worn["familyId"]), "quality": worn.get("quality"),
            "tier": _tier(item_id)}
    companion = _equipped_in(doc, "Companion")
    if companion and companion.get("familyId") in rule["companions"]:
        return pick, None
    return None, {"name": pick["name"], "missing": list(rule["companions"])}


def gear_multiplier(gear: dict) -> float:
    return max(0.0, 1 + (gear.get("percent") or 0) / 100)


def _still_carried(doc: dict, gear: dict, family_id: Optional[str] = None) -> dict:
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
    # A light also needs its tinderbox and fuel still on hand.
    items = [i for i in items
             if not i.get("fuel") or (not missing_for_light(doc) and _carries_family(doc, i["fuel"]["familyId"]))]
    return _with_bonus(weapon, items, family_id)


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
    trip (it's empty now, so the site disappears), "thin" once
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


def night_message(night: dict, missing_shelter: list[str], character_name: str,
                  rng: random.Random | None = None) -> str:
    """The night's sentence, plus a wish for the missing tent/bedroll - only
    when the lack, not bad luck, cost points: the weather's certain loss for
    the shelter carried (the whole part of pointsLost) is at least 1. So a
    bare cool or harsh night wishes for either, a harsh night with one of
    them wishes for the other, and a cool night with one (a 50% chance) wishes
    for nothing."""
    rng = rng or random.Random()
    # Weather-specific lines first (e.g. a cold night the tent kept warm),
    # else the general ones for the outcome.
    by_weather = (NIGHT_MESSAGES.get("byWeather") or {}).get(night.get("weather")) or {}
    templates = by_weather.get(night["kind"]) or NIGHT_MESSAGES[night["kind"]]
    carried = [f.replace("_", " ") for f in SHELTER if f not in missing_shelter]
    text = rng.choice(templates).format(name=character_name, shelter=" and ".join(carried) or "camp")
    shelter_count = len(SHELTER) - len(missing_shelter)
    certain = int(condition.night_cost(NIGHTS, shelter_count, night.get("weather") or ""))
    if night["points"] and missing_shelter and certain >= 1:
        wish = NIGHT_MESSAGES["wishNone"] if not shelter_count else NIGHT_MESSAGES["wishOne"]
        text = f"{text} {wish.format(name=character_name, missing=missing_shelter[0].replace('_', ' '))}"
    return text


def roll_surprises(rng: random.Random | None = None) -> dict[str, int]:
    """Rare extra finds: each band in SURPRISES rolls its chance once; a hit
    is a random raw material (any family) of one of the band's tiers, in an
    amount within the band's range. {item id: amount} - usually empty."""
    rng = rng or random.Random()
    found: dict[str, int] = {}
    for band in SURPRISES:
        if rng.random() >= band["chance"]:
            continue
        options = [r for r in RESOURCE_ITEMS if r.tier in band["tiers"]]
        item = rng.choice(options)
        low, high = band["amount"]
        found[item.id] = found.get(item.id, 0) + rng.randint(low, high)
    return found


def surprise_message(surprise: dict[str, int], character_name: str,
                     rng: random.Random | None = None) -> Optional[str]:
    """One sentence for the surprise finds, e.g. "...picked up 2 Copper Ore." -
    opened by a "you were exceptionally lucky" line when a find is T4 or higher."""
    if not surprise:
        return None
    rng = rng or random.Random()
    parts = [f"{n} {RESOURCE_ITEMS_BY_ID[item_id].name}" if item_id in RESOURCE_ITEMS_BY_ID else f"{n} {item_id}"
             for item_id, n in surprise.items()]
    found = parts[0] if len(parts) == 1 else f"{', '.join(parts[:-1])} and {parts[-1]}"
    text = rng.choice(SURPRISE_MESSAGES).format(name=character_name, found=found)
    if any(_tier(item_id) >= RARE_SURPRISE_TIER for item_id in surprise):
        text = f"{rng.choice(SURPRISE_RARE_INTROS).format(name=character_name)} {text}"
    return text


def old_gear_options(family_id: str) -> list[tuple[str, dict, int]]:
    """The pieces old gear can be for `family_id`: its gathering weapons and
    items that are condition-tracked instances, at the rule's tier, as
    (item family, catalog row, condition level when new)."""
    tier = int(OLD_GEAR.get("tier", 1))
    gear = GATHERING_GEAR.get(family_id) or {}
    options = []
    for item_family in dict.fromkeys(gear.get("weapons", ()) + gear.get("items", ())):
        family = items_catalog.ITEM_FAMILIES_BY_ID.get(item_family)
        if family is None or not family.needs_item_definition:
            continue
        row = items_catalog.resolve_output_row(item_family, tier)
        if row is not None:
            options.append((item_family, row, item_condition.NEW))
    return options


def roll_old_gear(family_id: str, rng: random.Random | None = None) -> Optional[dict]:
    """Maybe a forgotten piece of gathering gear for `family_id`, found
    broken: {"instanceId", "itemId", "familyId", "name", "tier", "icon",
    "description", "quality" (condition level), "condition"} or None."""
    rng = rng or random.Random()
    if not OLD_GEAR or rng.random() >= OLD_GEAR.get("chance", 0):
        return None
    options = old_gear_options(family_id)
    if not options:
        return None
    item_family, row, _ = rng.choice(options)
    return {"instanceId": uuid.uuid4().hex, "itemId": row["id"], "familyId": item_family,
            "name": row["name"], "tier": int(OLD_GEAR.get("tier", 1)), "icon": row.get("icon", ""),
            "description": row.get("description", ""), "quality": item_condition.LOST_EQUIPMENT_LEVEL,
            "condition": item_condition.label(item_condition.LOST_EQUIPMENT_LEVEL)}


def old_gear_message(old: Optional[dict], character_name: str,
                     rng: random.Random | None = None) -> Optional[str]:
    if not old:
        return None
    rng = rng or random.Random()
    return rng.choice(OLD_GEAR_MESSAGES).format(name=character_name, item=old["name"])


def roll_trip_night(doc: dict, family_id: Optional[str] = None, rng: random.Random | None = None) -> dict:
    """The trip's night: weather, what the tent/bedroll carried saved, and the
    temporary Body/Soul points it costs (applied when the trip is collected)."""
    rng = rng or random.Random()
    carried = [f for f in SHELTER if _carries_family(doc, f)]
    lost, _ = condition.settle(doc.get("attr") or {}, doc.get("attrLost"), doc.get("healFrom"),
                               datetime.now(timezone.utc), doc.get("id", ""))
    night = condition.roll_night(NIGHTS, len(carried), doc.get("attr") or {}, lost, rng, family_id)
    missing = [f for f in SHELTER if f not in carried]
    severity = (NIGHTS["weather"].get(night["weather"]) or {}).get("severity", "none")
    # The tent still kept that night off - but rough weather may wreck it.
    tent_destroyed = "tent" in carried and rng.random() < TENT_DESTROYED_CHANCE.get(severity, 0)
    # Any night may also simply wear a carried tent or bedroll out.
    worn_out = [f for f in carried if item_condition.roll(float(item_condition.NIGHTS["shelterLoss"]), rng)]
    return {**night, "shelter": carried, "tentDestroyed": tent_destroyed, "shelterWornOut": worn_out,
            "message": night_message(night, missing, doc.get("firstName") or "Your character", rng)}


def roll_dark_accident(doc: dict, rng: random.Random | None = None) -> Optional[dict]:
    """Maybe an accident in the dark (rules "darkness" "accidents"): one roll,
    the bands tried in order, each with its own chance. A hit costs a random
    number of points in its range, each on a random Body attribute (applied
    on collect; backend.condition spills a point over once an attribute is
    at 0 - a big accident can kill). A band with "lostDays" adds
    "lostDays" (the trip's hidden delay) and "lostPoints" (a point per day on
    the lostGroup - Soul). {"severity", "points", "message", "lostDays"?,
    "lostPoints"?} or None."""
    rng = rng or random.Random()
    roll = rng.random()
    for band in DARK_ACCIDENTS:
        if roll >= band["chance"]:
            roll -= band["chance"]
            continue
        low, high = band["points"]
        points: dict[str, int] = {}
        for _ in range(rng.randint(low, high)):
            attr = rng.choice(condition.BODY_ATTRS)
            points[attr] = points.get(attr, 0) + 1
        name = doc.get("firstName") or "Your character"
        text = rng.choice(_MESSAGES["darkAccidents"][band["severity"]]).format(name=name)
        accident = {"severity": band["severity"], "points": points, "message": text}
        if band.get("lostDays"):
            days = rng.randint(*band["lostDays"])
            lost_points: dict[str, int] = {}
            for _ in range(days * DARK_LOST_PER_DAY):
                attr = rng.choice(condition.ATTR_GROUPS[DARK_LOST_GROUP])
                lost_points[attr] = lost_points.get(attr, 0) + 1
            day_text = f"{days} day" if days == 1 else f"{days} days"
            lost_text = rng.choice(_MESSAGES["darkAccidents"]["lost"]).format(name=name, days=day_text)
            accident.update({"lostDays": days, "lostPoints": lost_points,
                             "message": f"{text} {lost_text}"})
        return accident
    return None


def tent_destroyed_message(tent_name: str, character_name: str, rng: random.Random | None = None,
                           weather: Optional[str] = None) -> str:
    """How the tent was lost - the weather's own lines first (a flooded
    gallery, a tremor...), else the general ones."""
    rng = rng or random.Random()
    by_weather = ((NIGHT_MESSAGES.get("byWeather") or {}).get(weather or "") or {}).get("tentDestroyed")
    return rng.choice(by_weather or NIGHT_MESSAGES["tentDestroyed"]).format(name=character_name, tent=tent_name)


def suggested_mission(family_id: str, seed: str) -> Optional[Mission]:
    """One mission from this material's list - stable for a given seed, so
    the offer doesn't reshuffle on every reload but changes after each trip."""
    options = sorted((m for m in MISSIONS_BY_ID.values() if m.family_id == family_id), key=lambda m: m.id)
    if not options:
        return None
    return random.Random(f"{seed}:{family_id}").choice(options)


def return_at(active: dict) -> datetime:
    """When a trip really ends: its readyAt, or later when the character got
    lost in the dark (returnAt, secret)."""
    return datetime.fromisoformat(active.get("returnAt") or active["readyAt"])


def is_lost(active: Optional[dict], now: datetime | None = None) -> bool:
    """Past the planned return but not back yet - lost in the dark."""
    if not active or not active.get("returnAt"):
        return False
    now = now or datetime.now(timezone.utc)
    return datetime.fromisoformat(active["readyAt"]) <= now < return_at(active)


def hide_pending_result(active: Optional[dict], now: datetime | None = None) -> Optional[dict]:
    """A trip as the client may see it - its outcome is rolled at the start
    but stays secret until the trip is collected, and so does how long a lost
    character stays away: the client gets the planned readyAt, and `lost`
    once that has passed."""
    if not active:
        return active
    shown = {k: v for k, v in active.items() if k not in ("result", "returnAt")}
    if is_lost(active, now):
        shown["lost"] = True
    return shown


def public_pc_entry(entry: dict, now: datetime | None = None) -> dict:
    """A player_characters entry as the client may see it: the real return
    time of a lost character (timers.foragingReturnAt) never leaves the
    server; once the planned return has passed, status "foraging" reads
    "lost" and the foraging timer is gone (no countdown, no "Back")."""
    timers = entry.get("timers") or {}
    real = timers.get("foragingReturnAt")
    if not real:
        return entry
    timers = {k: v for k, v in timers.items() if k != "foragingReturnAt"}
    now = now or datetime.now(timezone.utc)
    planned = timers.get("foragingReadyAt")
    status = entry.get("status") or []
    if planned and datetime.fromisoformat(planned) <= now < datetime.fromisoformat(real):
        timers.pop("foragingReadyAt", None)
        status = ["lost" if s == "foraging" else s for s in status]
    return {**entry, "timers": timers, "status": status}


def forage_active(doc: dict, now: datetime | None = None) -> bool:
    """Whether the character is out on a trip that hasn't returned yet (lost
    included)."""
    active = (doc.get("foraging") or {}).get("activeForage")
    return bool(active) and return_at(active) > (now or datetime.now(timezone.utc))


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
        # An empty (or forgotten) site is no longer shown or offered - its
        # last trip already said so (see return_outcome).
        if is_exhausted(remaining):
            continue
        gear = gathering_gear(doc, family_id)
        low_plan, high_plan = site_plans(doc, family_id, count, remaining, gear, site_half_life(entry["initial"]))
        low, high = low_plan["amount"], high_plan["amount"]
        if gear.get("light"):
            gear["light"] = {**gear["light"], **light_cover(gear["light"]["hours"], low_plan, high_plan)}
        mission = suggested_mission(family_id, seed)
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
            "helpfulItems": list(wanted["items"]) + [c for c, r in COMPANION_CHARMS.items()
                                                      if family_id in r["families"]],
            "mission": mission.to_dict() if mission else None,
            # Dug in the dark (ore, crystal): the site card marks it with a lit torch.
            "needsLight": family_id in DARK_FAMILIES,
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


@transactional
async def start_forage(address: str, character_id: str, mission_id: str) -> dict:
    db = get_database()
    doc = await _load_character(address, character_id)
    name = doc.get("firstName") or "This character"
    now = datetime.now(timezone.utc)

    mission = MISSIONS_BY_ID.get(mission_id)
    if mission is None:
        raise ForagingError("Unknown foraging mission")
    profession_ids = character_profession_ids(doc)
    if mission.family_id not in profession_families(profession_ids):
        raise ForagingError(f"{name}'s professions don't lead to {mission.name}")

    if condition.is_dead(doc):
        raise ForagingError(f"{name} lies cold beneath the earth. The dead gather nothing - no root, no stone, no ore.", 409)
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
    if is_exhausted(entry["remaining"]):
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
    updated = await find_one_and_update_checked(
        db.characters,
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
    await condition.pause_healing(address, character_id, db)

    # Roll the whole outcome now (finds, ammo, wear) and keep it with the
    # trip - hidden until collected (see hide_pending_result).
    result = await _roll_trip(db, address, character_id, doc, active, active["gear"])
    # Lost in the dark: the trip really ends days later - kept next to the
    # result, as secret as it (hide_pending_result / public_pc_entry).
    lost_days = (result.get("accident") or {}).get("lostDays") or 0
    trip_set: dict = {"foraging.activeForage.result": result}
    pc_set: dict = {"characters.$.timers.foragingReadyAt": ready_at.isoformat()}
    if lost_days:
        real_return = (ready_at + timedelta(days=lost_days)).isoformat()
        trip_set["foraging.activeForage.returnAt"] = real_return
        pc_set["characters.$.timers.foragingReturnAt"] = real_return
    updated = await find_one_and_update_checked(
        db.characters,
        {"address": address, "id": character_id, "foraging.activeForage.startedAt": active["startedAt"]},
        {"$set": trip_set},
        return_document=ReturnDocument.AFTER,
    ) or updated
    pool = await get_slot_pool(address, doc.get("slotNumber", 0))

    # Status + timer in one write (see _pc_update).
    await _pc_update(db, address, character_id, {
        "$addToSet": {"characters.$.status": "foraging"},
        "$set": pc_set,
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
                     found: bool, rng: random.Random | None = None) -> tuple[list, list]:
    """Wear the trip's gear (backend.item_condition, data/item-conditions.json
    "foraging"), whatever its tier: the weapon - only if it had to work for
    a find (`weapon_wear` > 0, see _roll_trip) - and each condition-tracked
    item, if the trip found anything (`found`), may drop one level; below
    broken it's gone. A stacked item (whetstone, iron spikes...)
    that counted may lose one unit instead. A light's own fuel already
    burned, so it's left out. Returns (worn, broken names) - worn entries
    {instanceId, name, kind, wear (levels lost), destroyed, condition}."""
    rng = rng or random.Random()
    wear: dict[str, int] = {}
    worn: list[dict] = []
    stacks_lost: list[dict] = []
    weapon = gear.get("weapon")
    if weapon:
        if (weapon["instanceId"] and weapon.get("quality") is not None and weapon_wear > 0
                and item_condition.roll(float(item_condition.FORAGING["weapon"]), rng)):
            wear[weapon["instanceId"]] = 1
        worn.append({"instanceId": weapon["instanceId"], "name": weapon["name"], "kind": "weapon",
                     "wear": wear.get(weapon["instanceId"] or "", 0), "destroyed": False,
                     "condition": item_condition.label(weapon.get("quality"))})
    for item in gear.get("items", []):
        if item["instanceId"] and item.get("quality") is not None:
            if found and item_condition.roll(float(item_condition.FORAGING["item"]), rng):
                wear[item["instanceId"]] = 1
        elif not item.get("fuel") and item_condition.roll(float(item_condition.FORAGING["stackLoss"]), rng):
            stacks_lost.append(item)
        worn.append({"instanceId": item["instanceId"], "name": item["name"], "kind": "item",
                     "wear": wear.get(item["instanceId"] or "", 0), "destroyed": False,
                     "condition": item_condition.label(item.get("quality"))})

    broken_names: list[str] = []
    # A stacked piece used up: one unit leaves the pack.
    for item in stacks_lost:
        used, _ = await _consume_ammo(db, address, character_id, item["familyId"], [item.get("tier", 1)])
        if used:
            broken_names.append(item["name"])
    if not wear:
        return worn, broken_names

    ids = list(wear)
    doc = await find_one_and_update_checked(
        db.characters,
        {"address": address, "id": character_id},
        {"$inc": {f"gear.items.$[g{n}].quality": -wear[iid] for n, iid in enumerate(ids)}},
        array_filters=[{f"g{n}.instanceId": iid} for n, iid in enumerate(ids)],
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return worn, broken_names
    after = {i.get("instanceId"): i for i in doc.get("gear", {}).get("items", [])}
    broken_items = [i for iid, i in after.items() if iid in wear and (i.get("quality") or 0) <= 0]
    if broken_items:
        await db.characters.update_one(
            {"address": address, "id": character_id},
            {"$pull": {"gear.items": {"instanceId": {"$in": [i["instanceId"] for i in broken_items]}}}},
        )
    broken_ids = {i["instanceId"] for i in broken_items}
    for w in worn:
        w["destroyed"] = w["instanceId"] in broken_ids
        if w["instanceId"] in after and not w["destroyed"]:
            w["condition"] = item_condition.label(after[w["instanceId"]].get("quality"))
    return worn, broken_names + [_item_name(i.get("itemId", ""), i.get("familyId", "")) for i in broken_items]


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

    # Light: everything carried that can burn (light_supply) - how much of it
    # burns depends on how much is dug (plan_trip, 1h per unit).
    weapon = gear.get("weapon")
    plain_items = [i for i in gear.get("items", []) if not i.get("fuel")]
    supply, _, lantern = light_supply(doc, family_id)

    found, entry, plan = {}, None, None
    for _ in range(3):
        pool = await get_slot_pool(address, slot)
        entry = ((pool or {}).get("families") or {}).get(family_id)
        if entry is None:
            break
        plan = plan_trip(random.randint(BASE_YIELD_MIN, BASE_YIELD_MAX), entry["count"], entry["remaining"],
                         weapon, plain_items, supply, lantern, family_id, bonus_draw(),
                         half_life=site_half_life(entry.get("initial")))
        amount, taken = plan["amount"], plan["taken"]
        # Conditional on the family being exactly as read - one writer wins.
        # Only the base find leaves the site; the gear's bonus is extra.
        res = await db.soul_slots.update_one(
            {"address": address, f"{path}.count": entry["count"], f"{path}.remaining": entry["remaining"]},
            {"$inc": {f"{path}.count": 1, f"{path}.remaining": -taken}},
        )
        if res.modified_count:
            entry = {**entry, "count": entry["count"] + 1, "remaining": entry["remaining"] - taken}
            found = roll_tiers(family_id, amount, profession_count) if amount else {}
            break
    if plan is not None:
        gear = {**gear, **plan["gear"]}

    # Burn what lit the dig: whole units, oil first, lowest tier first.
    light_used: dict[str, int] = {}
    for unit in supply:
        n = (plan or {}).get("burned", {}).get(unit["itemId"], 0)
        if n:
            used, _ = await _consume_ammo(db, address, character_id, unit["familyId"], [unit["tier"]] * n)
            for item_id, k in used.items():
                light_used[item_id] = light_used.get(item_id, 0) + k

    units_found = sum(found.values())
    tiers = unit_tiers(found)
    weapon = gear.get("weapon")
    ammo_family = WEAPON_AMMO.get(weapon["familyId"]) if weapon else None
    ammo_used, uncovered = (
        await _consume_ammo(db, address, character_id, ammo_family, tiers) if ammo_family else ({}, tiers)
    )
    # Gear of any tier wears on any find. A bow/crossbow's arrows/bolts cover
    # what they can (their tier or lower); the weapon only wears for the
    # finds they left uncovered.
    weapon_wear = len(uncovered) if weapon else 0
    ammo_shortfall = len(uncovered) if ammo_family else 0
    worn, broken = await _wear_gear(db, address, character_id, gear, weapon_wear, bool(tiers))

    # Lighting a light may use up the tinderbox (a stacked item).
    if light_used:
        for required in LIGHT_REQUIRES:
            piece = _pick(doc, required)
            if piece and piece["instanceId"] is None and item_condition.roll(float(item_condition.FORAGING["stackLoss"])):
                used, _ = await _consume_ammo(db, address, character_id, required, [piece["tier"]])
                if used:
                    broken = [*broken, piece["name"]]

    # The night: a severe one may wreck the pitched tent (the best one
    # carried), and any night may wear out the tent or bedroll - gone from
    # the pack right away, like burnt fuel.
    night = roll_trip_night(doc, family_id)
    if night.pop("tentDestroyed", False):
        tent = _pick(doc, "tent")
        used, _ = (await _consume_ammo(db, address, character_id, "tent", [tent["tier"]])
                   if tent else ({}, []))
        if used:
            night["tentLost"] = tent["name"]
            night["message"] = (f"{night['message']} "
                                f"{tent_destroyed_message(tent['name'], doc.get('firstName') or 'Your character', weather=night.get('weather'))}")
            broken = [*broken, tent["name"]]
    for shelter in night.pop("shelterWornOut", []):
        if shelter == "tent" and night.get("tentLost"):
            continue
        piece = _pick(doc, shelter)
        used, _ = (await _consume_ammo(db, address, character_id, shelter, [piece["tier"]])
                   if piece and piece["instanceId"] is None else ({}, []))
        if used:
            broken = [*broken, piece["name"]]

    # Mining in the dark: the find was already smaller, and it may go wrong.
    accident = roll_dark_accident(doc) if (plan or {}).get("inDark") else None

    exhausted = entry is None or is_exhausted(entry["remaining"])
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
        "lightUsed": light_used,
        "lightHours": (plan or {}).get("lightHours", 0),
        "litUnits": (plan or {}).get("litUnits", 0),
        "darkUnits": (plan or {}).get("darkUnits", 0) if (plan or {}).get("inDark") else 0,
        "fromSite": (plan or {}).get("taken", 0),
        "night": night,
        "accident": accident,
        **_surprise_fields(doc),
        **_old_gear_fields(doc, family_id),
    }


def _surprise_fields(doc: dict) -> dict:
    surprise = roll_surprises()
    return {"surprise": surprise,
            "surpriseMessage": surprise_message(surprise, doc.get("firstName") or "Your character")}


def _old_gear_fields(doc: dict, family_id: str) -> dict:
    old = roll_old_gear(family_id)
    return {"oldGear": old,
            "oldGearMessage": old_gear_message(old, doc.get("firstName") or "Your character")}


@transactional
async def finish_forage(address: str, character_id: str) -> dict:
    """Collect a returned trip: reveal the finds rolled when it started and
    drop them into the character's home storage. Returns {result, state}."""
    from backend.players import _inc_storage_balances, _push_storage_items

    db = get_database()
    doc = await _load_character(address, character_id)
    active = (doc.get("foraging") or {}).get("activeForage")
    if not active:
        raise ForagingError("Not out foraging", 404)
    if is_lost(active):
        raise ForagingError(f"{doc.get('firstName') or 'This character'} hasn't come back - "
                            "lost somewhere in the dark", 409)
    if return_at(active) > datetime.now(timezone.utc):
        raise ForagingError("Still out foraging", 409)

    # Claim the trip first, so a double-click can't pay out twice.
    claimed = await find_one_and_update_checked(
        db.characters,
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
                                  _still_carried(doc, active.get("gear") or {}, active.get("familyId")))
    result = {**result, "returnedAt": datetime.now(timezone.utc).isoformat()}

    # The character carries the finds home (character_homes.itemBalances),
    # surprise finds included.
    home_finds = dict(result["found"])
    for item_id, n in (result.get("surprise") or {}).items():
        home_finds[item_id] = home_finds.get(item_id, 0) + n
    if home_finds:
        await _inc_storage_balances(db, "home", address, character_id, home_finds)
    old = result.get("oldGear")
    if old:
        await _push_storage_items(db, "home", address, character_id, [{
            "instanceId": old["instanceId"], "itemId": old["itemId"], "familyId": old["familyId"],
            "quality": old["quality"], "location": "home", "slotRef": [],
            "createdAt": datetime.now(timezone.utc).isoformat(),
        }])
    # Back home and free: the night's toll lands now, and the healing clock
    # (re)starts - it never runs while out (backend.condition).
    night = result.get("night")
    lost, vital_status = await condition.apply_loss(address, character_id, (night or {}).get("points") or {}, db)
    if night is not None:
        result = {**result, "night": {**night, "lost": lost, "vitalStatus": vital_status}}
    accident = result.get("accident")
    if accident:
        # The accident's Body points, then a Soul point per day lost.
        points = dict(accident.get("points") or {})
        for attr, n in (accident.get("lostPoints") or {}).items():
            points[attr] = points.get(attr, 0) + n
        lost, vital_status = await condition.apply_loss(address, character_id, points, db)
        result = {**result, "accident": {**accident, "lost": lost, "vitalStatus": vital_status}}
    updated = await find_one_and_update_checked(
        db.characters,
        {"address": address, "id": character_id},
        {"$set": {"foraging.lastResult": result},
         "$inc": {"stats.forageFinished": 1, "stats.forageUnits": result["total"]}},
        return_document=ReturnDocument.AFTER,
    )
    await _pc_update(db, address, character_id, {
        "$pull": {"characters.$.status": "foraging"},
        "$unset": {"characters.$.timers.foragingReadyAt": "", "characters.$.timers.foragingReturnAt": ""},
    })
    slot = active.get("slotNumber") or doc.get("slotNumber", 0)
    return {"result": result, "state": _build_state(updated or claimed, await get_slot_pool(address, slot))}


async def forget_site(address: str, character_id: str, family_id: str) -> dict:
    """Give up one of the character's sites for good: what it still holds is
    dropped (remaining 0, kept as `forgotten`), so it's gone for every
    character the slot will ever have. Refused while a trip to it is out (a
    lost character included). One conditional write on soul_slots - checked
    by modified_count (see backend.db's Firestore note). Returns the state."""
    db = get_database()
    doc = await _load_character(address, character_id)
    name = doc.get("firstName") or "This character"
    if family_id not in profession_families(character_profession_ids(doc)):
        raise ForagingError(f"{name} has no {family_id} site to forget", 404)
    active = (doc.get("foraging") or {}).get("activeForage")
    if active and active.get("familyId") == family_id:
        raise ForagingError(f"{name} is out at that site", 409)

    slot = doc.get("slotNumber", 0)
    pool = await get_slot_pool(address, slot)
    entry = ((pool or {}).get("families") or {}).get(family_id)
    if entry is None or is_exhausted(entry["remaining"]):
        raise ForagingError(f"That {family_id} site is already gone", 409)
    path = f"forage_pools.{slot}.families.{family_id}"
    res = await db.soul_slots.update_one(
        {"address": address, f"{path}.remaining": entry["remaining"], f"{path}.count": entry["count"]},
        {"$set": {f"{path}.remaining": 0, f"{path}.forgotten": entry["remaining"]}},
    )
    if not res.modified_count:
        raise ForagingError("The site changed - please try again", 409)
    return _build_state(doc, await get_slot_pool(address, slot))
