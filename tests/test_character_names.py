"""
Character name rules (data/character-name-rules.json, backend/character_names.py):
Latin letters with one space, hyphen or apostrophe between two letters, at most
two accents, one hyphen and one apostrophe in the whole name, and no reserved
word - names reach stories, messages and other players, so nothing in them may
be readable as markup or code. Pure functions plus the creation route's early
refusal - no DB needed.
"""

import asyncio
import json
import re
from pathlib import Path

import pytest
from fastapi import HTTPException

from backend import character_names
from backend.auth_routes import CreateCharacterRequest, create_character

ROOT = Path(__file__).resolve().parent.parent
EXAMPLES = character_names.RULES["examples"]


@pytest.mark.parametrize("name", EXAMPLES["valid"])
def test_valid_names_are_kept_as_typed(name):
    assert character_names.clean_name(name, "First name") == name


@pytest.mark.parametrize("name", EXAMPLES["invalid"])
def test_invalid_names_are_refused(name):
    with pytest.raises(character_names.InvalidName):
        character_names.clean_name(name, "First name")


@pytest.mark.parametrize("raw,stored", EXAMPLES["normalised"].items())
def test_names_are_stored_normalised(raw, stored):
    assert character_names.clean_name(raw, "Surname") == stored


@pytest.mark.parametrize("first,last,shown", EXAMPLES["fullNames"]["valid"])
def test_full_names_pass_as_a_pair(first, last, shown):
    first_name, last_name = character_names.clean_full_name(first, last)
    assert f"{first_name} {last_name}" == shown


@pytest.mark.parametrize("first,last", EXAMPLES["fullNames"]["invalid"])
def test_full_names_with_a_bad_part_are_refused(first, last):
    with pytest.raises(character_names.InvalidName):
        character_names.clean_full_name(first, last)


@pytest.mark.parametrize("first,last", [("Game", "Master"), ("Wud", "Lands"), ("Re", "Turn"), ("Hélène", "Dupré")])
def test_some_pairs_are_only_refused_together(first, last):
    # Each name passes alone; the text "first surname" holds a reserved word
    # or too many accents.
    character_names.clean_name(first, "First name")
    character_names.clean_name(last, "Surname")
    with pytest.raises(character_names.InvalidName, match="^First name and surname together "):
        character_names.clean_full_name(first, last)


def test_messages_name_the_field_and_the_rule():
    cases = [
        (lambda: character_names.clean_name("  ", "Surname"), "Surname is required"),
        (lambda: character_names.clean_name("A" * 25, "First name"), "First name can be at most 24 characters"),
        (lambda: character_names.clean_name("<<run x>>", "First name"),
         "First name can only use Latin letters, with a single space, hyphen or apostrophe between letters"),
        (lambda: character_names.clean_name("Мирослава", "First name"),
         "First name can only use Latin letters, with a single space, hyphen or apostrophe between letters"),
        (lambda: character_names.clean_name("Héloïsé", "First name"), "First name can have at most two accents"),
        (lambda: character_names.clean_name("Anne-Marie-Louise", "First name"), "First name can have at most one hyphen"),
        (lambda: character_names.clean_name("R un", "First name"), 'First name can\'t use the reserved word "run"'),
        (lambda: character_names.clean_full_name("O'Brien", "D'Arcy"),
         "First name and surname together can have at most one apostrophe"),
        (lambda: character_names.clean_full_name("Game", "Master"),
         'First name and surname together can\'t use the reserved word "game master"'),
    ]
    for call, message in cases:
        with pytest.raises(character_names.InvalidName) as refused:
            call()
        assert str(refused.value) == message


def _macro_names(format_js: Path) -> set[str]:
    source = format_js.read_text(encoding="utf-8")
    html = json.loads(source[source.index("{") : source.rindex("}") + 1])["source"]
    names: set[str] = set()
    for match in re.finditer(r"Macro\.add\(\s*(\[[^\]]*\]|\"[^\"]+\")", html):
        names.update(re.findall(r"\"([^\"]+)\"", match.group(1)))
    for match in re.finditer(r"tags:\s*\[([^\]]*)\]", html):
        names.update(re.findall(r"\"([^\"]+)\"", match.group(1)))
    return {name for name in names if name.isalpha()}


def test_every_story_command_is_a_reserved_word():
    formats = sorted((ROOT / "twinejs-integrated" / "public" / "story-formats").glob("sugarcube-2*/format.js"))
    runtime = ROOT / "twinejs-integrated" / "src" / "util" / "wudlands-runtime.ts"
    if not formats or not runtime.exists():
        pytest.skip("twinejs-integrated submodule not checked out")
    reserved = set(character_names.RESERVED_WORDS)
    for format_js in formats:
        missing = _macro_names(format_js) - reserved
        assert not missing, f"{format_js.parent.name}: add to reservedWords.commands: {sorted(missing)}"
    custom = set(re.findall(r"Macro\.add\('([a-z]+)'", runtime.read_text(encoding="utf-8")))
    assert custom and custom <= reserved


def _request(first_name: str, last_name: str = "Ironfoot") -> CreateCharacterRequest:
    return CreateCharacterRequest(
        slotNumber=1, firstName=first_name, lastName=last_name, age_month=240, gender="m",
        raceGroup="Common", race="human",
        attr={key: 5 for key in ("migh", "agil", "endu", "prec", "will", "insi", "lore", "pres")},
    )


@pytest.mark.parametrize(
    "first,last,message",
    [
        ("<<run x>>", "Ironfoot", "First name can only use Latin letters"),
        ("Grimjaw", "[[Go]]", "Surname can only use Latin letters"),
        ("Goto", "Cave", 'First name can\'t use the reserved word "goto"'),
    ],
)
def test_creation_refuses_a_bad_name_before_anything_is_saved(first, last, message):
    # The check comes first in the route, so this never reaches the database.
    with pytest.raises(HTTPException) as refused:
        asyncio.run(create_character(_request(first, last), address="test-wallet"))
    assert refused.value.status_code == 400
    assert refused.value.detail.startswith(message)


def test_creation_form_reads_the_same_rules():
    mirror = (ROOT / "app" / "lib" / "characterNames.ts").read_text(encoding="utf-8")
    assert 'from "../../backend/data/character-name-rules.json"' in mirror
