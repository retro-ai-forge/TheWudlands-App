"""
MongoDB connection handling (Firestore with MongoDB compatibility on GCP).

Reads connection details from environment variables (loaded from .env by
backend.main). Exposes a single lazily-created Motor client shared across
requests, plus a helper to fetch the app's database handle.
"""

from __future__ import annotations

import os
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

_client: Optional[AsyncIOMotorClient] = None


def get_mongo_client() -> AsyncIOMotorClient:
    """Return the shared Motor client, creating it on first use."""
    global _client

    if _client is None:
        uri = os.getenv("MONGODB_URI")
        if not uri:
            raise RuntimeError("MONGODB_URI environment variable is not set")
        _client = AsyncIOMotorClient(uri)

    return _client


def get_database() -> AsyncIOMotorDatabase:
    """Return the app's database handle from the shared client."""
    db_name = os.getenv("MONGODB_DB_NAME", "thewudlands")
    return get_mongo_client()[db_name]


async def close_mongo_client() -> None:
    """Close the shared client. Call on app shutdown."""
    global _client

    if _client is not None:
        _client.close()
        _client = None


async def ensure_indexes() -> None:
    """
    Create the TTL/unique indexes session and active-player storage rely on.

    Idempotent - safe to call on every app startup. TTL indexes let Mongo
    expire documents itself instead of the app sweeping expired entries by
    hand: expireAfterSeconds=0 deletes a document once "now" passes the
    stored date field, so pointing that field at each entry's own expiry
    timestamp is what makes it expire "at" that time.
    """
    db = get_database()

    await db.sessions.create_index("token", unique=True)
    await db.sessions.create_index("expires_at", expireAfterSeconds=0)

    await db.nonces.create_index("nonce", unique=True)
    await db.nonces.create_index("created_at", expireAfterSeconds=5 * 60)

    await db.active_players.create_index("address", unique=True)
    await db.active_players.create_index("last_active_at", expireAfterSeconds=2 * 60 * 60)

    # `players` is the permanent record (no TTL) - unlike active_players,
    # documents here must survive logout and idle eviction indefinitely.
    await db.players.create_index("address", unique=True)
