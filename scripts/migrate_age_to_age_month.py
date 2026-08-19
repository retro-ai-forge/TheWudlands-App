"""
One-time data migration: renames the "age" key to "age_month" on every
character embedded in players.characters, matching the Character/
CharacterResponse rename in backend.character and backend.auth_routes
(the field was always canonical human-equivalent months, never years -
the old "age" name was just misleading).

Idempotent - characters already carrying "age_month" are left alone, so
this is safe to re-run.

Usage:
    source .venv/bin/activate
    python scripts/migrate_age_to_age_month.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from backend.db import get_database  # noqa: E402


async def main():
    db = get_database()

    players_updated = 0
    characters_updated = 0

    async for player in db.players.find({"characters.age": {"$exists": True}}):
        changed = False
        for character in player.get("characters", []):
            if "age" in character:
                character["age_month"] = character.pop("age")
                changed = True
                characters_updated += 1

        if changed:
            await db.players.update_one(
                {"_id": player["_id"]},
                {"$set": {"characters": player["characters"]}},
            )
            players_updated += 1

    print(f"Updated {characters_updated} character(s) across {players_updated} player(s).")


if __name__ == "__main__":
    asyncio.run(main())
