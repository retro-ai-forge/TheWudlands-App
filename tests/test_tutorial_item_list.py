"""The tutorial's item list (app/create/tutorial/storyItems.ts) is built from
the game's item data when the page is built. These tests keep it reading the
same files as the submit check (backend/items_catalog.py), so the list holds
exactly the ids a story may use in .includes(), and give every kind a heading."""

import json
import re
from pathlib import Path

from backend import items_catalog
from backend.story_rules import ITEM_FAMILY_IDS

ROOT = Path(__file__).resolve().parent.parent
SOURCE = (ROOT / "app" / "create" / "tutorial" / "storyItems.ts").read_text(encoding="utf-8")
DATA = ROOT / "backend" / "data"


def test_the_list_reads_the_same_item_files_as_the_check():
    imported = set(re.findall(r'from "@/backend/data/([a-z-]+\.json)"', SOURCE))
    assert imported == {items_catalog._FAMILIES_PATH.name, *items_catalog._FINAL_CATALOG_FILES}


def test_every_kind_has_a_heading():
    headings = set(re.findall(r'\["([a-z_]+)", "[^"]+"\]', SOURCE))
    families = json.loads(items_catalog._FAMILIES_PATH.read_text())
    kinds = {row["kind"][0] for row in families if row["familyId"] in ITEM_FAMILY_IDS}
    assert kinds <= headings, f"give these kinds a heading in KIND_HEADINGS: {sorted(kinds - headings)}"


def test_the_list_shows_every_family_the_check_accepts_with_a_tier_one_name():
    """What storyItemGroups() does, read the same way: each family the check
    accepts has a tier-1 row in one of the files, so none is left out."""
    tier_one = {
        row["familyId"]
        for name in items_catalog._FINAL_CATALOG_FILES
        for row in json.loads((DATA / name).read_text())
        if row["tier"] == 1
    }
    assert ITEM_FAMILY_IDS <= tier_one
