"""
Every profession works with its own 3 raw families (data/profession-raw-families.json):
what its soul slot forages, which raws earn it crafting XP, its salvage bonus
and its starter kit. Pure catalog logic, no DB needed.
"""

import json
import re
from pathlib import Path

from backend import foraging, players, recycling
from backend.professions_catalog import PROFESSION_CATEGORIES
from backend.resources_catalog import PROFESSION_RAW_FAMILIES, RESOURCE_ITEMS, resolve_trapping_options

ROOT = Path(__file__).resolve().parent.parent


def test_every_profession_has_three_known_raw_families():
    assert set(PROFESSION_RAW_FAMILIES) == set(PROFESSION_CATEGORIES)
    known = {item.family_id for item in RESOURCE_ITEMS}
    for profession, families in PROFESSION_RAW_FAMILIES.items():
        assert len(families) == 3 and len(set(families)) == 3, profession
        assert set(families) <= known, profession


def test_every_raw_family_belongs_to_some_profession():
    worked = {f for families in PROFESSION_RAW_FAMILIES.values() for f in families}
    assert worked == {item.family_id for item in RESOURCE_ITEMS}
    # The four that used to have no home at all.
    assert "pigment" in PROFESSION_RAW_FAMILIES["dyer"]
    assert "venom" in PROFESSION_RAW_FAMILIES["poisoner"]
    assert "essence" in PROFESSION_RAW_FAMILIES["alchemist"]
    assert "clockwork" in PROFESSION_RAW_FAMILIES["tinsmith"]


def test_professions_of_one_category_can_work_different_raws():
    assert foraging.profession_families(["leatherworker"]) == ["hide", "skin", "bone"]
    assert foraging.profession_families(["weaver"]) == ["fiber", "feather", "reed"]
    assert foraging.profession_families(["miner"]) == ["ore", "stone", "crystal"]
    assert foraging.profession_families(["miner", "tinsmith"]) == ["ore", "stone", "crystal", "clockwork", "wood"]


def test_starter_kit_offers_the_professions_own_raws():
    families = {item.family_id for item in resolve_trapping_options(["leatherworker"]).items}
    assert families == {"hide", "skin", "bone"}


def _character(profession_id: str, level: int = 5) -> dict:
    return {"profession": {"prof1": profession_id, "lvl1": level, "prof2": "none", "prof3": "none"}}


def test_crafting_xp_goes_to_the_profession_that_works_the_raw():
    # leather is made from hide (first option) at the tanning rack.
    assert players._crafting_xp_increments(_character("leatherworker"), "leather", 1).get("exp1")
    assert not players._crafting_xp_increments(_character("weaver"), "leather", 1)


def test_salvage_bonus_follows_the_professions_raws():
    assert recycling._profession_skill_percent(_character("leatherworker", 7), "hide") == 7
    assert recycling._profession_skill_percent(_character("weaver", 7), "hide") == 0


def test_frontend_mirror_matches_the_backend():
    source = (ROOT / "app" / "lib" / "characterOptions.ts").read_text()
    block = re.search(r"PROFESSION_RAW_FAMILIES: Record<string, string\[\]> = \{(.*?)\n\};", source, re.S).group(1)
    mirrored = {
        name: json.loads(families)
        for name, families in re.findall(r"^\s*(\w+): (\[.*?\]),$", block, re.M)
    }
    assert mirrored == {p: list(f) for p, f in PROFESSION_RAW_FAMILIES.items()}
