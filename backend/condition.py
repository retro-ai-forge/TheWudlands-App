"""
Temporary attribute loss and healing.

A character's `attr` holds its maximum attribute values (set at creation,
and may grow later through adventures or class levels). Temporary damage is
stored apart from it, as points lost per attribute:

    characters.attrLost  = {"endu": 2, "will": 1}   (only attributes that lost points)
    characters.healFrom  = ISO time the healing clock last (re)started, or None

so the current value is always `attr - attrLost` (never below 0) and a
growing maximum lifts the current value with it.

Healing: every HEAL_INTERVAL (20h) of UNINTERRUPTED free time heals one point.
The clock restarts after every new loss and every time the character comes
back from foraging, crafting or an adventure; while it is out, the clock is
stopped (healFrom None) and heals nothing. Which attribute heals is random,
weighted by points lost, so the worst-hit attribute tends to heal first.

Losing: a point aimed at an attribute already at 0 goes to another attribute
of its group, and once the whole group is at 0, to the other group - a lost
point is always lost until every attribute is 0. When all Body attributes
reach 0 the character is dead, when all Soul attributes do it is soulless.
Both are yes/no and stack: vitalStatus ["alive"] (soul intact is not
written), ["alive", "soulless"], ["dead"], ["dead", "soulless"] - mirrored
as the leading player_characters tags. A drained group never heals again.

The heal picks are seeded by the clock time, so working out the current
state is a pure function of the stored fields and the time: reads never need
to write. Transitions persist the settled state:
    pause_healing   - going out (foraging, crafting, adventure)
    resume_healing  - coming back free
    apply_loss      - losing points (restarts the clock)
"""

from __future__ import annotations

import math
import os
import random
from datetime import datetime, timedelta, timezone
from typing import Optional

from backend.character import VITAL_STATUSES, is_alive, vital_status_list
from backend.db import get_database, transactional

BODY_ATTRS = ("migh", "agil", "endu", "prec")
SOUL_ATTRS = ("will", "insi", "lore", "pres")
ATTR_GROUPS = {"body": BODY_ATTRS, "soul": SOUL_ATTRS}
ATTR_KEYS = BODY_ATTRS + SOUL_ATTRS

ATTR_NAMES = {
    "migh": "Might", "agil": "Agility", "endu": "Endurance", "prec": "Precision",
    "will": "Will", "insi": "Insight", "lore": "Lore", "pres": "Presence",
}

HEAL_HOURS = 20


def heal_interval() -> timedelta:
    """Free time needed per healed point - HEALING_INTERVAL_MINUTES overrides
    it (local testing only; never set it in production)."""
    override = os.getenv("HEALING_INTERVAL_MINUTES")
    if override:
        return timedelta(minutes=float(override))
    return timedelta(hours=HEAL_HOURS)


# ── Pure rules ──────────────────────────────────────────────────────────


def current_attrs(attr_max: dict, lost: Optional[dict]) -> dict:
    """Current value per attribute: max minus points lost, never below 0."""
    lost = lost or {}
    return {k: max(0, int(attr_max.get(k, 0)) - int(lost.get(k, 0))) for k in ATTR_KEYS}


def _clean(lost: dict) -> dict:
    return {k: n for k, n in lost.items() if n > 0}


def group_of(key: str) -> str:
    return "body" if key in BODY_ATTRS else "soul"


def _other(group: str) -> str:
    return "soul" if group == "body" else "body"


def drained_groups(attr_max: dict, lost: Optional[dict]) -> set:
    """Groups whose every attribute is at 0 - Body drained means dead, Soul
    drained means soulless. A drained group never heals again."""
    now = current_attrs(attr_max, lost)
    return {g for g, keys in ATTR_GROUPS.items() if all(now[k] == 0 for k in keys)}


def place_point(preferred: str, attr_max: dict, lost: dict, rng: random.Random,
                group: Optional[str] = None) -> Optional[str]:
    """Where one lost point lands: `preferred` if it still has a point, else
    a random other attribute of its group, else of the other group. None only
    once every attribute is at 0 - a lost point is always lost until then."""
    now = current_attrs(attr_max, lost)
    if preferred and now.get(preferred, 0) > 0:
        return preferred
    group = group or group_of(preferred)
    for g in (group, _other(group)):
        options = [k for k in ATTR_GROUPS[g] if now[k] > 0]
        if options:
            return rng.choice(options)
    return None


def pick_attr_to_lose(group: str, attr_max: dict, lost: dict, rng: random.Random) -> Optional[str]:
    """A random attribute of the group with a point left - spilling over to
    the other group once this one is drained (see place_point)."""
    return place_point("", attr_max, lost, rng, group=group)


def pick_attr_to_heal(lost: dict, rng: random.Random, locked: frozenset = frozenset()) -> Optional[str]:
    """A random damaged attribute outside the drained groups, weighted by
    points lost."""
    keys = sorted(k for k, n in lost.items() if n > 0 and group_of(k) not in locked)
    if not keys:
        return None
    return rng.choices(keys, weights=[lost[k] for k in keys], k=1)[0]


def settle(attr_max: dict, lost: Optional[dict], heal_from: Optional[str], now: datetime,
           seed: str) -> tuple[dict, Optional[str]]:
    """Apply every heal that came due by `now`.

    Returns (points lost, clock). Each healed point moves the clock on by one
    interval; once nothing is left to heal the clock stops (None). With the
    clock stopped (out foraging/crafting/adventuring) nothing changes. A
    drained group (dead / soulless) never heals.
    Deterministic for the same inputs, so any container computes the same.
    """
    lost = _clean(dict(lost or {}))
    locked = frozenset(drained_groups(attr_max, lost))
    if not lost or pick_attr_to_heal(lost, random.Random(0), locked) is None:
        return lost, None
    if not heal_from:
        return lost, None
    clock = datetime.fromisoformat(heal_from)
    step = heal_interval()
    while now - clock >= step:
        clock += step
        key = pick_attr_to_heal(lost, random.Random(f"{seed}:{clock.isoformat()}"), locked)
        if key is None:
            break
        lost[key] -= 1
        lost = _clean(lost)
    healable = pick_attr_to_heal(lost, random.Random(0), locked) is not None
    return lost, (clock.isoformat() if healable else None)


def is_dead(doc: dict) -> bool:
    """No physical actions (foraging, crafting, adventures): the life state
    is dead, or every Body attribute is at 0 (a drained group never heals,
    so the stored loss is enough). Soulless alone doesn't count."""
    if not is_alive(doc.get("vitalStatus")):
        return True
    lost = doc.get("attrLost")
    if not lost:   # nothing lost (or no attributes stored): Body is whole
        return False
    return "body" in drained_groups(doc.get("attr") or {}, lost)


def vital_status_for(attr_max: dict, lost: Optional[dict], current=("alive",)) -> list:
    """The vitalStatus list (see backend.character.vital_status_list): the
    life state turns dead once Body is drained, and soulless is added once
    Soul is - the two stack (["dead", "soulless"]). Other conditions
    (vampire, cursed, ...) are kept."""
    status = vital_status_list(current)
    drained = drained_groups(attr_max, lost)
    life = "dead" if "body" in drained else status[0]
    conditions = status[1:]
    if "soul" in drained and "soulless" not in conditions:
        conditions = [*conditions, "soulless"]
    return [life, *conditions]


def condition_view(doc: dict, now: Optional[datetime] = None) -> dict:
    """The fields the client sees: attrNow, attrLost, nextHealAt."""
    now = now or datetime.now(timezone.utc)
    lost, clock = settle(doc.get("attr") or {}, doc.get("attrLost"), doc.get("healFrom"), now, doc.get("id", ""))
    # Out foraging/crafting/adventuring: the clock is (about to be) stopped.
    next_heal = (datetime.fromisoformat(clock) + heal_interval()).isoformat() if clock and not is_busy(doc) else None
    return {
        "attrNow": current_attrs(doc.get("attr") or {}, lost),
        "attrLost": lost,
        "nextHealAt": next_heal,
    }


def annotate(doc: dict, now: Optional[datetime] = None) -> dict:
    """Add the condition fields to a character doc in place (for responses)."""
    doc.update(condition_view(doc, now))
    return doc


def is_busy(doc: dict, now: Optional[datetime] = None) -> bool:
    """Out foraging, crafting or on an adventure - no healing then."""
    availability = doc.get("availability") or {}
    return bool(
        availability.get("inAdventure")
        or availability.get("adventure")
        or (doc.get("foraging") or {}).get("activeForage")
        or (doc.get("crafting") or {}).get("activeCraft")
    )


# ── Transitions (persisted) ─────────────────────────────────────────────


async def _load(db, address: str, character_id: str) -> Optional[dict]:
    return await db.characters.find_one(
        {"address": address, "id": character_id},
        {"id": 1, "attr": 1, "attrLost": 1, "healFrom": 1, "availability": 1, "vitalStatus": 1,
         "foraging.activeForage": 1, "crafting.activeCraft": 1},
    )


async def _save(db, address: str, character_id: str, lost: dict, clock: Optional[str]) -> None:
    await db.characters.update_one(
        {"address": address, "id": character_id},
        {"$set": {"attrLost": lost, "healFrom": clock}},
    )


async def pause_healing(address: str, character_id: str, db=None) -> None:
    """The character is going out: keep what healed so far, stop the clock."""
    db = db if db is not None else get_database()
    doc = await _load(db, address, character_id)
    if doc is None or not (doc.get("attrLost") or doc.get("healFrom")):
        return
    lost, _ = settle(doc.get("attr") or {}, doc.get("attrLost"), doc.get("healFrom"),
                     datetime.now(timezone.utc), character_id)
    await _save(db, address, character_id, lost, None)


async def resume_healing(address: str, character_id: str, db=None) -> bool:
    """The character is free again: (re)start the clock if anything is lost.
    Returns whether anything changed."""
    db = db if db is not None else get_database()
    doc = await _load(db, address, character_id)
    if doc is None or is_busy(doc):
        return False
    lost = _clean(doc.get("attrLost") or {})
    healable = pick_attr_to_heal(lost, random.Random(0), frozenset(drained_groups(doc.get("attr") or {}, lost)))
    clock = datetime.now(timezone.utc).isoformat() if healable else None
    if lost == (doc.get("attrLost") or {}) and clock == doc.get("healFrom"):
        return False
    await _save(db, address, character_id, lost, clock)
    return True


@transactional
async def apply_loss(address: str, character_id: str, points: dict, db=None,
                     rng: random.Random | None = None) -> tuple[dict, Optional[str]]:
    """Take `points` ({attr: n}) off the current values and restart the
    healing clock (if the character is free). A point aimed at an attribute
    already at 0 spills over (place_point). Draining Body makes the character
    dead, draining Soul soulless. Returns (what was actually lost, what the
    vital status newly gained - e.g. "soulless" or "dead, soulless" - or
    None)."""
    db = db if db is not None else get_database()
    rng = rng or random.Random()
    doc = await _load(db, address, character_id)
    if doc is None:
        return {}, None
    now = datetime.now(timezone.utc)
    attr_max = doc.get("attr") or {}
    lost, _ = settle(attr_max, doc.get("attrLost"), doc.get("healFrom"), now, character_id)
    taken: dict = {}
    for key, n in points.items():
        for _ in range(int(n)):
            target = place_point(key, attr_max, lost, rng)
            if target is None:
                break
            lost[target] = lost.get(target, 0) + 1
            taken[target] = taken.get(target, 0) + 1
    lost = _clean(lost)
    healable = pick_attr_to_heal(lost, random.Random(0), frozenset(drained_groups(attr_max, lost)))
    clock = now.isoformat() if healable and not is_busy(doc) else None
    await _save(db, address, character_id, lost, clock)

    old_status = vital_status_list(doc.get("vitalStatus"))
    new_status = vital_status_for(attr_max, lost, old_status)
    if new_status != old_status:
        await _set_vital_status(db, address, character_id, new_status)
        gained = [s for s in new_status if s not in old_status]
        return taken, ", ".join(gained) or None
    return taken, None


async def _set_vital_status(db, address: str, character_id: str, new: list) -> None:
    """Set the vitalStatus list on the character, and as the leading tags of
    its summary entry (any older vital tags are replaced)."""
    await db.characters.update_one({"address": address, "id": character_id},
                                   {"$set": {"vitalStatus": new}})
    pc = await db.player_characters.find_one(
        {"address": address, "characters.characterId": character_id}, {"characters": 1})
    if not pc:
        return
    entry = next(e for e in pc["characters"] if e.get("characterId") == character_id)
    tags = [*new, *(t for t in entry.get("tags", []) if t not in VITAL_STATUSES)]
    await db.player_characters.update_one(
        {"address": address, "characters.characterId": character_id},
        {"$set": {"characters.$.tags": tags}},
    )


# ── A night out (foraging) ──────────────────────────────────────────────


def night_cost(rules: dict, shelter_count: int, weather: str) -> float:
    """Expected points a night costs: pointsLost by shelter count (tent/
    bedroll carried: 0, 1, 2) and the weather's severity (none/mild/severe).
    The whole part is certain, a fraction is the chance of one more point."""
    severity = (rules["weather"].get(weather) or {}).get("severity", "none")
    return float(rules["pointsLost"][str(min(shelter_count, 2))].get(severity, 0))


def weathers_for(rules: dict, family_id: Optional[str]) -> dict[str, float]:
    """{weather: weight} possible at a site. Materials dug underground
    (rules "underground": mines and caves) only get the weathers marked
    "underground", every other material only the rest. Weathers without
    "families" happen anywhere on their side, the others only when foraging
    one of their families (e.g. a sandstorm only on sand)."""
    below = family_id in (rules.get("underground") or ())
    return {w: float(c["weight"]) for w, c in rules["weather"].items()
            if bool(c.get("underground")) == below
            and (not c.get("families") or family_id in c["families"])}


def roll_night(rules: dict, shelter_count: int, attr_max: dict, lost: Optional[dict],
               rng: random.Random, family_id: Optional[str] = None) -> dict:
    """Roll one night's weather and what it costs.

    `rules` = foraging-rules.json "nights": weathers ({weight, severity,
    families?}) and pointsLost by shelter count and severity (night_cost).
    Two points = one Body + one Soul; one point = Body or Soul, 50/50 - a
    weather with "group" (e.g. ghosts: "soul") sends every point there.
    Returns {"weather", "points": {attr: 1},
    "kind": "both"|"body"|"soul"|"sheltered"|"calm"}.
    """
    weights = weathers_for(rules, family_id)
    weathers = list(weights)
    weather = rng.choices(weathers, weights=[weights[w] for w in weathers], k=1)[0]

    expected = night_cost(rules, shelter_count, weather)
    n = int(math.floor(expected))
    if rng.random() < expected - n:
        n += 1

    only = (rules["weather"].get(weather) or {}).get("group")
    if only:
        groups = [only] * n
    else:
        groups = ["body", "soul"] if n >= 2 else ([rng.choice(["body", "soul"])] if n == 1 else [])
    points: dict = {}
    running = dict(lost or {})
    for group in groups:
        key = pick_attr_to_lose(group, attr_max, running, rng)
        if key:
            points[key] = points.get(key, 0) + 1
            running[key] = running.get(key, 0) + 1

    hit = [g for g in ("body", "soul") if any(k in ATTR_GROUPS[g] for k in points)]
    if len(hit) == 2:
        kind = "both"
    elif hit:
        kind = hit[0]
    else:
        # Nothing lost: thanks to the shelter on a night that would have
        # cost something without it, else simply a harmless night.
        harmless = night_cost(rules, 0, weather) == 0
        kind = "sheltered" if shelter_count and not harmless else "calm"
    return {"weather": weather, "points": points, "kind": kind}
