"""
Per-profession-category blueprint pools for the soul-creation "Trappings"
step's blueprint quotas (see resource-selection-rules.json's
blueprintPoolsByProfessionCount).

Nothing here is hand-authored - it's all derived from craft-recipes.json
cross-referenced against every base-*.json item catalog (the same data
public/craft/recipe-viewer.html is built from) and
profession-resource-families.json's category -> raw-family map. A recipe is
assigned to whichever profession category supplies the most of its raw
material inputs (resolved recursively through any "processed" ingredients,
exactly like the recipe-viewer's own totals), ties counting for more than
one category. That assignment carries over to the recipe's own required
blueprint, if it has one.

Blueprints split into three non-overlapping pools per category, by what the
recipe actually produces:
  - tool families (base-tools.json) -> TOOL_BLUEPRINT_FAMILIES_BY_PROFESSION
  - "final" catalogs - armor, shield, weapon, food, potion, misc,
    adventuring_gear -> FINAL_BLUEPRINT_FAMILIES_BY_PROFESSION
  - everything else with a blueprint (mostly processed-good techniques, e.g.
    blueprint_leather) -> BLUEPRINT_FAMILIES_BY_PROFESSION, the general pool
    every profession count's quota draws from first.
This mirrors the growing-mastery shape of the quota rules themselves: 1
profession only unlocks the general pool, 2 additionally unlocks tool
blueprints, 3 additionally unlocks final-item blueprints.
"""

from __future__ import annotations

import json
from pathlib import Path

from backend.professions_catalog import PROFESSION_CATEGORIES
from backend.resources_catalog import PROFESSION_RESOURCE_FAMILIES

_DATA_DIR = Path(__file__).resolve().parent / "data"
_RECIPES_PATH = _DATA_DIR / "craft-recipes.json"

# Mirrors public/craft/build-recipe-viewer.py's own CATALOG_FILES - the set
# of item catalogs a recipe's output familyId might belong to.
_CATALOG_FILES: dict[str, str] = {
    "raw": "base-resources.json",
    "processed": "base-processed.json",
    "tool": "base-tools.json",
    "armor": "base-items-armor.json",
    "shield": "base-items-shield.json",
    "weapon": "base-items-weapon.json",
    "food": "base-food.json",
    "potion": "base-potion.json",
    "misc": "base-items-misc.json",
    "adventuring_gear": "base-adventuring-gear.json",
    "blueprint": "base-blueprint.json",
}

# A recipe whose own output lands in one of these catalogs is a "final"
# result - a finished, usable item rather than a tool or an intermediate
# processed good.
_FINAL_CATALOG_TYPES = {"armor", "shield", "weapon", "food", "potion", "misc", "adventuring_gear"}


def _load_family_catalog_types() -> dict[str, str]:
    """familyId -> which catalog it's defined in (raw/processed/tool/armor/...)."""
    family_types: dict[str, str] = {}
    for catalog_type, filename in _CATALOG_FILES.items():
        items = json.loads((_DATA_DIR / filename).read_text())
        for item in items:
            family_types[item["familyId"]] = catalog_type
    return family_types


def _load_recipes() -> dict[str, dict]:
    recipes = json.loads(_RECIPES_PATH.read_text())
    return {r["familyId"]: r for r in recipes}


_FAMILY_CATALOG_TYPES: dict[str, str] = _load_family_catalog_types()
_RECIPES_BY_FAMILY: dict[str, dict] = _load_recipes()


def _resolve_raw_family_hits(ingredients: list[dict], seen: frozenset[str] = frozenset()) -> list[str]:
    """
    Recursively resolves an ingredient list down to the raw-material family
    ids it's ultimately built from - one entry per qualifying ingredient
    line, "processed" ones expanded via their own recipe. "final" and
    "final_unresolved" ingredients (other crafted items, not raw materials)
    are skipped. Identical to the resolver used to build the recipe-count
    table in README.md, just reimplemented here in Python.
    """
    hits: list[str] = []
    for ing in ingredients:
        category, family_id = ing["category"], ing["familyId"]
        if category == "raw":
            hits.append(family_id)
        elif category == "processed" and family_id not in seen:
            sub_recipe = _RECIPES_BY_FAMILY.get(family_id)
            if sub_recipe:
                hits.extend(_resolve_raw_family_hits(sub_recipe["ingredients"], seen | {family_id}))
        # "final" / "final_unresolved" -> not a raw material, skip.
    return hits


def _recipe_profession_categories(recipe: dict) -> list[str]:
    """Which profession category/categories this recipe belongs to - the
    one(s) whose 3 raw-material families cover the most of its resolved raw
    inputs. Empty if it has no raw-family input at all (nothing to match)."""
    raw_hits = _resolve_raw_family_hits(recipe["ingredients"])
    if not raw_hits:
        return []
    counts = {
        category: sum(1 for hit in raw_hits if hit in family_ids)
        for category, family_ids in PROFESSION_RESOURCE_FAMILIES.items()
    }
    best = max(counts.values())
    if best == 0:
        return []
    return [category for category, count in counts.items() if count == best]


def _build_blueprint_pools() -> tuple[dict[str, set[str]], dict[str, set[str]], dict[str, set[str]]]:
    general: dict[str, set[str]] = {}
    tool: dict[str, set[str]] = {}
    final: dict[str, set[str]] = {}
    for recipe in _RECIPES_BY_FAMILY.values():
        blueprint_family_id = recipe.get("blueprintFamilyId")
        if not blueprint_family_id:
            continue
        categories = _recipe_profession_categories(recipe)
        if not categories:
            continue
        output_type = _FAMILY_CATALOG_TYPES.get(recipe["familyId"])
        bucket = tool if output_type == "tool" else final if output_type in _FINAL_CATALOG_TYPES else general
        for category in categories:
            bucket.setdefault(category, set()).add(blueprint_family_id)
    return general, tool, final


_general_pools, _tool_pools, _final_pools = _build_blueprint_pools()

# Profession category -> blueprint familyIds for that category's general
# technique pool (processed-good blueprints, e.g. blueprint_leather) - what
# a 1-profession character's quota draws from.
BLUEPRINT_FAMILIES_BY_PROFESSION: dict[str, tuple[str, ...]] = {
    category: tuple(sorted(ids)) for category, ids in _general_pools.items()
}

# Profession category -> blueprint familyIds for that category's tools
# (workbench, anvil, etc.) - what a 2-profession character's tool quota
# additionally draws from.
TOOL_BLUEPRINT_FAMILIES_BY_PROFESSION: dict[str, tuple[str, ...]] = {
    category: tuple(sorted(ids)) for category, ids in _tool_pools.items()
}

# Profession category -> blueprint familyIds for that category's finished
# items (armor, weapons, shields, food, potions, misc, adventuring gear) -
# what a 3-profession character's final-results quota additionally draws
# from.
FINAL_BLUEPRINT_FAMILIES_BY_PROFESSION: dict[str, tuple[str, ...]] = {
    category: tuple(sorted(ids)) for category, ids in _final_pools.items()
}
