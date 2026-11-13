"""Your Legend: the change rules (backend/legend.py, data/legend-rules.json)
and writing a change straight into the character doc."""

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from backend import legend
from backend.character import Character
from backend.db import get_database
from backend.players import add_character, get_or_create_player

ADDRESS = "5TestLegendPlayer"


def test_a_pair_is_one_scale():
    start = {"mercy": 5}
    out = legend.apply_change(start, "cruelty", 8)
    assert out["mercy"] == 0 and out["cruelty"] == 3  # 5 worn down first
    assert start == {"mercy": 5}  # input untouched
    out = legend.apply_change(out, "mercy", 2)
    assert out["mercy"] == 0 and out["cruelty"] == 1
    out = legend.apply_change(out, "cruelty", -4)  # -= on one side
    assert out["mercy"] == 3 and out["cruelty"] == 0


def test_fame_and_infamy_pull_against_each_other():
    out = legend.apply_change({"fame": 20, "infamy": 10}, "infamy", 6)
    assert out["infamy"] == 16 and out["fame"] == 17  # fame -3 (half of 6)
    out = legend.apply_change(out, "infamy", -6)  # a fall doesn't pull
    assert out["infamy"] == 10 and out["fame"] == 17


def test_small_changes_keep_their_shares():
    # +1 still pulls half a point and echoes a quarter - nothing is rounded away
    out = legend.apply_change({"infamy": 4}, "fame", 1)
    assert out["fame"] == 1 and out["infamy"] == 3.5 and out["renown"] == 0.25
    out = legend.apply_changes({}, [("courage", 1)] * 4)
    assert out["courage"] == 4 and out["fame"] == 1  # 4 x 0.25
    assert out["renown"] == 0  # fame's echo doesn't fire again


def test_echoes_once_and_only_on_a_rise():
    out = legend.apply_change({}, "cruelty", 8)
    assert out["infamy"] == 2  # a quarter of 8
    assert out["renown"] == 0  # infamy's own echo doesn't fire
    out = legend.apply_change({"cruelty": 8}, "cruelty", -8)
    assert out["infamy"] == 0 and out["cruelty"] == 0


def test_values_stay_within_0_and_100():
    out = legend.apply_change({"faith": 95}, "faith", 20)
    assert out["faith"] == 100
    out = legend.apply_change({"heresy": 95}, "faith", -40)
    assert out["heresy"] == 100 and out["faith"] == 0
    out = legend.apply_change({}, "fame", -5)
    assert out["fame"] == 0


def test_float_noise_does_not_pile_up():
    out = legend.apply_changes({}, [("mercy", 0.1)] * 3)
    assert out["mercy"] == 0.3


def test_levels():
    assert [legend.level(v) for v in (0, 9.75, 10, 29.9, 30, 60, 89.99, 90, 100)] == [
        "none", "none", "whispered", "whispered", "known", "renowned", "renowned", "legendary", "legendary"]


def test_renown_fades_with_time_since_the_last_write():
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    stored = {"renown": 10, "mercy": 10}
    out = legend.decayed(stored, start.isoformat(), start + timedelta(days=7))
    assert out["renown"] == 9 and out["mercy"] == 10  # only renown fades
    out = legend.decayed(stored, start.isoformat(), start + timedelta(days=3.5))
    assert out["renown"] == 9.5  # smoothly, not in steps
    out = legend.decayed(stored, start.isoformat(), start + timedelta(days=7 * 50))
    assert out["renown"] == 0  # never below 0
    out = legend.decayed({"obscurity": 10}, start.isoformat(), start + timedelta(days=280))
    assert out["obscurity"] == 10  # obscurity doesn't grow or fade
    assert legend.decayed(stored, None)["renown"] == 10  # no clock yet: nothing faded


def test_unknown_name_is_refused():
    with pytest.raises(ValueError):
        legend.apply_change({}, "meta_mercy", 1)


async def _purge(db):
    for name in ("characters", "player_characters", "player_vaults", "character_homes",
                 "character_camp", "character_blueprints", "active_players"):
        await db[name].delete_many({"address": ADDRESS})


@pytest.mark.asyncio
async def test_change_goes_straight_into_the_character(mongodb_uri):
    db = get_database()
    await _purge(db)
    try:
        await get_or_create_player(ADDRESS)
        player = await add_character(ADDRESS, Character(first_name="Lore", slot_number=1))
        cid = player.characters[0]["id"]

        new = await legend.change_legend(ADDRESS, cid, [("mercy", 3)])
        assert new["mercy"] == 3
        # several at once lose none of them
        await asyncio.gather(*(legend.change_legend(ADDRESS, cid, [("mercy", 1)]) for _ in range(4)))
        doc = await db.characters.find_one({"address": ADDRESS, "id": cid})
        assert doc["legend"]["mercy"] == 7
        # several changes in one write
        new = await legend.change_legend(ADDRESS, cid, [("cruelty", 2), ("courage", 1)])
        assert new["mercy"] == 5 and new["courage"] == 1 and new["fame"] == 0.25
        assert await legend.change_legend(ADDRESS, "no-such-character", [("mercy", 1)]) is None

        # a write folds in what faded and restarts the clock, so nothing fades twice
        old = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        await db.characters.update_one(
            {"address": ADDRESS, "id": cid},
            {"$set": {"legend.renown": 10, "legendUpdatedAt": old}},
        )
        new = await legend.change_legend(ADDRESS, cid, [("mercy", 1)])
        assert 8.99 < new["renown"] <= 9
        doc = await db.characters.find_one({"address": ADDRESS, "id": cid})
        assert 8.99 < doc["legend"]["renown"] <= 9
        assert datetime.fromisoformat(doc["legendUpdatedAt"]) > datetime.now(timezone.utc) - timedelta(minutes=5)
    finally:
        await _purge(db)
