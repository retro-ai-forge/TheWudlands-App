"""
Catalog of tool and item blueprints, scoped to profession categories for the
soul-creation "Trappings" step - the blueprint equivalent of
resources_catalog.py's resolve_trapping_options.

Which profession category a blueprint belongs to isn't hand-authored: it's
derived from craft-recipes.json, the same way the README's "Crafting Recipes
by Profession Category" table was built. A recipe's raw-material ingredients
(expanding "processed" ingredients through their own sub-recipe, skipping
"final"/"final_unresolved" ingredients since those are other crafted items,
not raw materials) are matched against each category's 3 resource families in
profession-resource-families.json; the recipe belongs to whichever category
has the most hits (ties count for multiple). A blueprint family then belongs
to the union of categories of every recipe gated behind it - relevant for
armor blueprints, which gate 3 recipes at once (head/chest/leg).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from backend.professions_catalog import PROFESSION_CATEGORIES
from backend.resources_catalog import PROFESSION_RESOURCE_FAMILIES

_DATA_DIR = Path(__file__).resolve().parent / "data"
_BLUEPRINT_PATH = _DATA_DIR / "base-blueprint.json"
_RECIPES_PATH = _DATA_DIR / "craft-recipes.json"
_SELECTION_RULES_PATH = _DATA_DIR / "resource-selection-rules.json"

# Mirrors public/craft/build-recipe-viewer.py's CATALOG_FILES.
_CATALOG_FILES = {
    "tool": "base-tools.json",
    "armor": "base-items-armor.json",
    "shield": "base-items-shield.json",
    "weapon": "base-items-weapon.json",
    "food": "base-food.json",
    "potion": "base-potion.json",
    "misc": "base-items-misc.json",
    "equipment": "base-items-equipment.json",
    "adventuring_gear": "base-adventuring-gear.json",
}
_FINAL_CATALOG_TYPES = {"armor", "shield", "weapon", "food", "potion", "misc", "adventuring_gear"}


@dataclass(frozen=True)
class BlueprintItem:
    """One entry in base-blueprint.json."""

    id: str
    name: str
    family_id: str
    tier: int

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "familyId": self.family_id, "tier": self.tier}


@dataclass(frozen=True)
class BlueprintPoolRule:
    """One entry of blueprintPoolsByProfessionCount for a given profession count."""

    source: str  # "tool" | "item"
    tier: int
    count: int


@dataclass(frozen=True)
class BlueprintPoolOption:
    """A pool rule paired with the blueprint items it makes eligible."""

    rule: BlueprintPoolRule
    items: tuple[BlueprintItem, ...]


@dataclass(frozen=True)
class BlueprintTrappingsOptions:
    """What a character may pick from on the Trappings step's blueprint pools."""

    pools: tuple[BlueprintPoolOption, ...]


def _load_blueprints() -> tuple[BlueprintItem, ...]:
    data = json.loads(_BLUEPRINT_PATH.read_text())
    return tuple(
        BlueprintItem(
            id=item["id"],
            name=item["name"],
            family_id=item["familyId"],
            tier=item["tier"],
        )
        for item in data
    )


def _load_family_catalog_types() -> dict[str, str]:
    """familyId -> catalog type ("tool", "armor", "weapon", ...), across every non-blueprint catalog."""
    family_types: dict[str, str] = {}
    for catalog_type, filename in _CATALOG_FILES.items():
        path = _DATA_DIR / filename
        if not path.exists():
            continue
        for item in json.loads(path.read_text()):
            family_types[item["familyId"]] = catalog_type
    return family_types


def _load_recipes() -> tuple[dict, ...]:
    return tuple(json.loads(_RECIPES_PATH.read_text()))


def _iter_ingredients(ingredients: list[dict]):
    """Flatten an ingredient list, expanding any "alternatives" slot (e.g.
    carcass's bone_blade-consumed-or-dagger-not-consumed choice) into its
    individual options. A plain ingredient yields itself unchanged."""
    for ingredient in ingredients:
        alternatives = ingredient.get("alternatives")
        if alternatives is not None:
            yield from alternatives
        else:
            yield ingredient


def _resolve_raw_family_hits(
    family_id: str, recipes_by_family: dict[str, dict], seen: frozenset[str]
) -> list[str]:
    """Expand a "processed" ingredient down to the raw familyIds it's ultimately made from."""
    if family_id in seen:
        return []
    recipe = recipes_by_family.get(family_id)
    if recipe is None:
        return []
    seen = seen | {family_id}
    hits: list[str] = []
    for ingredient in _iter_ingredients(recipe["ingredients"]):
        if ingredient["category"] == "raw":
            hits.append(ingredient["familyId"])
        elif ingredient["category"] == "processed":
            hits.extend(_resolve_raw_family_hits(ingredient["familyId"], recipes_by_family, seen))
        # "final" / "final_unresolved" ingredients are other crafted items, not raw materials - skip.
    return hits


def _recipe_categories(recipe: dict, recipes_by_family: dict[str, dict]) -> list[str]:
    hits: list[str] = []
    for ingredient in _iter_ingredients(recipe["ingredients"]):
        if ingredient["category"] == "raw":
            hits.append(ingredient["familyId"])
        elif ingredient["category"] == "processed":
            hits.extend(_resolve_raw_family_hits(ingredient["familyId"], recipes_by_family, frozenset()))
    if not hits:
        return []
    counts = {
        category: sum(1 for hit in hits if hit in families)
        for category, families in PROFESSION_RESOURCE_FAMILIES.items()
    }
    best = max(counts.values())
    if best == 0:
        return []
    return [category for category, count in counts.items() if count == best]


def _build_blueprint_category_index() -> dict[str, tuple[str, ...]]:
    """blueprint familyId -> profession categories it belongs to (union across its recipes).

    Every category counts a tied recipe as a member (e.g. a recipe tied
    between CraftGlass and CraftMetal counts for both) - except CraftMetal,
    which only counts a recipe where it's the sole winner. CraftMetal's raw
    materials (ore, wood, sand) overlap so heavily with other categories'
    that without this carve-out it would swallow nearly every generic tool
    blueprint (furnace, kiln, wrench, ...) via ties, drowning out what
    actually sets CraftMetal apart: weapons and the premium armor/shield
    materials.
    """
    recipes = _load_recipes()
    recipes_by_family = {r["familyId"]: r for r in recipes}
    index: dict[str, set[str]] = {}
    for recipe in recipes:
        blueprint_family = recipe.get("blueprintFamilyId")
        if not blueprint_family:
            continue
        categories = _recipe_categories(recipe, recipes_by_family)
        for category in categories:
            if category == "CraftMetal" and len(categories) != 1:
                continue
            index.setdefault(blueprint_family, set()).add(category)
    return {family: tuple(sorted(cats)) for family, cats in index.items()}


def _load_blueprint_pool_rules() -> dict[int, tuple[BlueprintPoolRule, ...]]:
    data = json.loads(_SELECTION_RULES_PATH.read_text())
    rules_by_count: dict[int, tuple[BlueprintPoolRule, ...]] = {}
    for count_str, rules in data.get("blueprintPoolsByProfessionCount", {}).items():
        parsed = [
            BlueprintPoolRule(source=rule["source"], tier=rule["tier"], count=rule["count"])
            for rule in rules
        ]
        rules_by_count[int(count_str)] = tuple(parsed)
    return rules_by_count


BLUEPRINT_ITEMS: tuple[BlueprintItem, ...] = _load_blueprints()
BLUEPRINT_ITEMS_BY_ID: dict[str, BlueprintItem] = {item.id: item for item in BLUEPRINT_ITEMS}
_FAMILY_CATALOG_TYPES: dict[str, str] = _load_family_catalog_types()

# blueprint familyId -> profession categories it belongs to, e.g.
# "blueprint_sword" -> ("CraftMetal", "Military").
BLUEPRINT_CATEGORIES: dict[str, tuple[str, ...]] = _build_blueprint_category_index()

# Starting-blueprint selection rules for the soul-creation "Trappings" step,
# mirroring RESOURCE_POOLS_BY_PROFESSION_COUNT but for discrete blueprint
# picks rather than a spendable raw-material budget.
BLUEPRINT_POOLS_BY_PROFESSION_COUNT: dict[int, tuple[BlueprintPoolRule, ...]] = _load_blueprint_pool_rules()


def _blueprint_catalog_type(blueprint_family_id: str) -> str | None:
    """Whether a blueprint family unlocks a "tool" or a final item, via what its recipe(s) produce."""
    suffix = blueprint_family_id[len("blueprint_"):]
    for candidate in (suffix, f"{suffix}_head_armor", f"{suffix}_chest_armor", f"{suffix}_leg_armor"):
        catalog_type = _FAMILY_CATALOG_TYPES.get(candidate)
        if catalog_type:
            return catalog_type
    return None


_SOURCE_PREDICATES = {
    "tool": lambda bp: _blueprint_catalog_type(bp.family_id) == "tool",
    "item": lambda bp: _blueprint_catalog_type(bp.family_id) in _FINAL_CATALOG_TYPES,
}


def resolve_blueprint_trapping_options(profession_ids: list[str]) -> BlueprintTrappingsOptions:
    """
    Resolve the blueprint pools a character with these (1-3) professions may
    pick from on the Trappings step, mirroring resolve_trapping_options in
    resources_catalog.py.

    Blank/"none" entries are ignored (unfilled slots). A non-empty id that
    isn't a real profession is a hard error rather than silently ignored -
    same reasoning as resolve_trapping_options: this is the source of truth
    the character-creation endpoint validates against.
    """
    chosen = [p for p in profession_ids if p and p != "none"]
    for profession_id in chosen:
        if profession_id not in PROFESSION_CATEGORIES:
            raise ValueError(f"Unknown profession id: {profession_id}")

    rules = BLUEPRINT_POOLS_BY_PROFESSION_COUNT.get(len(chosen), ())
    if not rules:
        return BlueprintTrappingsOptions(pools=())

    categories = {PROFESSION_CATEGORIES[p] for p in chosen}
    eligible_families = {
        family for family, cats in BLUEPRINT_CATEGORIES.items() if categories & set(cats)
    }

    pools = tuple(
        BlueprintPoolOption(
            rule=rule,
            items=tuple(
                bp
                for bp in BLUEPRINT_ITEMS
                if bp.family_id in eligible_families
                and bp.tier == rule.tier
                and _SOURCE_PREDICATES[rule.source](bp)
            ),
        )
        for rule in rules
    )
    return BlueprintTrappingsOptions(pools=pools)


def category_blueprint_summary(max_tier: int = 3) -> list[dict]:
    """
    Every profession category's blueprint families (tiers up to max_tier),
    grouped by category - lore/reference data for the /characters page's
    "Blueprints" section, not player-specific (unlike
    resolve_blueprint_trapping_options, which is scoped to one character's
    chosen professions). A category with no eligible family (e.g. Rural)
    still appears, with an empty families list.
    """
    by_category: dict[str, list[str]] = {}
    for family, cats in BLUEPRINT_CATEGORIES.items():
        for cat in cats:
            by_category.setdefault(cat, []).append(family)

    items_by_family: dict[str, list[BlueprintItem]] = {}
    for item in BLUEPRINT_ITEMS:
        items_by_family.setdefault(item.family_id, []).append(item)

    all_categories = sorted(set(PROFESSION_CATEGORIES.values()))
    summary = []
    for category in all_categories:
        families = []
        for family in sorted(by_category.get(category, [])):
            items = sorted(
                (i for i in items_by_family[family] if i.tier <= max_tier),
                key=lambda i: i.tier,
            )
            families.append({
                "familyId": family[len("blueprint_"):],
                "kind": _blueprint_catalog_type(family) or "?",
                "items": [
                    {"id": item.id, "name": item.name, "tier": item.tier}
                    for item in items
                ],
            })
        summary.append({"category": category, "families": families})
    return summary
