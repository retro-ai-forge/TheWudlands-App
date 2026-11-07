"""
MongoDB connection handling (Firestore with MongoDB compatibility on GCP).

Reads connection details from environment variables (loaded from .env by
backend.main). Exposes a single lazily-created Motor client shared across
requests, plus a helper to fetch the app's database handle.
"""

from __future__ import annotations

import os
import socket
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo.uri_parser import parse_uri

_client: Optional[AsyncIOMotorClient] = None


def _prefer_ipv4_for(hosts: set[str]) -> None:
    """Make connections to these hosts try their IPv4 address first.

    The Firestore endpoint resolves to an IPv6 and an IPv4 address, and the
    resolver lists IPv6 first. Where there is no IPv6 route (this dev box;
    Cloud Run without IPv6 egress), every NEW pooled connection hangs on the
    IPv6 address for PyMongo's full connectTimeoutMS (20s) before falling
    back to IPv4 - so any request needing one more connection than the pool
    had warm (parallel queries, e.g. _build_player's gather) stalled 20s.
    IPv6 stays in the list as a fallback; other hosts are untouched.
    """
    original = socket.getaddrinfo
    if getattr(original, "_ipv4_first_hosts", None) is not None:
        original._ipv4_first_hosts.update(hosts)  # type: ignore[attr-defined]
        return

    def getaddrinfo(host, *args, **kwargs):
        results = original(host, *args, **kwargs)
        if host in getaddrinfo._ipv4_first_hosts:  # type: ignore[attr-defined]
            results = sorted(results, key=lambda r: r[0] != socket.AF_INET)
        return results

    getaddrinfo._ipv4_first_hosts = set(hosts)  # type: ignore[attr-defined]
    socket.getaddrinfo = getaddrinfo


def get_mongo_client() -> AsyncIOMotorClient:
    """Return the shared Motor client, creating it on first use."""
    global _client

    if _client is None:
        uri = os.getenv("MONGODB_URI")
        if not uri:
            raise RuntimeError("MONGODB_URI environment variable is not set")
        if not uri.startswith("mongodb+srv://"):
            _prefer_ipv4_for({host for host, _port in parse_uri(uri)["nodelist"]})
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
    await db.active_players.create_index("last_active_at", expireAfterSeconds=8 * 60 * 60)

    # `characters` stores one doc per character, keyed by (address, id).
    await db.characters.create_index(
        [("address", 1), ("id", 1)], unique=True
    )
    await db.characters.create_index(
        [("address", 1), ("slotNumber", 1)], unique=True
    )

    # soul_slots is read on nearly every welcome-page load - without an
    # index this is a full collection scan per lookup.
    await db.soul_slots.create_index("address", unique=True)

    # Per-player summary: status, tags, timers, availability per character.
    await db.player_characters.create_index("address", unique=True)

    # Per-character storage (items + itemBalances) and blueprints, each in
    # their own collection. Home = out-of-adventure, camp = in-adventure.
    await db.character_homes.create_index(
        [("address", 1), ("characterId", 1)], unique=True
    )
    await db.character_camp.create_index(
        [("address", 1), ("characterId", 1)], unique=True
    )
    await db.character_blueprints.create_index(
        [("address", 1), ("characterId", 1)], unique=True
    )
    await db.player_vaults.create_index(
        [("address", 1)], unique=True
    )

    # Twine story cloud sync: one doc per story per player.
    await db.twine_stories.create_index(
        [("address", 1), ("storyId", 1)], unique=True
    )

    # Twine review submissions: one doc per submission (a player can resubmit).
    await db.twine_review.create_index(
        [("address", 1), ("storyId", 1)], unique=True
    )
    await db.twine_review.create_index("submittedAt")

    # Rejected submissions: one minimal doc per rejection, listed newest first.
    await db.twine_rejected.create_index("rejectedAt")

    # Role grants (reviewer/admin): one doc per wallet address.
    await db.roles.create_index("address", unique=True)

    # Running adventures (backend.adventures): looked up per player on every
    # resume/recovery; the log is write-once history of finished runs.
    await db.adventure_sessions.create_index("address")
    await db.adventure_log.create_index([("address", 1), ("endedAt", -1)])
    await db.adventure_log.create_index("storyId")

    # Runs left per player per story (backend.adventures run counter).
    await db.story_plays.create_index(
        [("address", 1), ("storyAuthor", 1), ("storyId", 1)], unique=True
    )
