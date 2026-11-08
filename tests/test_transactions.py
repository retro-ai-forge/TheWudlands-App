"""
run_in_transaction (backend/db.py): flows that write several documents land
every write or none. Runs against the real database (MONGODB_URI) with real
parallel requests (warm_pool), like tests/test_checked_update.py.
"""

import asyncio

import pytest

from backend.db import TransactionConflict, in_transaction, run_in_transaction

ADDRESS = "5TestTransactions"
CHAR = {"address": ADDRESS, "id": "t"}
HOME = {"address": ADDRESS, "characterId": "t"}


@pytest.fixture
async def db(warm_pool):
    async def clean():
        await warm_pool.characters.delete_many({"address": ADDRESS})
        await warm_pool.character_homes.delete_many({"address": ADDRESS})

    await clean()
    try:
        yield warm_pool
    finally:
        await clean()


async def _seed(db, stock: int) -> None:
    await db.characters.insert_one({**CHAR, "got": []})
    await db.character_homes.insert_one({**HOME, "stock": stock})


def _take(db, i: int):
    """Moves one unit from home stock to the character - or refuses (None)."""
    async def flow():
        home = await db.character_homes.find_one(HOME)
        if home["stock"] <= 0:
            return None
        await db.character_homes.update_one(HOME, {"$inc": {"stock": -1}})
        await db.characters.update_one(CHAR, {"$push": {"got": i}})
        return True
    return flow


async def test_none_rolls_every_write_back(db):
    await _seed(db, 3)

    async def flow():
        await db.character_homes.update_one(HOME, {"$inc": {"stock": -1}})
        await db.characters.update_one(CHAR, {"$push": {"got": 1}})
        return None

    assert await run_in_transaction(flow) is None
    assert (await db.character_homes.find_one(HOME))["stock"] == 3
    assert (await db.characters.find_one(CHAR))["got"] == []


async def test_an_exception_rolls_back_and_is_raised_again(db):
    await _seed(db, 3)

    async def flow():
        await db.character_homes.update_one(HOME, {"$inc": {"stock": -1}})
        raise ValueError("refused")

    with pytest.raises(ValueError, match="refused"):
        await run_in_transaction(flow)
    assert (await db.character_homes.find_one(HOME))["stock"] == 3


async def test_reads_see_the_transactions_own_writes_and_calls_side_by_side_work(db):
    await _seed(db, 3)

    async def flow():
        assert in_transaction()
        await asyncio.gather(
            db.character_homes.update_one(HOME, {"$inc": {"stock": -1}}),
            db.characters.update_one(CHAR, {"$push": {"got": 1}}),
        )
        home, char = await asyncio.gather(db.character_homes.find_one(HOME), db.characters.find_one(CHAR))
        return home["stock"], char["got"]

    assert await run_in_transaction(flow) == (2, [1])
    assert not in_transaction()


async def test_cursors_side_by_side_inside_a_transaction(db):
    # What _build_player does inside character creation: several find()
    # cursors read in parallel (asyncio.gather) on the transaction's one
    # session. Without taking turns their replies got mixed up on the shared
    # connection (pymongo ProtocolError "Got response id ... but expected ...").
    await _seed(db, 3)

    async def rows(coll):
        return [doc async for doc in coll.find({"address": ADDRESS})]

    async def flow():
        await db.characters.update_one(CHAR, {"$push": {"got": 1}})
        results = []
        for _ in range(10):
            chars, homes, listed, more = await asyncio.gather(
                rows(db.characters), rows(db.character_homes),
                db.characters.find({"address": ADDRESS}).sort("id", 1).to_list(None),
                rows(db.character_homes),
            )
            results.append((chars[0]["got"], homes[0]["stock"], listed[0]["got"], more[0]["stock"]))
        return results

    assert await run_in_transaction(flow) == [([1], 3, [1], 3)] * 10


async def test_a_nested_call_joins_the_running_transaction(db):
    await _seed(db, 3)

    async def inner():
        await db.characters.update_one(CHAR, {"$push": {"got": 1}})
        return True

    async def outer():
        await db.character_homes.update_one(HOME, {"$inc": {"stock": -1}})
        assert await run_in_transaction(inner) is True
        return None  # rolls back the inner write too

    assert await run_in_transaction(outer) is None
    assert (await db.characters.find_one(CHAR))["got"] == []


async def test_parallel_moves_never_lose_or_duplicate_anything(db):
    # 12 requests at once each move one unit across two collections out of a
    # stock of 5: exactly the moves that landed are told so, and home stock
    # plus moved units always add up.
    for _ in range(3):
        await db.characters.delete_many({"address": ADDRESS})
        await db.character_homes.delete_many({"address": ADDRESS})
        await _seed(db, 5)
        results = await asyncio.gather(
            *(run_in_transaction(_take(db, i)) for i in range(12)), return_exceptions=True
        )
        assert all(r is True or r is None or isinstance(r, TransactionConflict) for r in results), results
        moved = sorted(i for i, r in enumerate(results) if r is True)
        stored = await db.characters.find_one(CHAR)
        stock = (await db.character_homes.find_one(HOME))["stock"]
        assert sorted(stored["got"]) == moved
        assert stock == 5 - len(moved)
        assert len(moved) == 5  # retries got everyone through: 5 moved, 7 refused
