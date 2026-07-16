"""
Character model: an RPG character belonging to a player.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class BodyStats:
    """Physical stats: strength, constitution, dexterity, speed."""

    str: int = 0
    con: int = 0
    dex: int = 0
    speed: int = 0

    def to_dict(self) -> dict:
        return {"str": self.str, "con": self.con, "dex": self.dex, "speed": self.speed}


@dataclass
class SoulStats:
    """Mental stats: intelligence, power, wisdom."""

    int: int = 0
    power: int = 0
    wis: int = 0

    def to_dict(self) -> dict:
        return {"int": self.int, "power": self.power, "wis": self.wis}


@dataclass
class Character:
    first_name: str
    last_name: str
    age: int
    body: BodyStats = field(default_factory=BodyStats)
    soul: SoulStats = field(default_factory=SoulStats)

    def to_dict(self) -> dict:
        return {
            "firstName": self.first_name,
            "lastName": self.last_name,
            "age": self.age,
            "body": self.body.to_dict(),
            "soul": self.soul.to_dict(),
        }
