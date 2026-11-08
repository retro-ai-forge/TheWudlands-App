"""
Character model: an RPG character belonging to a player.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, Optional

from backend.legend import default_legend

# Valid values in Character.vital_status, per the "Vital Status" lore
# section on the world page (app/theworld/page.tsx).
VITAL_STATUSES = (
    "alive", "dead", "vampire", "soulless",
    "magicless", "cursed", "petrified", "incorporal",
)

# vitalStatus is a list: the first entry is the life state (alive or dead),
# the rest are conditions on top of it, e.g. ["alive", "soulless"] or
# ["dead", "soulless"]. The life state alone decides physical actions
# (foraging, adventures); conditions decide their own kind - soulless
# blocks soul actions such as magic.
LIFE_STATES = ("alive", "dead")


def vital_status_list(value) -> list:
    """Any stored vitalStatus as the list form. Older docs hold one word:
    "dead" -> ["dead"], "soulless" -> ["alive", "soulless"] (a condition on
    a living character), missing -> ["alive"]."""
    if isinstance(value, (list, tuple)):
        items = [str(v) for v in value if v]
    elif isinstance(value, str) and value:
        items = [value]
    else:
        items = []
    life = next((s for s in items if s in LIFE_STATES), "alive")
    conditions = list(dict.fromkeys(s for s in items if s not in LIFE_STATES))
    return [life, *conditions]


def is_alive(value) -> bool:
    """Can take physical actions: the life state (first entry) is alive."""
    return vital_status_list(value)[0] == "alive"


def has_soul(value) -> bool:
    """Can take soul actions such as magic: not soulless."""
    return "soulless" not in vital_status_list(value)

@dataclass
class ClassStats:
    """Class data: type, level."""    
    class_1: str = 'none'
    level_1: int = 0
    class_2: str = 'none'
    level_2: int = 0

    def to_dict(self) -> dict:
        return {"class1": self.class_1, "lvl1": self.level_1, "class2": self.class_2, "lvl2": self.level_2}

@dataclass
class ProfStats:
    """Profession data: profession, level, experience points."""
    profession_1: str = 'none'
    level_1: int = 0
    experience_1: int = 0
    profession_2: str = 'none'
    level_2: int = 0
    experience_2: int = 0
    profession_3: str = 'none'
    level_3: int = 0
    experience_3: int = 0
    # Which profession slot ("prof1"|"prof2"|"prof3") is this character's
    # prime profession, if any ("none" otherwise) - the sole slot that
    # receives final-item assembly-bonus XP on finishing a blueprint-gated
    # item (see backend.players.finish_craft). Player-chosen on the Stats
    # page, persisted here so it survives between sessions.
    prime: str = 'none'
    # Per-slot daily XP-cap tracking (see backend.players.
    # _profession_xp_grant_set_ops) - {"prof1": {"date": "2026-09-06",
    # "gained": 18}, ...}. "date" is a UTC calendar date (ISO 8601);
    # "gained" resets to 0 the first time that slot gains XP on a new date.
    # Never read directly by anything outside that grant logic.
    daily_xp: Dict[str, dict] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "prof1": self.profession_1,
            "lvl1": self.level_1,
            "exp1": self.experience_1,
            "prof2": self.profession_2,
            "lvl2": self.level_2,
            "exp2": self.experience_2,
            "prof3": self.profession_3,
            "lvl3": self.level_3,
            "exp3": self.experience_3,
            "prime": self.prime,
            "dailyXp": self.daily_xp,
        }

@dataclass
class AttributeStats:
    """Physical & Soul stats."""

    might: int = 1
    agility: int = 1
    endurance: int = 1
    precision: int = 1
    will: int = 1
    insight: int = 1
    lore: int = 1
    presence: int = 1

    def to_dict(self) -> dict:
        return {
            "migh": self.might,
            "agil": self.agility,
            "endu": self.endurance,
            "prec": self.precision,
            "will": self.will,
            "insi": self.insight,
            "lore": self.lore,
            "pres": self.presence,
        }

@dataclass(frozen=True)
class PortraitArea:
    """
    A crop rectangle expressed as fractions (0-1) of the source portrait
    image's natural width/height - portable, so it still makes sense however
    large/small the image is later re-rendered at, unlike on-screen pixel
    positions. See getPortraitAreas() in PortraitEditor.tsx, which computes
    these client-side.
    """

    x: float
    y: float
    width: float
    height: float
    # The crop rectangle's true on-screen aspect ratio (width/height),
    # captured directly from the editor's own frame element at save time -
    # x/y/width/height alone can't reproduce this (they're fractions of two
    # different bases, the source image's natural width and height, which
    # don't cancel out into a ratio without also knowing the natural size).
    # Optional only because older records were saved before this field
    # existed; a display falls back to an approximate fixed ratio for those.
    aspect_ratio: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            "x": self.x,
            "y": self.y,
            "width": self.width,
            "height": self.height,
            "aspectRatio": self.aspect_ratio,
        }


@dataclass
class Character:

    id: str = field(default_factory=lambda: uuid.uuid4().hex)
    # The soul slot (see backend.soul_slots) clicked to start creation; the
    # character "lives" in that slot. 0 means unassigned - the create route
    # always supplies a real value.
    slot_number: int = 0
    first_name: str = ''
    last_name: str = ''
    # See vital_status_list: [life state, *conditions].
    vital_status: list = field(default_factory=lambda: ["alive"])
    age_month: int = 23
    gender: str = 'd'
    race_group: str = 'common'
    race: str = 'human'
    portrait_url: str = ''
    birthsign: str = ''
    # Editing state (kept mainly for re-opening the portrait editor at the
    # same view) plus the two crop rectangles actually derived from it: the
    # full frame (frame_area, for future body/equipment-slot rendering) and
    # the face-only crop (face_area, used today for the soul slot preview).
    # None until a portrait has actually been framed (e.g. no portraitUrl).
    portrait_zoom: float = 1.0
    portrait_pan: Dict[str, float] = field(default_factory=lambda: {"x": 0.0, "y": 0.0})
    portrait_frame_area: Optional[PortraitArea] = None
    portrait_face_area: Optional[PortraitArea] = None
    classes: ClassStats = field(default_factory=ClassStats)
    profession: ProfStats = field(default_factory=ProfStats)
    attr: AttributeStats = field(default_factory=AttributeStats)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    # Temporary crafting-session staging area: itemBalances borrowed from
    # home (with vault as overflow) by start_craft, drained by finish_craft.
    # {"itemBalances": {id: qty},
    #  "activeCraft": {"familyId", "tier", "readyAt", ...} | None}
    crafting: dict = field(default_factory=lambda: {
        "itemBalances": {},
        "activeCraft": None,
    })
    # Everything this character carries for adventuring, as
    # opposed to what's staged for an active craft (see `crafting` above).
    # home itemBalances live in the character_homes collection (keyed by
    # address + characterId), not here.
    gear: dict = field(default_factory=lambda: {
        "items": [],
        "itemBalances": {"backpack": {}, "saddlepack": {}, "cart": {}},
    })
    # Which light source (if any) is currently lit and held, e.g.
    # {"family": "torch", "tier": 4, "litAt": "<isoformat>", "hand": "Left Hand"}.
    # Not an item instance - see backend/data/light-source-burn-hours.json;
    # remaining burn time is computed lazily from litAt, not stored directly.
    equipped_light: Optional[dict] = None
    # Player-toggled (see backend.players.set_in_adventure) - whether this
    # character is currently out on an adventure, away from the player's
    # shared vault. Changes what unequip_item does with a freed item: while
    # True, it's dropped into this character's own gear.items location:
    # "home" (still owned, not backpack-capacity-counted, since there's no
    # vault to send it back to mid-adventure); while False (safely at
    # base), it goes straight to the player's shared vault instead.
    in_adventure: bool = False
    # The running adventure this character is in, or None:
    # {"sessionId", "storyId", "title"} - a back-pointer to its
    # adventure_sessions doc (see backend.adventures). The DB is the only
    # source of truth for a running adventure (Cloud Run may serve each
    # request from a different container), so the frontend finds the run
    # through this field rather than React or localStorage state. Every
    # member of a party carries the same sessionId, which is how the soul
    # preview groups them. Cleared when the adventure ends.
    adventure: Optional[dict] = None
    # storyIds of every adventure this character finished (not ran away
    # from) - for stories that require others to be completed first.
    completed_stories: list = field(default_factory=list)
    adventure_finished: int = 0
    adventure_run_away: int = 0
    # Your Legend reputation values, {name: 0-100} without the story's
    # meta_ prefix (see backend.legend). Kept apart from `stats`.
    legend: dict = field(default_factory=default_legend)
    # Last write of `legend`; Renown fades from here (backend.legend.decayed).
    legend_updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "slotNumber": self.slot_number,
            "firstName": self.first_name,
            "lastName": self.last_name,
            "vitalStatus": vital_status_list(self.vital_status),
            "age_month": self.age_month,
            "gender": self.gender,
            "raceGroup": self.race_group,
            "race": self.race,
            "portraitUrl": self.portrait_url,
            "birthsign": self.birthsign,
            "portraitZoom": self.portrait_zoom,
            "portraitPan": self.portrait_pan,
            "portraitFrameArea": self.portrait_frame_area.to_dict() if self.portrait_frame_area else None,
            "portraitFaceArea": self.portrait_face_area.to_dict() if self.portrait_face_area else None,
            "classes": self.classes.to_dict(),
            "profession": self.profession.to_dict(),
            "attr": self.attr.to_dict(),
            "createdAt": self.created_at.isoformat(),
            # A character is immediately usable on creation - timeRdy is
            # stamped to created_at (already in the past by the time this is
            # read back), which is the signal the frontend uses to show no
            # countdown at all, just a "ready" status.
            "availability": {
                "name": "ready",
                "timeRdy": self.created_at.isoformat(),
                "inAdventure": self.in_adventure,
                "adventure": self.adventure,
            },
            "crafting": self.crafting,
            "gear": self.gear,
            "equippedLight": self.equipped_light,
            "completedStories": self.completed_stories,
            "stats": {
                "adventureFinished": self.adventure_finished,
                "adventureRunAway": self.adventure_run_away,
            },
            "legend": self.legend,
            "legendUpdatedAt": self.legend_updated_at.isoformat(),
        }
