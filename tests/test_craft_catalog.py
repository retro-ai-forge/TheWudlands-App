"""
Exercises backend.craft_catalog's soul-creation "Trappings" blueprint pools -
pure catalog logic, no DB needed.
"""

from backend.craft_catalog import (
    TOOL_BLUEPRINT_ROOT_FAMILIES,
    resolve_blueprint_trapping_options,
)
from backend.professions_catalog import PROFESSION_CATEGORIES


def _tool_pool_family_ids(profession_id: str) -> list[str]:
    opts = resolve_blueprint_trapping_options([profession_id, "none", "none"])
    pool = next(p for p in opts.pools if p.rule.source == "tool")
    return [item.family_id for item in pool.items]


def test_every_offered_tool_blueprint_is_a_resolved_root():
    """A new character gets exactly one permanent tool blueprint ever - every
    tool family the Trappings step offers must be self-sufficient (craftable
    from raw/processed materials plus other blueprint-free tools alone),
    never a mid-chain tool (e.g. furnace, which needs a kiln to make its own
    fired_brick ingredient) that can never actually be built."""
    for profession_id in PROFESSION_CATEGORIES:
        for family_id in _tool_pool_family_ids(profession_id):
            output_family = family_id[len("blueprint_"):]
            roots = TOOL_BLUEPRINT_ROOT_FAMILIES.get(output_family, (output_family,))
            assert roots == (output_family,), (
                f"{profession_id}'s tool pool offers {family_id}, a dead-end mid-chain "
                f"tool (resolves to root(s) {roots}) - should offer the root instead"
            )


def test_soldier_offers_kiln_not_wrench():
    """wrench needs an anvil, which needs a furnace, which needs a kiln (via
    its fired_brick ingredient) - Military's only category-matched
    tool-blueprint family used to be the dead-end wrench; kiln is its
    actual root, and should always be offered regardless of what else the
    item-hint widening below adds."""
    assert "blueprint_kiln" in _tool_pool_family_ids("soldier")
    assert "blueprint_wrench" not in _tool_pool_family_ids("soldier")


def test_alchemist_offers_lapidary_bench_not_enchanters_table():
    """enchanters_table needs a lapidary_bench - Alchemy's only
    category-matched tool-blueprint family used to be the dead-end
    enchanters_table."""
    assert "blueprint_lapidary_bench" in _tool_pool_family_ids("alchemist")
    assert "blueprint_enchanters_table" not in _tool_pool_family_ids("alchemist")


def test_tool_pool_widened_by_eligible_item_blueprints():
    """soldier's item pool includes bow/cloth/crossbow (need workbench,
    spinning_wheel, and kiln via anvil) and iron_ration/fishermans_ration
    (need oven) - the tool pool should surface every one of those roots as
    a selectable option, not just whichever tool family happens to share
    Military's own category (kiln, via wrench)."""
    tool_options = set(_tool_pool_family_ids("soldier"))
    assert tool_options == {
        "blueprint_kiln",
        "blueprint_oven",
        "blueprint_spinning_wheel",
        "blueprint_workbench",
    }


def test_item_blueprint_pool_is_unaffected():
    """The root-substitution only applies to the tool pool - item blueprint
    eligibility (already scoped to the profession's own categories) is
    untouched."""
    opts = resolve_blueprint_trapping_options(["blacksmith", "none", "none"])
    item_pool = next(p for p in opts.pools if p.rule.source == "item")
    assert "blueprint_sword" in [i.family_id for i in item_pool.items]
