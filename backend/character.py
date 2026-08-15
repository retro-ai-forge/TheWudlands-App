"""
Character model: an RPG character belonging to a player.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict

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
    """Profession data: profession, level."""    
    profession_1: str = 'none'
    level_1: int = 0
    profession_2: str = 'none'
    level_2: int = 0
    profession_3: str = 'none'
    level_3: int = 0

    def to_dict(self) -> dict:
        return {"prof1": self.profession_1, "lvl1": self.level_1, "prof2": self.profession_2, "lvl2": self.level_2, "prof3": self.profession_3, "lvl3": self.level_3}

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
    age: int = 23
    gender: str = 'd'
    race_group: str = 'common'
    race: str = 'human'
    portrait_url: str = ''
    birthsign: str = ''
    classes: ClassStats = field(default_factory=ClassStats)
    profession: ProfStats = field(default_factory=ProfStats)
    attr: AttributeStats = field(default_factory=AttributeStats)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    # Stackable crafting resources this character carries (backpack), keyed
    # by resource id (see backend.resources_catalog) - a running total, never
    # per-unit item instances or slot assignments.
    resource_balances: Dict[str, int] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "slotNumber": self.slot_number,
            "firstName": self.first_name,
            "lastName": self.last_name,
            "vitalStatus": self.vital_status,
            "age": self.age,
            "gender": self.gender,
            "raceGroup": self.race_group,
            "race": self.race,
            "portraitUrl": self.portrait_url,
            "birthsign": self.birthsign,
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
        }
