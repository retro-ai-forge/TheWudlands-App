"""
Character creation rules (data/character-creation-rules.json,
backend/character_creation.py): what the Soul Creation wizard can hand out,
checked again when a character is saved - the gender, race, birthsign and
professions (how many the age allows), the age range and how many points Body
and Soul hold at that age, and the soul slot. The wizard's own point formula
(SoulCreation.tsx getCharAgeMonths/getBodySoul) is replayed here, so nothing
it produces is ever refused. Pure functions plus the creation route's early
refusals - no DB needed.
"""

import asyncio
import math
import re
from pathlib import Path

import pytest
from fastapi import HTTPException

from backend import character_creation as creation
from backend.auth_routes import CreateCharacterRequest, create_character
from backend.professions_catalog import PROFESSION_CATEGORIES
from backend.soul_slots import ALL_SLOT_NUMBERS, FREE_SLOT_NUMBERS, SLOT_LAYOUT_VERSION, unlocked_slot_numbers

ROOT = Path(__file__).resolve().parent.parent
OPTIONS_TS = (ROOT / "app" / "lib" / "characterOptions.ts").read_text(encoding="utf-8")
SPAN = creation.AGE_MAX_MONTHS - creation.AGE_MIN_MONTHS


# ── Points ───────────────────────────────────────────────────────────────────

def _js_round(x: float) -> int:
    """Math.round: halves round up."""
    return math.floor(x + 0.5)


def _wizard(position: float, split: float) -> tuple:
    """(age_month, body, soul) the wizard produces with its marker at
    `position` on the age line (0 oldest .. 1 youngest) and `split` from all
    Soul (0) to all Body (1)."""
    age_month = _js_round(creation.AGE_MAX_MONTHS - position * SPAN)
    total = creation.body_soul_sum(position)
    lo, hi = creation.GROUP_MIN, creation.GROUP_MAX
    body_raw = lo + split * (hi - lo)
    soul_raw = hi - split * (hi - lo)

    def clamp(n: float) -> int:
        return max(lo, min(hi, _js_round(n)))

    return (
        age_month,
        clamp(body_raw / (body_raw + soul_raw) * total),
        clamp(soul_raw / (body_raw + soul_raw) * total),
    )


def _attr(body: int, soul: int) -> dict:
    """Body and Soul points spread over their attributes, at least 1 each."""
    return {
        "migh": body - 3, "agil": 1, "endu": 1, "prec": 1,
        "will": soul - 3, "insi": 1, "lore": 1, "pres": 1,
    }


def _wizard_results() -> set:
    """Every (age_month, body, soul) the wizard makes on a fine grid: a
    quarter month along the age line, 1/200 of the split."""
    return {
        _wizard(i / (SPAN * 4), j / 200)
        for i in range(SPAN * 4 + 1)
        for j in range(201)
    }


def test_body_soul_sum_follows_the_age_line():
    assert creation.body_soul_sum(0) == 90  # oldest
    assert creation.body_soul_sum(0.25) == 97
    assert creation.body_soul_sum(0.5) == 104  # peak, at 43 human years
    assert creation.body_soul_sum(0.75) == 68.5
    assert creation.body_soul_sum(1) == 33  # youngest


def test_nothing_the_wizard_makes_is_refused():
    for age_month, body, soul in _wizard_results():
        creation.check_attributes(age_month, _attr(body, soul))


def test_the_limit_is_at_most_one_point_over_what_the_wizard_makes():
    best: dict = {}
    for age_month, body, soul in _wizard_results():
        best[age_month] = max(best.get(age_month, 0), body + soul)
    assert set(best) == set(range(creation.AGE_MIN_MONTHS, creation.AGE_MAX_MONTHS + 1))
    over = {age: creation.max_body_soul(age) - total for age, total in best.items()}
    assert min(over.values()) == 0
    assert max(over.values()) <= 1


@pytest.mark.parametrize(
    "age_month,body,soul",
    [
        (336, 25, 25),  # the wizard's starting point, age 28
        (450, 81, 4),  # all to Body
        (511, 37, 66),  # close to the peak
        (735, 28, 64),  # among the oldest
        (276, 32, 4),  # youngest, all to Body: the smaller group lifted to 4
    ],
)
def test_wizard_characters_are_accepted(age_month, body, soul):
    creation.check_attributes(age_month, _attr(body, soul))


@pytest.mark.parametrize(
    "age_month,attr,message",
    [
        (275, _attr(16, 16), "This age is outside what character creation allows"),
        (757, _attr(45, 45), "This age is outside what character creation allows"),
        (516, {**_attr(50, 50), "agil": 0, "migh": 48}, "Every attribute needs at least 1 point"),
        (516, {**_attr(50, 50), "agil": -40, "migh": 88}, "Every attribute needs at least 1 point"),
        (516, _attr(101, 4), "Body can hold at most 100 points (got 101)"),
        (516, _attr(503, 20), "Body can hold at most 100 points (got 503)"),
        (516, _attr(4, 101), "Soul can hold at most 100 points (got 101)"),
        (336, _attr(30, 24), "Body and Soul together can hold at most 53 points at this age (got 54)"),
        (276, _attr(33, 4), "Body and Soul together can hold at most 36 points at this age (got 37)"),
    ],
)
def test_point_refusals(age_month, attr, message):
    with pytest.raises(creation.InvalidCharacter) as refused:
        creation.check_attributes(age_month, attr)
    assert str(refused.value) == message


# ── Choices ──────────────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "age_month,allowed",
    [(276, 1), (611, 1), (612, 2), (731, 2), (732, 3), (756, 3)],
)
def test_the_age_decides_how_many_professions(age_month, allowed):
    assert creation.professions_allowed(age_month) == allowed


@pytest.mark.parametrize(
    "age_month,gender,race_group,race,birthsign,professions",
    [
        (336, "m", "Giants", "ogre", "grit_stitch_brand", ["blacksmith", "none", "none"]),
        (640, "d", "Common", "halfling", "grit_stitch_brand", ["dyer", "miner", "none"]),
        (735, "m", "Mixed", "elder", "grit_stitch_brand", ["scholar", "merchant", "alchemist"]),
        (493, "f", "Mystical", "tiefling", "hearthfinder_sigil", ["mason", "none", "none"]),
    ],
)
def test_wizard_choices_are_accepted(age_month, gender, race_group, race, birthsign, professions):
    creation.check_choices(age_month, gender, race_group, race, birthsign, professions)


_OK = dict(age_month=640, gender="f", race_group="Common", race="human", birthsign="legend_crest",
           professions=["miner", "none", "none"])


@pytest.mark.parametrize(
    "changes,message",
    [
        ({"gender": "x"}, "Choose one of the listed genders"),
        ({"gender": "<<run x>>"}, "Choose one of the listed genders"),
        ({"race": "dragon"}, "Choose one of the listed races"),
        ({"race_group": "Giants"}, "The race human belongs to the group Common"),
        ({"birthsign": ""}, "Choose one of the listed birth signs"),
        ({"birthsign": "lucky_star"}, "Choose one of the listed birth signs"),
        ({"professions": ["none", "none", "none"]}, "Choose a first profession"),
        ({"professions": ["none", "miner", "none"]}, "Choose a first profession"),
        ({"professions": ["miner", "none", "dyer"]}, "Fill the profession slots in order"),
        ({"professions": ["miner", "wizard", "none"]}, "Unknown profession: wizard"),
        ({"professions": ["miner", "dyer", "scholar"]}, "At this age a character can have 2 professions (got 3)"),
        ({"age_month": 611, "professions": ["miner", "dyer", "none"]},
         "At this age a character can have 1 profession (got 2)"),
        ({"professions": ["miner", "miner", "none"]}, "Two professions can't come from the same group (Rural)"),
        ({"professions": ["miner", "farmer", "none"]}, "Two professions can't come from the same group (Rural)"),
    ],
)
def test_choice_refusals(changes, message):
    with pytest.raises(creation.InvalidCharacter) as refused:
        creation.check_choices(**{**_OK, **changes})
    assert str(refused.value) == message


def _ts_list(name: str) -> str:
    """The source of one exported list in characterOptions.ts."""
    return re.search(rf"export const {name}\b.*?\n\];", OPTIONS_TS, re.S).group(0)


def test_genders_races_and_birthsigns_match_the_creation_wizard():
    genders = re.findall(r'^\s*id: "(\w+)",', _ts_list("GENDERS"), re.M)
    races = dict(re.findall(r'\{ id: "(\w+)", name: "[^"]*", category: "(\w+)"', _ts_list("RACES")))
    birthsigns = re.findall(r'\|\s*"(\w+)"', re.search(r"export type BirthsignId =(.*?);", OPTIONS_TS, re.S).group(1))
    assert set(genders) == creation.GENDERS
    assert races == creation.RACE_GROUPS
    assert set(birthsigns) == creation.BIRTHSIGNS


def test_profession_groups_match_the_creation_wizard():
    # The wizard refuses two professions of one group by its own table; the
    # server's (professions_catalog) must agree, or it would refuse a pair the
    # wizard allows.
    professions = dict(re.findall(r'\{ id: "(\w+)", name: "[^"]*", category: "(\w+)"', _ts_list("PROFESSIONS")))
    assert professions == PROFESSION_CATEGORIES


# ── Soul slot ────────────────────────────────────────────────────────────────

def test_unlocked_slots_are_what_the_welcome_grid_shows():
    assert unlocked_slot_numbers(None) == set(FREE_SLOT_NUMBERS)
    current = {"layout_version": SLOT_LAYOUT_VERSION, "unlocked": [1, 5, 7, 99]}
    assert unlocked_slot_numbers(current) == {1, 5, 7}
    # A record from an older layout: its numbers mean other slots.
    assert unlocked_slot_numbers({**current, "layout_version": SLOT_LAYOUT_VERSION - 1}) == set(FREE_SLOT_NUMBERS)
    assert max(ALL_SLOT_NUMBERS) < 99


@pytest.mark.parametrize(
    "slot,unlocked,taken,problem",
    [
        (1, {1}, [], None),
        (5, {1, 5}, [1], None),
        (5, {1}, [], "This soul slot isn't unlocked for your wallet"),
        (57, {1, 5}, [], "This soul slot isn't unlocked for your wallet"),
        (-1, {1}, [], "This soul slot isn't unlocked for your wallet"),
        (1, {1, 5}, [1], "This soul slot already holds a character"),
    ],
)
def test_slot_problem(slot, unlocked, taken, problem):
    assert creation.slot_problem(slot, unlocked, taken) == problem


# ── The creation route ───────────────────────────────────────────────────────

def _request(**changes) -> CreateCharacterRequest:
    fields = dict(
        slotNumber=1, firstName="Grimjaw", lastName="Ironfoot", age_month=336, gender="m",
        raceGroup="Common", race="dwarf", birthsign="legend_crest", profession1="miner",
        attr=_attr(25, 25),
    )
    return CreateCharacterRequest(**{**fields, **changes})


@pytest.mark.parametrize(
    "changes,message",
    [
        ({"attr": {**_attr(25, 25), "migh": 500}}, "Body can hold at most 100 points"),
        ({"age_month": 120}, "This age is outside"),
        ({"attr": _attr(40, 40)}, "Body and Soul together can hold at most 53 points"),
        ({"profession2": "dyer"}, "At this age a character can have 1 profession (got 2)"),
        ({"race": "dragon"}, "Choose one of the listed races"),
        ({"birthsign": ""}, "Choose one of the listed birth signs"),
    ],
)
def test_creation_refuses_what_the_wizard_cant_make_before_anything_is_saved(changes, message):
    # These checks come before any database call in the route.
    with pytest.raises(HTTPException) as refused:
        asyncio.run(create_character(_request(**changes), address="test-wallet"))
    assert refused.value.status_code == 400
    assert refused.value.detail.startswith(message)


def test_creation_wizard_reads_the_same_rules():
    wizard = (ROOT / "app" / "main" / "welcome" / "soul-creation" / "SoulCreation.tsx").read_text(encoding="utf-8")
    ages = (ROOT / "app" / "lib" / "ageScaling.ts").read_text(encoding="utf-8")
    assert 'from "@/backend/data/character-creation-rules.json"' in wizard
    assert 'from "../../backend/data/character-creation-rules.json"' in ages
    for name in ("BODY_SOUL_RATIO_MAX", "BODY_SOUL_RATIO_MIN", "BODY_SOUL_SUM_AT_OLDEST",
                 "BODY_SOUL_SUM_PEAK", "BODY_SOUL_SUM_AT_YOUNGEST", "BODY_SOUL_SUM_PEAK_AGE_T"):
        assert f"const {name}: number = creationRules." in wizard, name
    for name in ("LIFE_ENERGY_MIN_AGE_MONTHS", "LIFE_ENERGY_MAX_AGE_MONTHS"):
        assert f"export const {name}: number = creationRules.ageMonths." in ages, name
    assert "creationRules.professions.secondFromMonths" in wizard
    assert "creationRules.professions.thirdFromMonths" in wizard
    # Only unlocked profession slots are sent, to the starter-kit lookup and on save.
    assert wizard.count("profession2: sentProfession2") == 2
