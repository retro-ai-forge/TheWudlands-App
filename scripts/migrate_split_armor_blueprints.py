"""
Migration: armor blueprints were split per piece.

An armor blueprint used to cover a whole set (blueprint_iron_1 crafted the
iron helmet, breastplate and greaves). Now every piece has its own
(blueprint_iron_head_armor_1, blueprint_iron_chest_armor_1,
blueprint_iron_leg_armor_1). A character that owned an old set blueprint
keeps the chest piece's blueprint of the same tier; head and legs have to
be learned again.

Rewrites character_blueprints.blueprints. Safe to run again - an already
migrated list has no old ids left. Each document is only written if its
list is still the one read (a conditional update), so a blueprint learned
meanwhile is never lost.

Usage:
    source .venv/bin/activate
    python scripts/migrate_split_armor_blueprints.py           # dry run: shows what would change
    python scripts/migrate_split_armor_blueprints.py --apply   # writes the changes
"""

import asyncio
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from backend.db import get_database  # noqa: E402

# The armor sets whose blueprint was split (see backend/data/base-blueprint.json).
SPLIT_ARMORS = ("cloth", "leather", "chainmail", "iron", "ebony", "chitin", "meteoric_iron", "darksteel")
_OLD_ID = re.compile(rf"^blueprint_({'|'.join(SPLIT_ARMORS)})_(\d)$")


def split_armor_blueprints(ids: list[str]) -> list[str]:
    """An old set blueprint id becomes the chest piece's of the same tier;
    every other id is kept. Order kept, duplicates dropped."""
    out: list[str] = []
    for blueprint_id in ids:
        match = _OLD_ID.match(blueprint_id)
        new_id = f"blueprint_{match.group(1)}_chest_armor_{match.group(2)}" if match else blueprint_id
        if new_id not in out:
            out.append(new_id)
    return out


async def main(apply: bool) -> None:
    db = get_database()
    changed = written = 0
    async for doc in db.character_blueprints.find({}):
        old = list(doc.get("blueprints") or [])
        new = split_armor_blueprints(old)
        if new == old:
            continue
        changed += 1
        swapped = [b for b in old if _OLD_ID.match(b)]
        print(f"{doc.get('address')} / {doc.get('characterId')}: {', '.join(swapped)} -> chest piece")
        if apply:
            result = await db.character_blueprints.update_one(
                {"_id": doc["_id"], "blueprints": old}, {"$set": {"blueprints": new}}
            )
            if result.modified_count:
                written += 1
            else:
                print("  changed meanwhile - skipped, run again")
    print(f"{changed} character(s) {'updated: ' + str(written) if apply else 'would be updated'}")
    if not apply:
        print("Dry run - nothing written. Run with --apply to write.")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
