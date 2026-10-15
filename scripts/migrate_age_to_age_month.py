"""
One-time data migration: renames the "age" key to "age_month" on every
character document in the characters collection, matching the Character/
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

    result = await db.characters.update_many(
        {"age": {"$exists": True}},
        [{"$set": {"age_month": "$age"}}, {"$unset": "age"}],
    )

    print(f"Updated {result.modified_count} character(s).")


if __name__ == "__main__":
    asyncio.run(main())
