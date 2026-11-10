"""
Item condition: every quality-tracked item instance carries `quality` 4..1 -
new, used, damaged, broken - the same for every tier. Each use may drop it
one level (a chance, not points); below broken (0) the item is gone. Broken
still works like new; it only warns that the next drop loses the item.
Stacked items have no condition - they may lose a unit per use instead.

Rules (all chances) live in data/item-conditions.json.
"""

from __future__ import annotations

import json
import random
from pathlib import Path
from typing import Optional

RULES: dict = json.loads((Path(__file__).parent / "data" / "item-conditions.json").read_text())

NEW, USED, DAMAGED, BROKEN = 4, 3, 2, 1
LABELS: dict[int, str] = {int(k): v for k, v in RULES["levels"].items()}

FORAGING: dict = RULES["foraging"]
NIGHTS: dict = RULES["nights"]
CRAFTING: dict = RULES["crafting"]
SALVAGE_PENALTY: dict[str, int] = dict(RULES["salvagePenalty"])
LOST_EQUIPMENT_LEVEL: int = int(RULES.get("lostEquipment", BROKEN))


def level(quality) -> Optional[int]:
    """The condition level of an instance's stored quality, 1..4 - None for
    an item without condition (a stack). Anything above 4 (an old-style
    point value not yet migrated) counts as new."""
    if quality is None:
        return None
    return max(0, min(NEW, int(quality)))


def label(quality) -> str:
    """'new' / 'used' / 'damaged' / 'broken' ('new' for items without condition)."""
    lvl = level(quality)
    if lvl is None:
        return "new"
    return LABELS.get(max(lvl, BROKEN), "broken")


def roll(chance: float, rng: random.Random | None = None) -> bool:
    return (rng or random).random() < chance


def crafting_tool_chance(units: int, station: bool = False) -> float:
    """Chance a borrowed tool drops a level over one craft of `units`: a
    crafting station a flat stationWear, a tool item (axe, dagger...)
    toolPerUnit per unit, at most toolMax."""
    if station:
        return float(CRAFTING["stationWear"])
    return min(float(CRAFTING["toolMax"]), float(CRAFTING["toolPerUnit"]) * max(1, units))
