"""
Trade market (backend.market): posting holds goods out of the home,
cancel/expiry give them back, accepting swaps both sides once - also when
several buyers (or a buyer and a cancel) race for the same offer - and goods
for a gone character reach the slot's new character or the vault.

Real database (MONGODB_URI), real parallel requests (warm_pool).
"""

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from backend import item_condition, market
from backend.character import Character
from backend.db import TransactionConflict
from backend.market import MarketRefused
from backend.players import _new_instance, add_character, delete_character, get_or_create_player

SELLER = "5TestMarketSeller"
BUYERS = ("5TestMarketBuyerA", "5TestMarketBuyerB", "5TestMarketBuyerC")
ADDRESSES = (SELLER, *BUYERS)
COLLECTIONS = (
    "characters", "player_characters", "player_vaults", "character_homes",
    "character_camp", "character_blueprints", "active_players",
)


async def _purge(db) -> None:
    for name in COLLECTIONS:
        await db[name].delete_many({"address": {"$in": list(ADDRESSES)}})
    await db.market_offers.delete_many({"sellerAddress": {"$in": list(ADDRESSES)}})


async def _new_character(address: str, slot: int, name: str = "Trader") -> str:
    await get_or_create_player(address)
    player = await add_character(address, Character(first_name=name, last_name="Test", slot_number=slot))
    return next(c["id"] for c in player.characters if c.get("slotNumber") == slot)


@pytest.fixture
async def chars(warm_pool):
    db = warm_pool
    await _purge(db)
    try:
        ids = {address: await _new_character(address, 1) for address in ADDRESSES}
        yield ids
    finally:
        await _purge(db)


async def _home(db, address, character_id) -> dict:
    return (await db.character_homes.find_one({"address": address, "characterId": character_id})) or {}


async def _stock(db, address, character_id, balances=None, items=None) -> None:
    update: dict = {}
    if balances:
        update["$inc"] = {f"itemBalances.{k}": v for k, v in balances.items()}
    if items:
        update["$push"] = {"items": {"$each": items}}
    await db.character_homes.update_one({"address": address, "characterId": character_id}, update, upsert=True)


def _instance(item_id: str, quality: int) -> dict:
    return {**_new_instance(item_id, "home"), "quality": quality}


async def _post(chars, balances=None, instance_ids=None, ask=None):
    return await market.create_offer(
        SELLER, chars[SELLER], instance_ids or [], balances or {}, ask or {"itemId": "ore_1", "qty": 1}
    )


async def test_post_holds_goods_and_cancel_returns_them(warm_pool, chars):
    db = warm_pool
    await _stock(db, SELLER, chars[SELLER], {"reed_1": 25})
    offer = await _post(chars, {"reed_1": 20})
    assert (await _home(db, SELLER, chars[SELLER]))["itemBalances"] == {"reed_1": 5}
    assert offer["give"]["balances"] == {"reed_1": 20}
    assert offer["ask"] == [{"itemId": "ore_1", "qty": 1, "minCondition": None}]

    assert await market.cancel_offer(SELLER, offer["id"]) is True
    assert (await _home(db, SELLER, chars[SELLER]))["itemBalances"] == {"reed_1": 25}
    doc = await db.market_offers.find_one({"_id": offer["id"]})
    assert doc["status"] == "cancelled" and doc.get("deleteAt") is None   # stays until the seller deletes it
    assert await market.cancel_offer(SELLER, offer["id"]) is None


async def test_accept_pays_with_a_higher_tier(warm_pool, chars):
    db = warm_pool
    buyer = BUYERS[0]
    await _stock(db, SELLER, chars[SELLER], {"reed_1": 20})
    await _stock(db, buyer, chars[buyer], {"ore_2": 3})
    offer = await _post(chars, {"reed_1": 20}, ask={"itemId": "ore_1", "qty": 2})

    assert await market.accept_offer(buyer, chars[buyer], offer["id"]) is True
    assert (await _home(db, buyer, chars[buyer]))["itemBalances"] == {"ore_2": 1, "reed_1": 20}
    assert (await _home(db, SELLER, chars[SELLER]))["itemBalances"] == {"ore_2": 2}
    doc = await db.market_offers.find_one({"_id": offer["id"]})
    assert doc["status"] == "taken" and doc["paid"]["balances"] == {"ore_2": 2}
    assert doc.get("deleteAt") is None                                     # stays until the seller deletes it
    assert await market.delete_closed_offer(SELLER, offer["id"]) is True


async def test_a_lower_tier_or_too_little_is_refused(warm_pool, chars):
    db = warm_pool
    buyer = BUYERS[0]
    await _stock(db, SELLER, chars[SELLER], {"reed_1": 20})
    await _stock(db, buyer, chars[buyer], {"ore_1": 5})
    offer = await _post(chars, {"reed_1": 20}, ask={"itemId": "ore_2", "qty": 1})
    with pytest.raises(MarketRefused):
        await market.accept_offer(buyer, chars[buyer], offer["id"])
    await market.cancel_offer(SELLER, offer["id"])
    offer = await _post(chars, {"reed_1": 20}, ask={"itemId": "ore_1", "qty": 6})
    with pytest.raises(MarketRefused):
        await market.accept_offer(buyer, chars[buyer], offer["id"])
    assert (await _home(db, buyer, chars[buyer]))["itemBalances"] == {"ore_1": 5}
    assert (await db.market_offers.find_one({"_id": offer["id"]}))["status"] == "open"


async def test_tracked_items_swap_and_respect_the_minimum_condition(warm_pool, chars):
    db = warm_pool
    buyer = BUYERS[0]
    given = _instance("shovel_1", item_condition.NEW)
    broken = _instance("shovel_1", item_condition.BROKEN)
    used_t2 = _instance("shovel_2", item_condition.USED)
    new_t3 = _instance("shovel_3", item_condition.NEW)
    await _stock(db, SELLER, chars[SELLER], items=[given])
    await _stock(db, buyer, chars[buyer], items=[broken, used_t2, new_t3])
    offer = await _post(chars, instance_ids=[given["instanceId"]],
                        ask={"itemId": "shovel_1", "qty": 1, "minCondition": item_condition.USED})
    assert (await _home(db, SELLER, chars[SELLER])).get("items") == []

    assert await market.accept_offer(buyer, chars[buyer], offer["id"]) is True
    buyer_iids = {i["instanceId"] for i in (await _home(db, buyer, chars[buyer]))["items"]}
    assert buyer_iids == {broken["instanceId"], new_t3["instanceId"], given["instanceId"]}
    seller_items = (await _home(db, SELLER, chars[SELLER]))["items"]
    assert [i["instanceId"] for i in seller_items] == [used_t2["instanceId"]]
    assert seller_items[0]["location"] == "home"


async def test_refusals(warm_pool, chars):
    db = warm_pool
    buyer = BUYERS[0]
    await _stock(db, SELLER, chars[SELLER], {"reed_1": 30})
    with pytest.raises(MarketRefused):
        await _post(chars, {"reed_1": 31})
    with pytest.raises(MarketRefused):
        await _post(chars, {"reed_1": 1}, ask={"itemId": "no_such_thing", "qty": 1})
    with pytest.raises(MarketRefused):
        await _post(chars, {})
    offer = await _post(chars, {"reed_1": 1})
    with pytest.raises(MarketRefused):
        await market.accept_offer(SELLER, chars[SELLER], offer["id"])

    await db.characters.update_one({"address": buyer, "id": chars[buyer]}, {"$set": {"availability.inAdventure": True}})
    await _stock(db, buyer, chars[buyer], {"ore_1": 1})
    with pytest.raises(MarketRefused):
        await market.accept_offer(buyer, chars[buyer], offer["id"])

    for _ in range(market.MAX_OPEN_OFFERS - 1):
        await _post(chars, {"reed_1": 1})
    with pytest.raises(MarketRefused):
        await _post(chars, {"reed_1": 1})
    assert (await _home(db, SELLER, chars[SELLER]))["itemBalances"] == {"reed_1": 30 - market.MAX_OPEN_OFFERS}


def _won(result) -> bool:
    if result is None or isinstance(result, (MarketRefused, TransactionConflict)):
        return False
    if isinstance(result, BaseException):
        raise result
    return result is True


async def test_parallel_buyers_only_one_gets_the_offer(warm_pool, chars):
    db = warm_pool
    await _stock(db, SELLER, chars[SELLER], {"reed_1": 20})
    for buyer in BUYERS:
        await _stock(db, buyer, chars[buyer], {"ore_1": 1})
    offer = await _post(chars, {"reed_1": 20})

    results = await asyncio.gather(
        *(market.accept_offer(b, chars[b], offer["id"]) for b in BUYERS), return_exceptions=True
    )
    assert sum(_won(r) for r in results) == 1
    homes = [await _home(db, b, chars[b]) for b in BUYERS]
    assert sum(h["itemBalances"].get("reed_1", 0) for h in homes) == 20
    assert sum(h["itemBalances"].get("ore_1", 0) for h in homes) == 2
    assert (await _home(db, SELLER, chars[SELLER]))["itemBalances"] == {"ore_1": 1}


async def test_cancel_and_accept_race_only_one_happens(warm_pool, chars):
    db = warm_pool
    buyer = BUYERS[0]
    for _ in range(3):
        await _stock(db, SELLER, chars[SELLER], {"reed_1": 20})
        await _stock(db, buyer, chars[buyer], {"ore_1": 1})
        offer = await _post(chars, {"reed_1": 20})
        results = await asyncio.gather(
            market.cancel_offer(SELLER, offer["id"]),
            market.accept_offer(buyer, chars[buyer], offer["id"]),
            return_exceptions=True,
        )
        assert sum(_won(r) for r in results) == 1
    seller = (await _home(db, SELLER, chars[SELLER]))["itemBalances"]
    bought = (await _home(db, buyer, chars[buyer]))["itemBalances"]
    assert seller.get("reed_1", 0) + bought.get("reed_1", 0) == 60
    assert seller.get("ore_1", 0) + bought.get("ore_1", 0) == 3


async def test_goods_for_a_gone_character_go_to_the_slot_then_the_vault(warm_pool, chars):
    db = warm_pool
    buyer = BUYERS[0]
    await _stock(db, SELLER, chars[SELLER], {"reed_1": 40})
    await _stock(db, buyer, chars[buyer], {"ore_1": 2})
    first = await _post(chars, {"reed_1": 20})
    second = await _post(chars, {"reed_1": 20})

    await delete_character(SELLER, chars[SELLER])
    successor = await _new_character(SELLER, 1, "Heir")
    assert await market.accept_offer(buyer, chars[buyer], first["id"]) is True
    assert (await _home(db, SELLER, successor))["itemBalances"] == {"ore_1": 1}

    await delete_character(SELLER, successor)
    vault_before = ((await db.player_vaults.find_one({"address": SELLER})) or {}).get("itemBalances", {})
    assert await market.accept_offer(buyer, chars[buyer], second["id"]) is True
    vault = (await db.player_vaults.find_one({"address": SELLER}))["itemBalances"]
    assert vault.get("ore_1", 0) == vault_before.get("ore_1", 0) + 1


async def test_expired_offer_cant_be_taken_and_sweep_returns_it(warm_pool, chars):
    db = warm_pool
    buyer = BUYERS[0]
    await _stock(db, SELLER, chars[SELLER], {"reed_1": 20})
    await _stock(db, buyer, chars[buyer], {"ore_1": 1})
    offer = await _post(chars, {"reed_1": 20})
    past = datetime.now(timezone.utc) - timedelta(minutes=1)
    await db.market_offers.update_one({"_id": offer["id"]}, {"$set": {"expiresAt": past}})

    assert await market.accept_offer(buyer, chars[buyer], offer["id"]) is None
    page = await market.list_offers(buyer)
    assert offer["id"] not in {o["id"] for o in page["offers"]}

    assert await market.sweep_expired(SELLER) == 1
    assert (await _home(db, SELLER, chars[SELLER]))["itemBalances"] == {"reed_1": 20}
    doc = await db.market_offers.find_one({"_id": offer["id"]})
    assert doc["status"] == "expired" and doc.get("deleteAt") is None      # stays until the seller deletes it
    assert await market.delete_closed_offer(SELLER, offer["id"]) is True
    assert await market.sweep_expired(SELLER) == 0


async def test_list_pages_newest_first_without_own_offers(warm_pool, chars):
    db = warm_pool
    buyer = BUYERS[0]
    await _stock(db, SELLER, chars[SELLER], {"reed_1": 5})
    posted = []
    for _ in range(5):
        posted.append((await _post(chars, {"reed_1": 1}))["id"])
        await asyncio.sleep(0.01)

    seen, after, pages = [], None, 0
    while True:
        page = await market.list_offers(buyer, family_id="reed", after=after, limit=3)
        pages += 1
        assert len(page["offers"]) <= 3
        seen += [o["id"] for o in page["offers"]]
        after = page["next"]
        if after is None:
            break
    ours = [i for i in seen if i in posted]
    assert ours == list(reversed(posted))
    assert pages >= 2
    assert all(o["id"] not in posted for o in (await market.list_offers(SELLER, family_id="reed"))["offers"])
    mine = await market.my_offers(SELLER)
    assert {o["id"] for o in mine} == set(posted) and all(o["mine"] for o in mine)


async def test_tier_filter_keeps_offers_giving_that_tier(warm_pool, chars):
    db = warm_pool
    buyer = BUYERS[0]
    await _stock(db, SELLER, chars[SELLER], {"reed_1": 1, "reed_3": 1})
    t1 = (await _post(chars, {"reed_1": 1}))["id"]
    t3 = (await _post(chars, {"reed_3": 1}))["id"]

    async def listed(tiers):
        page = await market.list_offers(buyer, family_id="reed", tiers=tiers)
        return {o["id"] for o in page["offers"]} & {t1, t3}

    assert await listed([3]) == {t3}
    assert await listed([1, 3]) == {t1, t3}
    assert await listed([2]) == set()
    assert await listed(None) == {t1, t3}


async def test_only_the_seller_deletes_only_a_closed_offer(warm_pool, chars):
    db = warm_pool
    await _stock(db, SELLER, chars[SELLER], {"reed_1": 2})
    offer = (await _post(chars, {"reed_1": 1}))["id"]
    assert await market.delete_closed_offer(SELLER, offer) is False      # still open
    await market.cancel_offer(SELLER, offer)
    assert await market.delete_closed_offer(BUYERS[0], offer) is False   # not theirs
    assert await market.delete_closed_offer(SELLER, offer) is True
    assert await db.market_offers.find_one({"_id": offer}) is None
    assert (await _home(db, SELLER, chars[SELLER]))["itemBalances"] == {"reed_1": 2}


async def test_cancelled_offers_count_until_deleted(warm_pool, chars):
    db = warm_pool
    await _stock(db, SELLER, chars[SELLER], {"reed_1": market.MAX_OPEN_OFFERS + 1})
    ids = [(await _post(chars, {"reed_1": 1}))["id"] for _ in range(market.MAX_OPEN_OFFERS)]
    await market.cancel_offer(SELLER, ids[0])
    with pytest.raises(MarketRefused):
        await _post(chars, {"reed_1": 1})                     # the cancelled one still counts
    assert await market.delete_closed_offer(SELLER, ids[0]) is True
    assert await _post(chars, {"reed_1": 1})                  # room again
