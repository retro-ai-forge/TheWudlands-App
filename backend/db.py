"""
MongoDB connection handling (Firestore with MongoDB compatibility on GCP).

Reads connection details from environment variables (loaded from .env by
backend.main). Exposes a single lazily-created Motor client shared across
requests, plus a helper to fetch the app's database handle.
"""

from __future__ import annotations

import asyncio
import contextvars
import os
import random
import socket
import uuid
from typing import Any, Awaitable, Callable, Optional, TypeVar

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection, AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pymongo.errors import PyMongoError
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


def get_database() -> "Database":
    """Return the app's database handle from the shared client.

    A thin wrapper around Motor's database: inside run_in_transaction every
    call on its collections joins that transaction (see below); outside one
    it behaves exactly like Motor's own handle.
    """
    db_name = os.getenv("MONGODB_DB_NAME", "thewudlands")
    return Database(get_mongo_client()[db_name])


# ── Transactions ────────────────────────────────────────────────────────────
#
# A flow that writes several documents (move an item from the vault to a
# character, start a craft, ...) runs inside run_in_transaction: either every
# write lands or none does - no item taken out of one place and never put in
# the other when a request loses a race or crashes halfway.
#
# The running transaction lives in a context variable, and the handle
# get_database() returns adds its session to every collection call made
# while it runs - so a flow and every helper it calls join it without passing
# a session around, and none of them can write outside it by accident.

T = TypeVar("T")


class TransactionConflict(Exception):
    """Other requests kept changing the same documents - nothing was written.
    Shown to the player as "try again" (HTTP 409, see backend.main)."""

    def __init__(self, message: str = "Something changed at the same time - please try again."):
        super().__init__(message)


class _Txn:
    def __init__(self, session):
        self.session = session
        # A session runs one operation at a time: calls made side by side
        # inside a transaction (asyncio.gather) take turns.
        self.lock = asyncio.Lock()


_current_txn: contextvars.ContextVar[Optional[_Txn]] = contextvars.ContextVar("wudlands_txn", default=None)

# Collection methods that are awaited directly / that return a cursor.
_AWAITED_METHODS = frozenset({
    "find_one", "insert_one", "insert_many", "update_one", "update_many", "replace_one",
    "delete_one", "delete_many", "find_one_and_update", "find_one_and_replace",
    "find_one_and_delete", "count_documents", "distinct", "bulk_write",
})
_CURSOR_METHODS = frozenset({"find", "aggregate"})


def in_transaction() -> bool:
    return _current_txn.get() is not None


class _TxnCursor:
    """A find()/aggregate() cursor inside a transaction. Its batches travel
    over the transaction's one session, so - like every other call there -
    it takes turns: the whole result is fetched under the transaction's lock,
    then handed out. Cursors read side by side (asyncio.gather, e.g.
    _build_player inside character creation) otherwise mix up their replies
    on the shared connection (pymongo ProtocolError "Got response id ... but
    expected ...", or a broken SSL connection). The lock is released before
    the documents are handed out, so the loop body may use the database.
    Chaining (sort, limit, skip, ...) works as on Motor's cursor."""

    __slots__ = ("_cursor", "_txn")

    def __init__(self, cursor, txn: "_Txn"):
        self._cursor = cursor
        self._txn = txn

    def __getattr__(self, name: str):
        attr = getattr(self._cursor, name)
        if not callable(attr):
            return attr

        def call(*args, **kwargs):
            result = attr(*args, **kwargs)
            return self if result is self._cursor else result
        return call

    async def to_list(self, length: Optional[int] = None) -> list:
        async with self._txn.lock:
            return await self._cursor.to_list(length)

    def __aiter__(self):
        return self._iterate()

    async def _iterate(self):
        for doc in await self.to_list(None):
            yield doc


class Collection:
    """Motor collection that joins the running transaction, if any."""

    __slots__ = ("_coll",)

    def __init__(self, coll: AsyncIOMotorCollection):
        self._coll = coll

    def __getattr__(self, name: str):
        attr = getattr(self._coll, name)
        if name in _AWAITED_METHODS:
            async def call(*args, **kwargs):
                txn = _current_txn.get()
                if txn is None or "session" in kwargs:
                    return await attr(*args, **kwargs)
                async with txn.lock:
                    return await attr(*args, session=txn.session, **kwargs)
            return call
        if name in _CURSOR_METHODS:
            def call_cursor(*args, **kwargs):
                txn = _current_txn.get()
                if txn is None or "session" in kwargs:
                    return attr(*args, **kwargs)
                return _TxnCursor(attr(*args, session=txn.session, **kwargs), txn)
            return call_cursor
        return attr

    def __repr__(self) -> str:
        return f"Collection({self._coll.name!r})"


class Database:
    """Motor database whose collections join the running transaction."""

    __slots__ = ("_db",)

    def __init__(self, db: AsyncIOMotorDatabase):
        self._db = db

    def __getattr__(self, name: str):
        attr = getattr(self._db, name)
        return Collection(attr) if isinstance(attr, AsyncIOMotorCollection) else attr

    def __getitem__(self, name: str) -> Collection:
        return Collection(self._db[name])

    def __repr__(self) -> str:
        return f"Database({self._db.name!r})"


async def run_in_transaction(fn: Callable[[], Awaitable[Optional[T]]], *, attempts: int = 8) -> Optional[T]:
    """Run `fn` inside one transaction: every database write it makes lands
    together, or none does.

    - `fn` returns the flow's result. None (this codebase's "refused / not
      found") rolls everything back and returns None; so does an exception,
      which is raised again.
    - A write conflict with another request (Firestore aborts one side with
      code 112, labelled TransientTransactionError) runs `fn` again from the
      start after a short random wait - `fn` must read what it decides on
      inside itself, never rely on what was read before the call. After
      `attempts` tries: TransactionConflict.
    - Called while a transaction is already running, `fn` simply joins it.
    - Keep reads that only build the response (e.g. _build_player) after the
      call: everything read inside is part of the conflict check.
    """
    if _current_txn.get() is not None:
        return await fn()
    client = get_mongo_client()
    for attempt in range(attempts):
        async with await client.start_session() as session:
            token = _current_txn.set(_Txn(session))
            try:
                session.start_transaction()
                result = await fn()
                if result is None:
                    await session.abort_transaction()
                    return None
                await _commit(session)
                return result
            except PyMongoError as exc:
                await _abort_quietly(session)
                if not exc.has_error_label("TransientTransactionError"):
                    raise
                if attempt + 1 == attempts:
                    raise TransactionConflict() from exc
            except BaseException:
                await _abort_quietly(session)
                raise
            finally:
                _current_txn.reset(token)
        # Back off a random, growing bit so the requests that collided don't
        # collide again on the next try.
        await asyncio.sleep(random.uniform(0.01, 0.04) * (2 ** attempt))
    raise TransactionConflict()  # not reached


def transactional(fn: Callable[..., Awaitable[Optional[T]]]) -> Callable[..., Awaitable[Optional[T]]]:
    """Decorator: the whole function runs in run_in_transaction (same
    rules - None or an exception rolls back, conflicts retry it)."""
    import functools

    @functools.wraps(fn)
    async def wrapper(*args: Any, **kwargs: Any):
        return await run_in_transaction(lambda: fn(*args, **kwargs))

    return wrapper


async def _commit(session) -> None:
    for attempt in range(3):
        try:
            await session.commit_transaction()
            return
        except PyMongoError as exc:
            # The commit may or may not have landed: committing again is
            # safe (same transaction) and tells which it was.
            if exc.has_error_label("UnknownTransactionCommitResult") and attempt < 2:
                continue
            raise


async def _abort_quietly(session) -> None:
    if session.in_transaction:
        try:
            await session.abort_transaction()
        except PyMongoError:
            pass


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
