"""
Exercises the Mongo-backed active-player registry in backend.active_players
against the real database configured via MONGODB_URI. This collection only
tracks who's online right now (see backend.players for permanent data).
"""

import pytest

from backend.active_players import (
    add_active_player,
    get_active_player,
    remove_active_player,
    touch_player,
)

TEST_ADDRESS = "5TestActivePlayerAddress"


@pytest.mark.asyncio
async def test_active_player_lifecycle(mongodb_uri):
    try:
        player = await add_active_player(TEST_ADDRESS)
        assert player.address == TEST_ADDRESS

        fetched = await get_active_player(TEST_ADDRESS)
        assert fetched is not None

        touched = await touch_player(TEST_ADDRESS)
        assert touched is not None
        assert touched.last_active_at >= player.last_active_at
    finally:
        await remove_active_player(TEST_ADDRESS)

    assert await get_active_player(TEST_ADDRESS) is None
