"""
Flows that move things between documents run in one transaction
(backend.players._in_transaction): racing requests never duplicate or lose
anything, and a failure halfway leaves everything where it was.

Real database (MONGODB_URI), real parallel requests (warm_pool).
"""

import asyncio

import pytest

from backend import players
from backend.character import Character
from backend.db import TransactionConflict
from backend.players import (
    CraftRefused,
    _new_instance,
    add_character,
    check_out_item_instance,
    get_or_create_player,
    move_storage_item_to_container,
    start_craft,
)

ADDRESS = "5TestTransactionFlows"
COLLECTIONS = (
    "characters", "player_characters", "player_vaults", "character_homes",
    "character_camp", "character_blueprints", "active_players",
)
REFUSED = (CraftRefused, TransactionConflict)


async def _purge(db) -> None:
    for name in COLLECTIONS:
        await db[name].delete_many({"address": ADDRESS})


@pytest.fixture
async def character_id(warm_pool):
    db = warm_pool
    await _purge(db)
    await get_or_create_player(ADDRESS)
    player = await add_character(ADDRESS, Character(first_name="Race", last_name="Test"))
    try:
        yield player.characters[-1]["id"]
    finally:
        await _purge(db)


async def _vault_items(db) -> list:
    return [i["instanceId"] for i in ((await db.player_vaults.find_one({"address": ADDRESS})) or {}).get("items", [])]


async def _home(db, character_id) -> dict:
    return (await db.character_homes.find_one({"address": ADDRESS, "characterId": character_id})) or {}


def _outcome(result):
    if isinstance(result, REFUSED) or result is None:
        return "refused"
    if isinstance(result, BaseException):
        raise result
    return "moved"


async def test_parallel_vault_to_home_moves_the_item_exactly_once(warm_pool, character_id):
    db = warm_pool
    for _ in range(3):
        shovel = _new_instance("shovel_1", "pool")
        await db.player_vaults.update_one(
            {"address": ADDRESS}, {"$set": {"items": [shovel], "itemBalances": {}}}, upsert=True
        )
        await db.character_homes.update_one(
            {"address": ADDRESS, "characterId": character_id}, {"$set": {"items": []}}, upsert=True
        )
        results = await asyncio.gather(
            *(check_out_item_instance(ADDRESS, character_id, shovel["instanceId"], "home") for _ in range(6)),
            return_exceptions=True,
        )
        assert [_outcome(r) for r in results].count("moved") == 1
        assert await _vault_items(db) == []
        assert [i["instanceId"] for i in (await _home(db, character_id))["items"]] == [shovel["instanceId"]]


async def test_a_failure_halfway_leaves_the_item_where_it_was(warm_pool, character_id, monkeypatch):
    # The item has already been pulled out of home storage when the write
    # putting it on the character fails - the pull must not stick.
    db = warm_pool
    bag = _new_instance("backpack_1", "body")
    bag["slotRef"] = ["Back"]
    await db.characters.update_one({"address": ADDRESS, "id": character_id}, {"$push": {"gear.items": bag}})
    shovel = _new_instance("shovel_1", "home")
    await db.character_homes.update_one(
        {"address": ADDRESS, "characterId": character_id}, {"$set": {"items": [shovel]}}, upsert=True
    )

    async def broken(*_args, **_kwargs):
        raise RuntimeError("connection dropped")

    monkeypatch.setattr(players, "find_one_and_update_checked", broken)
    with pytest.raises(RuntimeError):
        await move_storage_item_to_container(ADDRESS, character_id, shovel["instanceId"], "home", "backpack")
    monkeypatch.undo()

    assert [i["instanceId"] for i in (await _home(db, character_id))["items"]] == [shovel["instanceId"]]
    char = await db.characters.find_one({"address": ADDRESS, "id": character_id})
    assert shovel["instanceId"] not in [i["instanceId"] for i in char["gear"]["items"]]


async def test_parallel_craft_starts_take_materials_and_tool_once(warm_pool, character_id):
    # crowbar: anvil (an item at home) + 2 refined_ore. Six starts at once:
    # one craft, materials taken once, the anvil exactly once (borrowed).
    db = warm_pool
    anvil = _new_instance("anvil_1", "home")
    await db.character_homes.update_one(
        {"address": ADDRESS, "characterId": character_id},
        {"$set": {"items": [anvil], "itemBalances": {"refined_ore_1": 10}}},
        upsert=True,
    )
    results = await asyncio.gather(
        *(start_craft(ADDRESS, character_id, "crowbar", 1, count=1) for _ in range(6)),
        return_exceptions=True,
    )
    assert [_outcome(r) for r in results].count("moved") == 1

    home = await _home(db, character_id)
    char = await db.characters.find_one({"address": ADDRESS, "id": character_id})
    assert home["itemBalances"].get("refined_ore_1") == 8
    assert char["crafting"]["itemBalances"].get("refined_ore_1") == 2
    anvils = [i for i in home.get("items", []) + char["gear"]["items"] if i["instanceId"] == anvil["instanceId"]]
    assert len(anvils) == 1 and anvils[0]["location"] == "crafting"
    pc = await db.player_characters.find_one({"address": ADDRESS})
    entry = next(c for c in pc["characters"] if c["characterId"] == character_id)
    assert entry["status"].count("crafting") == 1


async def test_parallel_deletes_put_the_gear_in_the_vault_once(warm_pool, character_id):
    db = warm_pool
    shovel = _new_instance("shovel_1", "body")
    shovel["slotRef"] = ["Right Hand"]
    await db.characters.update_one({"address": ADDRESS, "id": character_id}, {"$push": {"gear.items": shovel}})
    await db.character_homes.update_one(
        {"address": ADDRESS, "characterId": character_id},
        {"$set": {"items": [], "itemBalances": {"wood_1": 7}}}, upsert=True,
    )
    results = await asyncio.gather(
        *(players.delete_character(ADDRESS, character_id) for _ in range(4)), return_exceptions=True
    )
    for result in results:
        if isinstance(result, BaseException) and not isinstance(result, TransactionConflict):
            raise result
    vault = await db.player_vaults.find_one({"address": ADDRESS})
    assert [i["instanceId"] for i in vault["items"]].count(shovel["instanceId"]) == 1
    assert vault["itemBalances"]["wood_1"] == 7
    assert await db.characters.find_one({"address": ADDRESS, "id": character_id}) is None


async def test_parallel_loads_never_duplicate_a_stack(warm_pool, character_id):
    db = warm_pool
    bag = _new_instance("backpack_1", "body")
    bag["slotRef"] = ["Back"]
    await db.characters.update_one({"address": ADDRESS, "id": character_id}, {"$push": {"gear.items": bag}})
    await db.character_homes.update_one(
        {"address": ADDRESS, "characterId": character_id},
        {"$set": {"items": [], "itemBalances": {"wood_1": 10}}}, upsert=True,
    )
    results = await asyncio.gather(
        *(players.load_balance_from_storage(ADDRESS, character_id, "wood_1", 4, "home", "backpack") for _ in range(6)),
        return_exceptions=True,
    )
    loaded = sum(1 for r in results if r is not None and not isinstance(r, BaseException))
    home = (await _home(db, character_id))["itemBalances"].get("wood_1", 0)
    char = await db.characters.find_one({"address": ADDRESS, "id": character_id})
    in_bag = char["gear"]["itemBalances"].get("backpack", {}).get("wood_1", 0)
    assert home + in_bag == 10 and home >= 0
    assert in_bag == 4 * loaded and loaded >= 1


async def test_parallel_collects_hand_out_the_craft_once(warm_pool, character_id):
    db = warm_pool
    anvil = _new_instance("anvil_1", "home")
    await db.character_homes.update_one(
        {"address": ADDRESS, "characterId": character_id},
        {"$set": {"items": [anvil], "itemBalances": {"refined_ore_1": 2}}}, upsert=True,
    )
    assert await start_craft(ADDRESS, character_id, "crowbar", 1, count=1) is not None
    await db.characters.update_one(
        {"address": ADDRESS, "id": character_id}, {"$set": {"crafting.activeCraft.readyAt": "2000-01-01T00:00:00+00:00"}}
    )
    results = await asyncio.gather(
        *(players.finish_craft(ADDRESS, character_id) for _ in range(4)), return_exceptions=True
    )
    assert [_outcome(r) for r in results].count("moved") == 1
    home_items = sorted(i["itemId"] for i in (await _home(db, character_id))["items"])
    assert home_items == ["anvil_1", "crowbar_1"]


async def test_a_collect_failing_halfway_keeps_the_trip_and_its_finds(warm_pool, monkeypatch):
    # The finds are already credited home when the night's damage fails to
    # apply - the trip must still be waiting, with nothing credited, and a
    # second collect must work.
    from datetime import datetime, timedelta, timezone

    from backend import condition, foraging
    from backend.character import ProfStats

    db = warm_pool
    await _purge(db)
    await db.soul_slots.delete_many({"address": ADDRESS})
    try:
        character = Character(first_name="Mira", slot_number=1, profession=ProfStats(
            profession_1="blacksmith", level_1=1, profession_2="none", profession_3="none"))
        await get_or_create_player(ADDRESS)
        await add_character(ADDRESS, character)
        cid = character.id
        await foraging.ensure_slot_pool(ADDRESS, 1, ["blacksmith", "none", "none"])
        state = await foraging.get_foraging_state(ADDRESS, cid)
        site = next(s for s in state["sites"] if s["familyId"] == "ore")
        await foraging.start_forage(ADDRESS, cid, site["mission"]["id"])
        past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        # An ore trip without light is dark: 6% of the time its accident
        # leaves the character lost (a hidden later returnAt) and collecting
        # is refused. Drop that, so the trip is always back.
        await db.characters.update_one({"address": ADDRESS, "id": cid},
                                       {"$set": {"foraging.activeForage.readyAt": past},
                                        "$unset": {"foraging.activeForage.returnAt": ""}})

        async def broken(*_args, **_kwargs):
            raise RuntimeError("connection dropped")

        monkeypatch.setattr(condition, "apply_loss", broken)
        with pytest.raises(RuntimeError):
            await foraging.finish_forage(ADDRESS, cid)
        monkeypatch.undo()

        char = await db.characters.find_one({"address": ADDRESS, "id": cid})
        assert char["foraging"]["activeForage"] is not None
        assert not (await _home(db, cid)).get("itemBalances", {}).get("ore_1")

        out = await foraging.finish_forage(ADDRESS, cid)
        assert (await _home(db, cid))["itemBalances"]["ore_1"] == out["result"]["found"]["ore_1"]
    finally:
        await _purge(db)
        await db.soul_slots.delete_many({"address": ADDRESS})
