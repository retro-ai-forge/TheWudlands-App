"""
find_one_and_update_checked (backend/db.py).

On Firestore with MongoDB compatibility a plain find_one_and_update can hand a
document back to callers whose write did not land (CLAUDE.md, "Firestore
note"). These tests race real concurrent requests against the database
(MONGODB_URI) and check that the helper names exactly the writes that landed.
"""

import asyncio

import pytest
from pymongo import ReturnDocument

from backend.db import WRITE_TOKEN_FIELD, find_one_and_update_checked

ADDRESS = "5TestCheckedUpdate"
KEY = {"address": ADDRESS, "id": "race"}
CALLERS = 12


@pytest.fixture
async def coll(warm_pool):
    db = warm_pool
    await db.characters.delete_many({"address": ADDRESS})
    try:
        yield db.characters
    finally:
        await db.characters.delete_many({"address": ADDRESS})


async def _race(coll, condition: dict, update: dict, start: dict):
    """CALLERS concurrent writes, each also appending its own number to `who`
    - so `who` lists exactly the writes that landed."""
    await coll.delete_many({"address": ADDRESS})
    await coll.insert_one({**KEY, "who": [], **start})
    results = await asyncio.gather(*(
        find_one_and_update_checked(
            coll,
            {**KEY, **condition},
            {**update, "$push": {"who": i}},
            return_document=ReturnDocument.AFTER,
        )
        for i in range(CALLERS)
    ))
    winners = [i for i, doc in enumerate(results) if doc is not None]
    stored = await coll.find_one(KEY)
    return results, winners, stored


async def test_one_winner_when_one_write_can_land(coll):
    for _ in range(3):
        results, winners, stored = await _race(coll, {"seq": 1}, {"$inc": {"seq": 1}}, {"seq": 1})
        assert len(winners) == 1
        assert stored["who"] == winners and stored["seq"] == 2
        won = results[winners[0]]
        assert won["seq"] == 2 and WRITE_TOKEN_FIELD not in won


async def test_every_winner_of_a_shared_guard_is_told(coll):
    for _ in range(3):
        _, winners, stored = await _race(
            coll, {"remaining": {"$gt": 0}}, {"$inc": {"remaining": -1}}, {"remaining": 3}
        )
        assert len(winners) == 3
        assert sorted(stored["who"]) == winners and stored["remaining"] == 0


async def test_every_unconditional_write_is_told(coll):
    _, winners, stored = await _race(coll, {}, {"$inc": {"n": 1}}, {"n": 0})
    assert winners == list(range(CALLERS))
    assert stored["n"] == CALLERS


async def test_no_match_is_none_and_the_callers_update_is_untouched(coll):
    await coll.insert_one({**KEY, "seq": 5})
    update = {"$set": {"seq": 6}}
    assert await find_one_and_update_checked(coll, {**KEY, "seq": 1}, update) is None
    assert update == {"$set": {"seq": 6}}  # no token added to the caller's dict
    won = await find_one_and_update_checked(coll, {**KEY, "seq": 5}, update)
    assert won["seq"] == 6 and update == {"$set": {"seq": 6}}


async def test_refuses_what_it_cannot_check(coll):
    with pytest.raises(ValueError):
        await find_one_and_update_checked(coll, KEY, {"$set": {"a": 1}}, return_document=ReturnDocument.BEFORE)
    with pytest.raises(ValueError):
        await find_one_and_update_checked(coll, KEY, {"$set": {"a": 1}}, projection={"a": 1})
    with pytest.raises(ValueError):
        await find_one_and_update_checked(coll, KEY, {"a": 1})  # a replacement, not operators
