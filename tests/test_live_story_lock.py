"""A story that passed review is live: its author can't resubmit it, only publish
changes as a new story with a new id (backend.auth_routes: _submit_refusal
before anything else, _store_review_entry for the final write). Runs against
the real database (MONGODB_URI), like test_free_story_limit.py."""

import pytest
from fastapi import HTTPException

from backend.auth_routes import _LIVE_STORY_LOCKED, _store_review_entry, submit_twine_story_for_review
from backend.db import get_database

AUTHOR = "5TestLiveStoryAuthor"


async def _purge(db):
    await db.twine_review.delete_many({"address": AUTHOR})
    await db.twine_stories.delete_many({"address": AUTHOR})


async def _review(db, story_id, status, name):
    await db.twine_review.insert_one({"address": AUTHOR, "storyId": story_id, "status": status, "name": name})


@pytest.fixture
async def db(mongodb_uri):
    database = get_database()
    await _purge(database)
    try:
        yield database
    finally:
        await _purge(database)


async def test_submit_refuses_a_live_story_and_leaves_it_alone(db):
    await db.twine_stories.insert_one({"address": AUTHOR, "storyId": "live", "name": "Changed", "passages": []})
    await _review(db, "live", "approved", "Live")

    with pytest.raises(HTTPException) as refused:
        await submit_twine_story_for_review("live", address=AUTHOR)

    assert refused.value.status_code == 409
    assert refused.value.detail == _LIVE_STORY_LOCKED
    entry = await db.twine_review.find_one({"address": AUTHOR, "storyId": "live"})
    assert (entry["status"], entry["name"]) == ("approved", "Live")


async def test_final_write_never_overwrites_a_story_approved_meanwhile(db):
    # The approval landed after the submit check: the guarded write must fail
    # on the unique (address, storyId) index instead of replacing the story.
    await _review(db, "live", "approved", "Live")

    with pytest.raises(HTTPException) as refused:
        await _store_review_entry(db, AUTHOR, "live", {"status": "submitted", "name": "Changed"})

    assert refused.value.status_code == 409
    assert await db.twine_review.count_documents({"address": AUTHOR, "storyId": "live"}) == 1
    entry = await db.twine_review.find_one({"address": AUTHOR, "storyId": "live"})
    assert (entry["status"], entry["name"]) == ("approved", "Live")


async def test_final_write_replaces_a_waiting_entry_and_adds_a_new_one(db):
    await _review(db, "waiting", "submitted", "Old")

    await _store_review_entry(db, AUTHOR, "waiting", {"status": "submitted", "name": "New"})
    await _store_review_entry(db, AUTHOR, "fresh", {"status": "submitted", "name": "Fresh"})

    waiting = await db.twine_review.find_one({"address": AUTHOR, "storyId": "waiting"})
    assert waiting["name"] == "New"
    assert await db.twine_review.count_documents({"address": AUTHOR, "storyId": "fresh"}) == 1
