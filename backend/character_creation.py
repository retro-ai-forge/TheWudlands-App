"""
Character creation rules (data/character-creation-rules.json): what the Soul
Creation wizard can hand out, checked again when a character is saved, so a
request sent past the wizard can't create a character the wizard couldn't.

- Choices (check_choices): gender, race (with its group) and birthsign come
  from the game's lists; profession 1 is required, the slots fill in order,
  every profession is real (PROFESSION_CATEGORIES), no two share a group, and
  the age decides how many there may be (a second from 51 human years, a
  third from 61).
- Points (check_attributes): the wizard's marker picks an age and a
  Body/Soul split. The age decides how many points Body and Soul share
  (bodySoulSum: 33 at the youngest, 104 at the peak, 90 at the oldest), the
  split how they're shared, and the player spends each group's points on its
  four attributes, at least 1 each (SoulCreation.tsx getBodySoul, which reads
  the same rule file). Checked: the age range, at least 1 per attribute, at
  most 100 per group, and Body + Soul at most max_body_soul(age) - the
  wizard's total for that age including its rounding, so nothing the wizard
  produces is ever refused. Fewer points are allowed: they only make a
  character weaker.
- Soul slot (slot_problem): one the wallet has unlocked, as the welcome grid
  shows it (soul_slots.unlocked_slot_numbers), and not already holding a
  character - checked inside the route's transaction.

The genders, races and birthsigns mirror app/lib/characterOptions.ts
(tests/test_character_creation.py compares them).
"""

from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Iterable, Mapping, Optional, Sequence

from backend.professions_catalog import PROFESSION_CATEGORIES

RULES = json.loads((Path(__file__).parent / "data" / "character-creation-rules.json").read_text(encoding="utf-8"))
AGE_MIN_MONTHS: int = RULES["ageMonths"]["min"]
AGE_MAX_MONTHS: int = RULES["ageMonths"]["max"]
ATTRIBUTE_MIN: int = RULES["attributeMin"]
GROUP_MIN: int = RULES["group"]["min"]
GROUP_MAX: int = RULES["group"]["max"]
_SUM = RULES["bodySoulSum"]
SECOND_PROFESSION_FROM: int = RULES["professions"]["secondFromMonths"]
THIRD_PROFESSION_FROM: int = RULES["professions"]["thirdFromMonths"]
GENDERS: frozenset[str] = frozenset(RULES["genders"])
RACE_GROUPS: dict[str, str] = {race: group for race, group in RULES["races"].items() if not race.startswith("_")}
BIRTHSIGNS: frozenset[str] = frozenset(RULES["birthsigns"])

BODY_ATTRIBUTES = ("migh", "agil", "endu", "prec")
SOUL_ATTRIBUTES = ("will", "insi", "lore", "pres")
NO_PROFESSION = "none"


class InvalidCharacter(ValueError):
    """A character the wizard couldn't make; the message says why (shown to the player)."""


# ── Choices ──────────────────────────────────────────────────────────────────

def professions_allowed(age_month: int) -> int:
    """How many professions a character of this age can have."""
    return 1 + (age_month >= SECOND_PROFESSION_FROM) + (age_month >= THIRD_PROFESSION_FROM)


def check_choices(
    age_month: int, gender: str, race_group: str, race: str, birthsign: str, professions: Sequence[str]
) -> None:
    """Refuse a gender, race, birthsign or professions the wizard can't hand out.

    `professions` are the three slots in order, "none" for an empty one.
    """
    if gender not in GENDERS:
        raise InvalidCharacter("Choose one of the listed genders")
    if race not in RACE_GROUPS:
        raise InvalidCharacter("Choose one of the listed races")
    if race_group != RACE_GROUPS[race]:
        raise InvalidCharacter(f"The race {race} belongs to the group {RACE_GROUPS[race]}")
    if birthsign not in BIRTHSIGNS:
        raise InvalidCharacter("Choose one of the listed birth signs")

    filled = [p != NO_PROFESSION for p in professions]
    if not filled or not filled[0]:
        raise InvalidCharacter("Choose a first profession")
    if any(later and not earlier for earlier, later in zip(filled, filled[1:])):
        raise InvalidCharacter("Fill the profession slots in order")
    chosen = [p for p in professions if p != NO_PROFESSION]
    for profession in chosen:
        if profession not in PROFESSION_CATEGORIES:
            raise InvalidCharacter(f"Unknown profession: {profession}")
    allowed = professions_allowed(age_month)
    if len(chosen) > allowed:
        raise InvalidCharacter(
            f"At this age a character can have {allowed} profession{'' if allowed == 1 else 's'}"
            f" (got {len(chosen)})"
        )
    groups = [PROFESSION_CATEGORIES[p] for p in chosen]
    for group in groups:
        if groups.count(group) > 1:
            raise InvalidCharacter(f"Two professions can't come from the same group ({group})")


# ── Points ───────────────────────────────────────────────────────────────────

def age_position(age_month: float) -> float:
    """Where an age sits on the wizard's age line: 0 = oldest, 1 = youngest."""
    return (AGE_MAX_MONTHS - age_month) / (AGE_MAX_MONTHS - AGE_MIN_MONTHS)


def body_soul_sum(position: float) -> float:
    """Points Body and Soul share at an age position (SoulCreation.tsx ageTToBodySoulSum)."""
    peak_at = _SUM["peakAt"]
    if position <= peak_at:
        total = _SUM["atOldest"] + position / peak_at * (_SUM["peak"] - _SUM["atOldest"])
    else:
        total = _SUM["peak"] + (position - peak_at) / (1 - peak_at) * (_SUM["atYoungest"] - _SUM["peak"])
    return max(_SUM["atYoungest"], min(_SUM["peak"], total))


def max_body_soul(age_month: int) -> int:
    """The most points Body and Soul can hold together at this age.

    The wizard sends the age rounded to whole months, so the age it worked
    with lies within half a month of this one: the largest total there counts.
    It then rounds Body and Soul separately (together up to 1 point over the
    total) and lifts a group that rounds below GROUP_MIN to it - the smaller
    group is at least GROUP_MIN / (GROUP_MIN + GROUP_MAX) of the total, so
    that adds at most the difference.
    """
    half_month = 0.5 / (AGE_MAX_MONTHS - AGE_MIN_MONTHS)
    position = age_position(age_month)
    nearest_peak = min(max(_SUM["peakAt"], position - half_month), position + half_month)
    total = body_soul_sum(min(max(nearest_peak, 0.0), 1.0))
    larger_share = GROUP_MAX / (GROUP_MIN + GROUP_MAX)
    return max(math.floor(total) + 1, math.floor(total * larger_share + 0.5) + GROUP_MIN)


def check_attributes(age_month: int, attr: Mapping[str, int]) -> None:
    """Refuse an age or attributes the creation wizard can't hand out."""
    if not AGE_MIN_MONTHS <= age_month <= AGE_MAX_MONTHS:
        raise InvalidCharacter("This age is outside what character creation allows")
    if any(attr[key] < ATTRIBUTE_MIN for key in BODY_ATTRIBUTES + SOUL_ATTRIBUTES):
        raise InvalidCharacter(
            f"Every attribute needs at least {ATTRIBUTE_MIN} point{'' if ATTRIBUTE_MIN == 1 else 's'}"
        )
    body = sum(attr[key] for key in BODY_ATTRIBUTES)
    soul = sum(attr[key] for key in SOUL_ATTRIBUTES)
    for group, points in (("Body", body), ("Soul", soul)):
        if points > GROUP_MAX:
            raise InvalidCharacter(f"{group} can hold at most {GROUP_MAX} points (got {points})")
    limit = max_body_soul(age_month)
    if body + soul > limit:
        raise InvalidCharacter(
            f"Body and Soul together can hold at most {limit} points at this age (got {body + soul})"
        )


# ── Soul slot ────────────────────────────────────────────────────────────────

def slot_problem(slot_number: int, unlocked: Iterable[int], taken: Iterable[int]) -> Optional[str]:
    """Why a new character can't go into this soul slot, or None if it can.

    `unlocked`: the slots the wallet may use (soul_slots.unlocked_slot_numbers);
    `taken`: the slots its characters already sit in.
    """
    if slot_number not in set(unlocked):
        return "This soul slot isn't unlocked for your wallet"
    if slot_number in set(taken):
        return "This soul slot already holds a character"
    return None
