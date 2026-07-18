"""
One-time provisioning script: creates the TTL/unique indexes that
backend.auth and backend.active_players rely on.

Run this manually once per database (e.g. after creating the Firestore
instance, or after switching to a new one) - NOT on every app startup.
Index creation on Firestore's MongoDB-compatibility layer is a real
server-side provisioning operation and can take several minutes per index,
which is too slow to block a Cloud Run container's boot on.

Usage:
    source .venv/bin/activate
    python scripts/setup_db_indexes.py
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from backend.db import ensure_indexes  # noqa: E402


async def main():
    print("Creating indexes - this can take several minutes per index on Firestore...")
    await ensure_indexes()
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
