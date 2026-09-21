"""
Exercises the permanent player/character storage in backend.players, and
confirms it's independent of the active_players registry - i.e. characters
survive logout / idle eviction, unlike the old design where they lived
inside the TTL-evicted active_players document.
"""

from datetime import datetime, timedelta, timezone

import pytest

from backend.active_players import add_active_player, remove_active_player
from backend.character import Character
from backend.db import get_database
from backend.players import add_character, finish_craft, get_or_create_player, get_player, start_craft

TEST_ADDRESS = "5TestPlayerAddress"
CRAFT_TEST_ADDRESS = "5TestCraftChainAddress"


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


async def _setup_craft_character(db, resources=None, tools=None, item_balances=None) -> str:
    """
    Fresh player + one character for the full-chain-auto-crafting tests
    below - seeds the PLAYER-level shared crafting pool (`crafting.
    resources`/`crafting.tools`) and vault.itemBalances start_craft draws
    the shortfall from, the same pools a real player's account would hold.
    Returns the new character's id.
    """
    await get_or_create_player(CRAFT_TEST_ADDRESS)
    player = await add_character(CRAFT_TEST_ADDRESS, Character(first_name="Crafter", last_name="Test"))
    character_id = player.characters[-1]["id"]
    await db.players.update_one(
        {"address": CRAFT_TEST_ADDRESS},
        {"$set": {
            "crafting.resources": resources or {},
            "crafting.tools": tools or {},
            "vault.itemBalances": item_balances or {},
        }},
    )
    return character_id


async def _force_craft_ready(db, character_id: str) -> None:
    """Backdates activeCraft.readyAt so finish_craft doesn't need a real sleep."""
    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    await db.players.update_one(
        {"address": CRAFT_TEST_ADDRESS, "characters.id": character_id},
        {"$set": {"characters.$.crafting.activeCraft.readyAt": past}},
    )


@pytest.mark.asyncio
async def test_craft_chain_auto_crafts_missing_intermediate_from_raw(mongodb_uri):
    # crowbar (tool: anvil, no blueprint) <- 2x refined_ore (processed, no
    # tool) <- 5x raw ore per refined_ore - a clean 2-level chain with no
    # processed material pre-owned, so the whole thing must be auto-crafted
    # from raw in one start_craft call.
    db = get_database()
    try:
        character_id = await _setup_craft_character(
            db, resources={"copper_ore": 100}, tools={"copper_anvil": 1}
        )
        result = await start_craft(CRAFT_TEST_ADDRESS, character_id, "crowbar", 1, count=1)
        assert result is not None
        character = result.characters[0]
        active = character["crafting"]["activeCraft"]
        assert active["familyId"] == "crowbar"
        assert active["count"] == 1
        chain = active["chain"]
        assert len(chain) == 1
        assert chain[0]["familyId"] == "refined_ore"
        assert chain[0]["count"] == 2
        # 600s: 300 (30 CRAFT_SECONDS_PER_RAW * tier 1 * 10 raw ore - 5 per
        # refined_ore * 2 needed) for the auto-crafted refined_ore step's
        # own direct-only time, PLUS 300 for crowbar's own step - crowbar
        # (the actually-requested item) always uses its full recursive
        # chain (2 refined_ore * 5 ore = 10, same 10-raw-material total),
        # added separately on top rather than replaced by a direct-only
        # calc - crowbar's own assembly time doesn't disappear just
        # because the refined_ore it needs got auto-crafted in the same
        # action instead of a separate one beforehand.
        ready_at = datetime.fromisoformat(active["readyAt"])
        started_at = ready_at - timedelta(seconds=600)
        assert abs((datetime.now(timezone.utc) - started_at).total_seconds()) < 5

        # 10 ore spent (5 per refined_ore * 2), pulled from the player pool
        # into the character's own staging area.
        refreshed = await db.players.find_one({"address": CRAFT_TEST_ADDRESS})
        assert refreshed["crafting"]["resources"].get("copper_ore", 0) == 90
        assert refreshed["crafting"]["tools"].get("copper_anvil", 0) == 0
        char_doc = next(c for c in refreshed["characters"] if c["id"] == character_id)
        assert char_doc["crafting"]["resources"].get("copper_ore", 0) == 10
        assert char_doc["crafting"]["tools"].get("copper_anvil", 0) == 1

        await _force_craft_ready(db, character_id)
        finished = await finish_craft(CRAFT_TEST_ADDRESS, character_id)
        assert finished is not None
        finished_char = finished.characters[0]
        assert finished_char["crafting"].get("activeCraft") is None
        # The anvil (never consumed, just borrowed) is back on the player.
        assert finished.crafting["tools"].get("copper_anvil", 0) == 1
        assert finished.vault["itemBalances"].get("crowbar_1", 0) == 1
    finally:
        await db.players.delete_one({"address": CRAFT_TEST_ADDRESS})


@pytest.mark.asyncio
async def test_craft_chain_skips_already_owned_processed_material(mongodb_uri):
    # Same crowbar/refined_ore pair, but with the processed intermediate
    # already fully owned - the chain collapses to just the top-level step
    # (no refined_ore step at all, and no ore touched), but crowbar's own
    # step still costs its usual full-chain-based time (see
    # _craft_final_duration_seconds) - owning the refined_ore saves the
    # smelting step, not the forging time crowbar's own assembly always
    # costs, matching a plain single-recipe craft's behavior from before
    # this feature existed.
    db = get_database()
    try:
        character_id = await _setup_craft_character(
            db, resources={"copper_refined_ore": 5}, tools={"copper_anvil": 1}
        )
        result = await start_craft(CRAFT_TEST_ADDRESS, character_id, "crowbar", 1, count=1)
        assert result is not None
        active = result.characters[0]["crafting"]["activeCraft"]
        assert active["chain"] == []
        ready_at = datetime.fromisoformat(active["readyAt"])
        started_at = ready_at - timedelta(seconds=300)
        assert abs((datetime.now(timezone.utc) - started_at).total_seconds()) < 5

        refreshed = await db.players.find_one({"address": CRAFT_TEST_ADDRESS})
        # 2 of the 5 pre-owned refined_ore pulled onto the character - none
        # manufactured, no ore touched at all.
        assert refreshed["crafting"]["resources"].get("copper_refined_ore", 0) == 3
        assert refreshed["crafting"]["resources"].get("copper_ore", 0) == 0
    finally:
        await db.players.delete_one({"address": CRAFT_TEST_ADDRESS})


@pytest.mark.asyncio
async def test_craft_chain_fails_atomically_on_missing_intermediate_tool(mongodb_uri):
    # beam (tool: workbench) <- 3x plank (processed) <- raw wood, but plank
    # itself needs an instance-tracked axe_stone/axe the player has none
    # of - the whole chain must fail outright (start_craft returns None),
    # with nothing staged, even though beam's own tool (workbench) IS
    # available.
    db = get_database()
    try:
        character_id = await _setup_craft_character(
            db, resources={"pine_wood": 100}, tools={"pine_workbench": 1}
        )
        result = await start_craft(CRAFT_TEST_ADDRESS, character_id, "beam", 1, count=1)
        assert result is None

        refreshed = await db.players.find_one({"address": CRAFT_TEST_ADDRESS})
        char_doc = next(c for c in refreshed["characters"] if c["id"] == character_id)
        assert char_doc["crafting"]["activeCraft"] is None
        assert refreshed["crafting"]["resources"].get("pine_wood", 0) == 100
        assert char_doc["crafting"]["resources"] == {}
    finally:
        await db.players.delete_one({"address": CRAFT_TEST_ADDRESS})


@pytest.mark.asyncio
async def test_craft_chain_multi_count_only_manufactures_the_shortfall(mongodb_uri):
    # count=3 crowbars need 6 refined_ore total; 2 already owned, so only
    # the remaining 4 should be auto-crafted (not 6, and not per-unit
    # double-credited for the 2 already on hand).
    db = get_database()
    try:
        character_id = await _setup_craft_character(
            db, resources={"copper_refined_ore": 2, "copper_ore": 100}, tools={"copper_anvil": 1}
        )
        result = await start_craft(CRAFT_TEST_ADDRESS, character_id, "crowbar", 1, count=3)
        assert result is not None
        active = result.characters[0]["crafting"]["activeCraft"]
        assert active["count"] == 3
        chain = active["chain"]
        assert len(chain) == 1
        assert chain[0]["familyId"] == "refined_ore"
        assert chain[0]["count"] == 4

        refreshed = await db.players.find_one({"address": CRAFT_TEST_ADDRESS})
        # 2 pre-owned refined_ore pulled as-is (no real vault decrement for
        # those - never really left the player's pool as a *transfer*, but
        # they DO move onto the character's own staging area) + 20 ore
        # spent making the other 4 (5 each).
        assert refreshed["crafting"]["resources"].get("copper_ore", 0) == 80
        assert refreshed["crafting"]["resources"].get("copper_refined_ore", 0) == 0
        char_doc = next(c for c in refreshed["characters"] if c["id"] == character_id)
        assert char_doc["crafting"]["resources"].get("copper_refined_ore", 0) == 2
        assert char_doc["crafting"]["resources"].get("copper_ore", 0) == 20
    finally:
        await db.players.delete_one({"address": CRAFT_TEST_ADDRESS})
