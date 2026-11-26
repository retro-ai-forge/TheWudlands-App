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
            _p("2", "End", "The end. <<set $isEnding to 'success'>>"),
            _p("0", "StoryInit", VALID_INIT),
            _p("3", "LastResort", "The tunnel collapses. <<set $isEnding to 'lastresort'>>"),
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
        _p("2", "End", "The end. <<set $isEnding to 'success'>>"),
        _p("3", "LastResort", "The tunnel collapses. <<set $isEnding to 'lastresort'>>"),
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
    # The test party and the edit history go live with the story, and the
    # review entry is gone.
    assert [c["name"] for c in live["testCharacters"]] == ["Grimjaw Ironfoot"]
    assert live["legendPoints"] == {}
    assert live["reviewEdits"][0]["by"] == REVIEWER
    assert await db.twine_review.find_one({"address": AUTHOR, "storyId": STORY}) is None


async def test_an_edit_with_program_code_is_refused(db, storage):
    await _submission(db)

    result = await save_twine_review(AUTHOR, STORY, _edited("Hi <<run alert(1)>> [[End]]"), address=REVIEWER)

    assert result["ok"] is False
    assert any("<<run>>" in e and "Story JavaScript" in e for e in result["errors"])


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
    assert any("outside the story" in e for e in result["errors"])
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


# --- warnings: a story that waits ---------------------------------------------


def _edited_with_script(script: str = "setup.roll = function (n) { return n * 2; };"):
    payload = _edited()
    payload.storyData["script"] = script
    return payload


async def test_an_edit_with_story_javascript_is_saved_and_waits(db, storage):
    await _submission(db)

    result = await save_twine_review(AUTHOR, STORY, _edited_with_script(), address=REVIEWER)

    assert result["ok"] is True
    assert result["held"] is True and result["hasCode"] is True
    assert result["warnings"][0].startswith("This story waits")
    entry = await db.twine_review.find_one({"address": AUTHOR, "storyId": STORY})
    assert entry["held"] is True and entry["hasCode"] is True
    assert [w["kind"] for w in entry["warnings"]] == ["code"]
    assert entry["warnings"][0]["place"] == "Story JavaScript"


async def test_a_story_that_waits_is_not_approved(db, storage):
    await _submission(db)
    await save_twine_review(AUTHOR, STORY, _edited_with_script(), address=REVIEWER)

    with pytest.raises(HTTPException) as refused:
        await approve_twine_review(AUTHOR, STORY, address=REVIEWER)

    assert refused.value.status_code == 409
    assert "waits" in refused.value.detail and "Story JavaScript" in refused.value.detail
    assert await db.twine_live.find_one({"_id": STORY}) is None


async def test_system_names_in_the_story_javascript_are_refused(db, storage):
    await _submission(db)

    result = await save_twine_review(
        AUTHOR, STORY, _edited_with_script("Config.history.maxStates = 5;"), address=REVIEWER
    )

    assert result["ok"] is False
    assert any("'Config' reaches into SugarCube" in e for e in result["errors"])


async def test_reviewers_read_the_warnings_and_the_queue_only_counts_them(db, storage):
    from backend.auth_routes import get_twine_review_story, list_twine_reviews

    await _submission(db)
    await save_twine_review(AUTHOR, STORY, _edited_with_script(), address=REVIEWER)

    story = await get_twine_review_story(AUTHOR, STORY, address=REVIEWER)
    assert story["checkProblems"] == []
    assert story["held"] is True and story["hasCode"] is True
    assert story["checkWarnings"][0]["kind"] == "code"

    listed = next(d for d in await list_twine_reviews() if d["storyId"] == STORY)
    assert (listed["warningCount"], listed["held"], listed["hasCode"]) == (1, True, True)
    assert "warnings" not in listed
