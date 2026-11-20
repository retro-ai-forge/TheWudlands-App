"""A reviewer saving edits to a submission (save_twine_review in
backend/auth_routes.py, the editor's "Save review").

- Only a reviewer, and only while the story waits for review (after its 7
  days, like approving), so the author can't overwrite the edit.
- The edit passes the same checks as a submit; its images must already be in
  the frozen review stage.
- The submission stays the author's (id, name, IFID, owner wallet, the 7-day
  anchor), and every save is recorded with the reviewer and the time.
- Approving afterwards publishes the edited version.

These tests use the real database (MONGODB_URI). Cloud storage is replaced by
recorded calls.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from backend import twine_images
from backend.auth_routes import TwineStoryPayload, approve_twine_review, save_twine_review
from backend.db import get_database
from tests.test_twine_syntax import _TEST_PARTY, VALID_INIT, _p, _story

AUTHOR = "5TestReviewEditAuthor"
REVIEWER = "5TestReviewEditReviewer"
PLAYER = "5TestReviewEditPlayer"
STORY = "test-review-edit-story"


def _ago(days: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


async def _purge(db):
    for name in ("twine_review", "twine_live"):
        await db[name].delete_many({"address": AUTHOR})
    await db.roles.delete_many({"address": {"$in": [REVIEWER, PLAYER]}})


async def _submission(db, days_ago: float = 8, status: str = "submitted"):
    stamp = _ago(days_ago)
    await db.twine_review.insert_one({
        "address": AUTHOR, "storyId": STORY, "name": "Edit Tale", "ifid": "IFID-AUTHOR",
        "status": status, "lastUpdate": stamp, "submittedAt": stamp,
        "storyData": {**_story([])["storyData"], "wallet": AUTHOR},
        "passages": _story([
            _p("1", "Start", "The author's text [[End]]"),
            _p("2", "End", "The end. <<set $isEnding to true>>"),
            _p("0", "StoryInit", VALID_INIT),
            _p("3", "LastResort", "The tunnel collapses. <<set $isEnding to false>>"),
        ])["passages"],
        "metadata": {"meta_title": "Edit Tale"},
    })
    return stamp


def _edited(start_text: str = "The reviewer's fixed text [[End]]", extra=()):
    """The reviewer's review copy as the editor sends it: its own local story
    id and IFID, a fixed Start scene, and a TestCharacters party."""
    story = _story([
        _p("0", "StoryInit", VALID_INIT),
        _p("1", "Start", start_text),
        _p("2", "End", "The end. <<set $isEnding to true>>"),
        _p("3", "LastResort", "The tunnel collapses. <<set $isEnding to false>>"),
        _p("9", "TestCharacters", _TEST_PARTY),
        *extra,
    ])
    return TwineStoryPayload(
        storyId="local-review-copy", name="Renamed locally", ifid="IFID-REVIEW-COPY",
        storyData={**story["storyData"], "wallet": REVIEWER, "formatUrl": "https://example.org/format.js"},
        passages=story["passages"],
    )


@pytest.fixture
def storage(monkeypatch):
    calls = []
    monkeypatch.setattr(twine_images, "copy_stage", lambda *args: calls.append(("copy", *args)) or 0)
    monkeypatch.setattr(twine_images, "delete_stage", lambda *args: calls.append(("delete", *args)) or 0)

    def list_images(owner, stage, story_id):
        calls.append(("list", owner, stage, story_id))
        return [{"filename": "cover.webp"}]

    monkeypatch.setattr(twine_images, "list_images", list_images)
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


async def test_reviewer_saves_an_edit_after_the_week(db, storage):
    stamp = await _submission(db)

    result = await save_twine_review(AUTHOR, STORY, _edited(), address=REVIEWER)

    assert (result["ok"], result["status"]) == (True, "submitted")
    entry = await db.twine_review.find_one({"address": AUTHOR, "storyId": STORY})
    start = next(p for p in entry["passages"] if p["name"] == "Start")
    assert start["text"] == "The reviewer's fixed text [[End]]"
    # The test party is never a scene: it is stored as a field of its own.
    assert all(p["name"] != "TestCharacters" for p in entry["passages"])
    assert [c["name"] for c in entry["testCharacters"]] == ["Grimjaw Ironfoot"]
    # storyData keeps only the fields the platform knows.
    assert "formatUrl" not in entry["storyData"]
    assert entry["storyData"]["storyFormatVersion"] == "2.37.3"
    # Still the author's submission, and the 7 days don't start again.
    assert (entry["name"], entry["ifid"], entry["storyData"]["wallet"]) == ("Edit Tale", "IFID-AUTHOR", AUTHOR)
    assert (entry["status"], entry["lastUpdate"], entry["submittedAt"]) == ("submitted", stamp, stamp)
    # Worked out again from the edited text, and the edit is recorded.
    assert entry["metadata"]["meta_title"] == "Title"
    assert entry["coverImage"] == "cover.webp"
    assert entry["editedBy"] == REVIEWER
    assert [e["by"] for e in entry["reviewEdits"]] == [REVIEWER]
    # Images are checked against the frozen review stage.
    assert ("list", AUTHOR, twine_images.STAGE_REVIEW, STORY) in storage

    await save_twine_review(AUTHOR, STORY, _edited("Second fix [[End]]"), address=REVIEWER)
    entry = await db.twine_review.find_one({"address": AUTHOR, "storyId": STORY})
    assert len(entry["reviewEdits"]) == 2


async def test_approving_publishes_the_edited_version(db, storage):
    await _submission(db)
    await save_twine_review(AUTHOR, STORY, _edited(), address=REVIEWER)

    await approve_twine_review(AUTHOR, STORY, address=REVIEWER)

    live = await db.twine_live.find_one({"_id": STORY})
    start = next(p for p in live["passages"] if p["name"] == "Start")
    assert start["text"] == "The reviewer's fixed text [[End]]"
    # The test party goes live with the story; the approved record keeps no text.
    assert [c["name"] for c in live["testCharacters"]] == ["Grimjaw Ironfoot"]
    assert live["legendPoints"] == {}
    record = await db.twine_review.find_one({"address": AUTHOR, "storyId": STORY})
    assert record["status"] == "approved" and record["reviewEdits"][0]["by"] == REVIEWER
    assert "testCharacters" not in record


async def test_an_edit_with_program_code_is_refused(db, storage):
    await _submission(db)

    result = await save_twine_review(AUTHOR, STORY, _edited("Hi <<run alert(1)>> [[End]]"), address=REVIEWER)

    assert result["ok"] is False
    assert any("<<run>>" in e and "runs program code" in e for e in result["errors"])


async def test_only_reviewers_save(db, storage):
    await _submission(db)
    with pytest.raises(HTTPException) as refused:
        await save_twine_review(AUTHOR, STORY, _edited(), address=PLAYER)
    assert refused.value.status_code == 403
    with pytest.raises(HTTPException) as own:
        await save_twine_review(AUTHOR, STORY, _edited(), address=AUTHOR)
    assert own.value.status_code == 403


async def test_no_edit_while_the_author_can_still_change_it(db, storage):
    await _submission(db, days_ago=1)
    with pytest.raises(HTTPException) as refused:
        await save_twine_review(AUTHOR, STORY, _edited(), address=REVIEWER)
    assert refused.value.status_code == 409


async def test_no_edit_after_approval_or_without_a_submission(db, storage):
    with pytest.raises(HTTPException) as missing:
        await save_twine_review(AUTHOR, STORY, _edited(), address=REVIEWER)
    assert missing.value.status_code == 404
    await _submission(db, status="approved")
    with pytest.raises(HTTPException) as approved:
        await save_twine_review(AUTHOR, STORY, _edited(), address=REVIEWER)
    assert approved.value.status_code == 409


async def test_an_edit_that_fails_the_checks_is_not_saved(db, storage):
    await _submission(db)

    result = await save_twine_review(
        AUTHOR, STORY, _edited("Broken [[Nowhere]] [img[https://example.com/x.png]]"), address=REVIEWER
    )

    assert result["ok"] is False
    assert any("Nowhere" in e for e in result["errors"])
    assert any("plain file name" in e for e in result["errors"])
    entry = await db.twine_review.find_one({"address": AUTHOR, "storyId": STORY})
    assert entry["passages"][0]["text"] == "The author's text [[End]]"
    assert "reviewEdits" not in entry


async def test_an_edit_cannot_add_images(db, storage):
    await _submission(db)

    result = await save_twine_review(
        AUTHOR, STORY, _edited("New picture [img[new.webp]] [[End]]"), address=REVIEWER
    )

    assert result["ok"] is False
    assert result["errors"] == ["Image 'new.webp' is referenced in the story but has not been uploaded"]
