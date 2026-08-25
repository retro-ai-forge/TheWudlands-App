#!/usr/bin/env python3
"""
Migration script to remove old 'tools' and 'toolStarter' fields from player documents.

These fields have been replaced with the nested 'inventory' structure:
  inventory:
    - tools
    - rawResources
    - processedResources
    - items

Run with: python scripts/migrate_remove_tools.py
"""

import asyncio
import sys
from pathlib import Path

# Load .env file first
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / ".env")

# Add backend directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from backend.db import get_database


async def migrate():
    """Remove old tools and toolStarter fields from all player documents."""
    db = get_database()

    print("Starting migration: removing old 'tools' and 'toolStarter' fields...")
    print()

    # First, check how many documents have these fields
    docs_with_tools = await db.players.count_documents({"tools": {"$exists": True}})
    docs_with_toolstarter = await db.players.count_documents({"toolStarter": {"$exists": True}})

    print(f"Documents with 'tools' field: {docs_with_tools}")
    print(f"Documents with 'toolStarter' field: {docs_with_toolstarter}")
    print()

    if docs_with_tools == 0 and docs_with_toolstarter == 0:
        print("✓ No documents with old fields found. Migration complete!")
        return

    # Remove both fields
    result = await db.players.update_many(
        {},
        {"$unset": {"tools": "", "toolStarter": ""}}
    )

    print(f"✓ Updated {result.modified_count} documents")
    print(f"✓ Matched {result.matched_count} documents")
    print()
    print("Migration complete! Old fields removed.")


if __name__ == "__main__":
    asyncio.run(migrate())
