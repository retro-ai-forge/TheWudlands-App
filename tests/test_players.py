"""
Exercises the permanent player/character storage in backend.players, and
confirms it's independent of the active_players registry - i.e. characters
survive logout / idle eviction, unlike the old design where they lived
inside the TTL-evicted active_players document.
"""

import pytest

from backend.active_players import add_active_player, remove_active_player
from backend.character import Character
from backend.db import get_database
from backend.players import add_character, get_or_create_player, get_player

TEST_ADDRESS = "5TestPlayerAddress"


@pytest.mark.asyncio
async def test_characters_persist_after_active_player_is_removed(mongodb_uri):
    db = get_database()
    try:
        player = await get_or_create_player(TEST_ADDRESS)
        assert player.address == TEST_ADDRESS
        assert player.characters == []

        # Calling it again (simulating a second login) must not duplicate
        # the record or reset first_login_at. Compared with sub-second
        # tolerance since BSON dates only store millisecond precision,
        # unlike Python's microsecond-precision datetime.now().
        again = await get_or_create_player(TEST_ADDRESS)
        assert abs((again.first_login_at - player.first_login_at).total_seconds()) < 1

        with_char = await add_character(
            TEST_ADDRESS, Character(first_name="Test", last_name="Hero")
        )
        with_char = await add_character(
            TEST_ADDRESS, Character(first_name="Second", last_name="Hero")
        )
        assert with_char is not None
        assert len(with_char.characters) == 2
        assert with_char.characters[0]["firstName"] == "Test"
        assert with_char.characters[1]["firstName"] == "Second"

        # Simulate the active-session ending (logout, or 2h idle eviction).
        await add_active_player(TEST_ADDRESS)
        await remove_active_player(TEST_ADDRESS)

        # The permanent record - and its characters - must still be there.
        fetched = await get_player(TEST_ADDRESS)
        assert fetched is not None
        assert len(fetched.characters) == 2
    finally:
        await db.players.delete_one({"address": TEST_ADDRESS})
        await db.active_players.delete_one({"address": TEST_ADDRESS})
