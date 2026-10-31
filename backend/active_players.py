"""
Registry of currently active (logged-in) players, backed by the Mongo
`active_players` collection (see backend.db) so every Cloud Run instance
sees the same state instead of each holding its own private copy.

A player is added when they log in (see auth_routes.verify_auth_signature)
and evicted once idle for INACTIVITY_TIMEOUT - i.e. no login refresh and no
in-game state change (touch_player) for 8 hours. Any activity resets the
idle timer, so an active player is never evicted mid-session.

Eviction itself is handled by a TTL index on `last_active_at` (created in
backend.db.ensure_indexes) rather than an application-side sweep - Mongo
deletes the document once it's past its idle window on its own. Because of
that TTL, this collection only ever tracks "is this player online right
now" - permanent data (character rosters) lives in backend.players instead,
which has no TTL and survives logout.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from pymongo import ReturnDocument

from backend.db import get_database

INACTIVITY_TIMEOUT = timedelta(hours=8)


@dataclass
class ActivePlayer:
    """An active player session, keyed by wallet address."""

    address: str
    logged_in_at: datetime
    last_active_at: datetime

    def to_dict(self) -> dict:
        return {
            "address": self.address,
            "loggedInAt": self.logged_in_at.isoformat(),
            "lastActiveAt": self.last_active_at.isoformat(),
        }


def _as_utc(value: datetime) -> datetime:
    """Mongo returns naive UTC datetimes; normalize to timezone-aware."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _last_active(doc: dict) -> Optional[datetime]:
    """Normalised `last_active_at`, or None if the doc lacks a usable value.

    A malformed/legacy doc without a datetime `last_active_at` is never swept by
    the TTL index (TTL only deletes docs whose indexed field is a date), so the
    read paths must tolerate it rather than KeyError on direct access.
    """
    value = doc.get("last_active_at")
    return _as_utc(value) if isinstance(value, datetime) else None


def _doc_to_player(doc: dict) -> ActivePlayer:
    # last_active_at is validated by the caller; fall back for logged_in_at so a
    # doc missing only that field still yields a usable player.
    last_active = _last_active(doc) or datetime.now(timezone.utc)
    logged_in = doc.get("logged_in_at")
    logged_in = _as_utc(logged_in) if isinstance(logged_in, datetime) else last_active
    return ActivePlayer(
        address=doc["address"],
        logged_in_at=logged_in,
        last_active_at=last_active,
    )


async def add_active_player(address: str) -> ActivePlayer:
    """
    Register a login for `address`, or refresh its idle timer if already
    active. Called from the /api/auth/verify flow once a signature checks out.
    """
    db = get_database()
    now = datetime.now(timezone.utc)

    doc = await db.active_players.find_one({"address": address})
    if doc is None:
        doc = {
            "address": address,
            "logged_in_at": now,
            "last_active_at": now,
        }
        await db.active_players.insert_one(doc)
    else:
        await db.active_players.update_one(
            {"address": address}, {"$set": {"last_active_at": now}}
        )
        doc["last_active_at"] = now

    return _doc_to_player(doc)


async def touch_player(address: str) -> Optional[ActivePlayer]:
    """
    Reset the idle timer for an already-active player, e.g. after a value
    change. Returns None if the player isn't currently active.
    """
    db = get_database()
    now = datetime.now(timezone.utc)

    doc = await db.active_players.find_one_and_update(
        {"address": address},
        {"$set": {"last_active_at": now}},
        return_document=ReturnDocument.AFTER,
    )

    if doc is None:
        return None

    return _doc_to_player(doc)


async def get_active_player(address: str) -> Optional[ActivePlayer]:
    db = get_database()
    doc = await db.active_players.find_one({"address": address})

    if doc is None:
        return None

    last_active = _last_active(doc)
    if last_active is None or datetime.now(timezone.utc) - last_active > INACTIVITY_TIMEOUT:
        # Idle past the timeout (or malformed, so never TTL-swept) - evict it.
        await db.active_players.delete_one({"address": address})
        return None

    return _doc_to_player(doc)


async def remove_active_player(address: str) -> None:
    db = get_database()
    await db.active_players.delete_one({"address": address})


async def list_active_players() -> List[ActivePlayer]:
    db = get_database()
    now = datetime.now(timezone.utc)
    players = []

    stale = []  # _id values of malformed docs the TTL index can't sweep
    async for doc in db.active_players.find({}):
        last_active = _last_active(doc)
        if last_active is None or not doc.get("address"):
            # No usable timestamp or no address - can't represent it; drop it.
            # Delete by _id so a missing address field can't break the cleanup.
            if "_id" in doc:
                stale.append(doc["_id"])
            continue
        if now - last_active > INACTIVITY_TIMEOUT:
            continue
        players.append(_doc_to_player(doc))

    if stale:
        await db.active_players.delete_many({"_id": {"$in": stale}})

    return players
