"""
Character model: an RPG character belonging to a player.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

# Valid values for Character.vital_status, per the "Vital Status" lore
# section on the world page (app/theworld/page.tsx). Nothing sets a
# character to anything but "alive" yet, but the set is recorded here so
# future writers have a single place to validate against.
VITAL_STATUSES = (
    "alive", "dead", "vampire", "soulless",
    "magicless", "cursed", "petrified", "incorporal",
)

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
    vital_status: str = 'alive'
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
    # Temporary crafting-session staging area: resources/tools/itemBalances
    # borrowed from the player's shared crafting/vault pools by
    # backend.players.start_craft to stage one active craft, and drained by
    # finish_craft (or check_in_resource/check_in_tool as a manual escape
    # hatch). Never a place a player parks materials directly - see the
    # item-instance plan's "Backpack capacity" section for the full model.
    # {"resources": {id: qty}, "tools": {id: qty}, "itemBalances": {id: qty},
    #  "activeCraft": {"familyId", "tier", "readyAt", ...} | None}
    crafting: dict = field(default_factory=lambda: {
        "resources": {},
        "tools": {},
        "itemBalances": {},
        "activeCraft": None,
    })
    # Blueprint ids this character has learned (see backend.craft_catalog) -
    # chosen on the Trappings step from the pools their professions unlock.
    # Soulbound: unlike tools, blueprints never move to the player's shared
    # pool or to another character - knowing a technique is permanently tied
    # to the character who learned it (eventual candidate for an on-chain
    # soulbound token, one day). A one-time unlock, never a stackable
    # quantity like a resource balance.
    blueprints: List[str] = field(default_factory=list)
    # Everything this character actually owns/carries for adventuring, as
    # opposed to what's staged for an active craft (see `crafting` above).
    # `items` holds item instances (backend.items_catalog; only
    # needsItemDefinition:true families ever appear here - location:
    # "backpack"/"body"/"crafting"/"camp", the last two meaning respectively
    # borrowed for an active craft, and unequipped-but-not-backpack-capacity-
    # counted (see in_adventure below and backend.players.unequip_item).
    # `resources`/`itemBalances` are flat-count balances split by physical
    # location: "camp" (owned, not packed anywhere specific), "backpack",
    # and "saddlepack" (mount-side, see the Mbagpack equip slot) - moving a
    # unit between locations never changes the total the character owns,
    # only where it currently sits.
    gear: dict = field(default_factory=lambda: {
        "items": [],
        "resources": {"camp": {}, "backpack": {}, "saddlepack": {}},
        "itemBalances": {"camp": {}, "backpack": {}, "saddlepack": {}},
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
    # "camp" (still owned, not backpack-capacity-counted, since there's no
    # vault to send it back to mid-adventure); while False (safely at
    # base), it goes straight to the player's shared vault instead.
    in_adventure: bool = False

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "slotNumber": self.slot_number,
            "firstName": self.first_name,
            "lastName": self.last_name,
            "vitalStatus": self.vital_status,
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
            },
            "crafting": self.crafting,
            "blueprints": self.blueprints,
            "gear": self.gear,
            "equippedLight": self.equipped_light,
        }
