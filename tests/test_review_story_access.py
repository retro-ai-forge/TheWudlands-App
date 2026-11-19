"""Reviewers open a submission in the story editor to test-play it
(backend.auth_routes get_twine_review_story, get_my_roles). Runs against the
real database (MONGODB_URI), like test_free_story_limit.py."""

import pytest
from fastapi import HTTPException

from backend.auth_routes import get_my_roles, get_twine_review_story
from backend.db import get_database

AUTHOR = "5TestReviewStoryAuthor"
REVIEWER = "5TestReviewStoryReviewer"
ADMIN = "5TestReviewStoryAdmin"
PLAYER = "5TestReviewStoryPlayer"


async def _purge(db):
    await db.twine_review.delete_many({"address": AUTHOR})
    await db.roles.delete_many({"address": {"$in": [REVIEWER, ADMIN, PLAYER]}})


@pytest.fixture
async def db(mongodb_uri):
    database = get_database()
    await _purge(database)
    await database.roles.insert_one({"address": REVIEWER, "roles": ["reviewer"]})
    await database.roles.insert_one({"address": ADMIN, "roles": ["admin"]})
    await database.twine_review.insert_one({
        "address": AUTHOR, "storyId": "tale", "name": "A Tale", "ifid": "IFID-1",
        "status": "submitted", "lastUpdate": "2026-11-19T10:00:00+00:00",
        "storyData": {"storyFormat": "SugarCube", "startPassage": "p1"},
        "passages": [{"id": "p1", "name": "Start", "text": "Hello"}],
        "privateMeta": {"meta_email": "author@example.org"},
    })
    try:
        yield database
    finally:
        await _purge(database)


async def test_reviewer_gets_the_frozen_copy_without_private_fields(db):
    story = await get_twine_review_story(AUTHOR, "tale", address=REVIEWER)
    assert story["owner"] == AUTHOR
    assert story["storyId"] == "tale"
    assert story["passages"][0]["text"] == "Hello"
    assert story["storyData"]["startPassage"] == "p1"
    assert "privateMeta" not in story and "_id" not in story


async def test_admin_counts_as_reviewer(db):
    assert (await get_twine_review_story(AUTHOR, "tale", address=ADMIN))["name"] == "A Tale"


async def test_others_are_refused(db):
    for who in (PLAYER, AUTHOR):
        with pytest.raises(HTTPException) as refused:
            await get_twine_review_story(AUTHOR, "tale", address=who)
        assert refused.value.status_code == 403


async def test_missing_submission_is_404(db):
    with pytest.raises(HTTPException) as missing:
        await get_twine_review_story(AUTHOR, "nothing", address=REVIEWER)
    assert missing.value.status_code == 404


async def test_roles_for_the_page(db):
    assert await get_my_roles(address=REVIEWER) == {"reviewer": True, "admin": False}
    assert await get_my_roles(address=ADMIN) == {"reviewer": True, "admin": True}
    assert await get_my_roles(address=PLAYER) == {"reviewer": False, "admin": False}
