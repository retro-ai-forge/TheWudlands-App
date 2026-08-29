"""
Catalog of craftable tools (anvil, loom, furnace, etc.).

Loaded once at import time from data/base-tools.json, the same
constant-tuple approach as resources_catalog.py's RESOURCE_ITEMS.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

_CATALOG_PATH = Path(__file__).resolve().parent / "data" / "base-tools.json"


@dataclass(frozen=True)
class ToolItem:
    """One entry in the tool catalog."""

    id: str
    name: str
    family_id: str
    tier: int

    def to_dict(self) -> dict:
        return {"id": self.id, "name": self.name, "familyId": self.family_id, "tier": self.tier}


def _load_catalog() -> tuple[ToolItem, ...]:
    data = json.loads(_CATALOG_PATH.read_text())
    return tuple(
        ToolItem(id=item["id"], name=item["name"], family_id=item["familyId"], tier=item["tier"])
        for item in data
    )


TOOL_ITEMS: tuple[ToolItem, ...] = _load_catalog()
TOOL_ITEMS_BY_ID: dict[str, ToolItem] = {item.id: item for item in TOOL_ITEMS}
