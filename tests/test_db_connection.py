"""
Run test with:

python -m pytest tests/ -v -s
(-s for log output)

Verifies the app can log in to the database using the credentials in .env
(MONGODB_URI). Skips instead of failing if no URI is configured yet.
"""

import pytest

from backend.db import close_mongo_client, get_database


@pytest.mark.asyncio
async def test_can_authenticate_and_ping(mongodb_uri):
    db = get_database()
    result = await db.command("ping")
    assert result.get("ok") == 1.0
    print(f"Connected to database: {db.name}")
    await close_mongo_client()
