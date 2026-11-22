"""
Migration: the iron item families are now metal families, so no item id says
"iron" except iron_ration. Iron is the tier-3 material of many families
(chainmail_head_armor_3 is an "Iron Chainmail Coif"), so an id with "iron" in
it misled story authors, who check items by id (docs/STORY-RULES.md):

    iron_head_armor  -> metal_head_armor
    iron_chest_armor -> metal_chest_armor
    iron_leg_armor   -> metal_leg_armor
    iron_shield      -> metal_shield
    iron_spikes      -> metal_spikes

Their blueprints (blueprint_iron_shield_3 -> blueprint_metal_shield_3) and
image paths (/images/items/iron_shield_t3.png -> metal_shield_t3.png) follow.
The display names now follow the ore of each tier like other metal items
(Copper, Bronze, Iron, Silver, Gold, Star Metal: "Apprentice's Copper Helmet");
items don't store their names, so they need nothing here. iron_ration stays,
and meteoric_iron_... (renamed earlier) is never touched.

Rewrites every stored id in every collection except the authors' story texts,
which it lists when they still use an old id (scripts/migrate_rename_item_families.py
does the work). Safe to run again; each document is only written if the fields
it changes still hold what was read. Run it together with the deploy of the
renamed catalog: old ids are unknown to the new code and the new ids to the old.

Usage:
    source .venv/bin/activate
    python scripts/migrate_rename_iron_to_metal.py           # dry run: shows what would change
    python scripts/migrate_rename_iron_to_metal.py --apply   # writes the changes
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from migrate_rename_item_families import make_renamer, migrate  # noqa: E402

RENAMES = {
    "iron_head_armor": "metal_head_armor",
    "iron_chest_armor": "metal_chest_armor",
    "iron_leg_armor": "metal_leg_armor",
    "iron_shield": "metal_shield",
    "iron_spikes": "metal_spikes",
}

renamed = make_renamer(RENAMES, not_after=("meteoric_",))


if __name__ == "__main__":
    asyncio.run(migrate(renamed, "--apply" in sys.argv))
