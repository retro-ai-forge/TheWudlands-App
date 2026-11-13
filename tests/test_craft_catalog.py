"""
Exercises backend.craft_catalog's soul-creation "Trappings" blueprint pools -
pure catalog logic, no DB needed.

A new character picks 2 starting blueprints from one list (source "any"):
the category's tool and item blueprints - higher tools too - plus the base
tools behind them. Any combination is allowed; a higher tool always comes
with its base tool(s) in the same list, so it can be completed with the
other pick.
"""

from backend.craft_catalog import (
    TOOL_BLUEPRINT_ROOT_FAMILIES,
    blueprint_source,
    resolve_blueprint_trapping_options,
)
from backend.professions_catalog import PROFESSION_CATEGORIES


def _pool(profession_id: str):
    pools = resolve_blueprint_trapping_options([profession_id, "none", "none"]).pools
    assert len(pools) == 1
    return pools[0]


def _families(profession_id: str, kind: str | None = None) -> set[str]:
    return {i.family_id for i in _pool(profession_id).items if kind is None or blueprint_source(i.family_id) == kind}


def test_two_picks_from_one_list_of_tools_and_items():
    for professions in (["blacksmith"], ["blacksmith", "weaver"], ["blacksmith", "weaver", "cook"]):
        pools = resolve_blueprint_trapping_options(professions).pools
        assert [(p.rule.source, p.rule.count, p.rule.tier) for p in pools] == [("any", 2, len(professions))]
        assert all(i.tier == len(professions) for i in pools[0].items)


def test_every_offered_tool_comes_with_its_base_tools():
    """A higher tool (anvil, furnace, enchanter's table, loom) is offered
    together with the base tool(s) it needs, so the other pick can be one."""
    for profession_id in PROFESSION_CATEGORIES:
        tools = _families(profession_id, "tool")
        for family_id in tools:
            roots = TOOL_BLUEPRINT_ROOT_FAMILIES.get(family_id[len("blueprint_"):], ())
            for root in roots:
                assert f"blueprint_{root}" in tools, f"{profession_id}: {family_id} without its base tool {root}"


def test_higher_tools_are_offered_next_to_their_base():
    alchemist = _families("alchemist", "tool")
    assert {"blueprint_lapidary_bench", "blueprint_enchanters_table"} <= alchemist
    tinsmith = _families("tinsmith", "tool")
    assert {"blueprint_kiln", "blueprint_anvil"} <= tinsmith


def test_carpenter_can_start_with_spinning_wheel_and_loom():
    """The loom needs no workbench any more - only thread from a spinning
    wheel - so the two picks make a complete weaving start."""
    assert TOOL_BLUEPRINT_ROOT_FAMILIES["loom"] == ("spinning_wheel",)
    assert {"blueprint_loom", "blueprint_spinning_wheel"} <= _families("carpenter", "tool")


def test_base_tools_behind_the_items_are_offered():
    """soldier's items need workbench, spinning_wheel, kiln (via anvil),
    oven and tanning_rack - all of them are in the list."""
    assert {
        "blueprint_kiln",
        "blueprint_oven",
        "blueprint_spinning_wheel",
        "blueprint_tanning_rack",
        "blueprint_workbench",
    } <= _families("soldier", "tool")


def test_items_of_the_category_are_offered():
    assert "blueprint_sword" in _families("blacksmith", "item")


def test_a_category_without_items_gets_the_fallback_items():
    """CraftTool has tool blueprints but no item ones: the universal item set
    (dagger, cloth chest piece) fills in, the tools stay its own."""
    assert {"blueprint_dagger", "blueprint_cloth_chest_armor"} <= _families("tinsmith", "item")
    assert "blueprint_workbench" not in _families("tinsmith", "tool")      # no tool fallback needed
