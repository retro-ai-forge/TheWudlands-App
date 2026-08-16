"""
Profession -> category mirror of app/lib/characterOptions.ts' PROFESSIONS
list (id + category only - names/descriptions stay frontend-only).

The backend has no JS access, so this small table is duplicated here rather
than derived. Keep it in sync by hand whenever a profession is added, removed,
or recategorized on the frontend.
"""

from __future__ import annotations

PROFESSION_CATEGORIES: dict[str, str] = {
    "farmer": "Rural",
    "herder": "Rural",
    "hunter": "Rural",
    "fisher": "Rural",
    "miner": "Rural",
    "forager": "Rural",
    "blacksmith": "CraftMetal",
    "armorer": "CraftMetal",
    "tinsmith": "CraftMetal",
    "mason": "CraftStone",
    "stonemason": "CraftStone",
    "potter": "CraftStone",
    "leatherworker": "CraftGarment",
    "tanner": "CraftGarment",
    "weaver": "CraftGarment",
    "dyer": "CraftGarment",
    "glassblower": "CraftGlass",
    "jeweler": "CraftGlass",
    "carpenter": "CraftWood",
    "cooper": "CraftWood",
    "scribe": "Aristocratic",
    "clerk": "Aristocratic",
    "scholar": "Aristocratic",
    "merchant": "Trade",
    "trader": "Trade",
    "baker": "Food",
    "butcher": "Food",
    "brewmaster": "Food",
    "cook": "Food",
    "pastry": "Food",
    "apiarist": "Food",
    "barkeep": "Food",
    "server": "Food",
    "soldier": "Military",
    "guard": "Military",
    "painter": "Artists",
    "acrobat": "Artists",
    "clown": "Artists",
    "firespitter": "Artists",
    "storyteller": "Artists",
    "actor": "Artists",
}
