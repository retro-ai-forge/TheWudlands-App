"""
Regenerates the crafting tables in docs/PLAYERS.md from the game data:

  - "categories":       blueprints each profession category starts with
                         (backend.craft_catalog.resolve_blueprint_trapping_options,
                         the same pools character creation offers)
  - "blueprint-xp":     blueprint-gated recipes - raw-material XP of their full
                         chain and the tier-scaled assembly bonus
  - "no-blueprint-xp":  recipes without a blueprint - raw-material XP only

Raw materials are counted down the whole chain the way the XP code does
(backend.players._resolve_recipe_full_chain_raw_total): a slot with options
counts its first consumed option. Each table sits between
<!-- BEGIN generated: NAME --> and <!-- END generated: NAME --> markers in
docs/PLAYERS.md and is replaced in place.

Usage:  python scripts/generate_crafting_tables.py           (writes the doc)
        python scripts/generate_crafting_tables.py --check   (exit 1 if out of date)
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend import craft_catalog  # noqa: E402
from backend.players import _RECIPES_BY_FAMILY  # noqa: E402
from backend.professions_catalog import PROFESSION_CATEGORIES  # noqa: E402
from backend.resources_catalog import PROFESSION_RESOURCE_FAMILIES  # noqa: E402

DOC = ROOT / "docs" / "PLAYERS.md"


def family_name(family_id: str) -> str:
    """A family as a plain name ("darksteel_head_armor" -> "Darksteel Head
    Armor") - not a tier's flavor name, since a row covers every tier."""
    return family_id.replace("_", " ").title().replace("'S ", "'s ")


def raw_label(family_id: str) -> str:
    """A raw family as a material name ("monster_part" -> "Monster Part")."""
    return family_id.replace("_", " ").title()


def _first_consumed(ingredient: dict) -> dict | None:
    options = ingredient.get("alternatives") or [ingredient]
    return next((o for o in options if o.get("consumed", True)), None)


def raw_chain(family_id: str, qty: int = 1, seen: frozenset = frozenset()) -> dict[str, int]:
    """Raw materials across the full creation chain of `qty` of family_id,
    per raw family - mirrors _resolve_recipe_full_chain_raw_total (first
    consumed option; held tools and other crafted items count nothing)."""
    recipe = _RECIPES_BY_FAMILY.get(family_id)
    if recipe is None or family_id in seen:
        return {}
    seen = seen | {family_id}
    totals: dict[str, int] = {}
    for ingredient in recipe["ingredients"]:
        chosen = _first_consumed(ingredient)
        if chosen is None:
            continue
        amount = chosen["qty"] * qty
        if chosen["category"] == "raw":
            totals[chosen["familyId"]] = totals.get(chosen["familyId"], 0) + amount
        elif chosen["category"] == "processed":
            for raw, n in raw_chain(chosen["familyId"], amount, seen).items():
                totals[raw] = totals.get(raw, 0) + n
    return totals


def materials_text(totals: dict[str, int]) -> str:
    ordered = sorted(totals.items(), key=lambda kv: (-kv[1], kv[0]))
    return ", ".join(f"{raw_label(raw)} x{n}" for raw, n in ordered)


def blueprint_name(blueprint_family_id: str) -> str:
    return family_name(blueprint_family_id.removeprefix("blueprint_"))


# ── Tables ─────────────────────────────────────────────────────────────


def categories_table() -> str:
    professions_by_category: dict[str, list[str]] = {}
    for profession, category in PROFESSION_CATEGORIES.items():
        professions_by_category.setdefault(category, []).append(profession)

    rows = []
    for category, professions in professions_by_category.items():
        options = craft_catalog.resolve_blueprint_trapping_options([sorted(professions)[0]])
        eligible = {f for f, cats in craft_catalog.BLUEPRINT_CATEGORIES.items() if category in cats}
        own_kinds = {craft_catalog._blueprint_catalog_type(f) for f in eligible}
        by_source: dict[str, tuple[list[str], bool]] = {}
        for pool in options.pools:
            source = pool.rule.source
            families = sorted({b.family_id.removeprefix("blueprint_") for b in pool.items})
            # The universal fallback stands in when the category has none of its own.
            fallback = (source == "item" and not (own_kinds & craft_catalog._FINAL_CATALOG_TYPES)) or (
                source == "tool" and not families_from_own(category, eligible))
            merged, was_fallback = by_source.get(source, ([], fallback))
            by_source[source] = (sorted(set(merged) | set(families)), was_fallback and fallback)
        tools, tools_fallback = by_source.get("tool", ([], False))
        items, items_fallback = by_source.get("item", ([], False))
        rows.append((category, sorted(professions), PROFESSION_RESOURCE_FAMILIES.get(category, ()),
                     tools, tools_fallback, items, items_fallback))

    rows.sort(key=lambda r: (-(len(r[3]) + len(r[5])), r[0]))
    lines = ["| Category | Professions | Resource Families | Tools | Tool Families | Items | Item Families |",
             "|---|---|---|---:|---|---:|---|"]
    for category, professions, resources, tools, tools_fb, items, items_fb in rows:
        def cell(names: list[str], fallback: bool) -> str:
            text = ", ".join(names)
            return f"*{text}*" if fallback and text else text
        lines.append(f"| {category} | {', '.join(professions)} | {', '.join(resources)} | "
                     f"{0 if tools_fb else len(tools)} | {cell(tools, tools_fb)} | "
                     f"{0 if items_fb else len(items)} | {cell(items, items_fb)} |")
    return "\n".join(lines)


def families_from_own(category: str, eligible: set[str]) -> bool:
    """Whether a category's tool pool comes from its own blueprints (a tool
    blueprint of its own, or a tool its items need) rather than the
    universal fallback."""
    for family in eligible:
        if craft_catalog._blueprint_catalog_type(family) == "tool":
            return True
        if craft_catalog.ITEM_BLUEPRINT_TOOL_HINTS.get(family):
            return True
    return False


def blueprint_xp_table() -> str:
    rows = []
    for family_id, recipe in _RECIPES_BY_FAMILY.items():
        if not recipe.get("blueprintFamilyId"):
            continue
        totals = raw_chain(family_id)
        raw = sum(totals.values())
        rows.append((raw, family_name(family_id), blueprint_name(recipe["blueprintFamilyId"]), totals))
    rows.sort(key=lambda r: (-r[0], r[1]))
    lines = ["| Item | Blueprint | Raw XP | Raw Materials | T1 Bonus | T2 Bonus | T3 Bonus | T4 Bonus | T5 Bonus | T6 Bonus | T1 Total XP |",
             "|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|"]
    for raw, name, blueprint, totals in rows:
        bonuses = [round(0.10 * raw * tier) for tier in range(1, 7)]
        lines.append(f"| {name} | {blueprint} | {raw} | {materials_text(totals)} | "
                     + " | ".join(str(b) for b in bonuses) + f" | {raw + bonuses[0]} |")
    return "\n".join(lines)


def no_blueprint_xp_table() -> str:
    rows = []
    for family_id, recipe in _RECIPES_BY_FAMILY.items():
        if recipe.get("blueprintFamilyId"):
            continue
        totals = raw_chain(family_id)
        rows.append((sum(totals.values()), family_name(family_id), totals))
    rows.sort(key=lambda r: (-r[0], r[1]))
    lines = ["| Item | Raw XP | Raw Materials |", "|---|---:|---|"]
    for raw, name, totals in rows:
        lines.append(f"| {name} | {raw} | {materials_text(totals) or '-'} |")
    return "\n".join(lines)


TABLES = {
    "categories": categories_table,
    "blueprint-xp": blueprint_xp_table,
    "no-blueprint-xp": no_blueprint_xp_table,
}


def render(doc: str) -> str:
    for name, build in TABLES.items():
        pattern = re.compile(
            rf"(<!-- BEGIN generated: {re.escape(name)} -->\n).*?(\n<!-- END generated: {re.escape(name)} -->)",
            re.S,
        )
        if not pattern.search(doc):
            raise SystemExit(f"docs/PLAYERS.md has no markers for '{name}'")
        doc = pattern.sub(lambda m: m.group(1) + build() + m.group(2), doc)
    return doc


def main() -> None:
    doc = DOC.read_text()
    updated = render(doc)
    if "--check" in sys.argv:
        if updated != doc:
            print("docs/PLAYERS.md crafting tables are out of date - run scripts/generate_crafting_tables.py")
            sys.exit(1)
        print("docs/PLAYERS.md crafting tables are up to date")
        return
    DOC.write_text(updated)
    print("Updated the crafting tables in docs/PLAYERS.md")


if __name__ == "__main__":
    main()
