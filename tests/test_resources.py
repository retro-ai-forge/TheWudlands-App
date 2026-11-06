"""
Exercises stackable item-balance storage in backend.players: the per-character
crafting staging area (characters.crafting.itemBalances) and the player's shared
vault (player_vaults.itemBalances, the unified pool for every stackable item).
"""

import pytest

from backend.character import Character
from backend.db import get_database
from backend.players import (
    add_character,
    get_or_create_player,
    grant_character_item_balance,
    grant_item_balance,
)
from backend.resources_catalog import resolve_trapping_options

TEST_ADDRESS = "5TestResourcesAddress"

# Every collection a test player's data can land in (see CLAUDE.md schema).
_PLAYER_COLLECTIONS = (
    "characters",
    "player_characters",
    "player_vaults",
    "character_homes",
    "character_camp",
    "character_blueprints",
)


async def _purge_player(db) -> None:
    for name in _PLAYER_COLLECTIONS:
        await db[name].delete_many({"address": TEST_ADDRESS})


async def _new_character(db) -> Character:
    await _purge_player(db)
    await get_or_create_player(TEST_ADDRESS)
    character = Character(first_name="Test", last_name="Hero")
    await add_character(TEST_ADDRESS, character)
    return character


async def _vault_balances(db) -> dict:
    vault = await db.player_vaults.find_one({"address": TEST_ADDRESS}) or {}
    return vault.get("itemBalances", {})


@pytest.mark.asyncio
async def test_grant_character_item_balance_accumulates_on_a_character(mongodb_uri):
    db = get_database()
    try:
        character = await _new_character(db)

        await grant_character_item_balance(TEST_ADDRESS, character.id, "wood_1", 10)
        player = await grant_character_item_balance(TEST_ADDRESS, character.id, "wood_1", 5)

        assert player is not None
        stored = next(c for c in player.characters if c["id"] == character.id)
        assert stored["crafting"]["itemBalances"]["wood_1"] == 15
    finally:
        await _purge_player(db)


@pytest.mark.asyncio
async def test_vault_grant_is_independent_of_characters(mongodb_uri):
    db = get_database()
    try:
        character = await _new_character(db)

        await grant_character_item_balance(TEST_ADDRESS, character.id, "herbs_1", 3)
        await grant_item_balance(TEST_ADDRESS, "herbs_1", 7)

        assert (await _vault_balances(db))["herbs_1"] == 7
        char_doc = await db.characters.find_one({"address": TEST_ADDRESS, "id": character.id})
        assert char_doc["crafting"]["itemBalances"]["herbs_1"] == 3
    finally:
        await _purge_player(db)


@pytest.mark.asyncio
async def test_grants_reject_non_positive_amounts(mongodb_uri):
    # Item-id validation lives in the character-creation route (it checks each
    # pick against the profession's trapping pool); the grant helpers trust
    # their caller and only guard the amount.
    db = get_database()
    try:
        character = await _new_character(db)

        with pytest.raises(ValueError):
            await grant_character_item_balance(TEST_ADDRESS, character.id, "wood_1", 0)
        with pytest.raises(ValueError):
            await grant_item_balance(TEST_ADDRESS, "wood_1", -1)
    finally:
        await _purge_player(db)


@pytest.mark.asyncio
async def test_trapping_selection_grants_land_in_the_vault(mongodb_uri):
    # Mirrors the create-character route: a starter-kit pick is granted into
    # the player's shared vault, not onto the character.
    db = get_database()
    try:
        await _new_character(db)

        options = resolve_trapping_options(["farmer"])
        tier1_item = next(item for item in options.items if item.tier == 1)

        await grant_item_balance(TEST_ADDRESS, tier1_item.id, options.tier_pools[1])

        assert (await _vault_balances(db))[tier1_item.id] == options.tier_pools[1]
    finally:
        await _purge_player(db)


def test_resolve_trapping_options_scales_with_profession_count():
    one = resolve_trapping_options(["farmer"])
    assert one.tier_pools == {1: 15}
    assert all(item.tier == 1 for item in one.items)

    two = resolve_trapping_options(["farmer", "blacksmith"])
    assert two.tier_pools == {1: 30, 2: 15}

    three = resolve_trapping_options(["farmer", "blacksmith", "scribe"])
    assert three.tier_pools == {1: 45, 2: 30, 3: 8}


def test_resolve_trapping_options_rejects_unknown_profession():
    with pytest.raises(ValueError):
        resolve_trapping_options(["not_a_real_profession"])
