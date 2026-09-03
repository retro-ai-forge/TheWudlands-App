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
    # Temporary crafting-session staging area, keyed by resource id (see
    # backend.resources_catalog) - populated by backend.players.start_craft
    # (drawing from the player's shared inventory.resources) and drained by
    # finish_craft, or check_in_resource as a manual escape hatch. Never a
    # place a player parks materials directly - see the item-instance
    # plan's "Backpack capacity" section for the full four-tier model.
    resource_balances: Dict[str, int] = field(default_factory=dict)
    # Same temporary-staging role as resource_balances, for tools -
    # populated by start_craft when the recipe's tool isn't already held,
    # drained via check_in_tool (start_craft's transfer never automatically
    # reverses on its own, unlike resources which finish_craft consumes).
    tools: Dict[str, int] = field(default_factory=dict)
    # Blueprint ids this character has learned (see backend.craft_catalog) -
    # chosen on the Trappings step from the pools their professions unlock.
    # Soulbound: unlike tools, blueprints never move to the player's shared
    # pool or to another character - knowing a technique is permanently tied
    # to the character who learned it (eventual candidate for an on-chain
    # soulbound token, one day). A one-time unlock, never a stackable
    # quantity like resource_balances.
    blueprints: List[str] = field(default_factory=list)
    # Item instances this character holds - either in the backpack
    # (location:"backpack") or equipped into a body slot (location:"body").
    # See backend.items_catalog; only needsItemDefinition:true families ever
    # appear here (everything else is a flat count in item_balances).
    items: List[dict] = field(default_factory=list)
    # Crafting vault for non-instance crafted items (food, potions, misc
    # trinkets, adventuring gear) - unlimited, keyed by concrete item id,
    # the same flat-count pattern as resource_balances/tools.
    item_balances: Dict[str, int] = field(default_factory=dict)
    # Subset of resource_balances physically loaded into the backpack -
    # slot-limited (see backend.items_catalog.backpack_slots_used), unlike
    # resource_balances itself which is the unlimited crafting vault.
    backpack_resources: Dict[str, int] = field(default_factory=dict)
    # Subset of item_balances physically loaded into the backpack -
    # same relationship backpack_resources has to resource_balances.
    backpack_item_balances: Dict[str, int] = field(default_factory=dict)
    # Which light source (if any) is currently lit and held, e.g.
    # {"family": "torch", "tier": 4, "litAt": "<isoformat>", "hand": "Left Hand"}.
    # Not an item instance - see backend/data/light-source-burn-hours.json;
    # remaining burn time is computed lazily from litAt, not stored directly.
    equipped_light: Optional[dict] = None
    # The character's in-progress craft, if any: {"familyId", "tier",
    # "readyAt"} (readyAt = start time + backend.players.CRAFT_DURATION_SECONDS,
    # ISO 8601). One job at a time - starting a craft is rejected while this
    # is set and still in the future. Resolved lazily (no background job):
    # a client counts down against readyAt itself, then calls finish_craft.
    active_craft: Optional[dict] = None

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
            "resources": self.resource_balances,
            "tools": self.tools,
            "blueprints": self.blueprints,
            "items": self.items,
            "itemBalances": self.item_balances,
            "backpackResources": self.backpack_resources,
            "backpackItemBalances": self.backpack_item_balances,
            "equippedLight": self.equipped_light,
        }
