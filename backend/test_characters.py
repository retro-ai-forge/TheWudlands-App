"""TestCharacters: a story's test party (docs/STORY-RULES.md "Test characters").

An author puts up to 4 characters as JSON in a scene called TestCharacters.
The editor's Test plays with them; on submit they are checked like real
characters, taken out of the story's scenes and stored with the submission as
`testCharacters`, for test runs of the submitted story (ARCHITECTURE.md "Test
runs"). The stored party is normalised: names cleaned like at character
creation, `name` made from them, and every Legend value present (0 when left
out) - the values a story reads as $char / $lead.
"""

from __future__ import annotations

import json
from typing import Optional

from backend import character_creation, legend
from backend.character_names import InvalidName, clean_full_name
from backend.professions_catalog import PROFESSION_CATEGORIES
from backend.story_rules import (
    EQUIPMENT_FIELD,
    ITEM_IDS,
    LEGEND_FIELDS,
    LIST_FIELDS,
    NAME_FIELDS,
    NUMBER_FIELDS,
    PARTY_MAX,
)
from backend.twine_graph import TEST_CHARACTERS_PASSAGE

PASSAGE = TEST_CHARACTERS_PASSAGE
NONE = character_creation.NO_PROFESSION
LEVEL_MAX = 30
EQUIPMENT_MAX = 64
LEGEND_MAX = int(legend.MAX)

BODY = ("might", "agility", "endurance", "precision")
SOUL = ("will", "insight", "lore", "presence")
GROUP_MIN = character_creation.GROUP_MIN
GROUP_MAX = character_creation.GROUP_MAX
# Body and Soul together: the youngest characters' share up to the peak age's.
TOTAL_MIN = character_creation.RULES["bodySoulSum"]["atYoungest"]
TOTAL_MAX = character_creation.RULES["bodySoulSum"]["peak"]

_REQUIRED = tuple(f for f in NAME_FIELDS if f != "name") + LIST_FIELDS + NUMBER_FIELDS + (EQUIPMENT_FIELD,)
_ALLOWED = frozenset(NAME_FIELDS + LIST_FIELDS + NUMBER_FIELDS + (EQUIPMENT_FIELD,) + LEGEND_FIELDS)
# Pairs whose two sides may both be above 0 (fame and infamy pull, they don't share a scale).
_TENSION = {frozenset(pair) for pair in legend.RULES["tension"]["pairs"]}


class _Problem(Exception):
    pass


def _whole(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _character(raw) -> dict:
    """One test character, checked and normalised. Raises _Problem."""
    if not isinstance(raw, dict):
        raise _Problem('each character is written as { ... }, like {"firstName": "Grimjaw", ...}')
    unknown = sorted(set(raw) - _ALLOWED)
    if unknown:
        raise _Problem(f"unknown values: {', '.join(unknown)} (see Characters in the story rules)")
    missing = [f for f in _REQUIRED if f not in raw]
    if missing:
        raise _Problem(f"missing values: {', '.join(missing)}")

    first, last = raw["firstName"], raw["lastName"]
    if not isinstance(first, str) or not isinstance(last, str):
        raise _Problem("firstName and lastName are text")
    try:
        first, last = clean_full_name(first, last)
    except InvalidName as ex:
        raise _Problem(str(ex))
    name = f"{first} {last}"
    if "name" in raw and raw["name"] != name:
        raise _Problem(f'name is made from firstName and lastName ("{name}") - leave it out')

    for field in LIST_FIELDS:
        if not isinstance(raw[field], str):
            raise _Problem(f"{field} is text in quotes")
    if raw["gender"] not in character_creation.GENDERS:
        raise _Problem(f"gender is one of {', '.join(sorted(character_creation.GENDERS))}")
    if raw["race"] not in character_creation.RACE_GROUPS:
        raise _Problem(f'"{raw["race"]}" isn\'t a race in the game')
    if raw["birthsign"] not in character_creation.BIRTHSIGNS:
        raise _Problem(f'"{raw["birthsign"]}" isn\'t a birthsign in the game')

    for slot in ("1", "2"):
        if raw[f"class{slot}"] != NONE or raw[f"classLvl{slot}"] != 0:
            raise _Problem(f'classes don\'t exist yet: class{slot} is "none" with classLvl{slot} 0')

    professions = [raw["prof1"], raw["prof2"], raw["prof3"]]
    for slot, profession in enumerate(professions, start=1):
        level = raw[f"profLvl{slot}"]
        if not _whole(level):
            raise _Problem(f"profLvl{slot} is a whole number")
        if profession == NONE:
            if level != 0:
                raise _Problem(f'profLvl{slot} is 0 while prof{slot} is "none"')
        else:
            if profession not in PROFESSION_CATEGORIES:
                raise _Problem(f'"{profession}" isn\'t a profession in the game')
            if not 1 <= level <= LEVEL_MAX:
                raise _Problem(f"profLvl{slot} is from 1 to {LEVEL_MAX}")
    if professions[0] == NONE:
        raise _Problem('prof1 is a profession, never "none"')
    if professions[2] != NONE and professions[1] == NONE:
        raise _Problem("fill the profession slots in order")
    groups = [PROFESSION_CATEGORIES[p] for p in professions if p != NONE]
    for group in groups:
        if groups.count(group) > 1:
            raise _Problem(f"two professions can't come from the same group ({group})")

    for attr in BODY + SOUL:
        if not _whole(raw[attr]) or raw[attr] < character_creation.ATTRIBUTE_MIN:
            raise _Problem(f"{attr} is a whole number of at least {character_creation.ATTRIBUTE_MIN}")
    body = sum(raw[a] for a in BODY)
    soul = sum(raw[a] for a in SOUL)
    if not GROUP_MIN <= body <= GROUP_MAX:
        raise _Problem(f"Body (might, agility, endurance, precision) adds up to {GROUP_MIN}-{GROUP_MAX} (got {body})")
    if not GROUP_MIN <= soul <= GROUP_MAX:
        raise _Problem(f"Soul (will, insight, lore, presence) adds up to {GROUP_MIN}-{GROUP_MAX} (got {soul})")
    if not TOTAL_MIN <= body + soul <= TOTAL_MAX:
        raise _Problem(f"Body and Soul together add up to {TOTAL_MIN}-{TOTAL_MAX} (got {body + soul})")

    equipment = raw[EQUIPMENT_FIELD]
    if not isinstance(equipment, list) or not all(isinstance(item, str) for item in equipment):
        raise _Problem('equipment is a list of item ids, like ["rope_1", "torch_2"]')
    if len(equipment) > EQUIPMENT_MAX:
        raise _Problem(f"equipment holds at most {EQUIPMENT_MAX} items")
    unknown_items = sorted({item for item in equipment if item not in ITEM_IDS})
    if unknown_items:
        raise _Problem(f"not items in the game: {', '.join(unknown_items)} (an item id with its tier, like rope_1)")

    values = {}
    for key in LEGEND_FIELDS:
        value = raw.get(key, 0)
        if not _whole(value) or not 0 <= value <= LEGEND_MAX:
            raise _Problem(f"{key} is a whole number from 0 to {LEGEND_MAX}")
        values[key] = value
    for pair in legend.LEGEND_PAIRS:
        if frozenset(pair) in _TENSION:
            continue
        if values[pair[0]] > 0 and values[pair[1]] > 0:
            raise _Problem(f"{pair[0]} and {pair[1]} are one scale - only one of them is above 0")

    return {
        "firstName": first,
        "lastName": last,
        "name": name,
        **{field: raw[field] for field in LIST_FIELDS},
        **{field: raw[field] for field in NUMBER_FIELDS},
        EQUIPMENT_FIELD: list(equipment),
        **values,
    }


def read_party(text: Optional[str], max_chars: Optional[int]) -> tuple:
    """The TestCharacters scene's party, checked: (party or None, errors).

    None and no errors when the story has no TestCharacters scene. Any problem
    is an error: the stored party must be one a test run can play with."""
    if text is None:
        return None, []
    try:
        raw = json.loads(text)
    except ValueError as ex:
        return None, [f"{PASSAGE}: not a valid list of characters (JSON): {ex}"]
    if not isinstance(raw, list) or not raw:
        return None, [f"{PASSAGE}: write the party as a list, like [{{\"firstName\": ...}}], leader first"]
    limit = PARTY_MAX
    if _whole(max_chars) and 1 <= max_chars < PARTY_MAX:
        limit = max_chars
    errors = []
    if len(raw) > limit:
        plural = "" if limit == 1 else "s"
        errors.append(f"{PASSAGE}: at most {limit} character{plural} (the story's $meta_maxCharNum, at most {PARTY_MAX})")
    party = []
    for number, entry in enumerate(raw, start=1):
        label = f"character {number}"
        if isinstance(entry, dict) and isinstance(entry.get("firstName"), str):
            label += f" ({entry['firstName'][:24]})"
        try:
            party.append(_character(entry))
        except _Problem as ex:
            errors.append(f"{PASSAGE}, {label}: {ex}")
    if errors:
        return None, errors
    return party, []
