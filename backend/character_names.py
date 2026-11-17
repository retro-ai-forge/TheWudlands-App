"""
Rules for a character's first name and surname (data/character-name-rules.json).

An allow-list: Latin letters (with accents and umlauts, plus "extraLetters")
and one separator (space, hyphen or apostrophe) between two letters; at most
two accents, one hyphen and one apostrophe in the whole name, and no reserved
word (SugarCube commands, staff words).
Names reach stories, messages and other players, so nothing in a name may be
readable as markup or code - checked at character creation, the only place a
name is set. Mirrored for the creation form in app/lib/characterNames.ts; this
module is the authority.
"""

from __future__ import annotations

import json
import unicodedata
from pathlib import Path

RULES = json.loads((Path(__file__).parent / "data" / "character-name-rules.json").read_text(encoding="utf-8"))
MAX_LENGTH: int = RULES["maxLength"]
EXTRA_LETTERS: frozenset[str] = frozenset(RULES["extraLetters"])
MAX_ACCENTS: int = RULES["maxAccentsInFullName"]
SEPARATORS: frozenset[str] = frozenset(RULES["separators"])
REPLACE: dict[str, str] = RULES["replace"]
MAX_IN_FULL_NAME: dict[str, int] = RULES["maxInFullName"]
RESERVED_WORDS: list[str] = [
    word.lower() for group, words in RULES["reservedWords"].items() if not group.startswith("_") for word in words
]
RESERVED_ANYWHERE: list[str] = [word.lower() for word in RULES["reservedAnywhere"]]

# Accents: the combining diacritical marks block, minus the invisible
# combining grapheme joiner.
_MARKS = range(0x0300, 0x0370)
_INVISIBLE_MARKS = {0x034F}

_SEPARATOR_WORDS = {" ": "space", "-": "hyphen", "'": "apostrophe"}
_NUMBER_WORDS = {1: "one", 2: "two", 3: "three"}


class InvalidName(ValueError):
    """A name the rules refuse; the message says why (shown to the player)."""


def _count(limit: int, word: str) -> str:
    return f"{_NUMBER_WORDS.get(limit, str(limit))} {word}{'' if limit == 1 else 's'}"


def _separator_phrase() -> str:
    """ "space, hyphen or apostrophe" for the configured separators."""
    words: list[str] = []
    for separator in RULES["separators"]:
        word = _SEPARATOR_WORDS.get(separator, repr(separator))
        if word not in words:
            words.append(word)
    return words[0] if len(words) == 1 else ", ".join(words[:-1]) + " or " + words[-1]


def normalise_name(value: str) -> str:
    """NFKC (wide or bold letter styles become plain letters), "replace"
    applied (curly apostrophes -> plain), trimmed, runs of plain spaces
    collapsed to one - the stored form."""
    text = unicodedata.normalize("NFKC", value or "")
    for old, new in REPLACE.items():
        text = text.replace(old, new)
    return " ".join(part for part in text.split(" ") if part)


def _is_letter(ch: str) -> bool:
    return "a" <= ch <= "z" or "A" <= ch <= "Z" or ch in EXTRA_LETTERS


def _is_mark(ch: str) -> bool:
    return ord(ch) in _MARKS and ord(ch) not in _INVISIBLE_MARKS


def _shape_problem(name: str, separators: frozenset[str] = SEPARATORS) -> str | None:
    """None for Latin letters with at most MAX_ACCENTS accents in all, each
    on a letter, and a separator only between two letters; "accents" for too
    many accents; "letters" for anything else."""
    previous = None
    accents = 0
    for ch in unicodedata.normalize("NFD", name):
        if _is_letter(ch):
            previous = "letter"
        elif _is_mark(ch):
            if previous != "letter":
                return "letters"
            accents += 1
            if accents > MAX_ACCENTS:
                return "accents"
        elif ch in separators:
            if previous != "letter":
                return "letters"
            previous = "separator"
        else:
            return "letters"
    return None if previous == "letter" else "letters"


def _too_many(text: str) -> str | None:
    """The first sign `text` holds more often than maxInFullName allows, as
    the allowance ("one hyphen"), or None."""
    for sign, limit in MAX_IN_FULL_NAME.items():
        if text.count(sign) > limit:
            return _count(limit, _SEPARATOR_WORDS.get(sign, repr(sign)))
    return None


def _reserved(text: str) -> str | None:
    """The reserved word or phrase `text` holds - as whole words, or spelled
    by the whole text once its separators are removed - or None."""
    lowered = text.lower()
    for separator in SEPARATORS:
        lowered = lowered.replace(separator, " ")
    words = lowered.split()
    squashed = "".join(words)
    for entry in RESERVED_WORDS:
        parts = entry.split()
        if squashed == "".join(parts) or any(
            words[i : i + len(parts)] == parts for i in range(len(words) - len(parts) + 1)
        ):
            return entry
    return next((entry for entry in RESERVED_ANYWHERE if entry in squashed), None)


def _problem(text: str, label: str, separators: frozenset[str] = SEPARATORS) -> str | None:
    shape = _shape_problem(text, separators)
    if shape == "letters":
        return f"{label} can only use Latin letters, with a single {_separator_phrase()} between letters"
    if shape == "accents":
        return f"{label} can have at most {_count(MAX_ACCENTS, 'accent')}"
    too_many = _too_many(text)
    if too_many:
        return f"{label} can have at most {too_many}"
    reserved = _reserved(text)
    if reserved:
        return f'{label} can\'t use the reserved word "{reserved}"'
    return None


def clean_name(value: str, label: str) -> str:
    """The normalised name, or InvalidName saying what is wrong with it.
    `label` names the field in the message ("First name", "Surname")."""
    name = normalise_name(value)
    if not name:
        raise InvalidName(f"{label} is required")
    if len(name) > MAX_LENGTH:
        raise InvalidName(f"{label} can be at most {MAX_LENGTH} characters")
    problem = _problem(name, label)
    if problem:
        raise InvalidName(problem)
    return name


def clean_full_name(first: str, last: str) -> tuple[str, str]:
    """Both names checked on their own, then together as the text
    "first surname" - the way they're shown (market, messages, stories) - so
    the combination can't hold anything the rule refuses either: a mix of
    signs over the limit, or a reserved word split across the two names. The
    space joining them is always allowed there. Returns the normalised pair."""
    first_name = clean_name(first, "First name")
    last_name = clean_name(last, "Surname")
    problem = _problem(f"{first_name} {last_name}", "First name and surname together", SEPARATORS | {" "})
    if problem:
        raise InvalidName(problem)
    return first_name, last_name
