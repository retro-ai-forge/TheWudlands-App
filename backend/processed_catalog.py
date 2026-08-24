"""
Catalog of processed crafting resources (leather, planks, ingots, etc.).

These are aggregate-balance items created through crafting, not found raw.
Loaded once at import time from data/base-processed.json.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

_CATALOG_PATH = Path(__file__).resolve().parent / "data" / "base-processed.json"


@dataclass(frozen=True)
class ProcessedResourceItem:
    """One entry in the processed resource catalog."""

    id: str
    name: str
    family_id: str
    tier: int

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "familyId": self.family_id, "tier": self.tier}


def _load_catalog() -> tuple[ProcessedResourceItem, ...]:
    data = json.loads(_CATALOG_PATH.read_text())
    return tuple(
        ProcessedResourceItem(id=item["id"], name=item["name"], family_id=item["familyId"], tier=item["tier"])
        for item in data
    )


PROCESSED_RESOURCE_ITEMS: tuple[ProcessedResourceItem, ...] = _load_catalog()
PROCESSED_RESOURCE_ITEMS_BY_ID: dict[str, ProcessedResourceItem] = {item.id: item for item in PROCESSED_RESOURCE_ITEMS}
