"""
Exercises backend.craft_catalog's soul-creation "Trappings" blueprint pool -
pure catalog logic, no DB needed.

A new character picks 1 starting blueprint, at the tier of its profession
count, from its professions' lists in data/profession-blueprints.json:
`own` (its trade) and `offered` (what it uses). Every blueprint is owned by
at least one profession.
"""

import json
from pathlib import Path

import pytest

from backend import craft_catalog
from backend.craft_catalog import (
    BLUEPRINT_ITEMS,
    PROFESSION_BLUEPRINTS,
    blueprint_owners,
    category_blueprint_summary,
    resolve_blueprint_trapping_options,
)
from backend.professions_catalog import PROFESSION_CATEGORIES


def _families(*profession_ids: str) -> set[str]:
    pools = resolve_blueprint_trapping_options(list(profession_ids)).pools
    assert len(pools) == 1
    return {i.family_id for i in pools[0].items}


def test_one_pick_at_the_tier_of_the_profession_count():
    for professions in (["blacksmith"], ["blacksmith", "weaver"], ["blacksmith", "weaver", "cook"]):
        pools = resolve_blueprint_trapping_options(professions).pools
        assert [(p.rule.source, p.rule.count, p.rule.tier) for p in pools] == [("profession", 1, len(professions))]
        assert pools[0].items and all(i.tier == len(professions) for i in pools[0].items)


def test_no_profession_no_pick():
    assert resolve_blueprint_trapping_options(["none", "none", "none"]).pools == ()


def test_unknown_profession_is_refused():
    with pytest.raises(ValueError):
        resolve_blueprint_trapping_options(["wizard"])


def test_every_profession_is_offered_something_and_every_blueprint_has_an_owner():
    assert set(PROFESSION_BLUEPRINTS) == set(PROFESSION_CATEGORIES)
    for profession_id in PROFESSION_CATEGORIES:
        assert _families(profession_id), profession_id
    for family in {b.family_id for b in BLUEPRINT_ITEMS}:
        assert blueprint_owners(family), family


def test_a_profession_is_offered_its_own_and_offered_lists_exactly():
    lists = PROFESSION_BLUEPRINTS["poisoner"]
    assert _families("poisoner") == set(lists.own) | set(lists.offered)
    assert "blueprint_venom_vial" in lists.own and "blueprint_dagger" in lists.offered


def test_own_blueprints_are_flagged():
    pool = resolve_blueprint_trapping_options(["blacksmith", "herder"]).pools[0]
    assert {"blueprint_sword", "blueprint_signal_whistle"} <= pool.own_families
    assert "blueprint_cart" not in pool.own_families                # herder only uses it
    assert "blueprint_cart" in {i.family_id for i in pool.items}


def test_several_professions_get_the_union():
    assert _families("blacksmith", "fisher") == _families("blacksmith") | _families("fisher")


def test_the_trades_from_the_design():
    assert "blueprint_meteoric_iron_chest_armor" in PROFESSION_BLUEPRINTS["alchemist"].own   # star metal
    assert "blueprint_ebony_shield" in PROFESSION_BLUEPRINTS["cooper"].own
    assert "blueprint_leather_chest_armor" in PROFESSION_BLUEPRINTS["leatherworker"].own
    assert "blueprint_anvil" in PROFESSION_BLUEPRINTS["blacksmith"].own
    assert "blueprint_pickaxe" in PROFESSION_BLUEPRINTS["miner"].own
    assert "blueprint_signal_whistle" in PROFESSION_BLUEPRINTS["herder"].own


def test_a_blueprint_without_an_owner_refuses_to_load(tmp_path, monkeypatch):
    data = json.loads(Path(craft_catalog._PROFESSION_BLUEPRINTS_PATH).read_text())
    data["miner"]["own"].remove("pickaxe")
    path = tmp_path / "profession-blueprints.json"
    path.write_text(json.dumps(data))
    monkeypatch.setattr(craft_catalog, "_PROFESSION_BLUEPRINTS_PATH", path)
    with pytest.raises(ValueError, match="without an owner.*pickaxe"):
        craft_catalog._load_profession_blueprints({b.family_id for b in BLUEPRINT_ITEMS})


def test_lore_summary_lists_every_blueprint_under_its_owners_categories():
    summary = category_blueprint_summary(max_tier=6)
    listed = {f"blueprint_{f['familyId']}" for entry in summary for f in entry["families"]}
    assert listed == {b.family_id for b in BLUEPRINT_ITEMS}
    alchemy = next(e for e in summary if e["category"] == "Alchemy")
    star = next(f for f in alchemy["families"] if f["familyId"] == "meteoric_iron_chest_armor")
    assert star["owners"] == ["alchemist"] and len(star["items"]) == 6


def test_every_blueprint_unlocks_exactly_the_recipe_of_its_name():
    """The creation preview shows blueprint_X as item X (same tier), and the
    trappings endpoint reads its station from recipe X - so each blueprint
    family must gate exactly one recipe, the one named after it."""
    recipes = json.loads((Path(craft_catalog._DATA_DIR) / "craft-recipes.json").read_text())
    gated: dict[str, list[str]] = {}
    for recipe in recipes:
        if recipe.get("blueprintFamilyId"):
            gated.setdefault(recipe["blueprintFamilyId"], []).append(recipe["familyId"])
    assert set(gated) == {b.family_id for b in BLUEPRINT_ITEMS}
    for family, outputs in gated.items():
        assert outputs == [family.removeprefix("blueprint_")], family


def test_lore_lists_every_profession_with_its_own_trade():
    summary = craft_catalog.profession_blueprint_summary()
    assert {p["id"] for p in summary["professions"]} == set(PROFESSION_CATEGORIES)
    for profession in summary["professions"]:
        assert profession["own"] == [f.removeprefix("blueprint_") for f in PROFESSION_BLUEPRINTS[profession["id"]].own]
        for family in profession["own"]:
            assert summary["families"][family]["items"][0]["tier"] == 1
    assert summary["families"]["fishermans_ration"]["name"] == "Fisherman's Ration"
    assert summary["families"]["lock_and_key"]["name"] == "Lock and Key"
