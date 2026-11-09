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
quality <= 0 is destroyed.

Companion charms (companionCharms): the charm worn in the companion's Charm
slot adds its tier's item bonus on the materials that suit its companion
(e.g. a flying charm on a winged companion: feather, meat, hide) - only on a
matching companion - and wears like any item (1 per trip).

Light (lightSources): at most one light counts per trip - a glass lantern
with oil, else a torch, else a candle - and only with a tinderbox carried
(lightRequires). It adds the item bonus of its tier; a lantern counts at the
lower of its own and its oil's tier. The trip burns one unit: one oil for a
lantern (lightFuel), one torch or candle otherwise. Only gear still on the character at collection
counts.

A trip spends a night out (rules "nights"): weather is rolled (warm, cool,
harsh), and without a tent and bedroll it may cost a temporary Body and/or
Soul point (backend.condition) - none with both, at most one with either.
The night gets its own sentence (foraging-messages.json "nights").

Surprise finds (surprises): each trip rolls a 5% chance of 1-3 units of a
random T1-T3 raw material of any family, and separately a 1% chance of a
single T4-T6 one - a bonus on top, outside the pool, with no gear wear.

Old gear (oldGear): each trip also has a 15% chance of turning up one
forgotten T1 weapon or item from the gathering-gear list of the material
foraged - only quality-tracked pieces, found in the damaged range (at most
10% of their quality). It lands in home storage (character_homes.items).

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
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from pymongo import ReturnDocument

from backend import condition, items_catalog
from backend.db import get_database
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
# Light sources (ore, crystal, clockwork): at most one counts per trip, the
# first of LIGHT_SOURCES the character can light - only with everything in
# LIGHT_REQUIRES carried (a tinderbox). Each trip burns one unit of its fuel:
# a lantern one oil (LIGHT_FUEL), a torch or candle one of itself.
LIGHT_SOURCES: tuple[str, ...] = tuple(RULES.get("lightSources", ()))
LIGHT_REQUIRES: tuple[str, ...] = tuple(RULES.get("lightRequires", ()))
LIGHT_FUEL: dict[str, str] = dict(RULES.get("lightFuel", {}))
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


def _item_bonus(item: dict) -> float:
    """An item's bonus by its tier - a lantern's by `bonusTier`, the lower of
    its own and its oil's tier."""
    return ITEM_BONUS_BY_TIER.get(item.get("bonusTier", item["tier"]), 0)


def _gear_percent(weapon: Optional[dict], items: list[dict]) -> float:
    """Total bonus in percent - the weapon's tier bonus plus each item's."""
    total = WEAPON_BONUS_BY_TIER.get(weapon["tier"], 0) if weapon else 0
    total += sum(_item_bonus(i) for i in items)
    return round(total * 100, 1)


def _with_bonus(weapon: Optional[dict], items: list[dict]) -> dict:
    if weapon:
        weapon = {**weapon, "percent": round(WEAPON_BONUS_BY_TIER.get(weapon["tier"], 0) * 100, 1)}
    items = [{**i, "percent": round(_item_bonus(i) * 100, 1)} for i in items]
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
    LOWEST quality (it's the one that wears, so worn pieces get used up
    first; a stack without quality comes last)."""
    pieces = _carried_pieces(doc, item_family)
    return max(pieces, key=_wear_order) if pieces else None


def missing_for_light(doc: dict) -> list[str]:
    """What a light still needs before it counts (empty = ready): a tinderbox."""
    return [f for f in LIGHT_REQUIRES if not _carries_family(doc, f)]


def _light(doc: dict, light_family: str) -> tuple[Optional[dict], list[str]]:
    """This light as a gear pick, ready to burn - or (None, what's missing).

    The pick carries `fuel` {"familyId", "itemId", "tier"}: what one trip
    burns. A torch or candle burns one of itself (its highest tier). A
    lantern burns one oil - the best oil up to the lantern's own tier (better
    oil would be wasted, as the lower tier sets the light), else the weakest
    one there is - and counts at the lower of the two tiers (`bonusTier`)."""
    piece = _pick(doc, light_family)
    if piece is None:
        return None, []
    missing = missing_for_light(doc)
    fuel_family = LIGHT_FUEL.get(light_family)
    if fuel_family is None:
        fuel = {"familyId": light_family, "itemId": piece["itemId"], "tier": piece["tier"]}
    else:
        oils = _carried_pieces(doc, fuel_family)
        if not oils:
            missing = [*missing, fuel_family]
            fuel = None
        else:
            fitting = [o for o in oils if o["tier"] <= piece["tier"]]
            oil = max(fitting, key=lambda o: o["tier"]) if fitting else min(oils, key=lambda o: o["tier"])
            fuel = {"familyId": fuel_family, "itemId": oil["itemId"], "tier": oil["tier"]}
    if missing:
        return None, missing
    return {**piece, "fuel": fuel, "bonusTier": min(piece["tier"], fuel["tier"])}, []


def gathering_gear(doc: dict, family_id: str) -> dict:
    """The gear this character would bring on a trip for `family_id`:
    {"weapon": {...} | None, "items": [{...}], "percent": int}. Each pick is
    {"instanceId" | None, "itemId", "familyId", "name", "quality" | None};
    instanceId None means a plain stacked item (no quality, never wears).
    At most one light is among the items (see _light)."""
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

    # At most one light - the first in LIGHT_SOURCES order that can be lit.
    blocked_lights = []
    for light_family in (f for f in LIGHT_SOURCES if f in wanted["items"]):
        light, missing = _light(doc, light_family)
        if light:
            items.append(light)
            blocked_lights = []
            break
        if missing:
            blocked_lights.append({"name": _pick(doc, light_family)["name"], "missing": missing})
    charm, blocked_charm = _companion_charm(doc, family_id)
    if charm:
        items.append(charm)
    return {**_with_bonus(weapon, items), "blockedWeapons": blocked, "blockedLights": blocked_lights,
            "blockedItems": [blocked_charm] if blocked_charm else []}


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
    # A light also needs its tinderbox and fuel still on hand.
    items = [i for i in items
             if not i.get("fuel") or (not missing_for_light(doc) and _carries_family(doc, i["fuel"]["familyId"]))]
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
    certain = int(float(NIGHTS["pointsLost"][str(min(shelter_count, 2))].get(night.get("weather"), 0)))
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
    items that are quality-tracked instances, at the rule's tier, as
    (item family, catalog row, full quality at that tier)."""
    tier = int(OLD_GEAR.get("tier", 1))
    gear = GATHERING_GEAR.get(family_id) or {}
    options = []
    for item_family in dict.fromkeys(gear.get("weapons", ()) + gear.get("items", ())):
        family = items_catalog.ITEM_FAMILIES_BY_ID.get(item_family)
        if family is None or not family.quality_max or not family.needs_item_definition:
            continue
        row = items_catalog.resolve_output_row(item_family, tier)
        if row is not None:
            options.append((item_family, row, family.quality_max * (2 ** (tier - 1))))
    return options


def roll_old_gear(family_id: str, rng: random.Random | None = None) -> Optional[dict]:
    """Maybe a forgotten piece of gathering gear for `family_id`, damaged:
    {"instanceId", "itemId", "familyId", "name", "tier", "icon", "quality", "qualityMax"}
    or None (qualityMax is the full quality at that tier)."""
    rng = rng or random.Random()
    if not OLD_GEAR or rng.random() >= OLD_GEAR.get("chance", 0):
        return None
    options = old_gear_options(family_id)
    if not options:
        return None
    item_family, row, quality_max = rng.choice(options)
    top = max(1, math.floor(quality_max * OLD_GEAR.get("maxQualityFraction", 0.1)))
    return {"instanceId": uuid.uuid4().hex, "itemId": row["id"], "familyId": item_family,
            "name": row["name"], "tier": int(OLD_GEAR.get("tier", 1)), "icon": row.get("icon", ""),
            "quality": rng.randint(1, top), "qualityMax": quality_max}


def old_gear_message(old: Optional[dict], character_name: str,
                     rng: random.Random | None = None) -> Optional[str]:
    if not old:
        return None
    rng = rng or random.Random()
    return rng.choice(OLD_GEAR_MESSAGES).format(name=character_name, item=old["name"])


def roll_trip_night(doc: dict, rng: random.Random | None = None) -> dict:
    """The trip's night: weather, what the tent/bedroll carried saved, and the
    temporary Body/Soul points it costs (applied when the trip is collected)."""
    rng = rng or random.Random()
    carried = [f for f in SHELTER if _carries_family(doc, f)]
    lost, _ = condition.settle(doc.get("attr") or {}, doc.get("attrLost"), doc.get("healFrom"),
                               datetime.now(timezone.utc), doc.get("id", ""))
    night = condition.roll_night(NIGHTS, len(carried), doc.get("attr") or {}, lost, rng)
    missing = [f for f in SHELTER if f not in carried]
    return {**night, "shelter": carried,
            "message": night_message(night, missing, doc.get("firstName") or "Your character", rng)}


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
            "helpfulItems": list(wanted["items"]) + [c for c, r in COMPANION_CHARMS.items()
                                                      if family_id in r["families"]],
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
    await condition.pause_healing(address, character_id, db)

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

    # Burn the light first: one oil for a lantern, one torch or candle. With
    # nothing left to burn (moved away since the gear was picked), the light
    # adds nothing.
    light_used: dict[str, int] = {}
    for light in [i for i in gear.get("items", []) if i.get("fuel")]:
        fuel = light["fuel"]
        used, unburned = await _consume_ammo(db, address, character_id, fuel["familyId"], [fuel["tier"]])
        if unburned:
            gear = {**gear, **_with_bonus(gear.get("weapon"),
                                          [i for i in gear["items"] if i is not light])}
        for item_id, n in used.items():
            light_used[item_id] = light_used.get(item_id, 0) + n
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
        "lightUsed": light_used,
        "night": roll_trip_night(doc),
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


async def finish_forage(address: str, character_id: str) -> dict:
    """Collect a returned trip: reveal the finds rolled when it started and
    drop them into the character's home storage. Returns {result, state}."""
    from backend.players import _inc_storage_balances, _push_storage_items

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
