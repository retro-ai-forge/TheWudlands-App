"""
Who is online right now, backed by the `active_players` collection (see
backend.db) so every Cloud Run instance sees the same state.

A player counts as online while their `last_active_at` is less than
ONLINE_WINDOW old. `mark_active` writes it: the signature login calls it, and
so does `auth_routes.get_current_address`, so every authenticated request
counts - including a session restored from the cookie, which never signs
again. While the tab is visible the online badge (app/main/VersionBadge.tsx)
asks for the count every few minutes, and that request counts too, so a
player who is reading without clicking stays online.

Writes are throttled per instance: an address that this instance wrote less
than TOUCH_INTERVAL ago is skipped without touching the database, so the
registry costs about one write per online player every few minutes, not one
per request. With the badge asking every 5 minutes, a present player's
`last_active_at` is at most about 10 minutes old - inside the 15 minute
window.

Logout deletes the entry; another device still signed in adds it back with
its next request (within TOUCH_INTERVAL).

The count filters on ONLINE_WINDOW itself. The TTL index on `last_active_at`
(backend.db.ensure_indexes, 8h) only clears out old docs and is deliberately
left at 8h: changing expireAfterSeconds on an existing index makes
create_index fail. Permanent data (character rosters) lives in
backend.players instead.
"""

from __future__ import annotations

import time
from datetime import datetime, timedelta, timezone

from pymongo.errors import DuplicateKeyError

from backend.db import get_database

ONLINE_WINDOW = timedelta(minutes=15)
TOUCH_INTERVAL = timedelta(minutes=5)

# address -> time.monotonic() of this instance's last write for it.
_last_write: dict[str, float] = {}
_MAX_CACHED = 10_000


def _forget_old_writes(now: float) -> None:
    """Keep the throttle cache bounded: drop entries past TOUCH_INTERVAL."""
    if len(_last_write) < _MAX_CACHED:
        return
    limit = TOUCH_INTERVAL.total_seconds()
    for address, at in list(_last_write.items()):
        if now - at >= limit:
            del _last_write[address]
    if len(_last_write) >= _MAX_CACHED:
        # Only possible with more than _MAX_CACHED players active within
        # TOUCH_INTERVAL on one instance; the cost is a few extra writes.
        _last_write.clear()


async def mark_active(address: str, force: bool = False) -> None:
    """Record that `address` is online now.

    Skipped when this instance already wrote it within TOUCH_INTERVAL, unless
    `force` (the signature login, so a logout on another instance can't leave
    a fresh login uncounted until the throttle runs out).
    """
    now_mono = time.monotonic()
    last = _last_write.get(address)
    if not force and last is not None and now_mono - last < TOUCH_INTERVAL.total_seconds():
        return

    _forget_old_writes(now_mono)
    # Claim the slot before awaiting so concurrent requests from the same
    # player don't all write; released again if the write fails.
    _last_write[address] = now_mono

    db = get_database()
    now = datetime.now(timezone.utc)
    try:
        try:
            await db.active_players.update_one(
                {"address": address},
                {"$set": {"last_active_at": now}},
                upsert=True,
            )
        except DuplicateKeyError:
            # Two upserts for a new address raced on the unique index; the
            # other one created the doc, so this is a plain update now.
            await db.active_players.update_one(
                {"address": address}, {"$set": {"last_active_at": now}}
            )
    except BaseException:
        _last_write.pop(address, None)
        raise


async def remove_active_player(address: str) -> None:
    """Logout: the player is no longer online."""
    _last_write.pop(address, None)
    db = get_database()
    await db.active_players.delete_one({"address": address})


async def is_online(address: str) -> bool:
    db = get_database()
    doc = await db.active_players.find_one(
        {"address": address, "last_active_at": {"$gte": _cutoff()}}
    )
    return doc is not None


async def count_online() -> int:
    """Number of players with an authenticated request within ONLINE_WINDOW."""
    db = get_database()
    return await db.active_players.count_documents(
        {"last_active_at": {"$gte": _cutoff()}}
    )


def _cutoff() -> datetime:
    return datetime.now(timezone.utc) - ONLINE_WINDOW
