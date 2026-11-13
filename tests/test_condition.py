"""
Temporary attribute loss and healing (backend.condition), and the night out
on a foraging trip. Pure rules first; the persisted transitions run against
the test database like test_foraging.py.
"""

import random
from collections import Counter
from datetime import datetime, timedelta, timezone

import pytest

from backend import condition, foraging
from backend.character import AttributeStats, Character, ProfStats
from backend.db import get_database
from backend.players import add_character

T0 = datetime(2026, 11, 9, 8, 0, tzinfo=timezone.utc)
H20 = timedelta(hours=20)
MAX = {"migh": 3, "agil": 2, "endu": 4, "prec": 1, "will": 2, "insi": 2, "lore": 1, "pres": 3}
RULES = foraging.NIGHTS


# ── Current values and healing ─────────────────────────────────────────


def test_current_is_max_minus_lost_never_below_zero():
    now = condition.current_attrs(MAX, {"endu": 2, "prec": 5})
    assert now["endu"] == 2 and now["prec"] == 0 and now["migh"] == 3


def test_heals_one_point_per_20h_of_free_time():
    lost = {"endu": 2, "will": 1}
    start = T0.isoformat()
    assert condition.settle(MAX, lost, start, T0 + H20 - timedelta(minutes=1), "c") == (lost, start)

    after_one, clock = condition.settle(MAX, lost, start, T0 + H20, "c")
    assert sum(after_one.values()) == 2 and clock == (T0 + H20).isoformat()

    healed, clock = condition.settle(MAX, lost, start, T0 + 3 * H20, "c")
    assert healed == {} and clock is None                      # all healed, clock stops


def test_no_healing_while_the_clock_is_stopped():
    assert condition.settle(MAX, {"endu": 2}, None, T0 + 10 * H20, "c") == ({"endu": 2}, None)


def test_settle_is_the_same_on_every_container():
    lost = {"endu": 3, "will": 1, "migh": 2}
    a = condition.settle(MAX, lost, T0.isoformat(), T0 + 2 * H20, "char-1")
    b = condition.settle(MAX, lost, T0.isoformat(), T0 + 2 * H20, "char-1")
    assert a == b


def test_worst_hit_attribute_heals_first_more_often():
    picks = Counter(condition.pick_attr_to_heal({"endu": 3, "will": 1}, random.Random(i)) for i in range(4000))
    assert picks["endu"] / picks["will"] == pytest.approx(3, rel=0.15)


# ── Losing points, dead and soulless ───────────────────────────────────


def test_point_spills_to_the_group_then_the_other_group():
    rng = random.Random(1)
    # prec is already at 0: the point goes to another Body attribute.
    assert condition.place_point("prec", MAX, {"prec": 1}, rng) in condition.BODY_ATTRS
    # Body drained: it goes to Soul.
    body_gone = {k: MAX[k] for k in condition.BODY_ATTRS}
    assert condition.place_point("endu", MAX, body_gone, rng) in condition.SOUL_ATTRS
    # Everything at 0: nothing left to lose.
    assert condition.place_point("endu", MAX, dict(MAX), rng) is None


def test_drained_body_is_dead_and_drained_soul_soulless():
    body_gone = {k: MAX[k] for k in condition.BODY_ATTRS}
    soul_gone = {k: MAX[k] for k in condition.SOUL_ATTRS}
    assert condition.vital_status_for(MAX, {"endu": 1}) == "alive"
    assert condition.vital_status_for(MAX, body_gone) == "dead"
    assert condition.vital_status_for(MAX, soul_gone) == "soulless"
    assert condition.vital_status_for(MAX, {**body_gone, **soul_gone}, "soulless") == "dead"


def test_a_drained_group_never_heals():
    soul_gone = {k: MAX[k] for k in condition.SOUL_ATTRS}
    # Soul drained, Body hurt: only Body heals; once it's whole the clock stops.
    lost, clock = condition.settle(MAX, {**soul_gone, "endu": 1}, T0.isoformat(), T0 + 5 * H20, "c")
    assert lost == soul_gone and clock is None
    # Nothing healable at all: the clock never runs.
    assert condition.settle(MAX, soul_gone, T0.isoformat(), T0 + 5 * H20, "c") == (soul_gone, None)


# ── The night out ──────────────────────────────────────────────────────


def _share(severity: str, family_id=None) -> float:
    """Chance of a weather of `severity` at a site, from the rules."""
    weights = condition.weathers_for(RULES, family_id)
    hit = sum(w for name, w in weights.items() if RULES["weather"][name]["severity"] == severity)
    return hit / sum(weights.values())


def _nights(shelter: int, n: int = 6000) -> Counter:
    rng = random.Random(7)
    return Counter(sum(condition.roll_night(RULES, shelter, MAX, {}, rng)["points"].values()) for _ in range(n))


def test_tent_and_bedroll_together_always_protect():
    assert _nights(2) == Counter({0: 6000})


def test_one_piece_of_shelter_costs_at_most_one_point():
    losses = _nights(1)
    assert set(losses) == {0, 1}
    assert losses[1] / 6000 == pytest.approx(_share("mild") * 0.5 + _share("severe"), abs=0.03)


def test_no_shelter_costs_up_to_one_body_and_one_soul():
    losses = _nights(0)
    assert set(losses) == {0, 1, 2}
    assert losses[2] / 6000 == pytest.approx(_share("severe"), abs=0.03)
    rng = random.Random(3)
    for _ in range(200):
        night = condition.roll_night(RULES, 0, MAX, {}, rng)
        if sum(night["points"].values()) == 2:
            assert night["kind"] == "both"
            assert {condition.group_of(k) for k in night["points"]} == {"body", "soul"}


def test_night_message_wishes_only_for_what_the_lack_cost():
    def msg(weather, missing):
        night = {"kind": "body", "weather": weather, "points": {"endu": 1}}
        return foraging.night_message(night, missing, "Mira", random.Random(0))

    # Nothing carried: cool and harsh losses are certain - wish for either.
    assert "bedroll or a tent" in msg("cool", ["tent", "bedroll"])
    assert "bedroll or a tent" in msg("harsh", ["tent", "bedroll"])
    # Bedroll only, harsh: it saved one point, the tent would have saved the other.
    assert "Mira wished for the tent as well." in msg("harsh", ["tent"])
    # Bedroll only, cool: the point was a 50% chance - bad luck, no wish.
    assert "wished" not in msg("cool", ["tent"])
    calm = foraging.night_message({"kind": "calm", "points": {}}, ["tent"], "Mira", random.Random(0))
    assert "wish" not in calm and "helped" not in calm


# ── Persisted (live DB) ────────────────────────────────────────────────

ADDRESS = "5TestConditionAddress"
_COLLECTIONS = ("characters", "player_characters", "player_vaults", "character_homes",
                "character_camp", "character_blueprints", "soul_slots")


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


async def _make() -> str:
    character = Character(first_name="Mira", slot_number=1,
                          attr=AttributeStats(might=2, agility=1, endurance=1, precision=1,
                                              will=1, insight=1, lore=1, presence=1),
                          profession=ProfStats(profession_1="blacksmith", level_1=1))
    await add_character(ADDRESS, character)
    return character.id


async def _doc(db, cid):
    return await db.characters.find_one({"address": ADDRESS, "id": cid})


async def test_loss_restarts_the_clock_and_going_out_stops_it(db):
    cid = await _make()
    taken, status = await condition.apply_loss(ADDRESS, cid, {"migh": 1})
    assert taken == {"migh": 1} and status is None
    doc = await _doc(db, cid)
    assert doc["attrLost"] == {"migh": 1} and doc["healFrom"] is not None
    assert condition.condition_view(doc)["attrNow"]["migh"] == 1

    await condition.pause_healing(ADDRESS, cid)
    assert (await _doc(db, cid))["healFrom"] is None


async def test_draining_body_kills_and_tags_the_character(db):
    cid = await _make()
    _, status = await condition.apply_loss(ADDRESS, cid, {"migh": 2, "agil": 1, "endu": 1, "prec": 1})
    assert status == "dead"
    doc = await _doc(db, cid)
    assert doc["vitalStatus"] == "dead" and doc["healFrom"] is None   # Body never heals
    pc = await db.player_characters.find_one({"address": ADDRESS})
    assert pc["characters"][0]["tags"][0] == "dead"

    # A further point can only land on Soul now.
    taken, _ = await condition.apply_loss(ADDRESS, cid, {"endu": 1})
    assert list(taken) and list(taken)[0] in condition.SOUL_ATTRS


async def test_foraging_night_lands_on_collect(db, monkeypatch):
    cid = await _make()
    await foraging.ensure_slot_pool(ADDRESS, 1, ["blacksmith"])
    monkeypatch.setattr(foraging, "roll_trip_night", lambda doc, family_id=None, rng=None: {
        "weather": "harsh", "points": {"endu": 1, "will": 1}, "kind": "both",
        "shelter": [], "message": "Cold."})
    await foraging.start_forage(ADDRESS, cid, "craftweapon_01")
    assert (await _doc(db, cid)).get("attrLost") in (None, {})        # nothing lost until home
    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    await db.characters.update_one({"address": ADDRESS, "id": cid},
                                   {"$set": {"foraging.activeForage.readyAt": past}})
    result = (await foraging.finish_forage(ADDRESS, cid))["result"]

    assert result["night"]["lost"] == {"endu": 1, "will": 1}
    doc = await _doc(db, cid)
    assert doc["attrLost"] == {"endu": 1, "will": 1} and doc["healFrom"] is not None


def test_cold_night_kept_warm_names_the_shelter():
    night = {"kind": "sheltered", "weather": "cool", "points": {}}
    text = foraging.night_message(night, ["bedroll"], "Mira", random.Random(0))
    assert "Mira" in text and "tent" in text
    assert text in [t.format(name="Mira", shelter="tent")
                    for t in foraging.NIGHT_MESSAGES["byWeather"]["cool"]["sheltered"]]
    # No weather lines for warm nights: the general calm lines are used.
    calm = foraging.night_message({"kind": "calm", "weather": "warm", "points": {}}, ["tent", "bedroll"], "Mira")
    assert calm in [t.format(name="Mira") for t in foraging.NIGHT_MESSAGES["calm"]]


def test_every_night_sentence_formats():
    groups = [v for k, v in foraging.NIGHT_MESSAGES.items() if isinstance(v, list)]
    groups += [v for weather in foraging.NIGHT_MESSAGES["byWeather"].values() for v in weather.values()]
    for templates in groups:
        for t in templates:
            t.format(name="N", shelter="tent", tent="Tent")  # no unknown placeholders


def test_site_weather_only_where_it_fits():
    def seen(family_id):
        rng = random.Random(9)
        return {condition.roll_night(RULES, 0, MAX, {}, rng, family_id)["weather"] for _ in range(3000)}

    anywhere = {w for w, c in RULES["weather"].items() if not c.get("families") and not c.get("underground")}
    below = {w for w, c in RULES["weather"].items() if c.get("underground")}
    assert seen("sand") == anywhere | {"sandstorm"}
    assert seen("fish") == anywhere | {"flood"}
    assert seen("stone") == anywhere | {"blizzard", "rockslide"}
    assert seen("herbs") == anywhere
    # Mines and caves: only what happens underground - no sky up there.
    assert seen("ore") == below and seen("crystal") == below


def test_every_harmful_weather_has_its_own_sentences():
    by_weather = foraging.NIGHT_MESSAGES["byWeather"]
    for weather, cfg in RULES["weather"].items():
        if cfg["severity"] == "none":
            continue
        kinds = ["sheltered", "body", "soul"]
        # Severe weathers get their own lines for losing both points too
        # (the first two existed before and use the general ones).
        if cfg["severity"] == "severe" and weather != "harsh":
            kinds.append("both")
        # A night whose points all go to one group (ghosts: Soul) never
        # reaches the other kinds.
        if cfg.get("group"):
            kinds = ["sheltered", cfg["group"]]
        for kind in kinds:
            assert len(by_weather[weather][kind]) >= 8, (weather, kind)


def test_only_severe_weather_can_wreck_a_carried_tent():
    assert foraging.TENT_DESTROYED_CHANCE == {"severe": 0.03}
    with_tent = {"attr": MAX, "gear": {"itemBalances": {"backpack": {"tent_1": 1}}}}
    rng = random.Random(4)
    nights = [foraging.roll_trip_night(with_tent, "sand", rng) for _ in range(20000)]
    wrecked = [n for n in nights if n["tentDestroyed"]]
    assert all(RULES["weather"][n["weather"]]["severity"] == "severe" for n in wrecked)
    severe = sum(RULES["weather"][n["weather"]]["severity"] == "severe" for n in nights)
    assert len(wrecked) / severe == pytest.approx(0.03, abs=0.01)
    # No tent carried: nothing to wreck.
    bare = {"attr": MAX, "gear": {}}
    assert not any(foraging.roll_trip_night(bare, "sand", rng)["tentDestroyed"] for _ in range(3000))


async def test_wrecked_tent_leaves_the_pack(db, monkeypatch):
    cid = await _make()
    await foraging.ensure_slot_pool(ADDRESS, 1, ["blacksmith"])
    await db.characters.update_one({"address": ADDRESS, "id": cid},
                                   {"$set": {"gear.itemBalances.backpack": {"tent_1": 1}}})
    monkeypatch.setattr(foraging, "roll_trip_night", lambda doc, family_id=None, rng=None: {
        "weather": "storm", "points": {}, "kind": "sheltered", "shelter": ["tent"],
        "message": "Storm.", "tentDestroyed": True})
    await foraging.start_forage(ADDRESS, cid, "craftweapon_01")
    doc = await _doc(db, cid)
    assert "tent_1" not in ((doc["gear"].get("itemBalances") or {}).get("backpack") or {})
    past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    await db.characters.update_one({"address": ADDRESS, "id": cid},
                                   {"$set": {"foraging.activeForage.readyAt": past}})
    result = (await foraging.finish_forage(ADDRESS, cid))["result"]
    assert result["night"]["tentLost"] in result["broken"]
    assert result["night"]["message"].startswith("Storm. ")
