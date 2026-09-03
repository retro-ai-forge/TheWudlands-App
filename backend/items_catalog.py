"""
Catalog loader for backend/data/item-inventory-properties.json and
item-size-classes.json - the equip/instance-tracking reference data for
crafted items, mirroring resources_catalog.py's load-once-at-import pattern.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

_DATA_DIR = Path(__file__).resolve().parent / "data"
_FAMILIES_PATH = _DATA_DIR / "item-inventory-properties.json"
_SIZE_CLASSES_PATH = _DATA_DIR / "item-size-classes.json"
_BACKPACK_TIERS_PATH = _DATA_DIR / "base-items-misc.json"

# Every "final" crafted-output catalog file, scanned to resolve a family+tier
# to a concrete {id, name} - mirrors craft_catalog.py's _CATALOG_FILES, but
# flattened into one lookup instead of picking a single file by kind, since
# an item's kind (e.g. axe_stone: ["weapon", "tool"]) isn't a reliable
# pointer to which base-*.json file its tiered rows actually live in.
_FINAL_CATALOG_FILES = (
    "base-tools.json",
    "base-items-armor.json",
    "base-items-shield.json",
    "base-items-weapon.json",
    "base-food.json",
    "base-potion.json",
    "base-items-misc.json",
    "base-items-equipment.json",
    "base-adventuring-gear.json",
)


@dataclass(frozen=True)
class ItemFamily:
    """One entry in item-inventory-properties.json."""

    family_id: str
    kind: tuple[str, ...]
    size_class: str
    stack_size: int
    needs_item_definition: bool
    equip_slots: tuple[str, ...]
    backpackable: bool
    two_handed: bool
    quality_max: Optional[int]
    icon: str


def _load_families() -> dict[str, ItemFamily]:
    data = json.loads(_FAMILIES_PATH.read_text())
    families: dict[str, ItemFamily] = {}
    for row in data:
        family = ItemFamily(
            family_id=row["familyId"],
            kind=tuple(row.get("kind", [])),
            size_class=row["sizeClass"],
            stack_size=row["stackSize"],
            needs_item_definition=row["needsItemDefinition"],
            equip_slots=tuple(row.get("equipSlots", [])),
            backpackable=row.get("backpackable", False),
            two_handed=bool(row.get("twoHanded", False)),
            quality_max=row.get("qualityMax"),
            icon=row.get("icon", ""),
        )
        families[family.family_id] = family
    return families


ITEM_FAMILIES_BY_ID: dict[str, ItemFamily] = _load_families()


def _load_size_classes() -> dict:
    return json.loads(_SIZE_CLASSES_PATH.read_text())


_SIZE_CLASS_DATA = _load_size_classes()
_NON_SLOT_KEYS = ("rawStackSize", "processedStackSize", "tinyStackSize")
SLOT_COST_BY_SIZE_CLASS: dict[str, int] = {
    key: value
    for key, value in _SIZE_CLASS_DATA.items()
    if not key.startswith("_") and key not in _NON_SLOT_KEYS
}
RAW_STACK_SIZE: int = _SIZE_CLASS_DATA["rawStackSize"]
PROCESSED_STACK_SIZE: int = _SIZE_CLASS_DATA["processedStackSize"]
TINY_STACK_SIZE: int = _SIZE_CLASS_DATA["tinyStackSize"]


def slot_cost_for_family(family_id: str) -> int:
    """
    How many backpack slots one unit/instance of `family_id` costs. Falls
    back to "tiny" (1 slot) for anything not in ITEM_FAMILIES_BY_ID -
    raw/processed resources aren't catalogued there at all, per
    item-size-classes.json's own documented fallback rule.
    """
    family = ITEM_FAMILIES_BY_ID.get(family_id)
    size_class = family.size_class if family else "tiny"
    return SLOT_COST_BY_SIZE_CLASS.get(size_class, 1)


def _load_backpack_capacity() -> dict[str, int]:
    data = json.loads(_BACKPACK_TIERS_PATH.read_text())
    return {row["id"]: row["capacitySlots"] for row in data if row.get("familyId") == "backpack"}


# Per-tier backpack slot bonus (e.g. "backpack_4" -> 20), keyed by concrete
# id rather than family - capacitySlots is a tiered value, not a flat
# family-level one, so it needs its own lookup separate from ITEM_FAMILIES_BY_ID.
BACKPACK_CAPACITY_BY_ID: dict[str, int] = _load_backpack_capacity()


def _load_final_catalog() -> tuple[dict[tuple[str, int], dict], dict[str, str]]:
    """
    (familyId, tier) -> {"id": ..., "name": ...} across every "final" crafted
    output catalog file - resolves a craft_item(family_id, tier) call to a
    concrete id/name regardless of which file that family's tiered rows
    happen to live in. Also builds the reverse id -> familyId index, needed
    wherever a concrete id shows up without its family attached (e.g.
    Character.itemBalances, keyed by concrete id the same way
    resources/tools already are).
    """
    rows: dict[tuple[str, int], dict] = {}
    family_by_id: dict[str, str] = {}
    for filename in _FINAL_CATALOG_FILES:
        path = _DATA_DIR / filename
        if not path.exists():
            continue
        for row in json.loads(path.read_text()):
            rows[(row["familyId"], row["tier"])] = {"id": row["id"], "name": row["name"]}
            family_by_id[row["id"]] = row["familyId"]
    return rows, family_by_id


FINAL_ITEM_ROWS_BY_FAMILY_TIER, FAMILY_ID_BY_FINAL_ITEM_ID = _load_final_catalog()


def resolve_output_row(family_id: str, tier: int) -> Optional[dict]:
    """Concrete {"id", "name"} for crafting `family_id` at `tier`, or None."""
    return FINAL_ITEM_ROWS_BY_FAMILY_TIER.get((family_id, tier))


@dataclass(frozen=True)
class ItemCatalogEntry:
    """One concrete tiered id belonging to an item-inventory-properties.json
    family - the reference data a UI needs to display "this id is really an
    item, here's its family/tier/kind" regardless of which physical bucket
    (items/itemBalances/resources) it's actually stored in."""

    id: str
    name: str
    family_id: str
    tier: int
    kind: tuple[str, ...]


def _load_item_catalog_entries() -> tuple[ItemCatalogEntry, ...]:
    """
    Every concrete tiered id across all 118 item-inventory-properties.json
    families, resolved from whichever catalog actually holds that family's
    rows - the 9 "final" files for most families, plus base-processed.json
    for the handful (arrow, bolt, oil) that are kind:["processed"] ammo
    living in Character.resources rather than items/itemBalances. A family
    with no rows in either (shouldn't happen, but not fatal) contributes
    nothing rather than raising.
    """
    from backend.processed_catalog import PROCESSED_RESOURCE_ITEMS

    entries: list[ItemCatalogEntry] = []
    for (family_id, tier), row in FINAL_ITEM_ROWS_BY_FAMILY_TIER.items():
        family = ITEM_FAMILIES_BY_ID.get(family_id)
        if family is not None:
            entries.append(ItemCatalogEntry(row["id"], row["name"], family_id, tier, family.kind))
    for item in PROCESSED_RESOURCE_ITEMS:
        family = ITEM_FAMILIES_BY_ID.get(item.family_id)
        if family is not None:
            entries.append(ItemCatalogEntry(item.id, item.name, item.family_id, item.tier, family.kind))
    return tuple(entries)


ITEM_CATALOG_ENTRIES: tuple[ItemCatalogEntry, ...] = _load_item_catalog_entries()
# Every concrete id an item-inventory-properties.json family accounts for,
# regardless of storage bucket - a UI uses this to reclassify a resource
# balance entry (e.g. arrow/bolt/oil) as "really an item" for display.
ITEM_CATALOG_ID_SET: frozenset[str] = frozenset(entry.id for entry in ITEM_CATALOG_ENTRIES)


def backpack_slots_used(character: dict) -> int:
    """
    Total backpack slots currently occupied on one character (as returned by
    Character.to_dict()/read back from Mongo) - sums items[] where
    location=="backpack" (never stacked, one slot cost per instance), plus
    backpackResources/backpackItemBalances (ceil(qty/stack_size) per id -
    see the "Backpack capacity" section of the item-instance plan for why
    this is a stack, not a flat count).
    """
    from backend.processed_catalog import PROCESSED_RESOURCE_ITEMS_BY_ID
    from backend.resources_catalog import RESOURCE_ITEMS_BY_ID

    total = 0

    for instance in character.get("items", []):
        if instance.get("location") == "backpack":
            total += slot_cost_for_family(instance["familyId"])

    for resource_id, qty in character.get("backpackResources", {}).items():
        if resource_id in RESOURCE_ITEMS_BY_ID:
            stack_size = RAW_STACK_SIZE
        elif resource_id in PROCESSED_RESOURCE_ITEMS_BY_ID:
            stack_size = PROCESSED_STACK_SIZE
        else:
            stack_size = TINY_STACK_SIZE
        total += math.ceil(qty / stack_size)

    for family_id, qty in character.get("backpackItemBalances", {}).items():
        family = ITEM_FAMILIES_BY_ID.get(family_id)
        stack_size = family.stack_size if family else 1
        total += math.ceil(qty / stack_size) * slot_cost_for_family(family_id)

    return total


def backpack_capacity(character: dict) -> int:
    """
    Total backpack slot ceiling for one character: base carry capacity from
    might/endurance, plus whichever backpack instance (if any) is currently
    equipped with "Back"/"Side" in its slotRef.
    """
    attr = character.get("attr", {})
    might = attr.get("migh", 1)
    endurance = attr.get("endu", 1)
    base = 10 + (might + endurance) // 3

    bonus = 0
    for instance in character.get("items", []):
        if instance.get("location") == "body" and any(
            slot in ("Back", "Side") for slot in instance.get("slotRef", [])
        ):
            bonus = max(bonus, BACKPACK_CAPACITY_BY_ID.get(instance["itemId"], 0))

    return base + bonus
