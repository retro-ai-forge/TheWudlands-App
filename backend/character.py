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
    positions. See getPortraitAreas() in SoulCreation.tsx, which computes
    these client-side.
    """

    x: float
    y: float
    width: float
    height: float

    def to_dict(self) -> dict:
        return {"x": self.x, "y": self.y, "width": self.width, "height": self.height}


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
    # Stackable crafting resources this character carries (backpack), keyed
    # by resource id (see backend.resources_catalog) - a running total, never
    # per-unit item instances or slot assignments.
    resource_balances: Dict[str, int] = field(default_factory=dict)
    # Tools this character currently holds (id -> quantity), checked out of
    # the player's shared pool (backend.players.Player.tools, via
    # check_out_tool/check_in_tool) - stacked the same way as that pool, and
    # unavailable to the player's other characters while held here.
    tools: Dict[str, int] = field(default_factory=dict)
    # Starter tools (e.g. "knife") checked out of the player's separate
    # Player.tool_starter pool - same check-out/check-in mechanics as
    # `tools`, just a different pool (pass pool="toolStarter").
    tool_starter: Dict[str, int] = field(default_factory=dict)
    # Blueprint ids this character has learned (see backend.craft_catalog) -
    # chosen on the Trappings step from the pools their professions unlock.
    # Soulbound: unlike tools, blueprints never move to the player's shared
    # pool or to another character - knowing a technique is permanently tied
    # to the character who learned it (eventual candidate for an on-chain
    # soulbound token, one day). A one-time unlock, never a stackable
    # quantity like resource_balances.
    blueprints: List[str] = field(default_factory=list)
    # Starter (no-fancy-name, "blueprint_basic_*") blueprints - kept separate
    # from `blueprints` since they aren't chosen on the Trappings step, they
    # just come with the character. Equally soulbound.
    blueprint_starter: List[str] = field(default_factory=list)

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
            "availability": {"name": "ready", "timeRdy": self.created_at.isoformat()},
            "resourceBalances": self.resource_balances,
            "tools": self.tools,
            "toolStarter": self.tool_starter,
            "blueprints": self.blueprints,
            "blueprintStarter": self.blueprint_starter,
        }
