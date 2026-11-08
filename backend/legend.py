"""Your Legend: a character's reputation values (see "Your Legend" on
app/create/tools and the tutorial section in app/create/tutorial).

Stored on the character doc as `legend: {name: 0-100}` (floats), one entry per name,
without the `meta_` prefix the story variables carry ($meta_mercy in a
story = legend.mercy on the character). The names come in pairs; except for
fame/infamy (two separate values that pull against each other) a pair is one
scale, so only one side of it is ever above 0.

A change is applied to the character the moment it happens (change_legend,
the one write path, through apply_change, the one calculation). Some
values fade with time (Renown, "out of sight, out of mind"): the fade is
worked out on read from legendUpdatedAt (decayed), like attribute healing,
and folded in on the next write:
a story's `<<set $meta_mercy += 3>>` goes straight into the character doc,
with the rules from data/legend-rules.json applied (apply_change). There is
no per-adventure tracking; story review makes sure no loop or oversized
change exists.
"""

import json
from datetime import datetime, timezone
from pathlib import Path

from backend.db import get_database

# (first, second) per pair - the same order as the tools page table.
LEGEND_PAIRS = (
    ("fame", "infamy"),
    ("renown", "obscurity"),
    ("faith", "heresy"),
    ("honor", "shame"),
    ("loyalty", "treachery"),
    ("mercy", "cruelty"),
    ("courage", "cowardice"),
    ("favour", "disgrace"),
    ("purity", "corruption"),
    ("wildkin", "despoiler"),
)

LEGEND_KEYS = tuple(name for pair in LEGEND_PAIRS for name in pair)

# Story variable prefix: $meta_<key> in a story maps to legend.<key>.
STORY_PREFIX = "meta_"

RULES = json.loads((Path(__file__).parent / "data" / "legend-rules.json").read_text())
MAX = RULES["max"]

# name -> the other name of its pair, and which pairs pull instead of sharing a scale
_PARTNER = {a: b for a, b in LEGEND_PAIRS} | {b: a for a, b in LEGEND_PAIRS}
_TENSION = {name for pair in RULES["tension"]["pairs"] for name in pair}
_ECHOES: dict = {}
for _link in RULES["echoes"]["links"]:
    _ECHOES.setdefault(_link["from"], []).append(_link["to"])


def default_legend() -> dict:
    """A new character's legend: every value 0."""
    return {key: 0.0 for key in LEGEND_KEYS}


def with_defaults(legend) -> dict:
    """A stored legend with every known name present (0 when missing), for
    characters created before the legend existed or before a name was added."""
    out = default_legend()
    for key, value in (legend or {}).items():
        if key in out:
            out[key] = float(value)
    return out


# Stored values are floats: a quarter or half of a small change (an echo of
# +1 is 0.25) must not be lost to rounding. Kept to a few decimals so float
# noise (0.1 + 0.2) never piles up; levels use the whole part.
DECIMALS = 4


def _clamp(value: float, low: float, high: float) -> float:
    return round(max(low, min(high, value)), DECIMALS)


def _apply_one(legend: dict, name: str, amount: float) -> None:
    """One change on its own pair, in place: a shared scale moves as one
    number (raising one side first wears the other down to 0); a tension
    pair is two values, and a rise lowers the other side by its share."""
    partner = _PARTNER[name]
    if name in _TENSION:
        legend[name] = _clamp(legend[name] + amount, 0, MAX)
        if amount > 0:
            pull = amount * RULES["tension"]["share"]
            legend[partner] = _clamp(legend[partner] - pull, 0, MAX)
        return
    scale = _clamp(legend[name] - legend[partner] + amount, -MAX, MAX)
    legend[name] = max(scale, 0.0)
    legend[partner] = max(-scale, 0.0)


def apply_change(legend, name: str, amount: float) -> dict:
    """The legend after one change: `<<set $meta_<name> += amount>>`
    (a negative amount is `-=`). Every change - stories, foraging, anything
    later - goes through here, so the related values always move with it.

    Returns a new dict; the input is not changed. Rules (legend-rules.json):
      - the two sides of a pair are one scale, except tension pairs
        (fame/infamy), where a rise lowers the other by its share (half);
      - a rise echoes its share (a quarter) into linked names, through the
        same pair rules, and an echo never echoes again;
      - every value stays within 0-100.
    """
    if name not in _PARTNER:
        raise ValueError(f"unknown legend name {name!r}")
    amount = float(amount)
    out = with_defaults(legend)
    _apply_one(out, name, amount)
    if amount > 0:
        echo = amount * RULES["echoes"]["share"]
        for target in _ECHOES.get(name, []):
            _apply_one(out, target, echo)
    return out


def apply_changes(legend, changes) -> dict:
    """Several changes in order, e.g. [("mercy", 3), ("courage", -1)]."""
    out = with_defaults(legend)
    for name, amount in changes:
        out = apply_change(out, name, amount)
    return out


def _parse_time(value):
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str) and value:
        parsed = datetime.fromisoformat(value)
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    return None


def decayed(legend, updated_at, now=None) -> dict:
    """The legend as it is now: the stored values minus what has faded since
    the last write (updated_at, the character's legendUpdatedAt). Computed
    on read, nothing is written. No timestamp (a character stored before the
    fade existed) means nothing has faded yet."""
    out = with_defaults(legend)
    since = _parse_time(updated_at)
    if since is None:
        return out
    days = ((now or datetime.now(timezone.utc)) - since).total_seconds() / 86400
    if days <= 0:
        return out
    for rule in RULES["decay"]["names"]:
        name = rule["name"]
        out[name] = _clamp(out[name] - days * rule["points"] / rule["days"], 0, MAX)
    return out


def level(value: float) -> str:
    """The level name of a value (the whole part counts)."""
    for low, name in ((90, "legendary"), (60, "renowned"), (30, "known"), (10, "whispered")):
        if value >= low:
            return name
    return "none"


async def change_legend(address: str, character_id: str, changes):
    """Apply changes (list of (name, amount)) to a character's stored legend
    in one write, and return the new legend (None if there is no such
    character). The one way a legend is written.

    Read, compute, then write only if nobody else wrote in between
    (legendSeq), retrying a few times, so two changes at once never lose one.
    The write is checked through update_one's modified count: on this
    database (Firestore, MongoDB compatible) find_one_and_update can report a
    match to several callers at once although only one write lands.
    """
    db = get_database()
    for _ in range(8):
        doc = await db.characters.find_one(
            {"address": address, "id": character_id},
            {"legend": 1, "legendSeq": 1, "legendUpdatedAt": 1},
        )
        if doc is None:
            return None
        # Fold in what has faded so far, then restart the fade clock at now,
        # so nothing fades twice.
        now = datetime.now(timezone.utc)
        current = decayed(doc.get("legend"), doc.get("legendUpdatedAt"), now)
        new = apply_changes(current, changes)
        seq = doc.get("legendSeq")
        result = await db.characters.update_one(
            {"address": address, "id": character_id, "legendSeq": seq},
            {"$set": {"legend": new, "legendUpdatedAt": now.isoformat()}, "$inc": {"legendSeq": 1}},
        )
        if result.modified_count == 1:
            return new
    raise RuntimeError(f"legend of {character_id} kept changing, gave up")
