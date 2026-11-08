"""
Migration: give every character the Your Legend values (backend/legend.py).

Sets each missing `legend.<name>` on the characters collection to 0, so every
character doc carries all names, and starts the Renown fade clock
(`legendUpdatedAt` = now) where there is none. Reads already fill missing names in
(players._build_player), so this only makes the stored docs complete. Safe
to run again - it never touches a value that is already there.

Usage:
    source .venv/bin/activate
    python scripts/migrate_add_legend.py           # dry run: shows what would change
    python scripts/migrate_add_legend.py --apply   # writes the changes
"""

import asyncio
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from backend.db import get_database  # noqa: E402
from backend.legend import LEGEND_KEYS  # noqa: E402


async def main(apply: bool) -> None:
    db = get_database()
    total = await db.characters.count_documents({})
    for key in LEGEND_KEYS:
        missing = {f"legend.{key}": {"$exists": False}}
        count = await db.characters.count_documents(missing)
        if not count:
            continue
        if apply:
            await db.characters.update_many(missing, {"$set": {f"legend.{key}": 0}})
        print(f"legend.{key}: {count} of {total} characters {'set to 0' if apply else 'would be set to 0'}")
    # Start the Renown fade clock for characters that don't have one yet.
    no_clock = {"legendUpdatedAt": {"$exists": False}}
    count = await db.characters.count_documents(no_clock)
    if count:
        if apply:
            now = datetime.now(timezone.utc).isoformat()
            await db.characters.update_many(no_clock, {"$set": {"legendUpdatedAt": now}})
        print(f"legendUpdatedAt: {count} of {total} characters {'set to now' if apply else 'would be set to now'}")
    if not apply:
        print("Dry run - nothing written. Run with --apply to write.")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
