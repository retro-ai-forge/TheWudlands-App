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
class BodyStats:
    """Physical stats: strength, stamina, dexterity, speed."""

    strength: int = 1
    stamina: int = 1
    dexterity: int = 1
    size: int = 1
    speed: int = 1

    def to_dict(self) -> dict:
        return {"str": self.strength, "sta": self.stamina, "dex": self.dexterity, "size": self.size, "speed": self.speed}


@dataclass
class SoulStats:
    """Mental stats: intelligence, power, wisdom."""

    power: int = 1
    wisdom: int = 1
    intelligence: int = 1
    perception: int = 1

    def to_dict(self) -> dict:
        return {"power": self.power, "wis": self.wisdom, "intelli": self.intelligence, "perc": self.perception}
    
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
    body: BodyStats = field(default_factory=BodyStats)
    soul: SoulStats = field(default_factory=SoulStats)

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
            "body": self.body.to_dict(),
            "soul": self.soul.to_dict(),
        }
