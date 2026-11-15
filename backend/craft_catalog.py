"""
Catalog of tool and item blueprints, and which ones each profession may start
with on the soul-creation "Trappings" step - the blueprint equivalent of
resources_catalog.py's resolve_trapping_options.

Which blueprints a profession is offered is hand-authored in
data/profession-blueprints.json: `own` are the blueprints of its trade (it
makes them), `offered` what it may also pick because it uses them. Every
blueprint is owned by at least one profession. A new character picks from the
union of its professions' lists, at the tier and count set in
resource-selection-rules.json (blueprintPoolsByProfessionCount).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from backend.professions_catalog import PROFESSION_CATEGORIES

_DATA_DIR = Path(__file__).resolve().parent / "data"
_BLUEPRINT_PATH = _DATA_DIR / "base-blueprint.json"
_RECIPES_PATH = _DATA_DIR / "craft-recipes.json"
_SELECTION_RULES_PATH = _DATA_DIR / "resource-selection-rules.json"
_PROFESSION_BLUEPRINTS_PATH = _DATA_DIR / "profession-blueprints.json"

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
    # Lacquer is the one processed material behind a blueprint (the dyer's).
    "processed": "base-processed.json",
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

    source: str  # "profession": the professions' own and offered blueprints
    tier: int
    count: int


@dataclass(frozen=True)
class BlueprintPoolOption:
    """A pool rule paired with the blueprint items it makes eligible."""

    rule: BlueprintPoolRule
    items: tuple[BlueprintItem, ...]
    # Blueprint families (with prefix) one of the chosen professions owns -
    # the rest of `items` are only offered.
    own_families: frozenset[str] = frozenset()


@dataclass(frozen=True)
class BlueprintTrappingsOptions:
    """What a character may pick from on the Trappings step's blueprint pools."""

    pools: tuple[BlueprintPoolOption, ...]


@dataclass(frozen=True)
class ProfessionBlueprints:
    """A profession's starting blueprint families (with the blueprint_ prefix)."""

    own: tuple[str, ...]
    offered: tuple[str, ...]


def _load_blueprints() -> tuple[BlueprintItem, ...]:
    data = json.loads(_BLUEPRINT_PATH.read_text())
    return tuple(
        BlueprintItem(id=item["id"], name=item["name"], family_id=item["familyId"], tier=item["tier"])
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


def _load_blueprint_pool_rules() -> dict[int, tuple[BlueprintPoolRule, ...]]:
    data = json.loads(_SELECTION_RULES_PATH.read_text())
    return {
        int(count_str): tuple(
            BlueprintPoolRule(source=rule["source"], tier=rule["tier"], count=rule["count"]) for rule in rules
        )
        for count_str, rules in data.get("blueprintPoolsByProfessionCount", {}).items()
    }


def _load_profession_blueprints(blueprint_families: set[str]) -> dict[str, ProfessionBlueprints]:
    """profession-blueprints.json, checked: every profession listed, every
    family a real blueprint, none both own and offered, every blueprint owned."""
    data = {k: v for k, v in json.loads(_PROFESSION_BLUEPRINTS_PATH.read_text()).items() if not k.startswith("_")}
    result: dict[str, ProfessionBlueprints] = {}
    problems: list[str] = []
    for profession_id, lists in data.items():
        own = tuple(f"blueprint_{f}" for f in lists.get("own", []))
        offered = tuple(f"blueprint_{f}" for f in lists.get("offered", []))
        unknown = (set(own) | set(offered)) - blueprint_families
        if unknown:
            problems.append(f"{profession_id}: unknown {sorted(unknown)}")
        if set(own) & set(offered):
            problems.append(f"{profession_id}: both own and offered {sorted(set(own) & set(offered))}")
        result[profession_id] = ProfessionBlueprints(own=own, offered=offered)
    missing = set(PROFESSION_CATEGORIES) - set(result)
    if missing:
        problems.append(f"missing professions {sorted(missing)}")
    unowned = blueprint_families - {f for lists in result.values() for f in lists.own}
    if unowned:
        problems.append(f"blueprints without an owner {sorted(unowned)}")
    if problems:
        raise ValueError("profession-blueprints.json: " + "; ".join(problems))
    return result


def _load_ingredient_families() -> frozenset[str]:
    """Every family some recipe consumes or holds as an ingredient."""
    return frozenset(
        option["familyId"]
        for recipe in json.loads(_RECIPES_PATH.read_text())
        for ingredient in recipe["ingredients"]
        for option in ingredient.get("alternatives") or [ingredient]
    )


BLUEPRINT_ITEMS: tuple[BlueprintItem, ...] = _load_blueprints()
_INGREDIENT_FAMILIES: frozenset[str] = _load_ingredient_families()
BLUEPRINT_ITEMS_BY_ID: dict[str, BlueprintItem] = {item.id: item for item in BLUEPRINT_ITEMS}
_FAMILY_CATALOG_TYPES: dict[str, str] = _load_family_catalog_types()

# Starting-blueprint selection rules for the soul-creation "Trappings" step,
# mirroring RESOURCE_POOLS_BY_PROFESSION_COUNT but for discrete blueprint
# picks rather than a spendable raw-material budget.
BLUEPRINT_POOLS_BY_PROFESSION_COUNT: dict[int, tuple[BlueprintPoolRule, ...]] = _load_blueprint_pool_rules()

# profession id -> its own and offered blueprint families.
PROFESSION_BLUEPRINTS: dict[str, ProfessionBlueprints] = _load_profession_blueprints(
    {item.family_id for item in BLUEPRINT_ITEMS}
)


def _blueprint_catalog_type(blueprint_family_id: str) -> str | None:
    """Whether a blueprint family unlocks a "tool" or a final item, via what its recipe(s) produce."""
    suffix = blueprint_family_id[len("blueprint_"):]
    # Every armor piece has its own blueprint (blueprint_iron_head_armor);
    # the piece suffixes are only a fallback for a family named without one.
    for candidate in (suffix, f"{suffix}_head_armor", f"{suffix}_chest_armor", f"{suffix}_leg_armor"):
        catalog_type = _FAMILY_CATALOG_TYPES.get(candidate)
        if catalog_type:
            return catalog_type
    return None


def blueprint_source(blueprint_family_id: str) -> str | None:
    """"tool", "item" or "material" (a processed material other recipes are
    made from, e.g. lacquer) - what a blueprint family unlocks (None if
    neither). A processed end product nothing is made from (the written
    scroll) counts as an item."""
    catalog_type = _blueprint_catalog_type(blueprint_family_id)
    if catalog_type == "tool":
        return "tool"
    if catalog_type in _FINAL_CATALOG_TYPES:
        return "item"
    if catalog_type == "processed":
        return "material" if blueprint_family_id.removeprefix("blueprint_") in _INGREDIENT_FAMILIES else "item"
    return None


def blueprint_owners(blueprint_family_id: str) -> list[str]:
    """Professions whose trade a blueprint family belongs to, in catalog order."""
    return [p for p, lists in PROFESSION_BLUEPRINTS.items() if blueprint_family_id in lists.own]


def resolve_blueprint_trapping_options(profession_ids: list[str]) -> BlueprintTrappingsOptions:
    """
    The blueprint pools a character with these (1-3) professions may pick
    from on the Trappings step: the union of their own and offered
    blueprints, at each rule's tier.

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
    own = frozenset(f for p in chosen for f in PROFESSION_BLUEPRINTS[p].own)
    families = own | {f for p in chosen for f in PROFESSION_BLUEPRINTS[p].offered}
    pools = tuple(
        BlueprintPoolOption(
            rule=rule,
            items=tuple(bp for bp in BLUEPRINT_ITEMS if bp.family_id in families and bp.tier == rule.tier),
            own_families=own,
        )
        for rule in rules
    )
    return BlueprintTrappingsOptions(pools=pools)


def category_blueprint_summary(max_tier: int = 3) -> list[dict]:
    """
    Every blueprint family (tiers up to max_tier), grouped by the profession
    category of the professions that own it - lore/reference data for the
    /characters page's "Blueprints" section and the character preview's
    blueprint tier lookup, not player-specific. Each family lists its owning
    professions. A category whose professions own nothing still appears, with
    an empty families list.
    """
    items_by_family: dict[str, list[BlueprintItem]] = {}
    for item in BLUEPRINT_ITEMS:
        items_by_family.setdefault(item.family_id, []).append(item)

    by_category: dict[str, set[str]] = {}
    for profession_id, lists in PROFESSION_BLUEPRINTS.items():
        by_category.setdefault(PROFESSION_CATEGORIES[profession_id], set()).update(lists.own)

    summary = []
    for category in sorted(set(PROFESSION_CATEGORIES.values())):
        families = []
        for family in sorted(by_category.get(category, ())):
            all_items = sorted(items_by_family[family], key=lambda i: i.tier)
            # No family-level display name exists anywhere in the data (only
            # each tiered item has its own flavor name) - the lowest-tier
            # item's name, "Blueprint: " prefix stripped, stands in for the
            # family as a whole, same as the recipe viewer.
            families.append({
                "familyId": family[len("blueprint_"):],
                "name": all_items[0].name.removeprefix("Blueprint: "),
                "kind": _blueprint_catalog_type(family) or "?",
                "owners": [p for p in blueprint_owners(family) if PROFESSION_CATEGORIES[p] == category],
                "items": [{"id": i.id, "name": i.name, "tier": i.tier} for i in all_items if i.tier <= max_tier],
            })
        summary.append({"category": category, "families": families})
    return summary


_NAME_FIXES = {"Fishermans": "Fisherman's", "Hunters": "Hunter's", "Merchants": "Merchant's",
               "Enchanters": "Enchanter's", "And": "and", "Of": "of"}


def family_display_name(blueprint_family_id: str) -> str:
    """A blueprint family as a plain name for the whole family, every tier
    ("blueprint_fishermans_ration" -> "Fisherman's Ration")."""
    words = blueprint_family_id.removeprefix("blueprint_").split("_")
    return " ".join(_NAME_FIXES.get(w.title(), w.title()) for w in words)


def profession_blueprint_summary() -> dict:
    """Every blueprint each profession can start with (its own and offered
    lists together, own first) - lore data for the /characters page.
    {"families": {familyId: {name, kind, items}}, "professions": [{id,
    category, blueprints}]}, family ids without the blueprint_ prefix, each
    family's items its tiers 1-6."""
    items_by_family: dict[str, list[BlueprintItem]] = {}
    for item in BLUEPRINT_ITEMS:
        items_by_family.setdefault(item.family_id, []).append(item)
    families = {
        family.removeprefix("blueprint_"): {
            "name": family_display_name(family),
            # A processed end product (written scroll) shows as an item.
            "kind": "item" if blueprint_source(family) == "item" and _blueprint_catalog_type(family) == "processed"
            else (_blueprint_catalog_type(family) or "?"),
            "items": [{"id": i.id, "name": i.name, "tier": i.tier} for i in sorted(items, key=lambda i: i.tier)],
        }
        for family, items in items_by_family.items()
    }
    professions = [
        {
            "id": profession_id,
            "category": PROFESSION_CATEGORIES[profession_id],
            "blueprints": [f.removeprefix("blueprint_") for f in lists.own + lists.offered],
        }
        for profession_id, lists in PROFESSION_BLUEPRINTS.items()
    ]
    return {"families": families, "professions": professions}
