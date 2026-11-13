"""
Exercises backend.foraging: the pool rules (fixed total split over unique
families with variation, decay formula, tier rolls by profession count) and
the slot-bound start -> finish flow against the test database.
"""

import json
import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from backend import condition, foraging, item_condition
from backend.character import Character, ProfStats
from backend.db import get_database
from backend.players import add_character, delete_character, get_single_character, set_in_adventure

ADDRESS = "5TestForagingAddress"
_COLLECTIONS = ("characters", "player_characters", "player_vaults", "character_homes",
                "character_camp", "character_blueprints", "soul_slots")
_FAMILIES = json.loads(
    (Path(__file__).resolve().parent.parent / "backend" / "data" / "profession-resource-families.json").read_text()
)


# ── Pure rules ──────────────────────────────────────────────────────────


@pytest.mark.parametrize("profs, total", [
    (["blacksmith"], 180),
    (["blacksmith", "armorer"], 216),          # same 3 families, boosted total
    (["blacksmith", "alchemist", "farmer"], 270),
])
def test_pool_total_is_exact_and_split_over_unique_families(profs, total):
    for seed in range(20):
        pool = foraging.roll_pool(profs, random.Random(seed))
        assert sum(pool.values()) == total
        assert list(pool) == foraging.profession_families(profs)
        even = total / len(pool)
        # +-30% variation before normalising - normalising can stretch it a little.
        assert all(0.55 * even <= n <= 1.45 * even for n in pool.values())


def test_pool_split_is_random():
    pools = {tuple(foraging.roll_pool(["blacksmith"], random.Random(s)).values()) for s in range(10)}
    assert len(pools) > 1


def test_reward_follows_half_life_formula():
    assert foraging.forage_reward(12, 0) == 12
    assert foraging.forage_reward(12, foraging.HALF_LIFE) == 6
    assert foraging.forage_reward(12, 2 * foraging.HALF_LIFE) == 3
    assert foraging.forage_reward(12, 100) == 0


def test_a_site_lasts_until_it_is_empty():
    assert not foraging.is_exhausted(50)
    assert foraging.is_exhausted(0)
    # However many trips it has seen, a site with something left gives 1.
    assert foraging.trip_amount(foraging.BASE_YIELD_MIN, 100, 50) == 1
    assert foraging.trip_amount(foraging.BASE_YIELD_MAX, 100, 50) == 1


def test_a_penalty_never_turns_a_trip_into_nothing():
    count = 12                                                      # last trip: floor(6 * 0.5**2.4) == 1
    assert not foraging.is_exhausted(50)
    assert foraging.forage_reward(foraging.BASE_YIELD_MIN, count, 0.5) == 0
    assert foraging.trip_amount(foraging.BASE_YIELD_MIN, count, 50, 0.5) == 1
    assert foraging.trip_amount(foraging.BASE_YIELD_MIN, count, 0, 0.5) == 0
    assert foraging.trip_amount(10, 0, 3, 2.0) == 3                 # capped by what's left


@pytest.mark.parametrize("count, allowed", [(1, {1}), (2, {1, 2}), (3, {1, 2, 3})])
def test_tiers_follow_profession_count(count, allowed):
    found = foraging.roll_tiers("ore", 500, count, random.Random(0))
    assert sum(found.values()) == 500
    assert {int(k.rsplit("_", 1)[1]) for k in found} == allowed


def test_every_group_has_missions_names_and_headline_for_each_family():
    for group, families in _FAMILIES.items():
        g = foraging.GROUPS[group]
        assert g["headline"]
        assert set(g["activities"]) == set(families)
        missions = [m for m in foraging.MISSIONS_BY_ID.values() if m.group == group]
        assert len(missions) >= 20
        assert {m.family_id for m in missions} == set(families)


def test_return_outcome_thresholds():
    assert foraging.return_outcome(60, 30, False) == "rich"
    assert foraging.return_outcome(60, 29, False) == "thin"   # more than half gone
    assert foraging.return_outcome(60, 50, True) == "depleted"


def test_return_message_fits_material_place_and_activity():
    msg = foraging.return_message("thin", "sand", "Mira", "the old riverbed", "Dredging", random.Random(0))
    assert "Mira" in msg and "the old riverbed" in msg
    msg = foraging.return_message("depleted", "ore", "Mira", "the old riverbed", "Prospecting", random.Random(1))
    assert msg.endswith(foraging.DEPLETED_HINT)
    assert msg[0].isupper()


def test_every_forageable_family_has_sentences_and_every_mission_a_place():
    families = {f for fams in _FAMILIES.values() for f in fams}
    for family in families:
        for outcome in ("rich", "thin", "depleted"):
            templates = foraging.MESSAGES_BY_FAMILY[family][outcome]
            assert len(templates) >= 2
            for t in templates:
                t.format(name="N", place="p", Place="P", activity="a")  # no unknown placeholders
    assert all(m.place for m in foraging.MISSIONS_BY_ID.values())


# ── Flow against the database ───────────────────────────────────────────


@pytest.fixture
async def db(mongodb_uri, monkeypatch):
    # Random extras (surprise finds, old gear) are off unless a test patches them in.
    monkeypatch.setattr(foraging, "roll_surprises", lambda rng=None: {})
    monkeypatch.setattr(foraging, "roll_old_gear", lambda family_id, rng=None: None)
    # Accidents in the dark too (rules "darkness").
    monkeypatch.setattr(foraging, "DARK_ACCIDENTS", ())
    # The gear bonus rounds down unless a test patches the draw (see foraging.dig).
    monkeypatch.setattr(foraging, "bonus_draw", lambda: 1.0)
    # Condition wear and stack losses are off too; a test sets the chance it checks to 1.
    for key in ("weapon", "item", "stackLoss"):
        monkeypatch.setitem(item_condition.FORAGING, key, 0.0)
    monkeypatch.setitem(item_condition.NIGHTS, "shelterLoss", 0.0)
    db = get_database()
    for name in _COLLECTIONS:
        await db[name].delete_many({"address": ADDRESS})
    try:
        yield db
    finally:
        for name in _COLLECTIONS:
            await db[name].delete_many({"address": ADDRESS})


async def _make(slot: int, *profs: str) -> str:
    padded = list(profs) + ["none"] * (3 - len(profs))
    character = Character(first_name="Mira", slot_number=slot, profession=ProfStats(
        profession_1=padded[0], level_1=1, profession_2=padded[1], profession_3=padded[2]))
    await add_character(ADDRESS, character)
    await foraging.ensure_slot_pool(ADDRESS, slot, padded)
    return character.id


async def _fast_forward(db, character_id: str) -> None:
    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    await db.characters.update_one({"address": ADDRESS, "id": character_id},
                                   {"$set": {"foraging.activeForage.readyAt": past}})


async def test_forage_round_trip_credits_vault_and_drains_pool(db):
    cid = await _make(1, "blacksmith")
    state = await foraging.get_foraging_state(ADDRESS, cid)
    assert {s["familyId"] for s in state["sites"]} == {"ore", "wood", "sand"}
    site = next(s for s in state["sites"] if s["familyId"] == "ore")

    state = await foraging.start_forage(ADDRESS, cid, site["mission"]["id"])
    assert state["activeForage"]["familyId"] == "ore"
    pc = await db.player_characters.find_one({"address": ADDRESS})
    assert "foraging" in pc["characters"][0]["status"]

    with pytest.raises(foraging.ForagingError):
        await foraging.finish_forage(ADDRESS, cid)  # not back yet
    await _fast_forward(db, cid)
    out = await foraging.finish_forage(ADDRESS, cid)

    found = out["result"]["found"]
    assert set(found) == {"ore_1"}  # one profession -> tier 1 only
    half = 1 - foraging.DARK_PENALTY                                 # ore without a light
    assert int(foraging.BASE_YIELD_MIN * half) <= out["result"]["total"] <= int(foraging.BASE_YIELD_MAX * half)
    home = await db.character_homes.find_one({"address": ADDRESS, "characterId": cid})
    assert home["itemBalances"]["ore_1"] == found["ore_1"]       # finds go home, not to the vault
    assert not ((await db.player_vaults.find_one({"address": ADDRESS})) or {}).get("itemBalances")
    ore = next(s for s in out["state"]["sites"] if s["familyId"] == "ore")
    assert ore["count"] == 1 and ore["remaining"] == ore["initial"] - found["ore_1"]
    assert out["state"]["activeForage"] is None
    assert out["result"]["outcome"] == "rich"
    assert site["mission"]["place"].lower() in out["result"]["message"].lower()

    with pytest.raises(foraging.ForagingError):
        await foraging.finish_forage(ADDRESS, cid)  # can't collect twice


async def test_foraging_blocks_adventure_and_double_start(db):
    cid = await _make(1, "blacksmith")
    mission = (await foraging.get_foraging_state(ADDRESS, cid))["sites"][0]["mission"]["id"]
    await foraging.start_forage(ADDRESS, cid, mission)
    with pytest.raises(foraging.ForagingError):
        await foraging.start_forage(ADDRESS, cid, mission)
    with pytest.raises(ValueError, match="foraging"):
        await set_in_adventure(ADDRESS, cid, True)


async def test_mission_outside_professions_is_refused(db):
    cid = await _make(1, "blacksmith")
    with pytest.raises(foraging.ForagingError):
        await foraging.start_forage(ADDRESS, cid, "alchemy_01")


async def test_pool_is_created_once_per_slot_and_inherited(db):
    first = await _make(2, "blacksmith")
    pool = await foraging.get_slot_pool(ADDRESS, 2)
    assert set(pool["families"]) == {"ore", "wood", "sand"}
    await db.soul_slots.update_one({"address": ADDRESS}, {"$set": {"forage_pools.2.families.ore.remaining": 7}})

    await delete_character(ADDRESS, first)
    second = await _make(2, "glassblower")  # sand, crystal, ore
    assert await foraging.get_slot_pool(ADDRESS, 2) == {**pool, "families": {
        **pool["families"], "ore": {**pool["families"]["ore"], "remaining": 7}}}

    state = await foraging.get_foraging_state(ADDRESS, second)
    # Only the inherited families this character's professions cover; no
    # crystal pool was ever created for this slot, wood lies dormant.
    assert {s["familyId"] for s in state["sites"]} == {"sand", "ore"}
    assert state["dormantFamilies"] == ["wood"]


async def test_exhausted_family_cannot_be_started(db):
    cid = await _make(1, "blacksmith")
    await db.soul_slots.update_one({"address": ADDRESS}, {"$set": {"forage_pools.1.families.ore.remaining": 0}})
    state = await foraging.get_foraging_state(ADDRESS, cid)
    assert "ore" not in {s["familyId"] for s in state["sites"]}  # no longer shown
    with pytest.raises(foraging.ForagingError):
        await foraging.start_forage(ADDRESS, cid, "craftweapon_01")  # nor startable


async def test_last_trip_says_depleted_and_hides_the_site(db):
    cid = await _make(1, "blacksmith")
    await db.soul_slots.update_one({"address": ADDRESS}, {"$set": {"forage_pools.1.families.ore.remaining": 1}})
    await foraging.start_forage(ADDRESS, cid, "craftweapon_01")
    await _fast_forward(db, cid)
    out = await foraging.finish_forage(ADDRESS, cid)
    assert out["result"]["total"] == 1
    assert out["result"]["outcome"] == "depleted"
    assert out["result"]["message"].endswith(foraging.DEPLETED_HINT)
    assert "Sword-Grave Hill" in out["result"]["message"] and "Mira" in out["result"]["message"]
    assert "ore" not in {s["familyId"] for s in out["state"]["sites"]}


# ── Gathering gear ──────────────────────────────────────────────────────


def test_gathering_file_splits_weapons_from_items():
    from backend import items_catalog
    for family, gear in foraging.GATHERING_GEAR.items():
        for w in gear["weapons"]:
            assert "weapon" in items_catalog.ITEM_FAMILIES_BY_ID[w].kind, (family, w)
        for i in gear["items"]:
            assert "weapon" not in items_catalog.ITEM_FAMILIES_BY_ID[i].kind, (family, i)


def _always(monkeypatch, *keys: str) -> None:
    """Make these foraging wear chances certain (item-conditions.json "foraging")."""
    for key in keys:
        monkeypatch.setitem(item_condition.FORAGING, key, 1.0)


def _instance(family: str, quality: int, location: str = "backpack", tier: int = 1) -> dict:
    return {"instanceId": f"{family}-{quality}-{location}", "itemId": f"{family}_{tier}", "familyId": family,
            "quality": quality, "location": location, "slotRef": []}


def test_gear_bonus_one_weapon_plus_each_item_scaled_by_tier():
    doc = {"gear": {
        "items": [_instance("pickaxe", 4, tier=3), _instance("warhammer", 4, "body"),
                  _instance("cart", 4, "cart", tier=2),
                  _instance("grappling_hook", 0), _instance("iron_spikes", 4, "home")],
        "itemBalances": {"backpack": {"hunters_charm_1": 1}},
    }}
    gear = foraging.gathering_gear(doc, "ore")
    assert gear["weapon"]["familyId"] == "pickaxe"             # only one weapon - the highest tier
    assert {i["familyId"] for i in gear["items"]} == {"cart", "hunters_charm"}  # broken + home don't count
    assert gear["dark"] is True                                 # no light on ore
    assert gear["percent"] == 45 + 8 + 5 - 50                   # T3 weapon, T2 cart, T1 charm, darkness
    assert foraging.gear_multiplier(gear) == pytest.approx(1.08)


def test_higher_tiers_always_add_more():
    w, i = foraging.WEAPON_BONUS_BY_TIER, foraging.ITEM_BONUS_BY_TIER
    assert [w[t] for t in range(1, 7)] == sorted(w[t] for t in range(1, 7))
    assert [i[t] for t in range(1, 7)] == sorted(i[t] for t in range(1, 7))
    assert len(set(w.values())) == 6 and len(set(i.values())) == 6
    light = foraging.LIGHT_BONUS_BY_TIER
    assert [light[t] for t in range(1, 7)] == sorted(light.values()) and len(set(light.values())) == 6


def test_basic_kit_matches_and_better_gear_beats_the_old_yield():
    old_average = 11
    base_average = (foraging.BASE_YIELD_MIN + foraging.BASE_YIELD_MAX) / 2
    w, i = foraging.WEAPON_BONUS_BY_TIER, foraging.ITEM_BONUS_BY_TIER
    assert base_average < old_average                              # no gear: less than before
    assert base_average * (1 + w[1] + 3 * i[1]) >= old_average      # T1 weapon + 3 T1 items: as before
    assert base_average * (1 + w[3] + 2 * i[3]) > old_average       # T3 kit: more


async def test_gear_boosts_yield_wears_and_breaks(db, monkeypatch):
    cid = await _make(1, "blacksmith")
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {
        "gear.items": [_instance("pickaxe", 4), _instance("cart", 1, "cart")],
        "gear.itemBalances.backpack": {"hunters_charm_1": 1},
    }})
    _always(monkeypatch, "weapon", "item")
    state = await foraging.get_foraging_state(ADDRESS, cid)
    ore = next(s for s in state["sites"] if s["familyId"] == "ore")
    assert ore["gear"]["percent"] == 25 + 5 + 5 - 50                # no light on ore
    assert ore["gear"]["dark"] is True

    monkeypatch.setattr(foraging.random, "randint", lambda a, b: 10)
    await foraging.start_forage(ADDRESS, cid, "craftweapon_01")
    await _fast_forward(db, cid)
    out = await foraging.finish_forage(ADDRESS, cid)

    assert out["result"]["total"] == 8                          # floor(10 * 0.85)
    assert out["result"]["gearPercent"] == -15
    assert len(out["result"]["broken"]) == 1                    # broken cart drops once more: gone
    doc = await db.characters.find_one({"address": ADDRESS, "id": cid})
    items = {i["familyId"]: i for i in doc["gear"]["items"]}
    assert items["pickaxe"]["quality"] == 3                     # new -> used, one level per trip
    worn = {w["name"]: w for w in out["result"]["gear"]}
    assert any(w["condition"] == "used" and w["wear"] == 1 for w in worn.values())
    assert "cart" not in items                                  # gone below broken
    assert doc["gear"]["itemBalances"]["backpack"]["hunters_charm_1"] == 1  # stack loss chance is 0


async def test_outcome_is_rolled_at_start_and_revealed_at_collect(db, monkeypatch):
    cid = await _make(1, "blacksmith")
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {"gear.items": [_instance("pickaxe", 4)]}})
    monkeypatch.setattr(foraging.random, "randint", lambda a, b: 10)
    _always(monkeypatch, "weapon")
    state = await foraging.start_forage(ADDRESS, cid, "craftweapon_01")

    # Wear and pool are settled already; the finds are hidden and not in the vault yet.
    doc = await db.characters.find_one({"address": ADDRESS, "id": cid})
    assert doc["gear"]["items"][0]["quality"] == 3               # already worn a level at start
    assert "result" not in state["activeForage"]
    assert "result" not in (await foraging.get_foraging_state(ADDRESS, cid))["activeForage"]
    full = await get_single_character(ADDRESS, cid)
    assert "result" not in full["foraging"]["activeForage"]
    assert not await db.character_homes.find_one({"address": ADDRESS, "characterId": cid})

    # Taking the pickaxe away mid-trip changes nothing any more.
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {"gear.items": []}})
    await _fast_forward(db, cid)
    out = await foraging.finish_forage(ADDRESS, cid)
    assert out["result"]["total"] == 7 and out["result"]["gearPercent"] == 25 - 50   # floor(10 * 0.75), no light
    home = await db.character_homes.find_one({"address": ADDRESS, "characterId": cid})
    assert sum(home["itemBalances"].values()) == 7


def test_bow_needs_quiver_and_arrows_crossbow_needs_girdle_and_bolts():
    bow = _instance("bow", 4, "body")
    alone = foraging.gathering_gear({"gear": {"items": [bow]}}, "meat")
    assert alone["weapon"] is None
    assert alone["blockedWeapons"][0]["missing"] == ["quiver", "arrow"]

    # Quiver plus arrows packed in the backpack.
    packed = {"gear": {"items": [bow, _instance("quiver", 4)], "itemBalances": {"backpack": {"arrow_1": 12}}}}
    assert foraging.gathering_gear(packed, "meat")["weapon"]["familyId"] == "bow"

    # Arrows equipped as a stack (quality None, a quantity) count too - but not an empty one.
    stack = {**_instance("arrow", 0, "body"), "quality": None, "quantity": 5}
    equipped = {"gear": {"items": [bow, _instance("quiver", 4, "body"), stack]}}
    assert foraging.gathering_gear(equipped, "meat")["weapon"]["familyId"] == "bow"
    empty = {"gear": {"items": [bow, _instance("quiver", 4, "body"), {**stack, "quantity": 0}]}}
    assert foraging.gathering_gear(empty, "meat")["weapon"] is None

    crossbow = _instance("crossbow", 4, "body")
    no_bolts = {"gear": {"items": [crossbow, _instance("bolt_girdle", 4)]}}
    assert foraging.gathering_gear(no_bolts, "meat")["blockedWeapons"][0]["missing"] == ["bolt"]
    ready = {"gear": {"items": [crossbow, _instance("bolt_girdle", 4)], "itemBalances": {"saddlepack": {"bolt_2": 3}}}}
    assert foraging.gathering_gear(ready, "meat")["weapon"]["familyId"] == "crossbow"


def test_other_weapon_counts_when_bow_is_not_ready():
    gear = foraging.gathering_gear({"gear": {"items": [_instance("bow", 4, tier=3), _instance("spear", 4)]}}, "meat")
    assert gear["weapon"]["familyId"] == "spear"


async def _bow_trip(db, monkeypatch, items: list, balances: dict) -> tuple[dict, dict]:
    cid = await _make(1, "hunter")
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {
        "gear.items": items, "gear.itemBalances.backpack": balances,
    }})
    monkeypatch.setattr(foraging.random, "randint", lambda a, b: 10)
    await foraging.start_forage(ADDRESS, cid, "rural_06")  # meat - bow T1: +25%
    await _fast_forward(db, cid)
    out = await foraging.finish_forage(ADDRESS, cid)
    return out["result"], await db.characters.find_one({"address": ADDRESS, "id": cid})


async def test_bow_shoots_one_arrow_per_unit_found(db, monkeypatch):
    _always(monkeypatch, "weapon")
    result, doc = await _bow_trip(db, monkeypatch,
                                  [_instance("bow", 4, "body"), _instance("quiver", 4, "body")],
                                  {"arrow_1": 20})
    assert result["total"] == 12                                # floor(10 * 1.25)
    assert result["ammoUsed"] == {"arrow_1": 12} and result["ammoShortfall"] == 0
    assert doc["gear"]["itemBalances"]["backpack"]["arrow_1"] == 8
    bow = next(i for i in doc["gear"]["items"] if i["familyId"] == "bow")
    assert bow["quality"] == 4                                  # arrows covered every find: no wear roll


async def test_missing_arrows_come_off_the_bow(db, monkeypatch):
    stack = {**_instance("arrow", 0, "body"), "quality": None, "quantity": 3}  # equipped, used first
    _always(monkeypatch, "weapon")
    result, doc = await _bow_trip(db, monkeypatch,
                                  [_instance("bow", 4, "body"), _instance("quiver", 4, "body"), stack],
                                  {"arrow_2": 5})
    assert result["ammoUsed"] == {"arrow_1": 3, "arrow_2": 5} and result["ammoShortfall"] == 4
    assert "arrow_2" not in doc["gear"]["itemBalances"]["backpack"]
    assert not any(i["familyId"] == "arrow" for i in doc["gear"]["items"])  # empty stack removed
    bow = next(i for i in doc["gear"]["items"] if i["familyId"] == "bow")
    assert bow["quality"] == 3                                  # finds the arrows didn't cover: the bow wore


# ── Ammo and wear by tier ───────────────────────────────────────────────


def _ammo(item_id: str, qty: int, order: int = 1) -> dict:
    return {"itemId": item_id, "tier": int(item_id.rsplit("_", 1)[1]), "left": qty, "had": qty, "order": order}


def test_arrows_only_cover_finds_of_their_tier_or_lower():
    pieces = [_ammo("arrow_1", 3), _ammo("arrow_3", 1)]
    used, uncovered = foraging.allocate_ammo(pieces, [2, 2, 1, 1, 1])
    # The T3 arrow takes one T2 find; nothing fits the other T2; T1 arrows take the T1 finds.
    assert used == {"arrow_3": 1, "arrow_1": 3}
    assert uncovered == [2]


def test_lowest_fitting_arrow_is_used_first_equipped_before_packed():
    pieces = [_ammo("arrow_2", 5, order=1), _ammo("arrow_1", 2, order=1), _ammo("arrow_1", 2, order=0)]
    used, uncovered = foraging.allocate_ammo(pieces, [1, 1, 1])
    assert used == {"arrow_1": 3} and uncovered == []
    assert pieces[2]["left"] == 0 and pieces[1]["left"] == 1 and pieces[0]["left"] == 5


async def test_gear_of_any_tier_wears_on_lower_tier_finds(db, monkeypatch):
    cid = await _make(1, "blacksmith")                              # 1 profession: T1 finds only
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {
        "gear.items": [_instance("pickaxe", 4, tier=2), _instance("cart", 4, "cart", tier=2),
                       _instance("grappling_hook", 4, tier=1)],
    }})
    monkeypatch.setattr(foraging.random, "randint", lambda a, b: 10)
    _always(monkeypatch, "weapon", "item")
    await foraging.start_forage(ADDRESS, cid, "craftweapon_01")
    items = {i["familyId"]: i for i in (await db.characters.find_one({"address": ADDRESS, "id": cid}))["gear"]["items"]}
    assert items["pickaxe"]["quality"] == 3                          # T2 weapon, T1 finds: wears all the same
    assert items["cart"]["quality"] == 3                             # T2 item too
    assert items["grappling_hook"]["quality"] == 3                   # T1 item: drops a level


async def test_bow_wears_for_uncovered_finds_below_its_tier(db, monkeypatch):
    # T1 finds, T2 bow, only 3 arrows: the finds the arrows left uncovered wear the bow, whatever its tier.
    stack = {**_instance("arrow", 0, "body"), "quality": None, "quantity": 3}
    _always(monkeypatch, "weapon")
    result, doc = await _bow_trip(db, monkeypatch,
                                  [_instance("bow", 4, "body", tier=2), _instance("quiver", 4, "body"), stack], {})
    assert result["ammoUsed"] == {"arrow_1": 3} and result["ammoShortfall"] == result["total"] - 3
    bow = next(i for i in doc["gear"]["items"] if i["familyId"] == "bow")
    assert bow["quality"] == 3


def test_highest_tier_then_most_worn_piece_is_used():
    doc = {"gear": {"items": [
        {**_instance("rope", 4), "instanceId": "rope-fresh"},
        {**_instance("rope", 2), "instanceId": "rope-worn"},
        {**_instance("rope", 1, tier=2), "instanceId": "rope-t2"},
        {**_instance("pickaxe", 4), "instanceId": "pick-fresh"},
        {**_instance("pickaxe", 3), "instanceId": "pick-worn"},
    ]}}
    reed = foraging.gathering_gear(doc, "reed")
    assert reed["items"][0]["instanceId"] == "rope-t2"            # higher tier wins even if almost broken
    del doc["gear"]["items"][2]
    assert foraging.gathering_gear(doc, "reed")["items"][0]["instanceId"] == "rope-worn"
    assert foraging.gathering_gear(doc, "ore")["weapon"]["instanceId"] == "pick-worn"


# ── Light (ore, crystal, clockwork) ────────────────────────────────────


def _lit(items: list, balances: dict) -> dict:
    return foraging.gathering_gear({"gear": {"items": items, "itemBalances": {"backpack": balances}}}, "ore")


def _light_of(gear: dict):
    return next((i for i in gear["items"] if i["familyId"] in foraging.LIGHT_SOURCES), None)


def test_light_needs_a_tinderbox():
    gear = _lit([], {"torch_1": 3})
    assert _light_of(gear) is None and gear["light"] is None
    assert gear["blockedLights"] == [{"name": gear["blockedLights"][0]["name"], "missing": ["tinderbox"]}]
    assert gear["dark"] is True and gear["percent"] == -50       # unlit: the ore is mined in the dark

    gear = _lit([], {"torch_1": 3, "tinderbox_1": 1})
    assert _light_of(gear)["familyId"] == "torch"
    assert gear["blockedLights"] == []
    assert gear["dark"] is False
    assert gear["percent"] == 25                   # a light counts like a weapon; the tinderbox only lights it
    assert gear["light"] == {"hours": 6}           # a T1 torch burns 2h


def test_burn_hours_come_from_the_table():
    assert foraging._burn_hours("torch", 1) == 2 and foraging._burn_hours("torch", 3) == 8
    assert foraging._burn_hours("candle", 1) == 1 and foraging._burn_hours("oil", 2) == 2
    assert foraging._burn_hours("glass_lantern", 3) == 4


def _supply(items: list, balances: dict) -> list:
    doc = {"gear": {"items": items, "itemBalances": {"backpack": balances}}}
    return foraging.light_supply(doc, "ore")[0]


def test_light_burns_oil_then_torches_then_candles_lowest_tier_first():
    lantern = _instance("glass_lantern", 4, tier=2)
    supply = _supply([lantern], {"tinderbox_1": 1, "candle_1": 5, "torch_3": 2, "torch_1": 1, "oil_2": 1, "oil_1": 3})
    assert [(u["itemId"], u["count"]) for u in supply] == [
        ("oil_1", 3), ("oil_2", 1), ("torch_1", 1), ("torch_3", 2), ("candle_1", 5)]
    # The site card shows the first light in line and everything's hours.
    gear = _lit([lantern], {"tinderbox_1": 1, "candle_1": 5, "torch_3": 2, "oil_1": 3})
    assert _light_of(gear)["fuel"]["itemId"] == "oil_1" and _light_of(gear)["instanceId"] == lantern["instanceId"]
    assert gear["light"] == {"hours": 3 * 1 + 2 * 8 + 5 * 1}

    # No oil: the lantern is left out and the torches come first.
    no_oil = _supply([lantern], {"tinderbox_1": 1, "torch_3": 2, "candle_1": 5})
    assert [u["itemId"] for u in no_oil] == ["torch_3", "candle_1"]


def test_lantern_burns_at_the_lower_tier_of_lantern_and_oil():
    lantern = _instance("glass_lantern", 4, tier=3)                        # a T3 lantern: 4h
    supply = _supply([lantern], {"tinderbox_1": 1, "oil_1": 4, "oil_2": 1, "oil_5": 1})
    assert [(u["itemId"], u["hours"], u["bonusTier"]) for u in supply] == [
        ("oil_1", 1, 1), ("oil_2", 2, 2), ("oil_5", 4, 3)]                  # T5 oil burns as T3


def test_the_best_light_that_burned_sets_the_bonus():
    supply = _supply([], {"tinderbox_1": 1, "torch_1": 3, "candle_2": 2})  # 6h of T1 torch, then 2h candles
    small = foraging.plan_trip(4, 0, 100, None, [], supply, None, "ore")    # 4 * 1.25 = 5 units: torches only
    assert small["burned"] == {"torch_1": 3} and small["amount"] == 5
    assert small["gear"]["percent"] == 25
    big = foraging.plan_trip(6, 0, 100, None, [], supply, None, "ore")      # needs the T2 candle -> +35%
    assert big["burned"] == {"torch_1": 3, "candle_2": 1} and big["amount"] == 8 and big["litUnits"] == 8
    assert big["gear"]["percent"] == 35 and not big["inDark"]


def test_ore_past_the_light_is_dug_in_the_dark():
    supply = _supply([], {"tinderbox_1": 1, "torch_1": 3})                 # 6h
    plan = foraging.plan_trip(10, 0, 100, None, [], supply, None, "ore")    # site 10, lit: 10 + 2 (+25%) = 12
    assert plan["litTarget"] == 12 and plan["litUnits"] == 6
    # 6 lit units came from 5 site units (5 * 1.25); the other 5 are dug in
    # the dark at -50%: 2, and only those 2 leave the site.
    assert plan["darkUnits"] == 2 and plan["amount"] == 8 and plan["taken"] == 5 + 2
    assert plan["inDark"] and plan["burned"] == {"torch_1": 3} and plan["lightHours"] == 6
    # Not on a material without darkness (clockwork): the rest is just dug
    # without the light's bonus.
    clockwork = foraging.light_supply({"gear": {"items": [], "itemBalances": {"backpack": {
        "tinderbox_1": 1, "torch_1": 3}}}}, "clockwork")[0]
    plan = foraging.plan_trip(10, 0, 100, None, [], clockwork, None, "clockwork")
    assert plan["litUnits"] == 6 and plan["amount"] == 6 + 5 and plan["taken"] == 10 and not plan["inDark"]


def test_the_gear_bonus_comes_on_top_and_never_leaves_the_site():
    pickaxe = {"instanceId": "p", "itemId": "pickaxe_3", "familyId": "pickaxe", "name": "Pickaxe",
               "quality": 4, "tier": 3}                                     # +45%
    supply = _supply([], {"tinderbox_1": 1, "torch_1": 20})                 # +25%, 40h
    plan = foraging.plan_trip(10, 0, 100, pickaxe, [], supply, None, "ore")
    assert plan["taken"] == 10 and plan["amount"] == 17                     # 10 from the site, +7 from the gear
    # Last trip on a nearly empty site: the site gives what's left, the gear still adds.
    plan = foraging.plan_trip(10, 0, 3, pickaxe, [], supply, None, "ore")
    assert plan["taken"] == 3 and plan["amount"] == 3 + math.floor(3 * 0.7)
    # A penalty shrinks the find, and only the smaller find leaves.
    plan = foraging.plan_trip(10, 0, 100, None, [], [], None, "ore")
    assert plan["taken"] == plan["amount"] == 5


def test_the_site_card_range_counts_the_light_running_short():
    doc = {"gear": {"items": [], "itemBalances": {"backpack": {"tinderbox_1": 1, "torch_1": 2}}}}  # 4h
    gear = foraging.gathering_gear(doc, "ore")
    low, high = foraging.planned_yield_range(doc, "ore", 0, 100, gear)
    # Lowest: site 6, lit 7 - 4 lit units (from 4 site units), the other 2 site units dark: 1.
    assert low == 4 + 1
    # Highest: site 10, lit 12 - 4 lit units, the other 6 site units dark: 3.
    assert high == 4 + 3


async def test_a_trip_burns_one_hour_of_light_per_unit(db, monkeypatch):
    cid = await _make(1, "blacksmith")
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {
        "gear.itemBalances.backpack": {"torch_2": 5, "tinderbox_1": 1},    # 5 x 4h
    }})
    monkeypatch.setattr(foraging.random, "randint", lambda a, b: 10)
    await foraging.start_forage(ADDRESS, cid, "craftweapon_01")  # ore
    await _fast_forward(db, cid)
    result = (await foraging.finish_forage(ADDRESS, cid))["result"]

    assert result["total"] == 13 and result["fromSite"] == 10               # 10 from the site, +3 (35%) on top
    slot = await db.soul_slots.find_one({"address": ADDRESS})
    ore = slot["forage_pools"]["1"]["families"]["ore"]
    assert ore["initial"] - ore["remaining"] == 10
    assert result["lightUsed"] == {"torch_2": 4} and result["lightHours"] == 16
    assert result["litUnits"] == 13 and result["darkUnits"] == 0 and result["accident"] is None
    assert result["gearPercent"] == round(foraging.LIGHT_BONUS_BY_TIER[2] * 100, 1)
    doc = await db.characters.find_one({"address": ADDRESS, "id": cid})
    assert doc["gear"]["itemBalances"]["backpack"] == {"torch_2": 1, "tinderbox_1": 1}


async def test_running_out_of_light_digs_the_rest_in_the_dark(db, monkeypatch):
    cid = await _make(1, "blacksmith")
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {
        "gear.itemBalances.backpack": {"torch_1": 3, "tinderbox_1": 1},    # 6h
    }})
    monkeypatch.setattr(foraging.random, "randint", lambda a, b: 10)
    monkeypatch.setattr(foraging, "DARK_ACCIDENTS", ({"severity": "minor", "chance": 1.0, "points": [1, 1]},))
    await foraging.start_forage(ADDRESS, cid, "craftweapon_01")
    await _fast_forward(db, cid)
    result = (await foraging.finish_forage(ADDRESS, cid))["result"]

    # Site 10, lit 12: 6 lit (from 5 site units), the other 5 site units in the dark: 2.
    assert result["litUnits"] == 6 and result["darkUnits"] == 2 and result["total"] == 8
    assert result["lightUsed"] == {"torch_1": 3}
    assert result["accident"]["severity"] == "minor"                        # the dark part rolls
    slot = await db.soul_slots.find_one({"address": ADDRESS})
    ore = slot["forage_pools"]["1"]["families"]["ore"]
    assert ore["initial"] - ore["remaining"] == result["fromSite"] == 5 + 2  # only what was dug leaves


async def test_trip_burns_oil_and_wears_the_lantern(db, monkeypatch):
    cid = await _make(1, "blacksmith")
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {
        "gear.items": [_instance("glass_lantern", 4, "body")],
        "gear.itemBalances.backpack": {"oil_1": 20, "tinderbox_1": 1},
    }})
    monkeypatch.setattr(foraging.random, "randint", lambda a, b: 10)
    _always(monkeypatch, "item")
    await foraging.start_forage(ADDRESS, cid, "craftweapon_01")
    await _fast_forward(db, cid)
    result = (await foraging.finish_forage(ADDRESS, cid))["result"]

    assert result["lightUsed"] == {"oil_1": 12}                             # 12 units, 1h per T1 oil
    doc = await db.characters.find_one({"address": ADDRESS, "id": cid})
    assert doc["gear"]["itemBalances"]["backpack"]["oil_1"] == 8
    assert doc["gear"]["items"][0]["quality"] == 3              # the lantern wears like any item
    assert doc["gear"]["itemBalances"]["backpack"]["tinderbox_1"] == 1   # stack loss chance is 0


# ── Companion charms ───────────────────────────────────────────────────


def _worn(family: str, slot: str, tier: int = 1, quality: int = 4) -> dict:
    return {**_instance(family, quality, "body", tier=tier), "slotRef": [slot]}


def test_charm_on_a_matching_companion_adds_its_bonus():
    doc = {"gear": {"items": [_worn("winged_companion", "Companion"), _worn("charm_flying", "Charm", tier=2)]}}
    gear = foraging.gathering_gear(doc, "feather")
    assert any(i["familyId"] == "charm_flying" for i in gear["items"])
    assert gear["percent"] == round(foraging.ITEM_BONUS_BY_TIER[2] * 100, 1)
    # Not a material that suits a winged companion: no bonus.
    assert foraging.gathering_gear(doc, "wood")["percent"] == 0


def test_charm_on_the_wrong_companion_or_in_the_pack_does_not_count():
    rat = {"gear": {"items": [_worn("critter_companion", "Companion"), _worn("charm_flying", "Charm")]}}
    gear = foraging.gathering_gear(rat, "feather")
    assert gear["percent"] == 0
    assert gear["blockedItems"][0]["missing"] == ["winged_companion"]

    packed = {"gear": {"items": [_worn("winged_companion", "Companion"), _instance("charm_flying", 4)]}}
    assert foraging.gathering_gear(packed, "feather")["percent"] == 0


async def test_charm_wears_like_any_item(db, monkeypatch):
    cid = await _make(1, "hunter")
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {
        "gear.items": [_worn("winged_companion", "Companion"), _worn("charm_flying", "Charm", quality=4)],
    }})
    monkeypatch.setattr(foraging.random, "randint", lambda a, b: 10)
    _always(monkeypatch, "item")
    await foraging.start_forage(ADDRESS, cid, "rural_06")  # meat
    await _fast_forward(db, cid)
    result = (await foraging.finish_forage(ADDRESS, cid))["result"]
    assert result["gearPercent"] == 5 and result["broken"] == []
    doc = await db.characters.find_one({"address": ADDRESS, "id": cid})
    charm = next(i for i in doc["gear"]["items"] if i["familyId"] == "charm_flying")
    assert charm["quality"] == 3                                # T1 finds: a T1 charm drops a level


# ── Surprise finds ─────────────────────────────────────────────────────


def test_surprise_bands_roll_separately_at_their_chances():
    rng = random.Random(11)
    low = high = 0
    runs = 20000
    for _ in range(runs):
        found = foraging.roll_surprises(rng)
        tiers = [foraging._tier(i) for i in found]
        low += any(t <= 3 for t in tiers)
        high += any(t >= 4 for t in tiers)
        for item_id, n in found.items():
            band = foraging.SURPRISES[0] if foraging._tier(item_id) <= 3 else foraging.SURPRISES[1]
            assert band["amount"][0] <= n <= band["amount"][1]
    low_band, high_band = foraging.SURPRISES                      # chances come from the rules
    assert low / runs == pytest.approx(low_band["chance"], abs=0.012)
    assert high / runs == pytest.approx(high_band["chance"], abs=0.012)


def test_surprise_can_be_any_family():
    rng = random.Random(5)
    families = set()
    for _ in range(20000):
        families |= {i.rsplit("_", 1)[0] for i in foraging.roll_surprises(rng)}
    assert len(families) >= 18                                   # of 21 raw families


def test_surprise_message_names_the_finds():
    text = foraging.surprise_message({"ore_1": 2, "crystal_5": 1}, "Mira", random.Random(0))
    assert "Mira" in text and "2 Copper Ore" in text and " and 1 " in text
    assert foraging.surprise_message({}, "Mira") is None
    # A rare (T4+) find opens with a lucky line; a common one doesn't.
    rare = foraging.surprise_message({"crystal_5": 1}, "Mira", random.Random(0))
    intros = [t.format(name="Mira") for t in foraging.SURPRISE_RARE_INTROS]
    assert any(rare.startswith(i) for i in intros)
    common = foraging.surprise_message({"ore_1": 2}, "Mira", random.Random(0))
    assert not any(common.startswith(i) for i in intros)


async def test_surprise_goes_home_without_draining_the_pool_or_wearing_gear(db, monkeypatch):
    cid = await _make(1, "blacksmith")
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {"gear.items": [_instance("pickaxe", 4)]}})
    monkeypatch.setattr(foraging.random, "randint", lambda a, b: 10)
    monkeypatch.setattr(foraging, "roll_surprises", lambda rng=None: {"crystal_5": 1})
    await foraging.start_forage(ADDRESS, cid, "craftweapon_01")  # ore
    await _fast_forward(db, cid)
    result = (await foraging.finish_forage(ADDRESS, cid))["result"]

    assert result["surprise"] == {"crystal_5": 1} and "crystal_5" not in result["found"]
    assert result["total"] == sum(result["found"].values())        # surprise not counted in the trip total
    home = await db.character_homes.find_one({"address": ADDRESS, "characterId": cid})
    assert home["itemBalances"]["crystal_5"] == 1
    doc = await db.characters.find_one({"address": ADDRESS, "id": cid})
    assert doc["gear"]["items"][0]["quality"] == 4              # wear chances are 0: untouched


# ── Old gear ───────────────────────────────────────────────────────────


def test_old_gear_rolls_at_its_chance_as_broken_t1_gear_of_the_material():
    rng = random.Random(3)
    runs, hits = 20000, 0
    allowed = {fam for fam, _, _ in foraging.old_gear_options("ore")}
    assert "pickaxe" in allowed and "torch" not in allowed and "iron_spikes" not in allowed  # stacks can't be damaged
    for _ in range(runs):
        old = foraging.roll_old_gear("ore", rng)
        if old is None:
            continue
        hits += 1
        assert old["familyId"] in allowed and old["itemId"].endswith("_1")
        assert old["quality"] == item_condition.BROKEN and old["condition"] == "broken"
    assert hits / runs == pytest.approx(foraging.OLD_GEAR["chance"], abs=0.012)


def test_old_gear_message_names_the_piece():
    old = {"name": "Stone Pickaxe"}
    assert "Stone Pickaxe" in foraging.old_gear_message(old, "Mira", random.Random(0))
    assert foraging.old_gear_message(None, "Mira") is None
    for t in foraging.OLD_GEAR_MESSAGES:
        t.format(name="N", item="I")


async def test_old_gear_goes_home_as_a_broken_instance(db, monkeypatch):
    cid = await _make(1, "blacksmith")
    old = {"instanceId": "old-1", "itemId": "pickaxe_1", "familyId": "pickaxe",
           "name": "Pickaxe", "quality": 1, "condition": "broken"}
    monkeypatch.setattr(foraging, "roll_old_gear", lambda family_id, rng=None: old)
    await foraging.start_forage(ADDRESS, cid, "craftweapon_01")  # ore
    await _fast_forward(db, cid)
    result = (await foraging.finish_forage(ADDRESS, cid))["result"]

    assert result["oldGear"] == old and result["oldGearMessage"]
    home = await db.character_homes.find_one({"address": ADDRESS, "characterId": cid})
    piece = next(i for i in home["items"] if i["instanceId"] == "old-1")
    assert piece["quality"] == 1 and piece["location"] == "home"


# ── Condition: stacked items and shelter ───────────────────────────────


async def test_stacked_gathering_item_may_be_used_up(db, monkeypatch):
    cid = await _make(1, "blacksmith")
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {
        "gear.itemBalances.backpack": {"iron_spikes_1": 2}}})
    _always(monkeypatch, "stackLoss")
    monkeypatch.setattr(foraging.random, "randint", lambda a, b: 10)
    await foraging.start_forage(ADDRESS, cid, "craftweapon_01")   # ore: iron spikes help
    await _fast_forward(db, cid)
    result = (await foraging.finish_forage(ADDRESS, cid))["result"]
    doc = await db.characters.find_one({"address": ADDRESS, "id": cid})
    assert doc["gear"]["itemBalances"]["backpack"]["iron_spikes_1"] == 1
    assert len(result["broken"]) == 1


async def test_a_night_may_wear_out_the_bedroll(db, monkeypatch):
    cid = await _make(1, "blacksmith")
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {
        "gear.itemBalances.backpack": {"bedroll_1": 1}}})
    monkeypatch.setitem(item_condition.NIGHTS, "shelterLoss", 1.0)
    await foraging.start_forage(ADDRESS, cid, "craftweapon_01")
    doc = await db.characters.find_one({"address": ADDRESS, "id": cid})
    assert "bedroll_1" not in (doc["gear"]["itemBalances"].get("backpack") or {})
    assert doc["foraging"]["activeForage"]["result"]["night"]["shelter"] == ["bedroll"]   # it still sheltered that night


# ── Darkness (ore without a light) ─────────────────────────────────────


def test_ore_and_crystal_are_dark():
    empty = {"gear": {"items": [], "itemBalances": {}}}
    for family in ("ore", "crystal"):
        gear = foraging.gathering_gear(empty, family)
        assert gear["dark"] is True and gear["percent"] == -50
    for family in ("clockwork", "wood"):
        gear = foraging.gathering_gear(empty, family)
        assert gear["dark"] is False and gear["percent"] == 0


async def test_ore_in_the_dark_finds_half_and_the_site_loses_only_that(db, monkeypatch):
    cid = await _make(1, "blacksmith")
    monkeypatch.setattr(foraging.random, "randint", lambda a, b: 10)
    before = (await foraging.get_slot_pool(ADDRESS, 1))["families"]["ore"]["remaining"]
    await foraging.start_forage(ADDRESS, cid, "craftweapon_01")
    await _fast_forward(db, cid)
    out = await foraging.finish_forage(ADDRESS, cid)
    assert out["result"]["total"] == 5                          # floor(10 * 0.5)
    after = (await foraging.get_slot_pool(ADDRESS, 1))["families"]["ore"]["remaining"]
    assert before - after == 5


async def test_an_accident_in_the_dark_costs_body_points_on_collect(db, monkeypatch):
    cid = await _make(1, "blacksmith")
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {
        "attr": {k: 5 for k in condition.ATTR_KEYS}, "attrLost": {}}})
    monkeypatch.setattr(foraging, "DARK_ACCIDENTS",
                        ({"severity": "serious", "chance": 1.0, "points": [3, 3]},))
    monkeypatch.setattr(foraging, "roll_trip_night", lambda doc, family_id=None, rng=None: {
        "weather": "warm", "points": {}, "kind": "calm", "shelter": [], "message": "calm"})
    await foraging.start_forage(ADDRESS, cid, "craftweapon_01")
    await _fast_forward(db, cid)
    result = (await foraging.finish_forage(ADDRESS, cid))["result"]

    assert result["accident"]["severity"] == "serious" and result["accident"]["message"]
    assert sum(result["accident"]["lost"].values()) == 3
    assert all(k in condition.BODY_ATTRS for k in result["accident"]["lost"])
    doc = await db.characters.find_one({"address": ADDRESS, "id": cid})
    assert sum(doc["attrLost"].values()) == 3


async def test_no_accident_with_a_light(db, monkeypatch):
    cid = await _make(1, "blacksmith")
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {
        "gear.itemBalances.backpack": {"torch_1": 10, "tinderbox_1": 1}}})
    monkeypatch.setattr(foraging.random, "randint", lambda a, b: 10)
    monkeypatch.setattr(foraging, "DARK_ACCIDENTS",
                        ({"severity": "hardcore", "chance": 1.0, "points": [10, 10]},))
    await foraging.start_forage(ADDRESS, cid, "craftweapon_01")
    await _fast_forward(db, cid)
    result = (await foraging.finish_forage(ADDRESS, cid))["result"]
    assert result["accident"] is None and result["lightUsed"] == {"torch_1": 6}   # 12 units, 2h a torch


def test_a_lost_band_adds_days_and_a_soul_point_per_day(monkeypatch):
    monkeypatch.setattr(foraging, "DARK_ACCIDENTS",
                        ({"severity": "serious", "chance": 1.0, "points": [3, 3], "lostDays": [1, 7]},))
    for seed in range(30):
        accident = foraging.roll_dark_accident({"firstName": "Mira"}, random.Random(seed))
        assert 1 <= accident["lostDays"] <= 7
        assert sum(accident["lostPoints"].values()) == accident["lostDays"] * foraging.DARK_LOST_PER_DAY
        assert all(k in condition.SOUL_ATTRS for k in accident["lostPoints"])
        assert all(k in condition.BODY_ATTRS for k in accident["points"])
        assert "day" in accident["message"]


def test_the_shipped_serious_and_hardcore_bands_get_lost():
    bands = {b["severity"]: b for b in foraging.RULES["darkness"]["accidents"]}
    assert bands["serious"]["lostDays"] == [1, 7] and bands["hardcore"]["lostDays"] == [1, 7]
    assert "lostDays" not in bands["minor"]


def test_public_pc_entry_hides_the_real_return():
    now = datetime.now(timezone.utc)
    entry = {"characterId": "c", "status": ["free", "foraging"],
             "timers": {"foragingReadyAt": (now + timedelta(hours=1)).isoformat(),
                        "foragingReturnAt": (now + timedelta(days=3)).isoformat()}}
    out = foraging.public_pc_entry(entry, now)
    assert out["status"] == ["free", "foraging"] and "foragingReturnAt" not in out["timers"]
    out = foraging.public_pc_entry(entry, now + timedelta(hours=2))
    assert out["status"] == ["free", "lost"] and out["timers"] == {}
    out = foraging.public_pc_entry(entry, now + timedelta(days=4))
    assert out["status"] == ["free", "foraging"] and set(out["timers"]) == {"foragingReadyAt"}


async def test_lost_in_the_dark_keeps_the_character_away_and_secret(db, monkeypatch):
    cid = await _make(1, "blacksmith")
    # An older wound, healing until the trip starts.
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {
        "attr": {k: 5 for k in condition.ATTR_KEYS}, "attrLost": {"migh": 1},
        "healFrom": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()}})
    monkeypatch.setattr(foraging, "DARK_ACCIDENTS",
                        ({"severity": "serious", "chance": 1.0, "points": [3, 3], "lostDays": [4, 4]},))
    monkeypatch.setattr(foraging, "roll_trip_night", lambda doc, family_id=None, rng=None: {
        "weather": "warm", "points": {}, "kind": "calm", "shelter": [], "message": "calm"})
    state = await foraging.start_forage(ADDRESS, cid, "craftweapon_01")
    active = state["activeForage"]
    assert "returnAt" not in active and "result" not in active and not active.get("lost")

    doc = await db.characters.find_one({"address": ADDRESS, "id": cid})
    stored = doc["foraging"]["activeForage"]
    ready = datetime.fromisoformat(stored["readyAt"])
    assert datetime.fromisoformat(stored["returnAt"]) - ready == timedelta(days=4)
    pc = await db.player_characters.find_one({"address": ADDRESS})
    pc_entry = next(e for e in pc["characters"] if e["characterId"] == cid)
    assert pc_entry["timers"]["foragingReturnAt"] == stored["returnAt"]

    # Past the planned return: lost - nothing to collect, no real date shown.
    await _fast_forward(db, cid)
    state = await foraging.get_foraging_state(ADDRESS, cid)
    assert state["activeForage"]["lost"] is True and "returnAt" not in state["activeForage"]
    with pytest.raises(foraging.ForagingError, match="lost"):
        await foraging.finish_forage(ADDRESS, cid)
    char = await get_single_character(ADDRESS, cid)
    assert char["foraging"]["activeForage"]["lost"] is True
    assert "returnAt" not in char["foraging"]["activeForage"]
    doc = await db.characters.find_one({"address": ADDRESS, "id": cid})
    assert foraging.forage_active(doc)
    # No healing while lost: the clock stopped when the trip began and
    # nothing restarts it before the collect.
    assert doc["healFrom"] is None and condition.is_busy(doc)
    assert char["nextHealAt"] is None and char["attrLost"] == {"migh": 1}

    # Back at last: the accident's Body points plus a Soul point per day.
    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    await db.characters.update_one({"address": ADDRESS, "id": cid},
                                   {"$set": {"foraging.activeForage.returnAt": past}})
    result = (await foraging.finish_forage(ADDRESS, cid))["result"]
    lost = result["accident"]["lost"]
    assert result["accident"]["lostDays"] == 4
    assert sum(v for k, v in lost.items() if k in condition.BODY_ATTRS) == 3
    assert sum(v for k, v in lost.items() if k in condition.SOUL_ATTRS) == 4
    doc = await db.characters.find_one({"address": ADDRESS, "id": cid})
    assert sum(doc["attrLost"].values()) == 1 + 3 + 4
    assert datetime.now(timezone.utc) - datetime.fromisoformat(doc["healFrom"]) < timedelta(minutes=1)
    pc = await db.player_characters.find_one({"address": ADDRESS})
    pc_entry = next(e for e in pc["characters"] if e["characterId"] == cid)
    assert "foragingReturnAt" not in pc_entry.get("timers", {}) and "foraging" not in pc_entry["status"]


async def test_a_worn_out_site_stays_open_while_it_holds_something(db):
    cid = await _make(1, "blacksmith")
    await db.soul_slots.update_one({"address": ADDRESS}, {"$set": {
        "forage_pools.1.families.ore.count": 40, "forage_pools.1.families.ore.remaining": 5}})
    state = await foraging.get_foraging_state(ADDRESS, cid)
    ore = next(s for s in state["sites"] if s["familyId"] == "ore")
    assert (ore["yieldMin"], ore["yieldMax"]) == (1, 1)
    await foraging.start_forage(ADDRESS, cid, "craftweapon_01")
    await _fast_forward(db, cid)
    out = await foraging.finish_forage(ADDRESS, cid)
    assert out["result"]["total"] == 1 and out["result"]["outcome"] != "depleted"


async def test_forgetting_a_site_drops_what_it_holds_for_the_slot(db):
    cid = await _make(1, "blacksmith")
    slot = await db.soul_slots.find_one({"address": ADDRESS})
    held = slot["forage_pools"]["1"]["families"]["ore"]["remaining"]
    state = await foraging.forget_site(ADDRESS, cid, "ore")
    assert "ore" not in {s["familyId"] for s in state["sites"]}
    slot = await db.soul_slots.find_one({"address": ADDRESS})
    ore = slot["forage_pools"]["1"]["families"]["ore"]
    assert ore["remaining"] == 0 and ore["forgotten"] == held
    with pytest.raises(foraging.ForagingError, match="already gone"):
        await foraging.forget_site(ADDRESS, cid, "ore")
    with pytest.raises(foraging.ForagingError):
        await foraging.start_forage(ADDRESS, cid, "craftweapon_01")


async def test_a_site_cannot_be_forgotten_while_out_there_or_if_not_ones_own(db):
    cid = await _make(1, "blacksmith")
    await foraging.start_forage(ADDRESS, cid, "craftweapon_01")
    with pytest.raises(foraging.ForagingError, match="out at that site"):
        await foraging.forget_site(ADDRESS, cid, "ore")
    with pytest.raises(foraging.ForagingError) as exc:
        await foraging.forget_site(ADDRESS, cid, "fish")
    assert exc.value.status == 404


async def test_the_trip_that_uses_up_the_tinderbox_stays_lit(db, monkeypatch):
    cid = await _make(1, "blacksmith")
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {
        "gear.itemBalances.backpack": {"torch_1": 10, "tinderbox_1": 1}}})
    monkeypatch.setattr(foraging.random, "randint", lambda a, b: 10)
    _always(monkeypatch, "stackLoss")
    monkeypatch.setattr(foraging, "DARK_ACCIDENTS",
                        ({"severity": "hardcore", "chance": 1.0, "points": [10, 10]},))
    await foraging.start_forage(ADDRESS, cid, "craftweapon_01")
    await _fast_forward(db, cid)
    result = (await foraging.finish_forage(ADDRESS, cid))["result"]
    # Already lit when it broke: the bonus counts and nothing happens in the dark.
    assert result["gearPercent"] == foraging.LIGHT_BONUS_BY_TIER[1] * 100
    assert result["accident"] is None and result["lightUsed"] == {"torch_1": 6}
    assert any("inderbox" in name for name in result["broken"])
    # The next trip has nothing to light the torch with - dark.
    doc = await db.characters.find_one({"address": ADDRESS, "id": cid})
    assert "tinderbox_1" not in doc["gear"]["itemBalances"]["backpack"]
    assert foraging.gathering_gear(doc, "ore")["dark"] is True


def test_a_carried_light_that_does_not_burn_gives_no_bonus():
    # A T6 candle in the pack, but the T1 torches cover the whole dig.
    supply = _supply([], {"tinderbox_1": 1, "torch_1": 10, "candle_6": 1})
    plan = foraging.plan_trip(6, 0, 100, None, [], supply, None, "ore")       # 6 * 1.25 = 7 units: 4 torches
    assert plan["burned"] == {"torch_1": 4}
    light = next(i for i in plan["gear"]["items"] if i.get("fuel"))
    assert light["itemId"] == "torch_1" and light["bonusTier"] == 1
    assert plan["gear"]["percent"] == foraging.LIGHT_BONUS_BY_TIER[1] * 100
    # Only once the torches run out does the candle burn - and then it counts.
    supply = _supply([], {"tinderbox_1": 1, "torch_1": 1, "candle_6": 1})
    plan = foraging.plan_trip(6, 0, 100, None, [], supply, None, "ore")
    assert plan["burned"] == {"torch_1": 1, "candle_6": 1}
    assert plan["gear"]["percent"] == foraging.LIGHT_BONUS_BY_TIER[6] * 100
    # Nothing dug, nothing burned: no light bonus at all.
    plan = foraging.plan_trip(6, 0, 0, None, [], supply, None, "ore")
    assert plan["burned"] == {} and plan["amount"] == 0
    assert not any(i.get("fuel") for i in plan["gear"]["items"])


@pytest.mark.parametrize("torches, cover", [(10, "full"), (4, "partial"), (2, "none")])
def test_light_cover_on_the_site_card(torches, cover):
    # No gear, a T1 torch (2h, +25%): lowest dig 6 + 1.5 rounded down = 7 units (7h),
    # highest 10 + 2.5 rounded up = 13 (13h).
    doc = {"gear": {"items": [], "itemBalances": {"backpack": {"tinderbox_1": 1, "torch_1": torches}}}}
    gear = foraging.gathering_gear(doc, "ore")
    low, high = foraging.site_plans(doc, "ore", 0, 100, gear)
    light = foraging.light_cover(gear["light"]["hours"], low, high)
    assert (light["needMin"], light["needMax"]) == (7, 13)
    assert light["cover"] == cover


async def test_the_site_card_carries_the_light_cover(db):
    cid = await _make(1, "blacksmith")
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {
        "gear.itemBalances.backpack": {"torch_1": 2, "tinderbox_1": 1}}})
    state = await foraging.get_foraging_state(ADDRESS, cid)
    ore = next(s for s in state["sites"] if s["familyId"] == "ore")
    assert ore["gear"]["light"]["hours"] == 4 and ore["gear"]["light"]["cover"] == "none"


def test_the_gear_bonus_is_rounded_with_a_chance():
    assert foraging.dig(1, 1.7, 1.0) == (1, 1)            # rounded down
    assert foraging.dig(1, 1.7, 0.69) == (1, 2)           # 0.7 beats the draw: one more
    assert foraging.dig(1, 1.7, 0.71) == (1, 1)
    assert foraging.dig(10, 1.7, 0.0) == (10, 17)         # a whole bonus needs no luck
    assert foraging.dig(4, 0.5, 0.0) == (2, 2)            # a penalty always rounds down
    rng = random.Random(3)
    homes = [foraging.dig(1, 1.7, rng.random())[1] for _ in range(4000)]
    assert 0.66 < homes.count(2) / len(homes) < 0.74


def test_the_site_card_range_rounds_the_bonus_down_low_and_up_high():
    # A T1 pickaxe on ore with a light: +25% weapon, +25% torch = +50%; on the
    # tail the site gives 1, so a trip brings home 1 or 2.
    doc = {"gear": {"items": [_instance("pickaxe", 4)],
                    "itemBalances": {"backpack": {"tinderbox_1": 1, "torch_1": 5}}}}
    gear = foraging.gathering_gear(doc, "ore")
    assert gear["percent"] == 50
    assert foraging.planned_yield_range(doc, "ore", 30, 100, gear) == (1, 2)


def test_a_trip_burns_at_most_24h_of_light_but_keeps_the_whole_find():
    assert foraging.MAX_LIGHT_HOURS_PER_TRIP == 24
    assert foraging.dig(10, 2.9, 0.0) == (10, 29)          # no cap on the find
    supply = _supply([], {"tinderbox_1": 1, "torch_1": 20})   # 40h of T1 torches
    pickaxe = {"instanceId": "p", "itemId": "pickaxe_6", "familyId": "pickaxe", "name": "Pickaxe",
               "quality": 4, "tier": 6}                     # +75%, +25% torch = +100%
    plan = foraging.plan_trip(10, 0, 100, None, [], supply, None, "ore", 0.0)
    assert plan["amount"] == 13 and plan["burned"] == {"torch_1": 7}  # 13h -> 7 torches
    supply = _supply([], {"tinderbox_1": 1, "torch_6": 3})      # 64h each, +75%
    plan = foraging.plan_trip(10, 0, 100, pickaxe, [], supply, None, "ore", 0.0)
    assert plan["amount"] == 25 and plan["taken"] == 10    # 10 + 150%: all of it comes home
    assert plan["burned"] == {"torch_6": 1} and not plan["inDark"] and plan["darkUnits"] == 0
    # A 28-unit dig on cheap light: 12 T1 torches (24h) light it, the rest needs
    # no more - the T6 candle stays in the pack and the T1 bonus counts.
    items = [{"instanceId": f, "itemId": f"{f}_6", "familyId": f, "name": f, "quality": 4, "tier": 6}
             for f in ("cart", "grappling_hook", "hunters_charm", "iron_spikes")]  # 4 x +18%
    supply = _supply([], {"tinderbox_1": 1, "torch_1": 12, "candle_6": 1})
    plan = foraging.plan_trip(10, 0, 100, pickaxe, items, supply, None, "ore", 0.0)
    assert plan["gear"]["percent"] == 75 + 4 * 18 + 25 and plan["amount"] == 28
    assert plan["burned"] == {"torch_1": 12} and plan["lightHours"] == 24 and not plan["inDark"]
    assert foraging.light_needed(30) == 24
