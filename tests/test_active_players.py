"""
Exercises the online-player registry in backend.active_players against the
real database configured via MONGODB_URI. This collection only tracks who's
online right now (see backend.players for permanent data).
"""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from starlette.requests import Request

from backend import active_players
from backend.active_players import (
    ONLINE_WINDOW,
    count_online,
    is_online,
    mark_active,
    remove_active_player,
)
from backend.auth import clear_session, create_session
from backend.auth_routes import get_current_address
from backend.db import get_database

TEST_ADDRESS = "5TestActivePlayerAddress"


async def _set_last_active(address: str, when: datetime) -> None:
    await get_database().active_players.update_one(
        {"address": address}, {"$set": {"last_active_at": when}}
    )


async def _last_active(address: str) -> datetime:
    doc = await get_database().active_players.find_one({"address": address})
    value = doc["last_active_at"]
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _request_with_session(token: str) -> Request:
    cookie = f"session_token={token}".encode()
    return Request({"type": "http", "headers": [(b"cookie", cookie)]})


@pytest.fixture
async def clean_address(mongodb_uri):
    await remove_active_player(TEST_ADDRESS)
    yield TEST_ADDRESS
    await remove_active_player(TEST_ADDRESS)


@pytest.mark.asyncio
async def test_mark_active_counts_the_player(clean_address):
    assert not await is_online(clean_address)

    await mark_active(clean_address)

    assert await is_online(clean_address)
    assert await count_online() >= 1


@pytest.mark.asyncio
async def test_player_goes_offline_after_the_window(clean_address):
    await mark_active(clean_address)
    stale = datetime.now(timezone.utc) - ONLINE_WINDOW - timedelta(minutes=1)
    await _set_last_active(clean_address, stale)

    assert not await is_online(clean_address)


@pytest.mark.asyncio
async def test_writes_are_throttled_unless_forced(clean_address):
    await mark_active(clean_address)
    old = datetime.now(timezone.utc) - timedelta(minutes=10)
    await _set_last_active(clean_address, old)

    # Within TOUCH_INTERVAL of this instance's last write: no database write.
    await mark_active(clean_address)
    assert await _last_active(clean_address) < old + timedelta(seconds=1)

    # A login forces the write.
    await mark_active(clean_address, force=True)
    assert await _last_active(clean_address) > old + timedelta(minutes=5)


@pytest.mark.asyncio
async def test_logout_removes_the_player_and_the_throttle(clean_address):
    await mark_active(clean_address)
    await remove_active_player(clean_address)
    assert not await is_online(clean_address)

    # The throttle entry went with it, so the next request counts at once.
    await mark_active(clean_address)
    assert await is_online(clean_address)


@pytest.mark.asyncio
async def test_failed_write_does_not_hold_the_throttle(clean_address, monkeypatch):
    class Boom(Exception):
        pass

    class FailingCollection:
        async def update_one(self, *args, **kwargs):
            raise Boom()

    with monkeypatch.context() as patched:
        patched.setattr(
            active_players, "get_database",
            lambda: SimpleNamespace(active_players=FailingCollection()),
        )
        with pytest.raises(Boom):
            await mark_active(clean_address)
    assert clean_address not in active_players._last_write

    await mark_active(clean_address)
    assert await is_online(clean_address)


@pytest.mark.asyncio
async def test_authenticated_request_marks_the_player(clean_address):
    # A session restored from the cookie never signs again - the request
    # itself has to count.
    session = await create_session(address=clean_address, session_duration_hours=1)
    try:
        address = await get_current_address(_request_with_session(session.token))
        assert address == clean_address
        assert await is_online(clean_address)
    finally:
        await clear_session(session.token)


@pytest.mark.asyncio
async def test_registry_failure_never_fails_the_request(clean_address, monkeypatch):
    async def broken(*args, **kwargs):
        raise RuntimeError("registry down")

    monkeypatch.setattr("backend.auth_routes.mark_active", broken)
    session = await create_session(address=clean_address, session_duration_hours=1)
    try:
        address = await get_current_address(_request_with_session(session.token))
        assert address == clean_address
    finally:
        await clear_session(session.token)
