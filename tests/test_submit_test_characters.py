"""Submitting a story keeps its test party as a field of its own
(submit_twine_story_for_review in backend/auth_routes.py).

- The TestCharacters scene is checked like real characters
  (backend/test_characters.py), never stored as a scene, and stored with the
  submission as `testCharacters`, normalised, for test runs.
- A party with problems refuses the submit.
- A reviewer loading the submission gets the party back.
- The submission keeps only the storyData fields the platform knows.

These tests use the real database (MONGODB_URI). Cloud storage is replaced by
recorded calls.
"""

import json

import pytest

from backend import twine_images
from backend.auth_routes import get_twine_review_story, submit_twine_story_for_review
from backend.db import get_database
from tests.test_twine_syntax import _TEST_PARTY, VALID_INIT, _p, _story

AUTHOR = "5TestSubmitPartyAuthor"
REVIEWER = "5TestSubmitPartyReviewer"
STORY = "test-submit-party-story"


async def _purge(db):
    for name in ("twine_review", "twine_stories"):
        await db[name].delete_many({"address": AUTHOR})
    await db.roles.delete_many({"address": REVIEWER})


@pytest.fixture
def storage(monkeypatch):
    calls = []
    monkeypatch.setattr(twine_images, "list_images", lambda *args: [{"filename": "cover.webp"}])
    monkeypatch.setattr(twine_images, "copy_stage", lambda *args: calls.append(("copy", *args)) or 0)
    return calls


@pytest.fixture
async def db(mongodb_uri, storage):
    database = get_database()
    await _purge(database)
    await database.roles.insert_one({"address": REVIEWER, "roles": ["reviewer"]})
    try:
        yield database
    finally:
        await _purge(database)


async def _working_copy(db, party_text: str = _TEST_PARTY, **story_data):
    story = _story([
        _p("0", "StoryInit", VALID_INIT),
        _p("1", "Start", "Welcome [[End]]"),
        _p("2", "End", "The end. <<set $isEnding to true>>"),
        _p("3", "LastResort", "The tunnel collapses. <<set $isEnding to false>>"),
        _p("9", "TestCharacters", party_text),
    ])
    await db.twine_stories.insert_one({
        "address": AUTHOR, "storyId": STORY, "name": "Party Tale", "ifid": "IFID-P",
        "storyData": {**story["storyData"], **story_data}, "passages": story["passages"],
    })


async def test_the_test_party_is_stored_as_its_own_field(db, storage):
    await _working_copy(db, formatUrl="https://example.org/format.js")

    result = await submit_twine_story_for_review(STORY, address=AUTHOR)

    assert result["ok"] is True, result
    entry = await db.twine_review.find_one({"address": AUTHOR, "storyId": STORY})
    assert all(p["name"] != "TestCharacters" for p in entry["passages"])
    party = entry["testCharacters"]
    assert [c["name"] for c in party] == ["Grimjaw Ironfoot"]
    # Normalised: every Legend value present, 0 when left out.
    assert party[0]["mercy"] == 0 and party[0]["might"] == 18
    # Only the storyData fields the platform knows, plus the owner's wallet.
    assert "formatUrl" not in entry["storyData"]
    assert entry["storyData"]["wallet"] == AUTHOR
    # The author's working copy keeps what the editor sent.
    working = await db.twine_stories.find_one({"address": AUTHOR, "storyId": STORY})
    assert working["storyData"]["formatUrl"] == "https://example.org/format.js"
    assert working["storyData"]["wallet"] == AUTHOR

    # A reviewer opening the submission gets the party back.
    story = await get_twine_review_story(AUTHOR, STORY, address=REVIEWER)
    assert story["testCharacters"] == party


async def test_a_story_without_a_test_party_has_none(db, storage):
    await _working_copy(db)
    await db.twine_stories.update_one(
        {"address": AUTHOR, "storyId": STORY}, {"$pull": {"passages": {"name": "TestCharacters"}}}
    )

    result = await submit_twine_story_for_review(STORY, address=AUTHOR)

    assert result["ok"] is True, result
    entry = await db.twine_review.find_one({"address": AUTHOR, "storyId": STORY})
    assert entry["testCharacters"] is None


async def test_a_test_party_with_problems_refuses_the_submit(db, storage):
    party = json.loads(_TEST_PARTY)
    party[0]["might"] = 0
    await _working_copy(db, json.dumps(party))

    result = await submit_twine_story_for_review(STORY, address=AUTHOR)

    assert result["ok"] is False
    assert any(e.startswith("TestCharacters, character 1 (Grimjaw): might") for e in result["errors"])
    assert await db.twine_review.find_one({"address": AUTHOR, "storyId": STORY}) is None
    assert storage == []
