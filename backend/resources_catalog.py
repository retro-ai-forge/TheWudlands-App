"""
Catalog of stackable crafting resources (ore, wood, herbs, etc.).

These are aggregate-balance items, not equippable item instances: a player's
or character's storage holds a running total per resource id, never a slot
assignment. Loaded once at import time from data/base-resource-items.json,
the same constant-tuple approach as SOUL_SLOTS in backend.soul_slots.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

_CATALOG_PATH = Path(__file__).resolve().parent / "data" / "base-resource-items.json"

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


RESOURCE_ITEMS: tuple[ResourceItem, ...] = _load_catalog()
RESOURCE_ITEMS_BY_ID: dict[str, ResourceItem] = {item.id: item for item in RESOURCE_ITEMS}

# Placeholder starting kit granted to every newly created character - a
# stand-in for the real starting-resource selection process planned for the
# soul-creation "finishing touches" step.
STARTING_RESOURCE_GRANTS: tuple[tuple[str, int], ...] = (
    ("pine_wood", 10),
    ("tanned_leather", 5),
    ("healing_herb", 5),
)
