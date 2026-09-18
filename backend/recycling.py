"""
Item recycling: breaking a crafted item back down into a fraction of the raw
materials its recipe's full chain would need, rather than refunding the
recipe outright.

Yield formula (per raw material family, capped at 91% until a future magic
bonus can push past that): 25% base + the character's profession level
(1-30) in whichever profession category that raw family belongs to (see
professions_catalog.PROFESSION_CATEGORIES / resources_catalog.
PROFESSION_RESOURCE_FAMILIES) as a flat percent, 0 with no matching
profession + a station-tool bonus (0/5/10/15/20/25/30% for
none/T1/.../T6) from the single BEST-tier crafting-station tool the
character has access to - every station works for every raw material
alike, only its tier matters. Most station families (anvil, workbench,
loom, scriptorium, grinding_stone, alchemy_stand, enchanters_table,
lapidary_bench) are instance-tracked equippable gear (item-inventory-
properties.json's needsItemDefinition:true - carried two-handed or hauled
on a mount), the rest are a flat balance - see
_best_owned_station_tool_tier. Recycling off a character's own body/
backpack only counts what that character physically has on them, never
the player's shared pool sitting back at the vault; recycling a vault item
counts the shared pool too, since the character is right there + a worn
hunters_charm's tier as a flat 1-6% (0 unworn). 25 + 30 + 30 + 6 = 91,
matching the design note this module implements.

The recovered amount is never handed back as raw units alone: it's
converted into the highest-tier processed intermediates the recipe's own
chain would make from that much raw material, greedily (as many of the
biggest processed unit as fit, then the next tier down on the remainder,
down to whatever raw units are left over) - see resolve_recycle_preview.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

from backend import items_catalog
from backend.processed_catalog import PROCESSED_RESOURCE_ITEMS, PROCESSED_RESOURCE_ITEMS_BY_ID
from backend.professions_catalog import PROFESSION_CATEGORIES
from backend.resources_catalog import RESOURCE_ITEMS, RESOURCE_ITEMS_BY_ID, PROFESSION_RESOURCE_FAMILIES
from backend.tools_catalog import TOOL_ITEMS_BY_ID

_DATA_DIR = Path(__file__).resolve().parent / "data"
_RECIPES_PATH = _DATA_DIR / "craft-recipes.json"


def _load_recipes() -> dict[str, dict]:
    data = json.loads(_RECIPES_PATH.read_text())
    return {row["familyId"]: row for row in data}


_RECIPES_BY_FAMILY: dict[str, dict] = _load_recipes()

_RAW_ID_BY_FAMILY_TIER: dict[tuple[str, int], str] = {
    (item.family_id, item.tier): item.id for item in RESOURCE_ITEMS
}
_PROCESSED_ID_BY_FAMILY_TIER: dict[tuple[str, int], str] = {
    (item.family_id, item.tier): item.id for item in PROCESSED_RESOURCE_ITEMS
}

# Processed families that represent a raw material being consumed as
# fuel/reagent rather than staying physically present in whatever gets
# crafted from them - coal (itself refined from wood, see craft-recipes.
# json's own "coal" entry: 3 wood -> 1 coal, then burned as furnace fuel in
# metal_ingot/metal_bar) is the one confirmed case today. Any raw material
# reached ONLY through a family in this set is dropped entirely from
# recycling - never shown, never recovered. Extend this set as more fuel/
# reagent-only intermediates are identified.
NON_RECOVERABLE_PROCESSED_FAMILIES: frozenset[str] = frozenset({"coal"})

RECYCLE_BASE_PERCENT = 25
STATION_TOOL_PERCENT_PER_TIER = 5  # T1=5% ... T6=30%
CHARM_PERCENT_PER_TIER = 1  # T1=1% ... T6=6%
CHARM_FAMILY_ID = "hunters_charm"
# 25 (base) + 30 (T6 station tool) + 30 (level-30 profession) + 6 (T6 charm).
MAX_YIELD_PERCENT = 91


# Of the 16 base-tools.json families, most (anvil, workbench, loom,
# scriptorium, grinding_stone, alchemy_stand, enchanters_table,
# lapidary_bench - exactly the "table-like" ones this feature was
# originally scoped around) are needsItemDefinition:true in item-
# inventory-properties.json: bulky portable crafting stations carried in
# both hands or hauled on a mount, tracked as item instances (Character.
# items / the player's shared inventory.items), never a flat balance. The
# rest (furnace, oven, kiln, mortar_and_pestle, spinning_wheel,
# tanning_rack, wrench, smokehouse) are flat-balance (Character.tools /
# the player's shared inventory.tools), same as _resolve_tool_for_craft
# already branches on family.needs_item_definition for crafting itself.
_STATION_TOOL_FAMILY_IDS: frozenset[str] = frozenset(tool.family_id for tool in TOOL_ITEMS_BY_ID.values())


def _best_owned_station_tool_tier(
    character: dict, player_tools: Dict[str, int], player_items: List[dict]
) -> int:
    """
    Highest tier among every crafting-station tool family the character has
    access to - every station tool counts toward recycling equally
    regardless of which raw material is being recycled, only its tier
    matters. `player_tools`/`player_items` are the player's shared pool
    (inventory.tools / inventory.items, location "pool") - the caller
    passes these empty to exclude the shared pool entirely (recycling off
    the character's own body/backpack can only use tools physically
    carried), or populated to include it (recycling a vault item, done
    right there at the vault). The character's own tools/backpack+body
    instances always count either way. 0 if none owned anywhere.
    """
    # Checked regardless of family.needs_item_definition, not just for the
    # flat-balance families - some accounts still hold an instance-tracked
    # station (enchanters_table, lapidary_bench, ...) as a plain flat count
    # in tools/inventory.tools from before those families were switched to
    # equippable instances, never migrated. Costs nothing for a normal
    # instance-tracked family, which will never actually have a flat entry.
    best = 0
    held_tools = character.get("crafting", {}).get("tools", {})
    for tool_id, tool in TOOL_ITEMS_BY_ID.items():
        if held_tools.get(tool_id, 0) > 0 or player_tools.get(tool_id, 0) > 0:
            best = max(best, tool.tier)

    for instance in (character.get("gear", {}).get("items", []) or []):
        if instance.get("familyId") in _STATION_TOOL_FAMILY_IDS and instance.get("location") in ("backpack", "body"):
            entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(instance.get("itemId"))
            if entry:
                best = max(best, entry.tier)
    for instance in player_items:
        if instance.get("familyId") in _STATION_TOOL_FAMILY_IDS and instance.get("location") == "pool":
            entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(instance.get("itemId"))
            if entry:
                best = max(best, entry.tier)
    return best


def _equipped_charm_tier(character: dict) -> int:
    """Tier of a hunters_charm currently equipped in the Neck slot (0 if
    none worn) - only an equipped instance counts, not one merely owned."""
    best = 0
    for instance in character.get("gear", {}).get("items", []) or []:
        if instance.get("familyId") != CHARM_FAMILY_ID or instance.get("location") != "body":
            continue
        if "Neck" not in (instance.get("slotRef") or []):
            continue
        entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(instance.get("itemId"))
        if entry:
            best = max(best, entry.tier)
    return best


def _profession_skill_percent(character: dict, raw_family_id: str) -> int:
    """
    Highest level (1-30) among the character's own professions whose
    category lists `raw_family_id` (resources_catalog.
    PROFESSION_RESOURCE_FAMILIES) - the same category match _crafting_xp_
    increments uses to decide which profession slot(s) a raw material grants
    XP to. 0 if no profession slot matches.
    """
    profession = character.get("profession", {})
    best = 0
    for n in (1, 2, 3):
        profession_id = profession.get(f"prof{n}")
        category = PROFESSION_CATEGORIES.get(profession_id) if profession_id else None
        if not category:
            continue
        if raw_family_id in PROFESSION_RESOURCE_FAMILIES.get(category, ()):
            best = max(best, profession.get(f"lvl{n}") or 0)
    return best


@dataclass(frozen=True)
class YieldBreakdown:
    """The four components that add up to one raw material's recycling
    yield percent - carried separately so the recycle popup can print each
    contributing line, not just the total."""

    base: int
    skill: int
    tool: int
    charm: int

    @property
    def total(self) -> int:
        return min(self.base + self.skill + self.tool + self.charm, MAX_YIELD_PERCENT)


def resolve_yield(
    character: dict, player_tools: Dict[str, int], player_items: List[dict], raw_family_id: str
) -> YieldBreakdown:
    return YieldBreakdown(
        base=RECYCLE_BASE_PERCENT,
        skill=_profession_skill_percent(character, raw_family_id),
        tool=_best_owned_station_tool_tier(character, player_tools, player_items) * STATION_TOOL_PERCENT_PER_TIER,
        charm=_equipped_charm_tier(character) * CHARM_PERCENT_PER_TIER,
    )


@dataclass(frozen=True)
class RecoveryDenomination:
    """One "coin" recycling can hand back for a raw family - either the
    processed family itself (a unit of which costs `raw_units_per_one` raw
    units to make, per its own recipe's recoverable-only chain) or the raw
    material itself (`raw_units_per_one` == 1)."""

    family_id: str
    category: str  # "raw" | "processed"
    raw_units_per_one: int


@dataclass
class _RecoveryBucket:
    """Running total for one raw family while walking a recipe's chain,
    plus every denomination discovered along the way that's purely built
    from that one raw family (see _accumulate_recovery)."""

    total_units: int = 0
    denominations: Dict[str, RecoveryDenomination] = None

    def __post_init__(self):
        if self.denominations is None:
            self.denominations = {}


def _accumulate_recovery(
    family_id: str, category: str, qty: int, seen: frozenset[str] = frozenset()
) -> Dict[str, _RecoveryBucket]:
    """
    Walks `family_id`'s own recipe chain (`qty` units of it) down through
    every ingredient line, dropping any line that's non-recoverable (see
    NON_RECOVERABLE_PROCESSED_FAMILIES) or unresolvable (a "final"/tool
    ingredient). Unlike a naive single-raw-family walk, this NEVER discards
    a whole node just because it mixes more than one raw family (e.g.
    reinforced_frame = wood + bone, dressed_meat = meat + bone_blade->bone)
    - it always keeps recursing per ingredient line, crediting each raw
    family its own share.

    Returns raw_family_id -> _RecoveryBucket. A node only gets added as a
    denomination of its OWN bucket (via `denominations[family_id]`) when
    its entire recoverable content traces to that single raw family (i.e.
    the result has exactly one bucket) - a mixed node is still walked
    through for its children's totals, it just can't be handed back as one
    unit of itself.
    """
    if category == "raw":
        return {family_id: _RecoveryBucket(qty, {family_id: RecoveryDenomination(family_id, "raw", 1)})}
    if category != "processed" or family_id in NON_RECOVERABLE_PROCESSED_FAMILIES or family_id in seen:
        return {}
    recipe = _RECIPES_BY_FAMILY.get(family_id)
    if recipe is None:
        return {}
    seen = seen | {family_id}

    result: Dict[str, _RecoveryBucket] = {}
    for ing0 in recipe["ingredients"]:
        options = ing0["alternatives"] if "alternatives" in ing0 else [ing0]
        chosen = next((o for o in options if o.get("consumed", True)), None)
        if chosen is None or chosen["category"] not in ("raw", "processed"):
            continue
        child = _accumulate_recovery(chosen["familyId"], chosen["category"], chosen["qty"] * qty, seen)
        for raw_family, child_bucket in child.items():
            bucket = result.setdefault(raw_family, _RecoveryBucket())
            bucket.total_units += child_bucket.total_units
            for fid, denom in child_bucket.denominations.items():
                existing = bucket.denominations.get(fid)
                if existing is None or denom.raw_units_per_one > existing.raw_units_per_one:
                    bucket.denominations[fid] = denom

    if len(result) == 1:
        (bucket,) = result.values()
        raw_units_per_one = bucket.total_units // qty
        bucket.denominations[family_id] = RecoveryDenomination(family_id, "processed", raw_units_per_one)
    return result


@dataclass(frozen=True)
class RecoveredLine:
    """One line of a recovery breakdown, e.g. "1 iron bar" or the leftover
    "2 iron ore"."""

    family_id: str
    concrete_id: str
    name: str
    tier: int
    category: str  # "raw" | "processed"
    qty: int


def _concrete_id_and_name(family_id: str, category: str, tier: int) -> Optional[tuple[str, str]]:
    if category == "raw":
        concrete_id = _RAW_ID_BY_FAMILY_TIER.get((family_id, tier))
        item = RESOURCE_ITEMS_BY_ID.get(concrete_id) if concrete_id else None
    else:
        concrete_id = _PROCESSED_ID_BY_FAMILY_TIER.get((family_id, tier))
        item = PROCESSED_RESOURCE_ITEMS_BY_ID.get(concrete_id) if concrete_id else None
    if concrete_id is None or item is None:
        return None
    return concrete_id, item.name


def _break_into_denominations(
    total_raw_units: int, denominations: Dict[str, RecoveryDenomination], tier: int
) -> List[RecoveredLine]:
    """
    Greedy "make change" breakdown of `total_raw_units` raw-equivalent units
    into the biggest processed denominations first, then whatever's left
    over at each smaller tier down to the leftover raw units themselves -
    e.g. 250 raw ore units -> "1 iron bar, 2 iron ingot, 2 iron ore" if
    those are the chain's own conversion ratios. Denominations worth 0 raw
    units (shouldn't happen, but guards a division by zero) are skipped.
    """
    ordered = sorted((d for d in denominations.values() if d.raw_units_per_one > 0),
                      key=lambda d: d.raw_units_per_one, reverse=True)
    remaining = total_raw_units
    lines: List[RecoveredLine] = []
    for denom in ordered:
        if remaining < denom.raw_units_per_one:
            continue
        qty = remaining // denom.raw_units_per_one
        remaining -= qty * denom.raw_units_per_one
        resolved = _concrete_id_and_name(denom.family_id, denom.category, tier)
        if resolved is None:
            continue
        concrete_id, name = resolved
        lines.append(RecoveredLine(denom.family_id, concrete_id, name, tier, denom.category, qty))
    return lines


@dataclass(frozen=True)
class RawMaterialRecovery:
    """One raw material's full recycling line for the popup: its full
    recoverable-chain total for ONE unit of the item, the yield% that
    applies to it, how many raw-equivalent units that yield produces, and
    the denomination breakdown of what's actually handed back."""

    raw_family_id: str
    raw_name: str
    total_units: int
    yield_breakdown: YieldBreakdown
    recovered_units: int
    recovered: List[RecoveredLine]


def resolve_recycle_preview(
    family_id: str, tier: int, character: dict, player_tools: Dict[str, int],
    player_items: Optional[List[dict]] = None, count: int = 1,
) -> List[RawMaterialRecovery]:
    """
    What recycling `count` unit(s) of `family_id` at `tier` would hand back
    to `character`, one entry per recoverable raw material family. A
    family's non-recoverable ingredient lines (coal today) simply
    contribute nothing - they never appear here at all, per
    NON_RECOVERABLE_PROCESSED_FAMILIES. `player_tools`/`player_items` -
    the player's shared pool - should be passed empty by a caller scoring a
    recycle off the character's own body/backpack (see
    _best_owned_station_tool_tier).
    """
    if family_id not in _RECIPES_BY_FAMILY:
        raise ValueError(f"Unknown recipe family: {family_id}")
    player_items = player_items or []

    buckets = _accumulate_recovery(family_id, "processed", count)

    results: List[RawMaterialRecovery] = []
    for raw_family, bucket in buckets.items():
        yield_breakdown = resolve_yield(character, player_tools, player_items, raw_family)
        recovered_units = (bucket.total_units * yield_breakdown.total) // 100
        recovered = _break_into_denominations(recovered_units, bucket.denominations, tier)
        raw_item = RESOURCE_ITEMS_BY_ID.get(_RAW_ID_BY_FAMILY_TIER.get((raw_family, tier)))
        results.append(RawMaterialRecovery(
            raw_family_id=raw_family,
            raw_name=raw_item.name if raw_item else raw_family,
            total_units=bucket.total_units,
            yield_breakdown=yield_breakdown,
            recovered_units=recovered_units,
            recovered=recovered,
        ))
    return results


def flatten_recovery(recoveries: List[RawMaterialRecovery]) -> Dict[str, int]:
    """
    Every recovered line across every raw material, collapsed into one
    concrete-id -> qty dict - what actually needs crediting to the shared
    inventory.resources, regardless of which raw family or denomination
    tier it came from. Lines with qty 0 never occur
    (_break_into_denominations only emits a denomination it actually
    used), but summed defensively in case the same concrete id somehow
    appears under two raw families.
    """
    amounts: Dict[str, int] = {}
    for recovery in recoveries:
        for line in recovery.recovered:
            if line.qty > 0:
                amounts[line.concrete_id] = amounts.get(line.concrete_id, 0) + line.qty
    return amounts
