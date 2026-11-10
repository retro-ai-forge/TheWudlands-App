"""
A higher-tier material can always fill a lower-tier requirement; the craft's
own tier (the lowest allowed) decides the outcome. Exact tier is used first,
then the next tiers up, the character's stock before the shared vault.
"""

import pytest

from backend import players

CROWBAR = players._RECIPES_BY_FAMILY["crowbar"]   # 2x refined_ore, anvil


def _resolve(tier, character=None, player=None, count=1):
    return players._resolve_recipe_ingredients(
        CROWBAR, tier, {}, {}, character={}, count=count,
        character_item_balances=character or {}, player_item_balances=player or {},
    )


def test_higher_tier_fills_a_lower_requirement():
    resolved = _resolve(2, player={"refined_ore_4": 5})
    assert resolved is not None
    assert resolved[3] == {"refined_ore_4": 2}


def test_exact_tier_first_then_the_lowest_higher_one():
    resolved = _resolve(2, player={"refined_ore_2": 1, "refined_ore_3": 1, "refined_ore_5": 3}, count=2)
    assert resolved[3] == {"refined_ore_2": 1, "refined_ore_3": 1, "refined_ore_5": 2}


def test_character_stock_before_the_vault_at_each_tier():
    resolved = _resolve(1, character={"refined_ore_1": 1}, player={"refined_ore_1": 5})
    assert resolved[2] == {"refined_ore_1": 1} and resolved[3] == {"refined_ore_1": 1}


def test_lower_tier_never_fills_a_higher_requirement():
    assert _resolve(3, player={"refined_ore_2": 10}) is None


def test_tier_ids_run_from_the_exact_tier_up():
    assert players._ingredient_tier_ids("refined_ore", 5) == ["refined_ore_5", "refined_ore_6"]
    with pytest.raises(ValueError):
        players._ingredient_tier_ids("no_such_family", 1)


# ── Where crafting takes from ──────────────────────────────────────────


def test_craft_storage_is_home_or_resting_camp():
    assert players._craft_storage_type({"availability": {"inAdventure": False}}) == "home"
    assert players._craft_storage_type({"availability": {"inAdventure": True, "resting": True}}) == "camp"
    assert players._craft_storage_type({"availability": {"inAdventure": True, "resting": False}}) is None


def test_take_from_storage_first_then_carried_bags():
    split = players._split_craft_take(
        {"ore_1": 7, "anvil_1": 1},
        {"ore_1": 3, "anvil_1": 1},
        {"backpack": {"ore_1": 2}, "saddlepack": {}, "cart": {"ore_1": 5}},
    )
    assert split == ({"ore_1": 3, "anvil_1": 1}, {"backpack": {"ore_1": 2}, "cart": {"ore_1": 2}})
    assert players._split_craft_take({"ore_1": 20}, {"ore_1": 3}, {"backpack": {"ore_1": 2}}) is None


def test_camp_craft_returns_home_once_the_adventure_is_over():
    camp = {"crafting": {"activeCraft": {"storage": "camp"}}}
    assert players._craft_return_storage({**camp, "availability": {"inAdventure": True}}) == "camp"
    assert players._craft_return_storage({**camp, "availability": {"inAdventure": False}}) == "home"
    assert players._craft_return_storage({"crafting": {"activeCraft": {}}}) is None   # older craft: vault



# ── Item condition ─────────────────────────────────────────────────────

from backend import item_condition  # noqa: E402


def test_condition_levels_and_labels():
    assert [item_condition.label(q) for q in (4, 3, 2, 1)] == ["new", "used", "damaged", "broken"]
    assert item_condition.label(None) == "new"            # a stack has no condition
    assert item_condition.level(180) == 4                 # an unmigrated point value counts as new


def test_crafting_tool_chance_grows_with_the_batch_up_to_the_cap():
    assert item_condition.crafting_tool_chance(1) == pytest.approx(0.02)
    assert item_condition.crafting_tool_chance(10) == pytest.approx(0.2)
    assert item_condition.crafting_tool_chance(50) == pytest.approx(0.5)


def test_salvage_penalty_by_condition():
    from backend import recycling
    assert recycling.CONDITION_PENALTY == {"new": 0, "used": 10, "damaged": 25, "broken": 50}


def test_stations_are_tracked_items_that_craft_their_tier_and_below():
    assert players._is_tracked_item("anvil_1") and not players._is_tracked_item("ore_1")
    t1_anvil = {"instanceId": "a", "itemId": "anvil_1", "familyId": "anvil", "quality": 4, "location": "home"}
    character = {"gear": {"items": [t1_anvil]}}
    assert players._resolve_tool_instances_for_craft(character, {}, ["anvil"], 5, 3, []) is None  # T1 anvil, T5 recipe
    t5_anvil = {**t1_anvil, "instanceId": "b", "itemId": "anvil_5"}
    found = players._resolve_tool_instances_for_craft({"gear": {"items": [t1_anvil, t5_anvil]}}, {}, ["anvil"], 3, 3, [])
    assert found[0] == "instance_moves" and found[1][0][0] == "b" and found[2] == 3   # T5 anvil does a T3 recipe
    t1_axe = {"instanceId": "x", "itemId": "axe_1", "familyId": "axe", "quality": 4, "location": "home"}
    assert players._resolve_tool_instances_for_craft({"gear": {"items": [t1_axe]}}, {}, ["axe"], 3, 1, []) is None


def test_station_wear_adds_up_per_item_like_any_tool():
    # 2% per item crafted, one roll for the batch, capped at 50%.
    assert item_condition.crafting_tool_chance(1) == pytest.approx(0.02)
    assert item_condition.crafting_tool_chance(10) == pytest.approx(0.2)
    assert item_condition.crafting_tool_chance(40) == pytest.approx(0.5)
