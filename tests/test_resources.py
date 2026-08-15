"""
Exercises stackable resource storage in backend.players: per-character
resourceBalances (backpack) and the player-level shared vault.
"""

import pytest

from backend.character import Character
from backend.db import get_database
from backend.players import (
    add_character,
    get_or_create_player,
    grant_resource,
    grant_shared_resource,
)
from backend.resources_catalog import STARTING_RESOURCE_GRANTS

TEST_ADDRESS = "5TestResourcesAddress"


@pytest.mark.asyncio
async def test_grant_resource_accumulates_on_a_character(mongodb_uri):
    db = get_database()
    try:
        await get_or_create_player(TEST_ADDRESS)
        character = Character(first_name="Test", last_name="Hero")
        await add_character(TEST_ADDRESS, character)

        await grant_resource(TEST_ADDRESS, character.id, "pine_wood", 10)
        player = await grant_resource(TEST_ADDRESS, character.id, "pine_wood", 5)

        assert player is not None
        stored = next(c for c in player.characters if c["id"] == character.id)
        assert stored["resourceBalances"]["pine_wood"] == 15
    finally:
        await db.players.delete_one({"address": TEST_ADDRESS})


@pytest.mark.asyncio
async def test_grant_shared_resource_is_independent_of_characters(mongodb_uri):
    db = get_database()
    try:
        await get_or_create_player(TEST_ADDRESS)
        character = Character(first_name="Test", last_name="Hero")
        await add_character(TEST_ADDRESS, character)

        await grant_resource(TEST_ADDRESS, character.id, "healing_herb", 3)
        player = await grant_shared_resource(TEST_ADDRESS, "healing_herb", 7)

        assert player is not None
        assert player.resource_balances["healing_herb"] == 7
        stored = next(c for c in player.characters if c["id"] == character.id)
        assert stored["resourceBalances"]["healing_herb"] == 3
    finally:
        await db.players.delete_one({"address": TEST_ADDRESS})


@pytest.mark.asyncio
async def test_grant_resource_rejects_unknown_id(mongodb_uri):
    db = get_database()
    try:
        await get_or_create_player(TEST_ADDRESS)
        character = Character(first_name="Test", last_name="Hero")
        await add_character(TEST_ADDRESS, character)

        with pytest.raises(ValueError):
            await grant_resource(TEST_ADDRESS, character.id, "not_a_real_resource", 1)
        with pytest.raises(ValueError):
            await grant_shared_resource(TEST_ADDRESS, "not_a_real_resource", 1)
    finally:
        await db.players.delete_one({"address": TEST_ADDRESS})


@pytest.mark.asyncio
async def test_starting_resource_grants_apply_to_a_new_character(mongodb_uri):
    db = get_database()
    try:
        await get_or_create_player(TEST_ADDRESS)
        character = Character(first_name="Test", last_name="Hero")
        await add_character(TEST_ADDRESS, character)

        player = None
        for resource_id, amount in STARTING_RESOURCE_GRANTS:
            player = await grant_resource(TEST_ADDRESS, character.id, resource_id, amount)

        assert player is not None
        stored = next(c for c in player.characters if c["id"] == character.id)
        for resource_id, amount in STARTING_RESOURCE_GRANTS:
            assert stored["resourceBalances"][resource_id] == amount
    finally:
        await db.players.delete_one({"address": TEST_ADDRESS})
