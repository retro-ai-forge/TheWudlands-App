"""
Character model: an RPG character belonging to a player.
"""

from __future__ import annotations

from dataclasses import dataclass, field

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

    first_name: str = ''
    last_name: str = ''
    vital_status: str = 'alive'
    age: int = 23
    gender: str = 'd'
    race_group: str = 'common'
    race: str = 'human'
    classes: ClassStats = field(default_factory=ClassStats)
    profession: ProfStats = field(default_factory=ProfStats)
    attr: AttributeStats = field(default_factory=AttributeStats)

    def to_dict(self) -> dict:
        return {
            "firstName": self.first_name,
            "lastName": self.last_name,
            "age": self.age,
            "gender": self.gender,
            "race_group": self.race_group,
            "race": self.race,
            "classes": self.classes.to_dict(),
            "profession": self.profession.to_dict(),
            "attr": self.attr.to_dict(),
        }
