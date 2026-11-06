"""One free story per author: _other_free_story decides whether a free submit
is allowed (backend.auth_routes, checked in submit_twine_story_for_review).
Runs against the real database (MONGODB_URI), like test_adventures.py."""

import pytest

from backend.auth_routes import _other_free_story
from backend.db import get_database

AUTHOR = "5TestFreeStoryAuthor"
OTHER_AUTHOR = "5TestFreeStoryOther"


async def _purge(db):
    await db.twine_review.delete_many({"address": {"$in": [AUTHOR, OTHER_AUTHOR]}})


async def _queue(db, address, story_id, access=None, title="A Story"):
    metadata = {"meta_title": title}
    if access is not None:
        metadata["meta_access"] = access
    await db.twine_review.insert_one({
        "address": address, "storyId": story_id, "name": title,
        "status": "submitted", "metadata": metadata,
    })


@pytest.fixture
async def db(mongodb_uri):
    database = get_database()
    await _purge(database)
    try:
        yield database
    finally:
        await _purge(database)


async def test_first_free_story_is_allowed(db):
    assert await _other_free_story(db, AUTHOR, "story-a") is None


async def test_resubmitting_the_same_free_story_is_allowed(db):
    await _queue(db, AUTHOR, "story-a", "free")
    assert await _other_free_story(db, AUTHOR, "story-a") is None


async def test_second_free_story_is_refused(db):
    await _queue(db, AUTHOR, "story-a", "free", title="Foraging")
    other = await _other_free_story(db, AUTHOR, "story-b")
    assert other is not None
    assert other["metadata"]["meta_title"] == "Foraging"


async def test_trial_paid_and_unset_stories_dont_count(db):
    await _queue(db, AUTHOR, "story-a", "trial")
    await _queue(db, AUTHOR, "story-b", "paid")
    await _queue(db, AUTHOR, "story-c")  # submitted before $meta_access existed
    assert await _other_free_story(db, AUTHOR, "story-d") is None


async def test_other_authors_free_stories_dont_count(db):
    await _queue(db, OTHER_AUTHOR, "story-x", "free")
    assert await _other_free_story(db, AUTHOR, "story-a") is None
