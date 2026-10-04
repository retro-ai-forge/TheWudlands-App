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
_BACKPACK_TIERS_PATH = _DATA_DIR / "base-items-adventuring-gear.json"
_MOUNT_ITEMS_PATH = _DATA_DIR / "base-items-mount.json"

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
    "base-items-food.json",
    "base-items-potion.json",
    "base-items-adventuring-gear.json",
    "base-items-essentials.json",
    "base-items-companion.json",
    "base-items-mount.json",
)


@dataclass(frozen=True)
class ItemFamily:
    """One entry in item-inventory-properties.json."""

    family_id: str
    kind: tuple[str, ...]
    size_class: str
    stack_size: int
    needs_item_definition: bool
    # Valid ways to equip one instance of this family, each an alternative
    # full set of slots it must occupy at once - e.g. a dagger's
    # (("Left Hand",), ("Right Hand",), ("Girdle",)) (pick any one slot) vs
    # a greatsword's (("Left Hand", "Right Hand"),) (must occupy both
    # together) vs a portable crafting station's (("Left Hand", "Right
    # Hand"), ("Mount",)) (both hands, OR just a mount). The single source
    # of truth for equip_item's validation - item-inventory-properties.
    # json's own "equipSlots" is already this list-of-groups shape.
    equip_slots: tuple[tuple[str, ...], ...]
    backpackable: bool
    quality_max: Optional[int]
    armor_class: Optional[int]
    icon: str


def _load_families() -> dict[str, ItemFamily]:
    data = json.loads(_FAMILIES_PATH.read_text())
    families: dict[str, ItemFamily] = {}
    for row in data:
        equip_slots = tuple(tuple(group) for group in row.get("equipSlots", []))
        family = ItemFamily(
            family_id=row["familyId"],
            kind=tuple(row.get("kind", [])),
            size_class=row["sizeClass"],
            stack_size=row["stackSize"],
            needs_item_definition=row["needsItemDefinition"],
            equip_slots=equip_slots,
            backpackable=row.get("backpackable", False),
            quality_max=row.get("qualityMax"),
            armor_class=row.get("armorClass"),
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


def _load_saddlepack_capacity() -> dict[str, int]:
    data = json.loads(_MOUNT_ITEMS_PATH.read_text())
    return {row["id"]: row["capacitySlots"] for row in data if row.get("familyId") == "saddlepack"}


SADDLEPACK_CAPACITY_BY_ID: dict[str, int] = _load_saddlepack_capacity()


def _load_mount_carry_capacity() -> dict[str, int]:
    data = json.loads(_MOUNT_ITEMS_PATH.read_text())
    return {row["id"]: row["carryCapacity"] for row in data if row.get("carryCapacity")}


MOUNT_CARRY_CAPACITY_BY_ID: dict[str, int] = _load_mount_carry_capacity()

_MOUNT_FAMILIES = frozenset({"steed_mount", "beast_mount", "exotic_mount", "aquatic_mount"})


def _load_cart_capacity() -> dict[str, int]:
    data = json.loads(_MOUNT_ITEMS_PATH.read_text())
    return {row["id"]: row["capacitySlots"] for row in data if row.get("familyId") == "cart"}


CART_CAPACITY_BY_ID: dict[str, int] = _load_cart_capacity()

_GATHERING_BONUSES_PATH = _DATA_DIR / "gathering-bonuses-raw-material.json"


def _load_gathering_bonuses_by_item() -> dict[str, tuple[str, ...]]:
    """
    gathering-bonuses-raw-material.json is keyed the other way around (raw
    material -> which item families help gather it) - inverted here into
    item family -> which raw materials it helps gather, since that's the
    direction the item detail popup actually needs (looking up one item's
    own bonuses, not one material's).
    """
    data = json.loads(_GATHERING_BONUSES_PATH.read_text())
    by_item: dict[str, list[str]] = {}
    for raw_material, info in data.items():
        for item_family in info.get("gatheringItems", []):
            by_item.setdefault(item_family, []).append(raw_material)
    return {item_family: tuple(materials) for item_family, materials in by_item.items()}


# Item family -> raw materials it grants a foraging/gathering bonus for
# (e.g. "pickaxe" -> ("ore", "stone", "crystal")) - empty tuple (via
# .get(family_id, ())) for the majority of families that aren't a
# gathering tool at all.
GATHERING_BONUSES_BY_ITEM: dict[str, tuple[str, ...]] = _load_gathering_bonuses_by_item()


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
            rows[(row["familyId"], row["tier"])] = {
                "id": row["id"],
                "name": row["name"],
                "icon": row.get("icon", ""),
                "description": row.get("description", ""),
                "size": row.get("size", ""),
                "carryCapacity": row.get("carryCapacity", 0),
                "capacitySlots": row.get("capacitySlots", 0),
            }
            family_by_id[row["id"]] = row["familyId"]
    return rows, family_by_id


FINAL_ITEM_ROWS_BY_FAMILY_TIER, FAMILY_ID_BY_FINAL_ITEM_ID = _load_final_catalog()


def _load_item_size_class_overrides() -> dict[str, str]:
    """Per-item sizeClass overrides from catalog files (e.g. companions
    whose size varies by tier instead of being flat across the family)."""
    overrides: dict[str, str] = {}
    for filename in _FINAL_CATALOG_FILES:
        path = _DATA_DIR / filename
        if not path.exists():
            continue
        for row in json.loads(path.read_text()):
            sc = row.get("sizeClass")
            if sc:
                overrides[row["id"]] = sc
    return overrides


ITEM_SIZE_CLASS_BY_ID: dict[str, str] = _load_item_size_class_overrides()


def slot_cost_for_item(item_id: str, family_id: str) -> int:
    """Slot cost for one instance, checking per-item sizeClass first,
    then falling back to the family-level size class."""
    sc = ITEM_SIZE_CLASS_BY_ID.get(item_id)
    if sc:
        return SLOT_COST_BY_SIZE_CLASS.get(sc, 1)
    return slot_cost_for_family(family_id)


def resolve_output_row(family_id: str, tier: int) -> Optional[dict]:
    """Concrete {"id", "name"} for crafting `family_id` at `tier`, or None.

    Checked against the 9 "final" catalog files first, then - since a
    dual-cataloged family (arrow, bolt, oil, and any other
    item-inventory-properties.json family whose tiered rows actually live
    in base-processed.json) can be referenced as a consumed "final"
    ingredient elsewhere (e.g. written_scroll's own parchment/ink) even
    though it was never in one of those 9 files to begin with - the
    processed-resource catalog, same as backend.players._resolve_recipe_output
    already does for a recipe's own OUTPUT."""
    row = FINAL_ITEM_ROWS_BY_FAMILY_TIER.get((family_id, tier))
    if row is not None:
        return row
    from backend.processed_catalog import PROCESSED_RESOURCE_ITEMS_BY_FAMILY_TIER

    item = PROCESSED_RESOURCE_ITEMS_BY_FAMILY_TIER.get((family_id, tier))
    return {"id": item.id, "name": item.name} if item else None


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
    # Flat across all 6 tiers of a family (unlike damage/defense, which
    # would scale by tier) - None for a family with no qualityMax row at
    # all (needsItemDefinition:false families never degrade, so this is
    # only ever meaningful alongside a real Character.items instance).
    quality_max: Optional[int]
    armor_class: Optional[int]
    icon: str
    # Family-level (item-inventory-properties.json's own "stackSize") -
    # whether the UI should show an owned-count badge at all: 1 means
    # never stacked (including every needsItemDefinition:true instance,
    # which is always exactly 1 per row), so a bare "1" would be noise.
    stack_size: int
    # Per-tier flavor text (see base-items-weapon.json's own "description"
    # field) - "" for a family/tier with no dedicated text yet, in which
    # case the UI shows its own placeholder.
    description: str
    # Family-level (item-inventory-properties.json's own "sizeClass") -
    # backpack slot-cost bucket ("tiny"/"light"/"medium"/...), shown as
    # reference info in the item detail popup.
    size_class: str
    # Family-level (ItemFamily.equip_slots) - alternative full slot-groups
    # valid for one equip action, non-empty only for needsItemDefinition:
    # true families. See ItemFamily's own docstring.
    equip_slots: tuple[tuple[str, ...], ...]
    # Family-level (item-inventory-properties.json's own "backpackable") -
    # whether a "move to backpack" action makes sense for this family at all.
    backpackable: bool
    # Family-level (gathering-bonuses-raw-material.json, inverted - see
    # GATHERING_BONUSES_BY_ITEM) - raw materials this family grants a
    # foraging/gathering bonus for, e.g. ("ore", "stone", "crystal") for a
    # pickaxe. Empty for the majority of families that aren't a gathering
    # tool at all.
    gathering_bonuses: tuple[str, ...]
    # Per-tier (base-items-mount.json's own "size" field) - creature size on
    # the Medium/Heavy/Huge/Colossal scale, only meaningful for
    # kind:["mount"] families. "" for anything else (companions aren't
    # ridden, so they carry no size). Shown in the UI for Giants-race
    # riding suitability.
    size: str
    # Per-tier (base-items-mount.json/base-items-companion.json's own
    # "carryCapacity" field) - extra backpack slots this mount/companion
    # grants its rider/owner while equipped. 0 for anything not a mount or
    # companion.
    carry_capacity: int
    # Per-tier (base-items-essentials.json's own "capacitySlots" field) -
    # slot capacity of a backpack/saddlepack/cart tier. 0 for anything that
    # isn't a container.
    capacity_slots: int


def _load_item_catalog_entries() -> tuple[ItemCatalogEntry, ...]:
    """
    Every concrete tiered id across all 118 item-inventory-properties.json
    families, resolved from whichever catalog actually holds that family's
    rows - the 9 "final" files for most families, plus base-processed.json
    for the handful (arrow, bolt, oil) that are kind:["processed"] ammo -
    their id/name/tier/icon are resolved the processed-resource-catalog
    way (that's simply where their tiered rows live), but they're credited
    into vault.itemBalances like any other crafted item, not resources
    (see backend.players._resolve_recipe_output). A family with no rows in
    either (shouldn't happen, but not fatal) contributes nothing rather
    than raising.
    """
    from backend.processed_catalog import PROCESSED_RESOURCE_ITEMS

    entries: list[ItemCatalogEntry] = []
    for (family_id, tier), row in FINAL_ITEM_ROWS_BY_FAMILY_TIER.items():
        family = ITEM_FAMILIES_BY_ID.get(family_id)
        if family is not None:
            item_sc = ITEM_SIZE_CLASS_BY_ID.get(row["id"], family.size_class)
            entries.append(
                ItemCatalogEntry(
                    row["id"], row["name"], family_id, tier, family.kind, family.quality_max,
                    family.armor_class, row.get("icon", ""), family.stack_size,
                    row.get("description", ""), item_sc,
                    family.equip_slots, family.backpackable,
                    GATHERING_BONUSES_BY_ITEM.get(family_id, ()),
                    row.get("size", ""), row.get("carryCapacity", 0),
                    row.get("capacitySlots", 0),
                )
            )
    for item in PROCESSED_RESOURCE_ITEMS:
        family = ITEM_FAMILIES_BY_ID.get(item.family_id)
        if family is not None:
            entries.append(
                ItemCatalogEntry(
                    item.id, item.name, item.family_id, item.tier, family.kind, family.quality_max,
                    family.armor_class, item.icon or "", family.stack_size,
                    "", family.size_class,
                    family.equip_slots, family.backpackable,
                    GATHERING_BONUSES_BY_ITEM.get(item.family_id, ()),
                    "", 0, 0,
                )
            )
    return tuple(entries)


ITEM_CATALOG_ENTRIES: tuple[ItemCatalogEntry, ...] = _load_item_catalog_entries()
# Every concrete id an item-inventory-properties.json family accounts for,
# regardless of storage bucket - a UI uses this to reclassify a resource
# balance entry (e.g. arrow/bolt/oil) as "really an item" for display.
ITEM_CATALOG_ID_SET: frozenset[str] = frozenset(entry.id for entry in ITEM_CATALOG_ENTRIES)
# Concrete id -> its own entry (family/tier/kind/qualityMax) - used to
# resolve a Character.items instance's own tier from its stored itemId
# (e.g. deciding whether an owned T1 dagger is high enough tier to serve
# as a T3 recipe's own "tool" requirement - see backend.players.
# _resolve_tool_for_craft).
ITEM_CATALOG_ENTRIES_BY_ID: dict[str, ItemCatalogEntry] = {entry.id: entry for entry in ITEM_CATALOG_ENTRIES}


def resolve_item_balance_stack(item_id: str) -> tuple[int, int]:
    """
    (stack_size, slot_cost) for one gear.itemBalances/vault.itemBalances
    concrete id (e.g. "rabbit_oil") - every itemBalances write path keys by
    this concrete per-tier id, never a bare family id (see
    backend.players._resolve_recipe_output), so resolving it needs
    ITEM_CATALOG_ENTRIES_BY_ID (concrete id -> family, covers the
    dual-cataloged ammo families - arrow/bolt/oil - whose ids live in the
    processed-resource catalog rather than one of the "final" catalog
    files FAMILY_ID_BY_FINAL_ITEM_ID was built from) rather than looking
    the id up directly in the family-keyed ITEM_FAMILIES_BY_ID, which
    always misses for a concrete id and silently falls back to stack_size
    1 - inflating slot cost by up to stackSize-fold.
    """
    entry = ITEM_CATALOG_ENTRIES_BY_ID.get(item_id)
    if entry is not None:
        return entry.stack_size, slot_cost_for_item(item_id, entry.family_id)
    family = ITEM_FAMILIES_BY_ID.get(item_id)
    stack_size = family.stack_size if family else 1
    return stack_size, slot_cost_for_family(item_id)


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
    gear = character.get("gear", {})

    for instance in gear.get("items", []):
        if instance.get("location") == "backpack":
            total += slot_cost_for_item(instance["itemId"], instance["familyId"])

    for resource_id, qty in gear.get("resources", {}).get("backpack", {}).items():
        if resource_id in RESOURCE_ITEMS_BY_ID:
            stack_size = RAW_STACK_SIZE
        elif resource_id in PROCESSED_RESOURCE_ITEMS_BY_ID:
            stack_size = PROCESSED_STACK_SIZE
        else:
            stack_size = TINY_STACK_SIZE
        total += math.ceil(qty / stack_size)

    for item_id, qty in gear.get("itemBalances", {}).get("backpack", {}).items():
        stack_size, slot_cost = resolve_item_balance_stack(item_id)
        total += math.ceil(qty / stack_size) * slot_cost

    return total


def has_backpack_equipped(character: dict) -> bool:
    """Whether this character's own "backpack" family is currently
    equipped (location:"body") - a physical backpack worn right now, as
    opposed to just carried or sitting in the pool. Checked by familyId,
    not by "Back"/"Side" appearing in slotRef: several OTHER families
    (bolt_girdle, quiver, ladder) also list "Side" as one of their own
    alternative equip_slots groups, so an equipped bolt_girdle sitting in
    "Side" is not a backpack and must not satisfy this check."""
    return any(
        instance.get("location") == "body" and instance.get("familyId") == "backpack"
        for instance in character.get("gear", {}).get("items", [])
    )


def has_backpack_available(character: dict) -> bool:
    """Whether this character has a "backpack"-family instance to actually
    pack things into - either worn (location:"body", same as
    has_backpack_equipped) OR sitting unequipped in camp (location:"camp").
    A camp-located backpack still holds its own gear.itemBalances.backpack/
    gear.items location:"backpack" storage bucket (unequip_item's "camp"
    destination deliberately never cascades that away - see its own
    docstring), so it should count as available to add more into, not just
    the one currently on the character's back. Used wherever "can this
    character stash something in a backpack right now" is the actual
    question (backpack_capacity, unequip_item's "backpack" destination) -
    has_backpack_equipped itself stays literal (only "body") for callers
    that specifically mean "is one physically worn" (e.g. the
    check_in_item_instance cascade, which cares whether some OTHER worn
    backpack's storage is still in active use)."""
    return any(
        instance.get("location") in ("body", "camp") and instance.get("familyId") == "backpack"
        for instance in character.get("gear", {}).get("items", [])
    )


def has_saddlepack_equipped(character: dict) -> bool:
    """Whether this character's own "saddlepack" family is currently
    equipped into the mount's own Mbagpack slot (location:"body") - the
    mount-side counterpart to has_backpack_equipped. Checked by familyId
    for the same reason has_backpack_equipped is - "Mbagpack" happens to be
    exclusive to the "saddlepack" family today, but checking the family
    directly doesn't depend on that staying true."""
    return any(
        instance.get("location") == "body" and instance.get("familyId") == "saddlepack"
        for instance in character.get("gear", {}).get("items", [])
    )


def has_saddlepack_available(character: dict) -> bool:
    """The saddlepack counterpart to has_backpack_available - whether this
    character has a "saddlepack"-family instance worn on the mount's own
    Mbagpack slot (location:"body", same value backpack itself uses - see
    has_saddlepack_equipped) OR sitting unequipped in camp (location:
    "camp"). Used for the same "only one at a time" enforcement
    equip_item/equip_item_from_pool apply to "backpack" - has_saddlepack_
    equipped itself stays literal (only "body"/worn) for callers that
    specifically mean that."""
    return any(
        instance.get("location") in ("body", "camp") and instance.get("familyId") == "saddlepack"
        for instance in character.get("gear", {}).get("items", [])
    )


def backpack_capacity(character: dict) -> int:
    """
    Total backpack slot ceiling - 0 when no backpack is available,
    otherwise purely the tier capacity from the best equipped/camped
    backpack (fixed per tier, no character-stat base).
    """
    if not has_backpack_available(character):
        return 0

    cap = 0
    for instance in character.get("gear", {}).get("items", []):
        if instance.get("location") in ("body", "camp") and instance.get("familyId") == "backpack":
            cap = max(cap, BACKPACK_CAPACITY_BY_ID.get(instance["itemId"], 0))

    return cap


def saddlepack_slots_used(character: dict) -> int:
    """
    Total saddlepack slots currently occupied - mirrors backpack_slots_used
    but for location:"saddlepack" items, resources, and itemBalances.
    """
    from backend.processed_catalog import PROCESSED_RESOURCE_ITEMS_BY_ID
    from backend.resources_catalog import RESOURCE_ITEMS_BY_ID

    total = 0
    gear = character.get("gear", {})

    for instance in gear.get("items", []):
        if instance.get("location") == "saddlepack":
            total += slot_cost_for_item(instance["itemId"], instance["familyId"])

    for resource_id, qty in gear.get("resources", {}).get("saddlepack", {}).items():
        if resource_id in RESOURCE_ITEMS_BY_ID:
            stack_size = RAW_STACK_SIZE
        elif resource_id in PROCESSED_RESOURCE_ITEMS_BY_ID:
            stack_size = PROCESSED_STACK_SIZE
        else:
            stack_size = TINY_STACK_SIZE
        total += math.ceil(qty / stack_size)

    for item_id, qty in gear.get("itemBalances", {}).get("saddlepack", {}).items():
        stack_size, slot_cost = resolve_item_balance_stack(item_id)
        total += math.ceil(qty / stack_size) * slot_cost

    return total


def saddlepack_capacity(character: dict) -> int:
    """
    Total saddlepack slot ceiling - 0 when no saddlepack is available,
    otherwise purely the tier bonus from the best equipped/camped
    saddlepack (no character-stat base, unlike backpack).
    """
    if not has_saddlepack_available(character):
        return 0

    bonus = 0
    for instance in character.get("gear", {}).get("items", []):
        if instance.get("location") in ("body", "camp") and instance.get("familyId") == "saddlepack":
            bonus = max(bonus, SADDLEPACK_CAPACITY_BY_ID.get(instance["itemId"], 0))

    return bonus


def cart_slots_used(character: dict) -> int:
    """
    Total cart slots currently occupied - mirrors backpack_slots_used
    but for location:"cart" items, resources, and itemBalances.
    """
    from backend.processed_catalog import PROCESSED_RESOURCE_ITEMS_BY_ID
    from backend.resources_catalog import RESOURCE_ITEMS_BY_ID

    total = 0
    gear = character.get("gear", {})

    for instance in gear.get("items", []):
        if instance.get("location") == "cart":
            total += slot_cost_for_item(instance["itemId"], instance["familyId"])

    for resource_id, qty in gear.get("resources", {}).get("cart", {}).items():
        if resource_id in RESOURCE_ITEMS_BY_ID:
            stack_size = RAW_STACK_SIZE
        elif resource_id in PROCESSED_RESOURCE_ITEMS_BY_ID:
            stack_size = PROCESSED_STACK_SIZE
        else:
            stack_size = TINY_STACK_SIZE
        total += math.ceil(qty / stack_size)

    for item_id, qty in gear.get("itemBalances", {}).get("cart", {}).items():
        stack_size, slot_cost = resolve_item_balance_stack(item_id)
        total += math.ceil(qty / stack_size) * slot_cost

    return total


def has_cart_equipped(character: dict) -> bool:
    """Whether this character has a cart-family instance currently worn
    (location:"body") on the mount's Hitch slot."""
    return any(
        instance.get("location") == "body" and instance.get("familyId") == "cart"
        for instance in character.get("gear", {}).get("items", [])
    )


def has_cart_available(character: dict) -> bool:
    """Whether this character has a cart-family instance equipped on the
    mount's Hitch slot (location:"body") or sitting in camp (location:
    "camp"). Same one-at-a-time pattern as backpack/saddlepack."""
    return any(
        instance.get("location") in ("body", "camp") and instance.get("familyId") == "cart"
        for instance in character.get("gear", {}).get("items", [])
    )


def cart_capacity(character: dict) -> int:
    """
    Total cart slot ceiling - 0 when no cart is available, otherwise
    purely the tier bonus from the best equipped/camped cart.
    """
    if not has_cart_available(character):
        return 0

    bonus = 0
    for instance in character.get("gear", {}).get("items", []):
        if instance.get("location") in ("body", "camp") and instance.get("familyId") == "cart":
            bonus = max(bonus, CART_CAPACITY_BY_ID.get(instance["itemId"], 0))

    return bonus


ENCUMBERED_THRESHOLD = 1.3


def carry_weight_capacity(character: dict) -> int:
    """
    How much total weight this character can carry based on attributes.
    Body-worn gear + backpack (the item itself) + backpack contents all
    count against this.  Saddlepack rides on the mount and is excluded.
    """
    attr = character.get("attr", {})
    might = attr.get("migh", 1)
    endurance = attr.get("endu", 1)
    return 10 + (might + endurance) // 3


_CARRY_WEIGHT_EXCLUDED_SLOTS = frozenset({
    "Mount", "Companion",
    "Bridle", "Saddle", "Barding", "Saddlepack", "Hitch",
    "Charm", "Rune",
})


def carry_weight_used(character: dict) -> int:
    """
    Total slot-weight the character is personally carrying: everything
    worn on body + the backpack item itself + everything packed inside
    the backpack (items, itemBalances, resources).  Excluded from the
    count: mount/companion slots and their sub-slots (Bridle, Saddle,
    Barding, Saddlepack, Hitch, Charm, Rune), and anything
    stored in saddlepack/cart locations.
    """
    from backend.processed_catalog import PROCESSED_RESOURCE_ITEMS_BY_ID
    from backend.resources_catalog import RESOURCE_ITEMS_BY_ID

    total = 0
    gear = character.get("gear", {})

    for instance in gear.get("items", []):
        loc = instance.get("location")
        if loc == "body":
            if _CARRY_WEIGHT_EXCLUDED_SLOTS.intersection(instance.get("slotRef", [])):
                continue
            total += slot_cost_for_item(instance["itemId"], instance["familyId"])
        elif loc == "backpack":
            total += slot_cost_for_item(instance["itemId"], instance["familyId"])

    for resource_id, qty in gear.get("resources", {}).get("backpack", {}).items():
        if resource_id in RESOURCE_ITEMS_BY_ID:
            stack_size = RAW_STACK_SIZE
        elif resource_id in PROCESSED_RESOURCE_ITEMS_BY_ID:
            stack_size = PROCESSED_STACK_SIZE
        else:
            stack_size = TINY_STACK_SIZE
        total += math.ceil(qty / stack_size)

    for item_id, qty in gear.get("itemBalances", {}).get("backpack", {}).items():
        stack_size, slot_cost = resolve_item_balance_stack(item_id)
        total += math.ceil(qty / stack_size) * slot_cost

    return total


def body_gear_weight(character: dict) -> int:
    """Weight of body-worn gear only (no backpack contents, no mount/companion sub-slots)."""
    total = 0
    for instance in character.get("gear", {}).get("items", []):
        if instance.get("location") == "body":
            if _CARRY_WEIGHT_EXCLUDED_SLOTS.intersection(instance.get("slotRef", [])):
                continue
            total += slot_cost_for_item(instance["itemId"], instance["familyId"])
    return total


def mount_gear_weight(character: dict) -> int:
    """Weight of mount sub-slot gear only (Bridle, Saddle, Barding, Saddlepack, Hitch) — no saddlepack contents."""
    total = 0
    for instance in character.get("gear", {}).get("items", []):
        loc = instance.get("location")
        if loc == "body" and _MOUNT_SUB_SLOTS.intersection(instance.get("slotRef", [])):
            total += slot_cost_for_item(instance["itemId"], instance["familyId"])
    return total


def encumbrance_state(character: dict) -> str:
    """
    "normal"     — weight <= capacity
    "encumbered" — weight <= 130% capacity (allowed, penalised)
    "immobile"   — weight > 130% capacity (cannot move)
    """
    cap = carry_weight_capacity(character)
    used = carry_weight_used(character)
    if cap <= 0:
        return "immobile" if used > 0 else "normal"
    if used <= cap:
        return "normal"
    if used <= cap * ENCUMBERED_THRESHOLD:
        return "encumbered"
    return "immobile"


_MOUNT_SUB_SLOTS = frozenset({"Bridle", "Saddle", "Barding", "Saddlepack"})


def mount_carry_weight_capacity(character: dict) -> int:
    """Carry capacity of the currently equipped mount, or 0 if none."""
    for instance in character.get("gear", {}).get("items", []):
        if (
            instance.get("location") == "body"
            and instance.get("familyId") in _MOUNT_FAMILIES
        ):
            return MOUNT_CARRY_CAPACITY_BY_ID.get(instance["itemId"], 0)
    return 0


def mount_carry_weight_used(character: dict) -> int:
    """Total slot-weight the mount is carrying: mount sub-slot gear
    (Bridle, Saddle, Barding, Saddlepack, Hitch) plus everything
    packed inside the saddlepack (items, itemBalances, resources)."""
    from backend.processed_catalog import PROCESSED_RESOURCE_ITEMS_BY_ID
    from backend.resources_catalog import RESOURCE_ITEMS_BY_ID

    total = 0
    gear = character.get("gear", {})

    for instance in gear.get("items", []):
        loc = instance.get("location")
        if loc == "body" and _MOUNT_SUB_SLOTS.intersection(instance.get("slotRef", [])):
            total += slot_cost_for_item(instance["itemId"], instance["familyId"])
        elif loc == "saddlepack":
            total += slot_cost_for_item(instance["itemId"], instance["familyId"])

    for resource_id, qty in gear.get("resources", {}).get("saddlepack", {}).items():
        if resource_id in RESOURCE_ITEMS_BY_ID:
            stack_size = RAW_STACK_SIZE
        elif resource_id in PROCESSED_RESOURCE_ITEMS_BY_ID:
            stack_size = PROCESSED_STACK_SIZE
        else:
            stack_size = TINY_STACK_SIZE
        total += math.ceil(qty / stack_size)

    for item_id, qty in gear.get("itemBalances", {}).get("saddlepack", {}).items():
        stack_size, slot_cost = resolve_item_balance_stack(item_id)
        total += math.ceil(qty / stack_size) * slot_cost

    return total
