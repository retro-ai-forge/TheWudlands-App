"""
Registry of currently active (logged-in) players, backed by the Mongo
`active_players` collection (see backend.db) so every Cloud Run instance
sees the same state instead of each holding its own private copy.

A player is added when they log in (see auth_routes.verify_auth_signature)
and evicted once idle for INACTIVITY_TIMEOUT - i.e. no login refresh and no
in-game state change (touch_player) for 2 hours. Any activity resets the
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

INACTIVITY_TIMEOUT = timedelta(hours=2)


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


def _doc_to_player(doc: dict) -> ActivePlayer:
    return ActivePlayer(
        address=doc["address"],
        logged_in_at=_as_utc(doc["logged_in_at"]),
        last_active_at=_as_utc(doc["last_active_at"]),
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

    if datetime.now(timezone.utc) - _as_utc(doc["last_active_at"]) > INACTIVITY_TIMEOUT:
        # Idle past the timeout but not yet swept by the TTL index.
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

    async for doc in db.active_players.find({}):
        if now - _as_utc(doc["last_active_at"]) > INACTIVITY_TIMEOUT:
            continue
        players.append(_doc_to_player(doc))

    return players
