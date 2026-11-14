"""
Food (backend/food.py, data/food-rules.json): rations are the adventure
provisions, preserved food is stored and eaten any time (3 points), fresh
dishes are eaten the moment they're collected (1 point, once a day).
"""

import json
import random
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from backend import condition, craft_catalog, food, items_catalog, players
from backend.character import AttributeStats, Character, ProfStats
from backend.db import get_database
from backend.players import CraftRefused, add_character, finish_craft, start_craft

ROOT = Path(__file__).resolve().parent.parent
_RECIPES = {r["familyId"]: r for r in json.loads((ROOT / "backend" / "data" / "craft-recipes.json").read_text())}


# ── Rules ─────────────────────────────────────────────────────────────────


def test_every_food_has_one_kind_and_heals_body_or_soul():
    food_families = {f for f, fam in items_catalog.ITEM_FAMILIES_BY_ID.items() if "food" in fam.kind}
    assert food_families == set(food.RATIONS) | set(food.PRESERVED) | set(food.FRESH)
    for family in set(food.PRESERVED) | set(food.FRESH):
        assert food.feeds(family) in ("body", "soul")
    assert food.feeds("iron_ration") is None and food.kind_of("iron_ration") == "ration"


def test_preserved_and_rations_need_a_blueprint_fresh_dishes_dont():
    for family in list(food.PRESERVED) + list(food.RATIONS):
        assert _RECIPES[family]["blueprintFamilyId"] == f"blueprint_{family}", family
        assert craft_catalog.blueprint_owners(f"blueprint_{family}"), family
    for family in food.FRESH:
        assert _RECIPES[family]["blueprintFamilyId"] is None, family


def test_a_fresh_dish_is_never_an_ingredient():
    for recipe in _RECIPES.values():
        for ingredient in recipe["ingredients"]:
            for option in ingredient.get("alternatives") or [ingredient]:
                assert option["familyId"] not in food.FRESH, (recipe["familyId"], option["familyId"])


def _raw(family: str, qty: int = 1) -> int:
    """Raw units down the whole chain, gutting with a dagger (no bone blade)."""
    recipe = _RECIPES.get(family)
    if recipe is None:
        return 0
    total = Counter()
    for ingredient in recipe["ingredients"]:
        option = (ingredient.get("alternatives") or [ingredient])[0]
        if option["familyId"] == "bone_blade":
            continue
        n = option.get("qty", ingredient.get("qty")) * qty
        total[option["familyId"]] += n if option["category"] == "raw" else 0
        if option["category"] != "raw":
            total["_"] += _raw(option["familyId"], n)
    return sum(total.values())


def test_everyday_food_is_cheapest_rations_most_expensive():
    fresh = [_raw(f) for f in food.FRESH]
    preserved = [_raw(f) for f in food.PRESERVED]
    rations = [_raw(f) for f in food.RATIONS]
    assert max(fresh) < min(preserved) and max(preserved) < min(rations)


def test_rations_need_several_trades():
    def owners(family):
        return set(craft_catalog.blueprint_owners(f"blueprint_{family}"))
    for ration in food.RATIONS:
        parts = [i["familyId"] for i in _RECIPES[ration]["ingredients"] if i["familyId"] in food.PRESERVED]
        trades = set().union(*(owners(p) for p in parts))
        assert len(trades) >= 2, (ration, trades)


def test_adventure_end_takes_all_preserved_food_and_rarely_a_ration():
    doc = {"gear": {"itemBalances": {"backpack": {"jerky_1": 2, "iron_ration_1": 1, "fiber_1": 5},
                                     "cart": {"fig_cake_2": 1}}}}
    unset, ration, provisions = food.adventure_end(doc, random.Random(0))
    assert set(unset) == {"gear.itemBalances.backpack.jerky_1", "gear.itemBalances.cart.fig_cake_2"}
    assert provisions == "ration"

    class Always:
        def random(self):
            return 0.0

    class Never:
        def random(self):
            return 0.99

    assert food.adventure_end(doc, Always())[1] == "gear.itemBalances.backpack.iron_ration_1"
    assert food.adventure_end(doc, Never())[1] is None
    assert food.adventure_end({"gear": {"itemBalances": {"backpack": {"smoked_fish_1": 1}}}})[2] == "preserved"
    assert food.adventure_end({})[2] == "none"


# ── Persisted (live DB) ────────────────────────────────────────────────

ADDRESS = "5TestFoodAddress"
_COLLECTIONS = ("characters", "player_characters", "player_vaults", "character_homes",
                "character_camp", "character_blueprints", "soul_slots", "adventure_log")


@pytest.fixture
async def db(mongodb_uri):
    db = get_database()
    for name in _COLLECTIONS:
        await db[name].delete_many({"address": ADDRESS})
    try:
        yield db
    finally:
        for name in _COLLECTIONS:
            await db[name].delete_many({"address": ADDRESS})


async def _make(db, lost: dict, home: dict | None = None, items: list | None = None) -> str:
    character = Character(first_name="Mira", slot_number=1,
                          attr=AttributeStats(might=3, agility=3, endurance=3, precision=3,
                                              will=3, insight=3, lore=3, presence=3),
                          profession=ProfStats(profession_1="cook", level_1=1))
    await add_character(ADDRESS, character)
    await db.characters.update_one({"address": ADDRESS, "id": character.id}, {"$set": {"attrLost": lost}})
    await db.character_homes.update_one(
        {"address": ADDRESS, "characterId": character.id},
        {"$set": {"itemBalances": home or {}, "items": items or []}}, upsert=True,
    )
    return character.id


async def _doc(db, cid):
    return await db.characters.find_one({"address": ADDRESS, "id": cid})


async def test_eating_preserved_food_heals_three_points_of_its_group(db):
    cid = await _make(db, {"migh": 3, "agil": 1, "will": 1}, home={"jerky_1": 2})
    meal = await food.eat_preserved(ADDRESS, cid, "jerky_1", "home")
    assert sum(meal["healed"].values()) == 3 and set(meal["healed"]) <= set(condition.BODY_ATTRS)
    doc = await _doc(db, cid)
    assert sum(doc["attrLost"].values()) == 2 and doc["attrLost"].get("will") == 1   # Soul untouched
    assert doc["meals"]["last"]["familyId"] == "jerky"
    home = await db.character_homes.find_one({"address": ADDRESS, "characterId": cid})
    assert home["itemBalances"]["jerky_1"] == 1


async def test_eating_is_refused_with_nothing_to_heal_or_out_of_reach(db):
    cid = await _make(db, {"will": 1}, home={"jerky_1": 1, "fig_cake_1": 1})
    with pytest.raises(food.FoodError, match="nothing to heal"):
        await food.eat_preserved(ADDRESS, cid, "jerky_1", "home")      # Body food, only Soul lost
    with pytest.raises(food.FoodError, match="can't reach"):
        await food.eat_preserved(ADDRESS, cid, "fig_cake_1", "camp")  # not resting on an adventure
    with pytest.raises(food.FoodError, match="Only preserved"):
        await food.eat_preserved(ADDRESS, cid, "iron_ration_1", "home")
    home = await db.character_homes.find_one({"address": ADDRESS, "characterId": cid})
    assert home["itemBalances"] == {"jerky_1": 1, "fig_cake_1": 1}            # nothing taken


async def _cook(db, cid, family):
    assert await start_craft(ADDRESS, cid, family, 1, count=1) is not None
    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {"crafting.activeCraft.readyAt": past}})
    assert await finish_craft(ADDRESS, cid) is not None


async def test_a_fresh_dish_is_eaten_on_collect_each_dish_once_a_day(db):
    oven = {"instanceId": "oven-1", "itemId": "oven_1", "familyId": "oven", "quality": 4,
            "location": "home", "slotRef": [], "createdAt": datetime.now(timezone.utc).isoformat()}
    cid = await _make(db, {"migh": 2}, home={"clean_fish_1": 4, "wood_1": 1}, items=[oven])
    with pytest.raises(CraftRefused, match="one at a time"):
        await start_craft(ADDRESS, cid, "cooked_fish", 1, count=2)
    await _cook(db, cid, "cooked_fish")

    home = await db.character_homes.find_one({"address": ADDRESS, "characterId": cid})
    assert not home.get("itemBalances", {}).get("cooked_fish_1")              # eaten, not stored
    doc = await _doc(db, cid)
    assert doc["attrLost"] == {"migh": 1}                                     # 1 Body point healed
    assert doc["meals"]["last"]["itemId"] == "cooked_fish_1" and doc["meals"]["freshAt"]["cooked_fish"]
    with pytest.raises(CraftRefused, match="this dish already today"):
        await start_craft(ADDRESS, cid, "cooked_fish", 1, count=1)       # the same dish: tomorrow
    await _cook(db, cid, "grilled_fish_skewer")                           # another dish: today
    assert (await _doc(db, cid))["meals"]["freshAt"].keys() == {"cooked_fish", "grilled_fish_skewer"}


async def test_a_real_adventure_ending_uses_up_carried_preserved_food(db, monkeypatch):
    from backend import adventures

    cid = await _make(db, {})
    monkeypatch.setattr(food, "RATION_LOSS_CHANCE", 1.0)
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {
        "availability.inAdventure": True,
        "availability.adventure": {"sessionId": "food-session", "storyId": "s", "title": "t"},
        "gear.itemBalances.backpack": {"jerky_1": 3, "iron_ration_1": 2, "fiber_1": 4},
    }})
    await db.adventure_log.update_one({"_id": "food-session"}, {"$set": {"address": ADDRESS}}, upsert=True)
    try:
        await adventures._release_character(db, ADDRESS, cid, "food-session", "finished", "s")
        bag = (await _doc(db, cid))["gear"]["itemBalances"]["backpack"]
        assert bag == {"iron_ration_1": 1, "fiber_1": 4}                      # jerky gone, one ration used
        log = await db.adventure_log.find_one({"_id": "food-session"})
        assert log["provisions"] == {cid: "ration"}
        # Repeating the release (a retried finish) takes nothing more.
        await adventures._release_character(db, ADDRESS, cid, "food-session", "finished", "s")
        assert (await _doc(db, cid))["gear"]["itemBalances"]["backpack"] == bag
    finally:
        await db.adventure_log.delete_one({"_id": "food-session"})
