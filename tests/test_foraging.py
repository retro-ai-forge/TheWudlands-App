"""
Exercises backend.foraging: the pool rules (fixed total split over unique
families with variation, decay formula, tier rolls by profession count) and
the slot-bound start -> finish flow against the test database.
"""

import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from backend import foraging
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


def test_exhausted_when_lowest_roll_finds_nothing():
    assert not foraging.is_exhausted(0, 50)
    assert foraging.is_exhausted(0, 0)
    assert foraging.is_exhausted(100, 50)


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
async def db(mongodb_uri):
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
    assert foraging.BASE_YIELD_MIN <= out["result"]["total"] <= foraging.BASE_YIELD_MAX
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


def _instance(family: str, quality: int, location: str = "backpack", tier: int = 1) -> dict:
    return {"instanceId": f"{family}-{quality}-{location}", "itemId": f"{family}_{tier}", "familyId": family,
            "quality": quality, "location": location, "slotRef": []}


def test_gear_bonus_one_weapon_plus_each_item_scaled_by_tier():
    doc = {"gear": {
        "items": [_instance("pickaxe", 50, tier=3), _instance("warhammer", 900, "body"),
                  _instance("cart", 10, "cart", tier=2),
                  _instance("grappling_hook", 0), _instance("iron_spikes", 5, "home")],
        "itemBalances": {"backpack": {"hunters_charm_1": 1}},
    }}
    gear = foraging.gathering_gear(doc, "ore")
    assert gear["weapon"]["familyId"] == "pickaxe"             # only one weapon - the highest tier
    assert {i["familyId"] for i in gear["items"]} == {"cart", "hunters_charm"}  # broken + home don't count
    assert gear["percent"] == 45 + 8 + 5                        # T3 weapon, T2 cart, T1 charm
    assert foraging.gear_multiplier(gear) == pytest.approx(1.58)


def test_higher_tiers_always_add_more():
    w, i = foraging.WEAPON_BONUS_BY_TIER, foraging.ITEM_BONUS_BY_TIER
    assert [w[t] for t in range(1, 7)] == sorted(w[t] for t in range(1, 7))
    assert [i[t] for t in range(1, 7)] == sorted(i[t] for t in range(1, 7))
    assert len(set(w.values())) == 6 and len(set(i.values())) == 6


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
        "gear.items": [_instance("pickaxe", 200), _instance("cart", 1, "cart")],
        "gear.itemBalances.backpack": {"hunters_charm_1": 1},
    }})
    state = await foraging.get_foraging_state(ADDRESS, cid)
    ore = next(s for s in state["sites"] if s["familyId"] == "ore")
    assert ore["gear"]["percent"] == 25 + 5 + 5

    monkeypatch.setattr(foraging.random, "randint", lambda a, b: 10)
    await foraging.start_forage(ADDRESS, cid, "craftweapon_01")
    await _fast_forward(db, cid)
    out = await foraging.finish_forage(ADDRESS, cid)

    assert out["result"]["total"] == 13                         # floor(10 * 1.35)
    assert out["result"]["gearPercent"] == 35
    assert len(out["result"]["broken"]) == 1                    # cart at quality 1 -> 0
    doc = await db.characters.find_one({"address": ADDRESS, "id": cid})
    items = {i["familyId"]: i for i in doc["gear"]["items"]}
    assert items["pickaxe"]["quality"] == 200 - 13              # weapon wears by units found
    assert "cart" not in items                                  # destroyed at 0
    assert doc["gear"]["itemBalances"]["backpack"]["hunters_charm_1"] == 1  # stacked item: no wear


async def test_outcome_is_rolled_at_start_and_revealed_at_collect(db, monkeypatch):
    cid = await _make(1, "blacksmith")
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {"gear.items": [_instance("pickaxe", 200)]}})
    monkeypatch.setattr(foraging.random, "randint", lambda a, b: 10)
    state = await foraging.start_forage(ADDRESS, cid, "craftweapon_01")

    # Wear and pool are settled already; the finds are hidden and not in the vault yet.
    doc = await db.characters.find_one({"address": ADDRESS, "id": cid})
    assert doc["gear"]["items"][0]["quality"] == 200 - 12        # floor(10 * 1.25)
    assert "result" not in state["activeForage"]
    assert "result" not in (await foraging.get_foraging_state(ADDRESS, cid))["activeForage"]
    full = await get_single_character(ADDRESS, cid)
    assert "result" not in full["foraging"]["activeForage"]
    assert not await db.character_homes.find_one({"address": ADDRESS, "characterId": cid})

    # Taking the pickaxe away mid-trip changes nothing any more.
    await db.characters.update_one({"address": ADDRESS, "id": cid}, {"$set": {"gear.items": []}})
    await _fast_forward(db, cid)
    out = await foraging.finish_forage(ADDRESS, cid)
    assert out["result"]["total"] == 12 and out["result"]["gearPercent"] == 25
    home = await db.character_homes.find_one({"address": ADDRESS, "characterId": cid})
    assert sum(home["itemBalances"].values()) == 12


def test_bow_needs_quiver_and_arrows_crossbow_needs_girdle_and_bolts():
    bow = _instance("bow", 100, "body")
    alone = foraging.gathering_gear({"gear": {"items": [bow]}}, "meat")
    assert alone["weapon"] is None
    assert alone["blockedWeapons"][0]["missing"] == ["quiver", "arrow"]

    # Quiver plus arrows packed in the backpack.
    packed = {"gear": {"items": [bow, _instance("quiver", 40)], "itemBalances": {"backpack": {"arrow_1": 12}}}}
    assert foraging.gathering_gear(packed, "meat")["weapon"]["familyId"] == "bow"

    # Arrows equipped as a stack (quality None, a quantity) count too - but not an empty one.
    stack = {**_instance("arrow", 0, "body"), "quality": None, "quantity": 5}
    equipped = {"gear": {"items": [bow, _instance("quiver", 40, "body"), stack]}}
    assert foraging.gathering_gear(equipped, "meat")["weapon"]["familyId"] == "bow"
    empty = {"gear": {"items": [bow, _instance("quiver", 40, "body"), {**stack, "quantity": 0}]}}
    assert foraging.gathering_gear(empty, "meat")["weapon"] is None

    crossbow = _instance("crossbow", 100, "body")
    no_bolts = {"gear": {"items": [crossbow, _instance("bolt_girdle", 40)]}}
    assert foraging.gathering_gear(no_bolts, "meat")["blockedWeapons"][0]["missing"] == ["bolt"]
    ready = {"gear": {"items": [crossbow, _instance("bolt_girdle", 40)], "itemBalances": {"saddlepack": {"bolt_2": 3}}}}
    assert foraging.gathering_gear(ready, "meat")["weapon"]["familyId"] == "crossbow"


def test_other_weapon_counts_when_bow_is_not_ready():
    gear = foraging.gathering_gear({"gear": {"items": [_instance("bow", 100, tier=3), _instance("spear", 50)]}}, "meat")
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
    result, doc = await _bow_trip(db, monkeypatch,
                                  [_instance("bow", 100, "body"), _instance("quiver", 40, "body")],
                                  {"arrow_1": 20})
    assert result["total"] == 12                                # floor(10 * 1.25)
    assert result["ammoUsed"] == {"arrow_1": 12} and result["ammoShortfall"] == 0
    assert doc["gear"]["itemBalances"]["backpack"]["arrow_1"] == 8
    bow = next(i for i in doc["gear"]["items"] if i["familyId"] == "bow")
    assert bow["quality"] == 100                                # arrows took all the wear


async def test_missing_arrows_come_off_the_bow(db, monkeypatch):
    stack = {**_instance("arrow", 0, "body"), "quality": None, "quantity": 3}  # equipped, used first
    result, doc = await _bow_trip(db, monkeypatch,
                                  [_instance("bow", 100, "body"), _instance("quiver", 40, "body"), stack],
                                  {"arrow_2": 5})
    assert result["ammoUsed"] == {"arrow_1": 3, "arrow_2": 5} and result["ammoShortfall"] == 4
    assert "arrow_2" not in doc["gear"]["itemBalances"]["backpack"]
    assert not any(i["familyId"] == "arrow" for i in doc["gear"]["items"])  # empty stack removed
    bow = next(i for i in doc["gear"]["items"] if i["familyId"] == "bow")
    assert bow["quality"] == 100 - 4                            # only what the 8 arrows didn't cover
