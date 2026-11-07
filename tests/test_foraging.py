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
from backend.players import add_character, delete_character, set_in_adventure

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
    vault = await db.player_vaults.find_one({"address": ADDRESS})
    assert vault["itemBalances"]["ore_1"] == found["ore_1"]
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
