"""
Every armor piece has its own blueprint (blueprint_iron_head_armor, ...),
no blueprint covers a whole set any more, and the migration turns an old set
blueprint into the chest piece's of the same tier.
"""

import importlib.util
import json
from pathlib import Path

from backend import craft_catalog, items_catalog

ROOT = Path(__file__).resolve().parent.parent
PIECES = ("head_armor", "chest_armor", "leg_armor")
RECIPES = json.loads((ROOT / "backend" / "data" / "craft-recipes.json").read_text())


def _armor_recipes():
    return [r for r in RECIPES if r["familyId"].endswith(PIECES)]


def test_each_armor_piece_needs_its_own_blueprint():
    pieces = _armor_recipes()
    assert len(pieces) == 24
    for recipe in pieces:
        assert recipe["blueprintFamilyId"] == f"blueprint_{recipe['familyId']}"
    # No two recipes share an armor blueprint.
    families = [r["blueprintFamilyId"] for r in pieces]
    assert len(families) == len(set(families))


def test_piece_blueprints_exist_for_every_tier_named_after_the_piece():
    by_id = craft_catalog.BLUEPRINT_ITEMS_BY_ID
    for recipe in _armor_recipes():
        family = recipe["familyId"]
        for tier in range(1, 7):
            blueprint = by_id[f"blueprint_{family}_{tier}"]
            assert blueprint.family_id == f"blueprint_{family}" and blueprint.tier == tier
            assert blueprint.name == "Blueprint: " + items_catalog.ITEM_CATALOG_ENTRIES_BY_ID[f"{family}_{tier}"].name
    # The old set blueprints are gone.
    for armor in ("cloth", "leather", "chainmail", "iron", "ebony", "chitin", "meteoric_iron", "darksteel"):
        assert not any(b.family_id == f"blueprint_{armor}" for b in craft_catalog.BLUEPRINT_ITEMS)


def test_creation_offers_each_piece_separately():
    pools = craft_catalog.resolve_blueprint_trapping_options(["armorer"]).pools
    items = {i.id for p in pools for i in p.items}
    assert {"blueprint_iron_head_armor_1", "blueprint_iron_chest_armor_1", "blueprint_iron_leg_armor_1"} <= items
    # The fallback item set (a category without item blueprints) uses the cloth chest piece.
    fallback = craft_catalog.resolve_blueprint_trapping_options(["tinsmith"]).pools
    assert "blueprint_cloth_chest_armor_1" in {i.id for p in fallback for i in p.items}


def _migration():
    path = ROOT / "scripts" / "migrate_split_armor_blueprints.py"
    spec = importlib.util.spec_from_file_location("migrate_split_armor_blueprints", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_keeps_the_chest_piece_of_an_old_set_blueprint():
    split = _migration().split_armor_blueprints
    assert split(["blueprint_iron_2", "blueprint_kiln_1", "blueprint_meteoric_iron_6"]) == [
        "blueprint_iron_chest_armor_2", "blueprint_kiln_1", "blueprint_meteoric_iron_chest_armor_6"]
    # Shields and already split ids are left alone; running twice changes nothing.
    already = ["blueprint_iron_shield_1", "blueprint_iron_head_armor_1", "blueprint_iron_chest_armor_1"]
    assert split(already) == already
    assert split(["blueprint_cloth_1", "blueprint_cloth_chest_armor_1"]) == ["blueprint_cloth_chest_armor_1"]
