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

from backend import items_catalog
from backend.professions_catalog import PROFESSION_CATEGORIES
from backend.resources_catalog import PROFESSION_RESOURCE_FAMILIES

# The profession-facing "CraftMetal" category (blacksmith/armorer/tinsmith)
# was later split into CraftWeapon/CraftArmor/CraftTool, and "CraftWood"
# (carpenter/cooper) into CraftFurniture/CraftWood - see those entries in
# profession-resource-families.json. But CraftWeapon/CraftArmor/CraftTool
# all share the same raw-family tuple (ore, wood, sand), so tallying hits
# against them directly would make every recipe a 3-way tie instead of the
# single "sole winner" the old unified CraftMetal carve-out relied on. The
# tie-break math below runs against one internal, not-user-facing "_Metal"
# identity standing in for the old unified CraftMetal (this dict), and
# _build_blueprint_category_index relabels a "_Metal"/CraftWood win into the
# right sub-category afterward, using the recipe's own output item's kind.
_BLUEPRINT_TIE_BREAK_FAMILIES: dict[str, tuple[str, ...]] = {
    category: tuple(families)
    for category, families in PROFESSION_RESOURCE_FAMILIES.items()
    if category not in ("CraftWeapon", "CraftArmor", "CraftTool", "CraftFurniture")
}
_BLUEPRINT_TIE_BREAK_FAMILIES["_Metal"] = ("ore", "wood", "sand")

# Output item "kind" (items_catalog.ITEM_FAMILIES_BY_ID[...].kind) -> which
# split-off category a "_Metal"/CraftWood win relabels to. Verified exact
# (no leftovers) against the current blueprint set: the old unified metal
# group's 20 blueprints split 11/6/3 weapon/armor+shield/tool; CraftWood's
# 14 split 8/6 weapon+armor+shield/tool+equipment.
_CRAFTMETAL_SUBCATEGORY_BY_KIND = {
    "weapon": "CraftWeapon",
    "armor": "CraftArmor",
    "shield": "CraftArmor",
    "tool": "CraftTool",
}
_CRAFTWOOD_SUBCATEGORY_BY_KIND = {
    "weapon": "CraftWood",
    "armor": "CraftWood",
    "shield": "CraftWood",
    "tool": "CraftFurniture",
    "essentials": "CraftFurniture",
}


def _craftmetal_subcategory(output_family_id: str) -> str:
    item = items_catalog.ITEM_FAMILIES_BY_ID.get(output_family_id)
    if item:
        for kind in item.kind:
            sub = _CRAFTMETAL_SUBCATEGORY_BY_KIND.get(kind)
            if sub:
                return sub
    return "CraftTool"


def _craftwood_subcategory(output_family_id: str) -> str:
    item = items_catalog.ITEM_FAMILIES_BY_ID.get(output_family_id)
    if item:
        for kind in item.kind:
            sub = _CRAFTWOOD_SUBCATEGORY_BY_KIND.get(kind)
            if sub:
                return sub
    return "CraftWood"

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
    "food": "base-items-food.json",
    "potion": "base-items-potion.json",
    "adventuring_gear": "base-items-adventuring-gear.json",
    "essentials": "base-items-essentials.json",
    "companion": "base-items-companion.json",
    "mount": "base-items-mount.json",
}
_FINAL_CATALOG_TYPES = {"armor", "shield", "weapon", "food", "potion", "adventuring_gear", "essentials", "companion", "mount"}


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
        for category, families in _BLUEPRINT_TIE_BREAK_FAMILIES.items()
    }
    best = max(counts.values())
    if best == 0:
        return []
    return [category for category, count in counts.items() if count == best]


def _build_blueprint_category_index() -> dict[str, tuple[str, ...]]:
    """blueprint familyId -> profession categories it belongs to (union across its recipes).

    Every category counts a tied recipe as a member (e.g. a recipe tied
    between CraftGlass and the internal "_Metal" identity counts for both)
    - except "_Metal", which only counts a recipe where it's the sole
    winner, then relabels into CraftWeapon/CraftArmor/CraftTool. Metal's raw
    materials (ore, wood, sand) overlap so heavily with other categories'
    that without this carve-out it would swallow nearly every generic tool
    blueprint (furnace, kiln, wrench, ...) via ties, drowning out what
    actually sets it apart: weapons and the premium armor/shield materials.
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
            if category == "_Metal":
                if len(categories) != 1:
                    continue
                category = _craftmetal_subcategory(recipe["familyId"])
            elif category == "CraftWood":
                category = _craftwood_subcategory(recipe["familyId"])
            index.setdefault(blueprint_family, set()).add(category)
    return {family: tuple(sorted(cats)) for family, cats in index.items()}


def _tool_is_blueprint_gated(family_id: str, recipes_by_family: dict[str, dict]) -> bool:
    recipe = recipes_by_family.get(family_id)
    return bool(recipe and recipe.get("blueprintFamilyId"))


def _hard_gated_tool_deps(
    family_id: str, recipes_by_family: dict[str, dict], seen: frozenset[str] = frozenset()
) -> set[str]:
    """Which OTHER blueprint-gated tool families family_id's production chain
    can never avoid needing - i.e. every tool requirement along the way
    (its own recipe's "tool", and every "processed" ingredient's own chain,
    recursively) whose every alternative is itself blueprint-gated. A "tool"
    alternatives list (e.g. plank's ["axe_stone", "axe"]) imposes no hard
    dependency as long as at least one option needs no blueprint at all
    (axe_stone's own blueprintFamilyId is null - anyone can craft one from
    raw wood/stone/carcass), since that option is always free to obtain."""
    if family_id in seen:
        return set()
    seen = seen | {family_id}
    recipe = recipes_by_family.get(family_id)
    if not recipe:
        return set()
    deps: set[str] = set()
    tool = recipe.get("tool")
    candidates = [tool] if isinstance(tool, str) else (tool if isinstance(tool, list) else [])
    if candidates and not any(not _tool_is_blueprint_gated(c, recipes_by_family) for c in candidates):
        deps.update(candidates)
    for ingredient in _iter_ingredients(recipe.get("ingredients", [])):
        if ingredient["category"] == "processed":
            deps |= _hard_gated_tool_deps(ingredient["familyId"], recipes_by_family, seen)
    return deps


def _resolve_tool_root_families(
    family_id: str, recipes_by_family: dict[str, dict], seen: frozenset[str] = frozenset()
) -> frozenset[str]:
    """The "lowest tool(s) required" to ever produce family_id - itself if
    its production chain needs no other blueprint-gated tool, otherwise the
    (recursively resolved) roots of whichever gated tool(s) it can't avoid
    needing. E.g. a sword needs a furnace, but a furnace's own fired_brick
    ingredient needs a kiln - furnace isn't a "lowest tool", kiln is."""
    if family_id in seen:
        return frozenset()
    seen = seen | {family_id}
    deps = _hard_gated_tool_deps(family_id, recipes_by_family)
    if not deps:
        return frozenset({family_id})
    roots: set[str] = set()
    for dep in deps:
        roots |= _resolve_tool_root_families(dep, recipes_by_family, seen)
    return roots


def _build_tool_blueprint_root_index() -> dict[str, tuple[str, ...]]:
    """Every "tool"-catalog-type family (base-tools.json) -> its resolved
    root tool family id(s) - see resolve_blueprint_trapping_options' tool
    pool, which substitutes these in so a new character's one permanent
    tool blueprint pick is always something actually craftable from raw
    materials (plus other blueprint-free tools), never a dead end."""
    recipes = _load_recipes()
    recipes_by_family = {r["familyId"]: r for r in recipes}
    return {
        family: tuple(sorted(_resolve_tool_root_families(family, recipes_by_family)))
        for family, catalog_type in _FAMILY_CATALOG_TYPES.items()
        if catalog_type == "tool"
    }


def _hard_tool_alternative_sets(
    family_id: str, recipes_by_family: dict[str, dict], seen: frozenset[str] = frozenset()
) -> set[frozenset[str]]:
    """Every hard tool requirement point in family_id's full production
    chain (its own recipe's "tool", and every "processed" ingredient's own
    chain, recursively) whose every alternative is blueprint-gated - each
    one kept as its own alternatives set (e.g. bow's frame step needing
    {"spinning_wheel"} is a separate requirement from its string step
    needing {"workbench"}; both must eventually be met, unlike a single
    alternatives list where any one option suffices)."""
    if family_id in seen:
        return set()
    seen = seen | {family_id}
    recipe = recipes_by_family.get(family_id)
    if not recipe:
        return set()
    reqs: set[frozenset[str]] = set()
    tool = recipe.get("tool")
    candidates = [tool] if isinstance(tool, str) else (tool if isinstance(tool, list) else [])
    if candidates and not any(not _tool_is_blueprint_gated(c, recipes_by_family) for c in candidates):
        reqs.add(frozenset(candidates))
    for ingredient in _iter_ingredients(recipe.get("ingredients", [])):
        if ingredient["category"] == "processed":
            reqs |= _hard_tool_alternative_sets(ingredient["familyId"], recipes_by_family, seen)
    return reqs


def _build_item_blueprint_tool_hints(
    recipes_by_family: dict[str, dict], tool_roots: dict[str, tuple[str, ...]]
) -> dict[str, tuple[str, ...]]:
    """blueprint familyId (of a FINAL item, e.g. "blueprint_cloth") -> the
    root tool family id(s) that would help build it - the union, across
    every hard tool requirement anywhere in its chain, of each
    requirement's alternatives' own resolved roots. Used to widen the
    Trappings step's tool pool: even when a profession's own
    category-matched tools are exhausted (or self-sufficient already), a
    tool that actually unlocks one of the items on offer (e.g. soldier's
    cloth/bow/crossbow needing workbench/kiln/spinning_wheel) is worth
    surfacing as a selectable option, not just the category match."""
    hints: dict[str, set[str]] = {}
    for recipe in recipes_by_family.values():
        blueprint_family = recipe.get("blueprintFamilyId")
        if not blueprint_family:
            continue
        if _blueprint_catalog_type(blueprint_family) not in _FINAL_CATALOG_TYPES:
            continue
        alt_sets = _hard_tool_alternative_sets(recipe["familyId"], recipes_by_family)
        for alt_set in alt_sets:
            for candidate in alt_set:
                hints.setdefault(blueprint_family, set()).update(tool_roots.get(candidate, (candidate,)))
    return {family: tuple(sorted(roots)) for family, roots in hints.items()}


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
# "blueprint_sword" -> ("CraftWeapon",), "blueprint_bow" -> ("Artists",
# "CraftGarment", "CraftWood", "Military").
BLUEPRINT_CATEGORIES: dict[str, tuple[str, ...]] = _build_blueprint_category_index()

# Starting-blueprint selection rules for the soul-creation "Trappings" step,
# mirroring RESOURCE_POOLS_BY_PROFESSION_COUNT but for discrete blueprint
# picks rather than a spendable raw-material budget.
BLUEPRINT_POOLS_BY_PROFESSION_COUNT: dict[int, tuple[BlueprintPoolRule, ...]] = _load_blueprint_pool_rules()

# tool familyId -> its resolved root tool family id(s), e.g. "furnace" ->
# ("kiln",) since a furnace's own fired_brick ingredient needs a kiln.
# Self-sufficient tools (e.g. "kiln" itself, "workbench") map to themselves.
TOOL_BLUEPRINT_ROOT_FAMILIES: dict[str, tuple[str, ...]] = _build_tool_blueprint_root_index()


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

# item blueprint familyId -> root tool family id(s) that would help build it,
# e.g. "blueprint_cloth" -> ("kiln", "spinning_wheel", "workbench"). See
# _build_item_blueprint_tool_hints.
ITEM_BLUEPRINT_TOOL_HINTS: dict[str, tuple[str, ...]] = _build_item_blueprint_tool_hints(
    {r["familyId"]: r for r in _load_recipes()}, TOOL_BLUEPRINT_ROOT_FAMILIES
)

# Used only when a profession-category pool for a given source has nothing
# eligible (e.g. Food has no tool blueprints, Trade has no item blueprints,
# Rural has neither) - a small, fixed, broadly-applicable set rather than
# leaving that combo box empty. Same set for every category regardless of
# which one is short, not a per-category thematic pick.
UNIVERSAL_FALLBACK_BLUEPRINT_FAMILIES: dict[str, tuple[str, ...]] = {
    "tool": ("blueprint_workbench", "blueprint_kiln"),
    "item": ("blueprint_dagger", "blueprint_cloth"),
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

    def _effective_families(rule: BlueprintPoolRule) -> set[str]:
        if rule.source != "tool":
            return eligible_families
        # Substitute every eligible tool family with its resolved root(s) -
        # a mid-chain tool (e.g. furnace, which needs a kiln to make its own
        # fired_brick ingredient) is a dead-end pick for a new character,
        # who gets exactly one permanent tool blueprint ever (see
        # TOOL_BLUEPRINT_ROOT_FAMILIES). Also pull in the root tool(s)
        # behind every eligible ITEM family (e.g. Military's blueprint_bow/
        # blueprint_cloth need workbench/spinning_wheel, on top of kiln
        # already reached via a category-matched tool) - same one-tool-
        # blueprint-ever constraint applies, so surfacing every tool that
        # actually unlocks something on the item side is strictly more
        # useful than only offering tools whose OWN category happens to
        # match, per ITEM_BLUEPRINT_TOOL_HINTS.
        resolved: set[str] = set()
        for family in eligible_families:
            if _blueprint_catalog_type(family) == "tool":
                output_family = family[len("blueprint_"):]
                roots = TOOL_BLUEPRINT_ROOT_FAMILIES.get(output_family, (output_family,))
                resolved.update(f"blueprint_{root}" for root in roots)
            else:
                resolved.update(f"blueprint_{root}" for root in ITEM_BLUEPRINT_TOOL_HINTS.get(family, ()))
        return resolved

    def _pool_items(rule: BlueprintPoolRule) -> tuple[BlueprintItem, ...]:
        families = _effective_families(rule)
        items = tuple(
            bp
            for bp in BLUEPRINT_ITEMS
            if bp.family_id in families
            and bp.tier == rule.tier
            and _SOURCE_PREDICATES[rule.source](bp)
        )
        if items:
            return items

        # Nothing eligible for this category/source combo (e.g. Food has no
        # tool blueprints) - fall back to the universal set rather than
        # handing the player an empty combo box.
        fallback_families = set(UNIVERSAL_FALLBACK_BLUEPRINT_FAMILIES.get(rule.source, ()))
        return tuple(
            bp
            for bp in BLUEPRINT_ITEMS
            if bp.family_id in fallback_families
            and bp.tier == rule.tier
            and _SOURCE_PREDICATES[rule.source](bp)
        )

    pools = tuple(BlueprintPoolOption(rule=rule, items=_pool_items(rule)) for rule in rules)
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
            # No family-level display name exists anywhere in the data (only
            # each tiered item has its own flavor name) - same convention
            # the recipe viewer's own family grouping already uses: the
            # lowest-tier item's name, "Blueprint: " prefix stripped, stands
            # in for the family as a whole.
            all_items = sorted(items_by_family[family], key=lambda i: i.tier)
            family_name = all_items[0].name.removeprefix("Blueprint: ") if all_items else family[len("blueprint_"):]
            families.append({
                "familyId": family[len("blueprint_"):],
                "name": family_name,
                "kind": _blueprint_catalog_type(family) or "?",
                "items": [
                    {"id": item.id, "name": item.name, "tier": item.tier}
                    for item in items
                ],
            })
        summary.append({"category": category, "families": families})
    return summary
