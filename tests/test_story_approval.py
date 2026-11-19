"""Reviewing a submitted story (approve_twine_review and reject_twine_review
in backend/auth_routes.py).

- Only a reviewer can review, and only after the story's 7 days for updates:
  until then the author may still change it. After that it waits for review,
  with no time limit.
- Approval copies the story to twine_live. Adventures only play stories from
  twine_live, so a story that is only submitted can't be played.
- After approval the story's entry in twine_review stays, with status
  "approved" and without the story text. It keeps the author from submitting
  this story again.
- Rejection removes the entry, so the author can fix the story and submit it
  again.

These tests use the real database (MONGODB_URI). They don't copy or delete
images in cloud storage; they only record which calls the code makes.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from backend import adventures, twine_images
from backend.auth_routes import (
    _LIVE_ID_TAKEN,
    _LIVE_STORY_LOCKED,
    RejectReviewRequest,
    approve_twine_review,
    reject_twine_review,
    list_twine_reviews,
    submit_twine_story_for_review,
)
from backend.db import get_database

AUTHOR = "5TestApprovalAuthor"
OTHER_AUTHOR = "5TestApprovalOther"
REVIEWER = "5TestApprovalReviewer"
PLAYER = "5TestApprovalPlayer"
STORY = "test-approval-story"


def _ago(days: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


async def _purge(db):
    for name in ("twine_review", "twine_live", "twine_stories", "twine_rejected"):
        await db[name].delete_many({"address": {"$in": [AUTHOR, OTHER_AUTHOR]}})
    await db.roles.delete_many({"address": {"$in": [REVIEWER, PLAYER]}})


async def _submission(db, days_ago: float = 8, **extra):
    stamp = _ago(days_ago)
    await db.twine_review.insert_one({
        "address": AUTHOR, "storyId": STORY, "name": "Approval Tale", "ifid": "IFID-A",
        "status": "submitted", "lastUpdate": stamp, "submittedAt": stamp,
        "storyData": {"storyFormat": "SugarCube", "startPassage": "p1"},
        "passages": [{"id": "p1", "name": "Start", "text": "Hello <<set $isEnding to true>>"}],
        "metadata": {"meta_title": "Approval Tale", "meta_access": "free"},
        "privateMeta": {"meta_email": "author@example.org"},
        **extra,
    })


@pytest.fixture
def storage(monkeypatch):
    calls = []
    monkeypatch.setattr(twine_images, "copy_stage", lambda *args: calls.append(("copy", *args)) or 0)
    monkeypatch.setattr(twine_images, "delete_stage", lambda *args: calls.append(("delete", *args)) or 0)
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


async def test_a_submitted_story_is_not_playable(db):
    await _submission(db)
    with pytest.raises(adventures.AdventureError) as missing:
        await adventures.story_runs(PLAYER, AUTHOR, STORY)
    assert missing.value.status_code == 404


async def test_reviewer_approves_after_the_week(db, storage):
    await _submission(db)

    result = await approve_twine_review(AUTHOR, STORY, address=REVIEWER)

    assert result["status"] == "approved"
    live = await db.twine_live.find_one({"_id": STORY})
    assert (live["address"], live["approvedBy"]) == (AUTHOR, REVIEWER)
    assert live["passages"][0]["name"] == "Start"
    assert live["metadata"]["meta_title"] == "Approval Tale"
    assert "privateMeta" not in live

    record = await db.twine_review.find_one({"address": AUTHOR, "storyId": STORY})
    assert record["status"] == "approved"
    assert "passages" not in record and "storyData" not in record
    assert record["privateMeta"]["meta_email"] == "author@example.org"

    assert storage == [
        ("copy", AUTHOR, STORY, twine_images.STAGE_REVIEW, twine_images.STAGE_SERVED),
        ("delete", AUTHOR, twine_images.STAGE_REVIEW, STORY),
    ]
    # Playable now, and no longer in the review queue.
    assert (await adventures.story_runs(PLAYER, AUTHOR, STORY))["access"] == "free"
    assert not any(entry["address"] == AUTHOR for entry in await list_twine_reviews())


async def test_story_in_its_week_cannot_be_approved(db, storage):
    await _submission(db, days_ago=1)
    with pytest.raises(HTTPException) as refused:
        await approve_twine_review(AUTHOR, STORY, address=REVIEWER)
    assert refused.value.status_code == 409
    assert await db.twine_live.count_documents({"_id": STORY}) == 0
    assert storage == []


async def test_only_reviewers_approve(db, storage):
    await _submission(db)
    with pytest.raises(HTTPException) as refused:
        await approve_twine_review(AUTHOR, STORY, address=PLAYER)
    assert refused.value.status_code == 403
    assert storage == []


async def test_missing_and_already_approved(db, storage):
    with pytest.raises(HTTPException) as missing:
        await approve_twine_review(AUTHOR, STORY, address=REVIEWER)
    assert missing.value.status_code == 404

    await _submission(db, status="approved")
    with pytest.raises(HTTPException) as again:
        await approve_twine_review(AUTHOR, STORY, address=REVIEWER)
    assert again.value.status_code == 409
    assert storage == []


async def test_a_live_story_id_is_never_taken_twice(db, storage):
    await db.twine_live.insert_one({"_id": STORY, "address": OTHER_AUTHOR, "storyId": STORY, "passages": []})
    await _submission(db)

    with pytest.raises(HTTPException) as taken:
        await approve_twine_review(AUTHOR, STORY, address=REVIEWER)

    assert (taken.value.status_code, taken.value.detail) == (409, _LIVE_ID_TAKEN)
    assert (await db.twine_review.find_one({"address": AUTHOR, "storyId": STORY}))["status"] == "submitted"
    assert storage == []  # the other story's served images are untouched


async def test_submit_refuses_a_live_story_id(db, storage):
    await db.twine_live.insert_one({"_id": STORY, "address": AUTHOR, "storyId": STORY, "passages": []})
    await db.twine_stories.insert_one({"address": AUTHOR, "storyId": STORY, "name": "Approval Tale", "passages": []})

    with pytest.raises(HTTPException) as refused:
        await submit_twine_story_for_review(STORY, address=AUTHOR)

    assert (refused.value.status_code, refused.value.detail) == (409, _LIVE_STORY_LOCKED)
    assert await db.twine_review.count_documents({"address": AUTHOR, "storyId": STORY}) == 0


async def test_reject_waits_for_the_week_too(db, storage):
    await _submission(db, days_ago=1)
    with pytest.raises(HTTPException) as refused:
        await reject_twine_review(AUTHOR, STORY, RejectReviewRequest(reason="Broken links"), address=REVIEWER)
    assert refused.value.status_code == 409
    assert await db.twine_review.count_documents({"address": AUTHOR, "storyId": STORY}) == 1
    assert storage == []


async def test_reject_after_the_week(db, storage):
    await _submission(db)

    result = await reject_twine_review(AUTHOR, STORY, RejectReviewRequest(reason="Broken links"), address=REVIEWER)

    assert result["ok"] is True
    assert await db.twine_review.count_documents({"address": AUTHOR, "storyId": STORY}) == 0
    assert (await db.twine_rejected.find_one({"address": AUTHOR, "storyId": STORY}))["reason"] == "Broken links"
    assert storage == [("delete", AUTHOR, twine_images.STAGE_REVIEW, STORY)]


async def test_an_approved_story_cannot_be_rejected(db, storage):
    await _submission(db, status="approved")
    with pytest.raises(HTTPException) as refused:
        await reject_twine_review(AUTHOR, STORY, RejectReviewRequest(reason="Too late"), address=REVIEWER)
    assert refused.value.status_code == 409
    assert (await db.twine_review.find_one({"address": AUTHOR, "storyId": STORY}))["status"] == "approved"
