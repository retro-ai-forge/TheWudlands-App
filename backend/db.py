"""
MongoDB connection handling (Firestore with MongoDB compatibility on GCP).

Reads connection details from environment variables (loaded from .env by
backend.main). Exposes a single lazily-created Motor client shared across
requests, plus a helper to fetch the app's database handle.
"""

from __future__ import annotations

import os
import socket
import uuid
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from pymongo import ReturnDocument
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


# ── Conditional writes on Firestore ─────────────────────────────────────────
#
# Firestore with MongoDB compatibility answers findAndModify wrongly when
# several hit the same document at once: only the writes that should land do
# land, but callers whose condition no longer held still get a document back
# (and updatedExisting: true) - the winner's. Measured reliable instead: a
# token the caller writes itself and finds in the returned document,
# update_one's modified_count and delete_one's deleted_count; matched_count
# is NOT reliable. See CLAUDE.md ("Firestore note").

WRITE_TOKEN_FIELD = "_writeToken"


async def find_one_and_update_checked(collection, filter, update, *, return_document=ReturnDocument.AFTER, **kwargs):
    """`collection.find_one_and_update(...)` that returns the document only if
    THIS call's update landed, and None otherwise - what MongoDB itself does.

    Every find_one_and_update in the backend goes through here. It writes a
    fresh token with the update and asks for the document after it; the call
    won only if that document carries its own token. One round trip, and the
    caller gets the state its own write produced. Holds for conditional and
    unconditional updates and for guards with several winners alike
    (measured: 16 concurrent callers, no false win and no false loss). The
    token stays on the document (overwritten by the next write) and is taken
    off the returned copy.
    """
    if return_document is not ReturnDocument.AFTER:
        raise ValueError("find_one_and_update_checked returns the document after the update only")
    if "projection" in kwargs:
        # A projection could leave the token out and turn every win into a loss.
        raise ValueError("find_one_and_update_checked does not take a projection")
    if not isinstance(update, dict) or not update or not all(key.startswith("$") for key in update):
        raise ValueError("update must be a non-empty dict of update operators")
    token = uuid.uuid4().hex
    marked = dict(update)  # the caller's dict stays as it was
    marked["$set"] = {**update.get("$set", {}), WRITE_TOKEN_FIELD: token}
    doc = await collection.find_one_and_update(
        filter, marked, return_document=ReturnDocument.AFTER, **kwargs
    )
    if doc is None or doc.pop(WRITE_TOKEN_FIELD, None) != token:
        return None
    return doc


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
