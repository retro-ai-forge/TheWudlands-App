"""Basic recipes that take an overflowing raw as well as the scarce one:
leather tans from hide or skin (1 to 1, at the tanning rack), and rope is
braided from leather (so from hide or skin) or spun from fiber."""

from backend import players


def _resolve(family, stock, tier=1, count=1):
    resolved = players._resolve_recipe_ingredients(
        players._RECIPES_BY_FAMILY[family], tier, {}, {}, character={}, count=count,
        character_item_balances={}, player_item_balances=stock,
    )
    return None if resolved is None else resolved[3]


def test_leather_tans_from_hide_or_skin_at_the_tanning_rack():
    recipe = players._RECIPES_BY_FAMILY["leather"]
    assert recipe["tool"] == "tanning_rack"
    assert _resolve("leather", {"hide_1": 6, "skin_1": 6}) == {"hide_1": 6}          # hide first
    assert _resolve("leather", {"skin_1": 6}) == {"skin_1": 6}
    assert _resolve("leather", {"hide_1": 3, "skin_1": 3}) is None                 # no mixing in one slot


def test_rope_from_leather_or_fiber():
    assert _resolve("rope", {"leather_1": 1, "fiber_1": 6}) == {"leather_1": 1}      # leather on hand first
    assert _resolve("rope", {"fiber_1": 6}) == {"fiber_1": 6}
    assert _resolve("rope", {"fiber_1": 5}) is None


def test_stand_ins_do_not_move_an_item_into_other_profession_groups():
    from backend import craft_catalog as C
    rope = players._RECIPES_BY_FAMILY["rope"]["ingredients"]
    leather = players._RECIPES_BY_FAMILY["leather"]["ingredients"]
    # Only the classic (last consumed) option counts for the groups.
    assert [i["familyId"] for i in C._classic_ingredients(rope)] == ["fiber"]
    assert [i["familyId"] for i in C._classic_ingredients(leather)] == ["skin"]
    carcass = players._RECIPES_BY_FAMILY["carcass"]["ingredients"]
    assert [i["familyId"] for i in C._classic_ingredients(carcass)] == ["meat", "bone_blade"]


def test_an_option_that_needs_a_tool_does_not_force_it_on_the_slot():
    from backend import craft_catalog as C
    recipes = {r["familyId"]: r for r in C._load_recipes()}
    # Rope from leather needs a tanning rack, rope from fiber nothing - so rope needs none.
    assert C._hard_gated_tool_deps("rope", recipes) == set()
    assert C._hard_tool_alternative_sets("rope", recipes) == set()


def test_glass_pane_from_sand_or_crystal_at_the_kiln():
    from backend import craft_catalog as C
    recipe = players._RECIPES_BY_FAMILY["glass_pane"]
    assert recipe["tool"] == "kiln"
    assert _resolve("glass_pane", {"crystal_1": 6, "sand_1": 6}) == {"sand_1": 6}      # sand first
    assert _resolve("glass_pane", {"crystal_1": 6}) == {"crystal_1": 6}
    # Sand stays the classic material for the profession groups, though listed first.
    assert [i["familyId"] for i in C._classic_ingredients(recipe["ingredients"])] == ["sand"]


def test_coal_from_wood_or_monster_parts():
    from backend import craft_catalog as C
    recipe = players._RECIPES_BY_FAMILY["coal"]
    assert _resolve("coal", {"wood_1": 3, "monster_part_1": 3}) == {"wood_1": 3}      # wood first
    assert _resolve("coal", {"monster_part_1": 3}) == {"monster_part_1": 3}
    assert [i["familyId"] for i in C._classic_ingredients(recipe["ingredients"])] == ["wood"]


def test_arrow_shaft_from_bone_reed_or_wood_fletching_from_feather_or_hide():
    from backend import craft_catalog as C
    recipe = players._RECIPES_BY_FAMILY["arrow"]
    assert recipe["tool"] is None and recipe["blueprintFamilyId"] is None
    stock = {"bone_1": 1, "reed_1": 1, "wood_1": 1, "feather_1": 1, "hide_1": 1}
    assert _resolve("arrow", stock) == {"bone_1": 1, "feather_1": 1}                 # surplus raws first
    assert _resolve("arrow", {"reed_1": 1, "wood_1": 1, "hide_1": 1}) == {"reed_1": 1, "hide_1": 1}
    assert _resolve("arrow", {"wood_1": 10, "feather_1": 10}, count=10) == {"wood_1": 10, "feather_1": 10}
    assert _resolve("arrow", {"wood_1": 1}) is None                                  # no fletching
    # Still a wood-and-feather item for the profession groups.
    assert [i["familyId"] for i in C._classic_ingredients(recipe["ingredients"])] == ["wood", "feather"]


def test_bolt_shaft_from_bone_or_wood_head_from_stone_monster_part_crystal_or_ore():
    from backend import craft_catalog as C
    recipe = players._RECIPES_BY_FAMILY["bolt"]
    assert recipe["tool"] is None and recipe["blueprintFamilyId"] is None
    stock = {"bone_1": 1, "wood_1": 1, "stone_1": 1, "monster_part_1": 1, "crystal_1": 1, "ore_1": 1}
    assert _resolve("bolt", stock) == {"bone_1": 1, "stone_1": 1}                    # surplus raws first
    assert _resolve("bolt", {"wood_1": 1, "monster_part_1": 1}) == {"wood_1": 1, "monster_part_1": 1}
    assert _resolve("bolt", {"wood_1": 1, "crystal_1": 1, "ore_1": 1}) == {"wood_1": 1, "crystal_1": 1}
    assert _resolve("bolt", {"wood_1": 1, "ore_1": 1}) == {"wood_1": 1, "ore_1": 1}
    assert _resolve("bolt", {"bone_1": 1}) is None                                   # no head
    assert [i["familyId"] for i in C._classic_ingredients(recipe["ingredients"])] == ["wood", "ore"]
