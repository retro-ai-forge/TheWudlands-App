"""
Catalog of stackable crafting resources (ore, wood, herbs, etc.).

These are aggregate-balance items, not equippable item instances: a player's
or character's storage holds a running total per resource id, never a slot
assignment. Loaded once at import time from data/base-resources.json,
the same constant-tuple approach as SOUL_SLOTS in backend.soul_slots.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

from backend.professions_catalog import PROFESSION_CATEGORIES

_CATALOG_PATH = Path(__file__).resolve().parent / "data" / "base-resources.json"
_PROFESSION_FAMILIES_PATH = Path(__file__).resolve().parent / "data" / "profession-resource-families.json"
_SELECTION_RULES_PATH = Path(__file__).resolve().parent / "data" / "resource-selection-rules.json"

# Display-only contract: the frontend splits a resource's total into stacks
# of this size when rendering storage/backpack UI. Storage itself just keeps
# a running total; there is no per-stack backend concept.
MAX_STACK_SIZE = 100


@dataclass(frozen=True)
class ResourceItem:
    """One entry in the resource catalog."""

    id: str
    name: str
    family_id: str
    tier: int

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "familyId": self.family_id, "tier": self.tier}


def _load_catalog() -> tuple[ResourceItem, ...]:
    data = json.loads(_CATALOG_PATH.read_text())
    return tuple(
        ResourceItem(id=item["id"], name=item["name"], family_id=item["familyId"], tier=item["tier"])
        for item in data
    )


def _load_profession_families() -> dict[str, tuple[str, ...]]:
    data = json.loads(_PROFESSION_FAMILIES_PATH.read_text())
    return {category: tuple(family_ids) for category, family_ids in data.items()}


def _load_selection_rules() -> dict[int, dict[int, int]]:
    data = json.loads(_SELECTION_RULES_PATH.read_text())
    return {
        int(profession_count): {int(tier): pool for tier, pool in tier_pools.items()}
        for profession_count, tier_pools in data["tierPoolsByProfessionCount"].items()
    }


RESOURCE_ITEMS: tuple[ResourceItem, ...] = _load_catalog()
RESOURCE_ITEMS_BY_ID: dict[str, ResourceItem] = {item.id: item for item in RESOURCE_ITEMS}

# Resource families (3 per category) available to a character through each of
# their professions, keyed by profession category - e.g. "Rural", "CraftWood".
PROFESSION_RESOURCE_FAMILIES: dict[str, tuple[str, ...]] = _load_profession_families()

# Starting-resource selection rules for the soul-creation "Trappings" step:
# the number of professions a character has determines which resource tiers
# they may pick from, and a total unit pool per tier that they freely
# allocate across the eligible familyIds of that tier (e.g. with 1
# profession: a 15-unit Tier 1 pool spendable across that profession's 3
# familyIds however the player likes).
TIER_POOLS_BY_PROFESSION_COUNT: dict[int, dict[int, int]] = _load_selection_rules()


@dataclass(frozen=True)
class TrappingsOptions:
    """What a character may pick from on the Trappings step."""

    tier_pools: dict[int, int]
    items: tuple[ResourceItem, ...]


def resolve_trapping_options(profession_ids: list[str]) -> TrappingsOptions:
    """
    Resolve the tier pools and eligible resource items for a character with
    these (1-3) professions, chosen on the wizard's earlier Foundation step.

    Blank/"none" entries are ignored (unfilled slots). A non-empty id that
    isn't a real profession is a hard error rather than silently ignored -
    accepting it would let a client claim resource access it never earned.
    Also the single source of truth POST /me/characters validates
    selectedResources against, so the picker a player sees can never drift
    from what's actually allowed.
    """
    chosen = [p for p in profession_ids if p and p != "none"]
    for profession_id in chosen:
        if profession_id not in PROFESSION_CATEGORIES:
            raise ValueError(f"Unknown profession id: {profession_id}")

    tier_pools = TIER_POOLS_BY_PROFESSION_COUNT.get(len(chosen), {})
    if not tier_pools:
        return TrappingsOptions(tier_pools={}, items=())

    categories = {PROFESSION_CATEGORIES[p] for p in chosen}
    family_ids = {family_id for category in categories for family_id in PROFESSION_RESOURCE_FAMILIES[category]}
    items = tuple(item for item in RESOURCE_ITEMS if item.family_id in family_ids and item.tier in tier_pools)
    return TrappingsOptions(tier_pools=tier_pools, items=items)
