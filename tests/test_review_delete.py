"""Deleting a waiting submission (delete_twine_review in backend/auth_routes.py,
the Delete button on the review page):
- its author, only during the 7 days of grace;
- an admin, at any time;
- nobody else - reviewers reject instead.
Only the submitted copy goes (with its review-stage images); an approved
record is never deleted this way, and a resubmit that lands in between
survives. These tests use the real database (MONGODB_URI); cloud storage is
replaced by recorded calls.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from backend import auth_routes, twine_images
from backend.auth_routes import delete_twine_review, get_my_roles
from backend.db import get_database

AUTHOR = "5TestReviewDeleteAuthor"
ADMIN = "5TestReviewDeleteAdmin"
REVIEWER = "5TestReviewDeleteReviewer"
OTHER = "5TestReviewDeleteOther"
STORY = "test-review-delete-story"


def _ago(days: float) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


async def _purge(db):
    await db.twine_review.delete_many({"address": AUTHOR})
    await db.roles.delete_many({"address": {"$in": [ADMIN, REVIEWER, OTHER]}})


async def _submission(db, days_ago: float, status: str = "submitted", **fields):
    stamp = _ago(days_ago)
    doc = {
        "address": AUTHOR, "storyId": STORY, "name": "Delete Tale", "status": status,
        "lastUpdate": stamp, "submittedAt": stamp, **fields,
    }
    await db.twine_review.insert_one({k: v for k, v in doc.items() if v is not None})


async def _exists(db) -> bool:
    return await db.twine_review.find_one({"address": AUTHOR, "storyId": STORY}) is not None


@pytest.fixture
def storage(monkeypatch):
    calls = []
    monkeypatch.setattr(twine_images, "delete_stage", lambda *args: calls.append(("delete", *args)) or 0)
    return calls


@pytest.fixture
async def db(mongodb_uri, storage):
    database = get_database()
    await _purge(database)
    await database.roles.insert_many([
        {"address": ADMIN, "roles": ["admin"]},
        {"address": REVIEWER, "roles": ["reviewer"]},
    ])
    try:
        yield database
    finally:
        await _purge(database)


async def test_the_author_deletes_during_the_days_of_grace(db, storage):
    await _submission(db, days_ago=2)
    result = await delete_twine_review(AUTHOR, STORY, address=AUTHOR)
    assert result["ok"] is True
    assert not await _exists(db)
    assert ("delete", AUTHOR, twine_images.STAGE_REVIEW, STORY) in storage


async def test_the_author_cannot_delete_once_it_waits_for_the_reviewers(db, storage):
    await _submission(db, days_ago=8)
    with pytest.raises(HTTPException) as refused:
        await delete_twine_review(AUTHOR, STORY, address=AUTHOR)
    assert refused.value.status_code == 409
    assert "only an admin" in refused.value.detail
    assert await _exists(db)
    assert storage == []


@pytest.mark.parametrize("days_ago", [2, 8])
async def test_an_admin_deletes_at_any_time(db, days_ago):
    await _submission(db, days_ago=days_ago)
    await delete_twine_review(AUTHOR, STORY, address=ADMIN)
    assert not await _exists(db)


@pytest.mark.parametrize("who", [REVIEWER, OTHER])
@pytest.mark.parametrize("days_ago", [2, 8])
async def test_nobody_else_deletes(db, who, days_ago):
    await _submission(db, days_ago=days_ago)
    with pytest.raises(HTTPException) as refused:
        await delete_twine_review(AUTHOR, STORY, address=who)
    assert refused.value.status_code == 403
    assert await _exists(db)


async def test_an_approved_record_is_never_deleted_this_way(db):
    await _submission(db, days_ago=30, status="approved")
    for who in (AUTHOR, ADMIN):
        with pytest.raises(HTTPException) as missing:
            await delete_twine_review(AUTHOR, STORY, address=who)
        assert missing.value.status_code == 404
    assert await _exists(db)


async def test_an_entry_without_timestamps_can_be_deleted_by_its_author(db):
    # Never locked (_review_window_closed), so still in its days of grace.
    await _submission(db, days_ago=0, lastUpdate=None, submittedAt=None)
    await db.twine_review.update_one(
        {"address": AUTHOR, "storyId": STORY}, {"$unset": {"lastUpdate": "", "submittedAt": ""}}
    )
    await delete_twine_review(AUTHOR, STORY, address=AUTHOR)
    assert not await _exists(db)


async def test_a_resubmit_in_between_survives(db, monkeypatch):
    """The delete is conditional on the version read: if the author submits
    again between the read and the delete, the new version stays."""
    await _submission(db, days_ago=2)

    class ResubmitAfterRead:
        """twine_review, but the author resubmits right after the route reads it."""

        def __getattr__(self, name):
            return getattr(db.twine_review, name)

        async def find_one(self, *args, **kwargs):
            found = await db.twine_review.find_one(*args, **kwargs)
            await db.twine_review.update_one(
                {"address": AUTHOR, "storyId": STORY}, {"$set": {"lastUpdate": _ago(0)}}
            )
            return found

    class Database:
        twine_review = ResubmitAfterRead()

    monkeypatch.setattr(auth_routes, "get_database", lambda: Database())
    with pytest.raises(HTTPException) as changed:
        await delete_twine_review(AUTHOR, STORY, address=AUTHOR)
    assert changed.value.status_code == 409
    assert await _exists(db)


async def test_roles_tell_the_page_who_is_looking(db):
    assert await get_my_roles(address=ADMIN) == {"reviewer": True, "admin": True, "address": ADMIN}
    assert await get_my_roles(address=AUTHOR) == {"reviewer": False, "admin": False, "address": AUTHOR}
