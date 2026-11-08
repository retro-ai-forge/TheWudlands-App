"""
Burn all / pack all / salvage all at home act only on what the storage grid showed
(backend.players.destroy_all_storage / move_all_storage_to_bags with a
selection) - tools and raw materials hidden behind a filter stay put.
Without a selection both still act on everything.
"""

import pytest

from backend.character import Character
from backend.db import get_database
from backend.players import (
    add_character,
    destroy_all_storage,
    get_or_create_player,
    move_all_storage_to_bags,
    preview_home_salvage,
    salvage_home,
)

TEST_ADDRESS = "5TestStorageBulkSelection"

_PLAYER_COLLECTIONS = (
    "characters",
    "player_characters",
    "player_vaults",
    "character_homes",
    "character_camp",
    "character_blueprints",
    "soul_slots",
)


async def _purge_player(db) -> None:
    for name in _PLAYER_COLLECTIONS:
        await db[name].delete_many({"address": TEST_ADDRESS})


def _instance(iid: str) -> dict:
    return {"instanceId": iid, "itemId": "test_thing", "familyId": "test_thing", "location": "home", "slotRef": [], "quality": 4}


async def _character_with_home(db, balances: dict, items: list) -> Character:
    await _purge_player(db)
    await get_or_create_player(TEST_ADDRESS)
    character = Character(first_name="Test", last_name="Hero")
    await add_character(TEST_ADDRESS, character)
    await db.character_homes.update_one(
        {"address": TEST_ADDRESS, "characterId": character.id},
        {"$set": {"itemBalances": balances, "items": items}},
        upsert=True,
    )
    return character


async def _home(db, character_id: str) -> dict:
    return await db.character_homes.find_one({"address": TEST_ADDRESS, "characterId": character_id}) or {}


@pytest.mark.asyncio
async def test_burn_all_with_selection_only_burns_what_was_shown(mongodb_uri):
    db = get_database()
    try:
        character = await _character_with_home(
            db, {"wood_1": 10, "hide_1": 5}, [_instance("a"), _instance("b")]
        )

        player = await destroy_all_storage(
            TEST_ADDRESS, character.id, "home", instance_ids=["a"], balances={"wood_1": 4}
        )

        assert player is not None
        home = await _home(db, character.id)
        assert [i["instanceId"] for i in home["items"]] == ["b"]
        assert home["itemBalances"] == {"wood_1": 6, "hide_1": 5}
    finally:
        await _purge_player(db)


@pytest.mark.asyncio
async def test_burn_all_caps_amount_and_skips_what_is_gone(mongodb_uri):
    db = get_database()
    try:
        character = await _character_with_home(db, {"wood_1": 3}, [_instance("a")])

        # More than held burns what is there; an id no longer there is ignored.
        player = await destroy_all_storage(
            TEST_ADDRESS, character.id, "home", instance_ids=["gone"], balances={"wood_1": 99, "hide_1": 2}
        )

        assert player is not None
        home = await _home(db, character.id)
        assert [i["instanceId"] for i in home["items"]] == ["a"]
        assert home["itemBalances"].get("wood_1", 0) == 0
    finally:
        await _purge_player(db)


@pytest.mark.asyncio
async def test_burn_all_with_empty_selection_burns_nothing(mongodb_uri):
    db = get_database()
    try:
        character = await _character_with_home(db, {"wood_1": 3}, [_instance("a")])

        player = await destroy_all_storage(TEST_ADDRESS, character.id, "home", instance_ids=[], balances={})

        assert player is None
        home = await _home(db, character.id)
        assert home["itemBalances"] == {"wood_1": 3}
        assert len(home["items"]) == 1
    finally:
        await _purge_player(db)


@pytest.mark.asyncio
async def test_burn_all_without_selection_burns_everything(mongodb_uri):
    db = get_database()
    try:
        character = await _character_with_home(db, {"wood_1": 3}, [_instance("a")])

        player = await destroy_all_storage(TEST_ADDRESS, character.id, "home")

        assert player is not None
        home = await _home(db, character.id)
        assert home["items"] == []
        assert not any(home["itemBalances"].values())
    finally:
        await _purge_player(db)


async def _wear_backpack(db, character_id: str) -> None:
    await db.characters.update_one(
        {"address": TEST_ADDRESS, "id": character_id},
        {"$push": {"gear.items": {
            "instanceId": "pack", "itemId": "backpack_3", "familyId": "backpack",
            "location": "body", "slotRef": ["Back"], "quality": 4,
        }}},
    )


@pytest.mark.asyncio
async def test_pack_all_with_selection_only_packs_what_was_shown(mongodb_uri):
    db = get_database()
    try:
        character = await _character_with_home(db, {"wood_1": 10, "hide_1": 5}, [])
        await _wear_backpack(db, character.id)

        result = await move_all_storage_to_bags(
            TEST_ADDRESS, character.id, "home", instance_ids=[], balances={"hide_1": 5, "wood_1": 4}
        )

        assert result
        doc = await db.characters.find_one({"address": TEST_ADDRESS, "id": character.id})
        assert doc["gear"]["itemBalances"]["backpack"] == {"hide_1": 5, "wood_1": 4}
        home = await _home(db, character.id)
        assert home["itemBalances"] == {"wood_1": 6}
    finally:
        await _purge_player(db)


@pytest.mark.asyncio
async def test_pack_all_with_empty_selection_packs_nothing(mongodb_uri):
    db = get_database()
    try:
        character = await _character_with_home(db, {"wood_1": 10}, [])
        await _wear_backpack(db, character.id)

        result = await move_all_storage_to_bags(TEST_ADDRESS, character.id, "home", instance_ids=[], balances={})

        assert result is None
        home = await _home(db, character.id)
        assert home["itemBalances"] == {"wood_1": 10}
    finally:
        await _purge_player(db)


# --- Salvage all (backend.players.preview_home_salvage / salvage_home) ---


@pytest.mark.asyncio
async def test_salvage_at_home_leaves_the_worn_backpack_alone(mongodb_uri):
    """Salvaging planks at home must not touch the planks in the worn
    backpack - they are neither shown nor salvaged."""
    db = get_database()
    try:
        character = await _character_with_home(db, {"plank_1": 3}, [])
        await _wear_backpack(db, character.id)
        await db.characters.update_one(
            {"address": TEST_ADDRESS, "id": character.id},
            {"$set": {"gear.itemBalances.backpack": {"plank_1": 2}}},
        )

        rows = await preview_home_salvage(TEST_ADDRESS, character.id)
        assert [row["id"] for row in rows] == ["plank_1"]

        player = await salvage_home(TEST_ADDRESS, character.id, ["plank_1"])

        assert player is not None
        doc = await db.characters.find_one({"address": TEST_ADDRESS, "id": character.id})
        assert doc["gear"]["itemBalances"]["backpack"] == {"plank_1": 2}
        home = await _home(db, character.id)
        assert home["itemBalances"].get("plank_1", 0) == 0
    finally:
        await _purge_player(db)


@pytest.mark.asyncio
async def test_salvage_a_stored_backpack_takes_its_contents_only_when_shown(mongodb_uri):
    """A backpack lying at home: its contents come along when the backpack
    is in the selection, and stay apart from the same item lying loose."""
    db = get_database()
    try:
        stored_pack = {
            "instanceId": "pack", "itemId": "backpack_1", "familyId": "backpack",
            "location": "home", "slotRef": [], "quality": 4,
        }
        character = await _character_with_home(db, {"plank_1": 3}, [stored_pack])
        await db.characters.update_one(
            {"address": TEST_ADDRESS, "id": character.id},
            {"$set": {"gear.itemBalances.backpack": {"plank_1": 2}}},
        )

        loose_only = await preview_home_salvage(TEST_ADDRESS, character.id, selected_ids=["plank_1"])
        assert [row["id"] for row in loose_only] == ["plank_1"]

        with_pack = await preview_home_salvage(TEST_ADDRESS, character.id, selected_ids=["pack"])
        assert sorted(row["id"] for row in with_pack) == ["backpack:plank_1", "pack"]

        await salvage_home(TEST_ADDRESS, character.id, ["plank_1"])
        doc = await db.characters.find_one({"address": TEST_ADDRESS, "id": character.id})
        assert doc["gear"]["itemBalances"]["backpack"] == {"plank_1": 2}
    finally:
        await _purge_player(db)
