"""
Regenerate public/craft/recipe-viewer.html from
public/craft/recipe-viewer.template.html and the current backend/data/*.json
catalogs + craft-recipes.json.

Run this after editing craft-recipes.json or any base-*.json catalog file so
the viewer reflects the latest data:

    python3 public/craft/build-recipe-viewer.py
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = ROOT / "backend" / "data"
TEMPLATE = Path(__file__).resolve().parent / "recipe-viewer.template.html"
OUTPUT = Path(__file__).resolve().parent / "recipe-viewer.html"

CATALOG_FILES = {
    "raw": "base-resources.json",
    "processed": "base-processed.json",
    "tool": "base-tools.json",
    "armor": "base-items-armor.json",
    "shield": "base-items-shield.json",
    "weapon": "base-items-weapon.json",
    "food": "base-items-food.json",
    "potion": "base-items-potion.json",
    "adventuring_gear": "base-items-adventuring-gear.json",
    "essentials": "base-items-essentials.json",
    "companion": "base-items-companion.json",
    "mount": "base-items-mount.json",
    "blueprint": "base-blueprint.json",
}


def _load_gathering_bonuses_by_item() -> dict[str, list[str]]:
    # Mirrors backend.items_catalog._load_gathering_bonuses_by_item -
    # raw-material-gathering-bonuses.json is keyed the other way around (raw
    # material -> which item families help gather it), inverted here into
    # item family -> which raw materials it helps gather, the direction the
    # popup actually needs.
    data = json.loads((DATA_DIR / "raw-material-gathering-bonuses.json").read_text())
    by_item: dict[str, list[str]] = {}
    for raw_material, info in data.items():
        for item_family in info.get("gatheringItems", []):
            by_item.setdefault(item_family, []).append(raw_material)
    return by_item


def build_families() -> dict:
    # familyId -> its full item-inventory-properties.json row - the same
    # equip/instance-tracking reference data backend.items_catalog loads.
    # needsItemDefinition (true for e.g. axe_stone/axe/dagger doubling as a
    # tool) lets the viewer's own isCurrentSelectionCraftable apply the same
    # ">= recipe tier" minimum backend.players._resolve_tool_for_craft
    # enforces for these, while a flat-balance tool (an anvil, a furnace,
    # ...) stays any-tier-satisfies. The rest (sizeClass/stackSize/
    # qualityMax/equipSlots/twoHanded/backpackable/gatheringBonuses) is
    # embedded as each family's "props" below, feeding the item-detail
    # popup opened by clicking the root row of the Recipe Tree - only a
    # family with a props entry (an equippable/instance-tracked item, not a
    # raw/processed material) gets that popup at all.
    props_by_family: dict[str, dict] = {
        row["familyId"]: row
        for row in json.loads((DATA_DIR / "item-inventory-properties.json").read_text())
    }
    gathering_by_item = _load_gathering_bonuses_by_item()

    families: dict[str, dict] = {}
    for category, filename in CATALOG_FILES.items():
        items = json.loads((DATA_DIR / filename).read_text())
        by_family: dict[str, list[dict]] = {}
        for item in items:
            by_family.setdefault(item["familyId"], []).append(item)
        for family_id, family_items in by_family.items():
            family_items = sorted(family_items, key=lambda x: x["tier"])
            props = props_by_family.get(family_id)
            family: dict = {
                "category": category,
                "name": family_items[0]["name"],
                "needsItemDefinition": props.get("needsItemDefinition", False) if props else False,
                "tiers": [
                    {
                        "tier": it["tier"],
                        "name": it["name"],
                        "id": it["id"],
                        "description": it.get("description"),
                        "icon": it.get("icon"),
                    }
                    for it in family_items
                ],
            }
            # A pure crafting-station tool (kind == ["tool"] exactly, e.g.
            # anvil/furnace/workbench) gets no popup - still all "dummy"
            # placeholder descriptions with nothing worth previewing. A
            # dual-role item (kind includes "weapon" too, e.g. axe_stone/
            # axe/dagger) keeps its popup same as any other equippable item.
            has_popup = bool(props) and sorted(props.get("kind", [])) != ["tool"]
            if has_popup:
                family["props"] = {
                    "sizeClass": props.get("sizeClass"),
                    "stackSize": props.get("stackSize", 1),
                    "qualityMax": props.get("qualityMax"),
                    "equipSlots": props.get("equipSlots", []),
                    "twoHanded": props.get("twoHanded", False),
                    "backpackable": props.get("backpackable", False),
                    "gatheringBonuses": gathering_by_item.get(family_id, []),
                }
            families[family_id] = family
    return families


def build_recipes() -> dict:
    recipes = json.loads((DATA_DIR / "craft-recipes.json").read_text())
    return {r["familyId"]: r for r in recipes}


def main() -> None:
    data = {"families": build_families(), "recipes": build_recipes()}
    template = TEMPLATE.read_text()
    output = template.replace("__DATA__", json.dumps(data))
    OUTPUT.write_text(output)
    print(f"Wrote {OUTPUT} ({len(data['families'])} families, {len(data['recipes'])} recipes)")


if __name__ == "__main__":
    main()
