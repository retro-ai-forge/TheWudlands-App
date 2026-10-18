"""
One-time migration: backfill player_characters entries with preview fields
(slotNumber, availability, portraitUrl, portraitFaceArea, portraitFrameArea,
activeCraft) from the corresponding character documents.

Idempotent — entries already carrying these fields are overwritten with
the current character-doc values, so this is safe to re-run.

Usage:
    source .venv/bin/activate
    python scripts/migrate_pc_preview_fields.py
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

    char_by_key: dict[tuple[str, str], dict] = {}
    async for doc in db.characters.find({}):
        key = (doc["address"], doc["id"])
        char_by_key[key] = doc

    updated_players = 0
    updated_entries = 0

    async for pc_doc in db.player_characters.find({}):
        address = pc_doc["address"]
        changed = False

        for entry in pc_doc.get("characters", []):
            cid = entry["characterId"]
            char = char_by_key.get((address, cid))
            if char is None:
                continue

            availability = char.get("availability", {})
            entry["slotNumber"] = char.get("slotNumber", 0)
            entry["availability"] = {"inAdventure": availability.get("inAdventure", False)}
            entry["portraitUrl"] = char.get("portraitUrl", "")
            entry["portraitFaceArea"] = char.get("portraitFaceArea")
            entry["portraitFrameArea"] = char.get("portraitFrameArea")

            active_craft = char.get("crafting", {}).get("activeCraft")
            if active_craft:
                entry["activeCraft"] = {
                    "familyId": active_craft.get("familyId"),
                    "tier": active_craft.get("tier"),
                    "count": active_craft.get("count"),
                    "readyAt": active_craft.get("readyAt"),
                }
            else:
                entry["activeCraft"] = None

            changed = True
            updated_entries += 1

        if changed:
            await db.player_characters.replace_one(
                {"_id": pc_doc["_id"]},
                pc_doc,
            )
            updated_players += 1

    print(f"Updated {updated_entries} entries across {updated_players} player_characters doc(s).")


if __name__ == "__main__":
    asyncio.run(main())
