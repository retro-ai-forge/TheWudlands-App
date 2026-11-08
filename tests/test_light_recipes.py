"""Torch, candle and oil take whatever the crafter has: each ingredient slot
lists its options with the overflowing raws first (bone, reed, hide, fish,
monster part) and the scarce ones (wood, fiber, meat) only as a fallback -
crafting uses the first option the crafter has enough of."""

from backend import players


def _resolve(family, stock, tier=1, count=1):
    resolved = players._resolve_recipe_ingredients(
        players._RECIPES_BY_FAMILY[family], tier, {}, {}, character={}, count=count,
        character_item_balances={}, player_item_balances=stock,
    )
    return None if resolved is None else resolved[3]


def test_no_light_needs_wood():
    for family in ("candle", "oil"):
        recipe = players._RECIPES_BY_FAMILY[family]
        assert all(o["familyId"] != "wood" for slot in recipe["ingredients"] for o in slot["alternatives"])


def test_a_torch_prefers_bone_and_reed():
    everything = {"bone_1": 5, "wood_1": 5, "reed_1": 5, "hide_1": 5, "fiber_1": 5}
    assert _resolve("torch", everything) == {"bone_1": 1, "reed_1": 1}


def test_a_torch_falls_back_to_wood_and_fiber():
    assert _resolve("torch", {"wood_1": 1, "fiber_1": 1}) == {"wood_1": 1, "fiber_1": 1}
    assert _resolve("torch", {"wood_1": 1, "hide_1": 1}) == {"wood_1": 1, "hide_1": 1}
    assert _resolve("torch", {"wood_1": 1}) is None                     # a shaft alone is no torch


def test_candle_and_oil_take_the_first_option_on_hand():
    assert _resolve("candle", {"hide_1": 1, "meat_1": 1, "reed_1": 1, "fiber_1": 1}) == {"hide_1": 1, "reed_1": 1}
    assert _resolve("candle", {"harvest_1": 2, "fiber_1": 1}) == {"harvest_1": 2, "fiber_1": 1}  # wax and a fiber wick
    assert _resolve("oil", {"fish_1": 1, "bone_1": 1, "meat_1": 3}) == {"fish_1": 1, "bone_1": 1}
    assert _resolve("oil", {"meat_1": 1, "harvest_1": 1}) == {"meat_1": 1, "harvest_1": 1}
    assert _resolve("oil", {"meat_1": 1, "fiber_1": 1}) == {"meat_1": 1, "fiber_1": 1}         # the old oil, last


def test_one_option_covers_a_whole_batch():
    # 5 reed and 5 hide can't make 10 torch heads together - one option per slot and batch.
    assert _resolve("torch", {"bone_1": 10, "reed_1": 5, "hide_1": 5}, count=10) is None
    assert _resolve("torch", {"bone_1": 10, "reed_1": 5, "hide_1": 10}, count=10) == {"bone_1": 10, "hide_1": 10}


def test_a_higher_tier_raw_fills_the_slot():
    assert _resolve("torch", {"bone_3": 1, "reed_2": 1}, tier=2) == {"bone_3": 1, "reed_2": 1}
