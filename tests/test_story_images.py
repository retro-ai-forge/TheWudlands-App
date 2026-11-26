"""What happens to a story's images in the bucket:
- deleting a story in the editor (delete_twine_story) also deletes its working
  images (create stage), never a submission's or a live story's copy;
- the editor's Duplicate copies the working images to the copy's new id
  (copy_twine_story_images), only between the caller's own stories;
- scripts/cleanup_story_images.py deletes a folder only when its story id is
  in none of twine_stories, twine_review and twine_live AND its newest file is
  older than 30 days.
The route tests use the real database (MONGODB_URI); cloud storage is
replaced by recorded calls.
"""

import importlib.util
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend import twine_images
from backend.auth_routes import copy_twine_story_images, delete_twine_story
from backend.db import get_database

AUTHOR = "5TestStoryImagesAuthor"
OTHER = "5TestStoryImagesOther"
ADMIN = "5TestStoryImagesAdmin"
STORY = "test-story-images-story"
COPY = "test-story-images-copy"

_spec = importlib.util.spec_from_file_location(
    "cleanup_story_images", Path(__file__).resolve().parent.parent / "scripts" / "cleanup_story_images.py"
)
cleanup = importlib.util.module_from_spec(_spec)
sys.modules[_spec.name] = cleanup  # its dataclasses look their module up while being built
_spec.loader.exec_module(cleanup)


@pytest.fixture
def storage(monkeypatch):
    calls = []
    monkeypatch.setattr(twine_images, "delete_stage", lambda *args: calls.append(("delete", *args)) or 0)
    monkeypatch.setattr(twine_images, "copy_story", lambda *args: calls.append(("copy", *args)) or 3)
    return calls


@pytest.fixture
async def db(mongodb_uri, storage):
    database = get_database()

    async def purge():
        await database.twine_stories.delete_many({"address": {"$in": [AUTHOR, OTHER]}})
        await database.roles.delete_many({"address": ADMIN})

    await purge()
    await database.roles.insert_one({"address": ADMIN, "roles": ["admin"]})
    try:
        yield database
    finally:
        await purge()


async def _story(db, owner=AUTHOR, story_id=STORY):
    await db.twine_stories.insert_one({"address": owner, "storyId": story_id, "name": "Pictures", "passages": []})


# --- deleting a story ----------------------------------------------------------


async def test_deleting_a_story_deletes_its_working_images(db, storage):
    await _story(db)
    await delete_twine_story(STORY, address=AUTHOR)
    assert await db.twine_stories.find_one({"storyId": STORY}) is None
    # Only the create stage: review and served belong to a submission or a live story.
    assert storage == [("delete", AUTHOR, twine_images.STAGE_CREATE, STORY)]


async def test_a_missing_story_deletes_no_images(db, storage):
    with pytest.raises(HTTPException) as missing:
        await delete_twine_story(STORY, address=AUTHOR)
    assert missing.value.status_code == 404
    assert storage == []


async def test_a_failing_image_delete_still_deletes_the_story(db, monkeypatch):
    await _story(db)

    def broken(*args):
        raise RuntimeError("bucket down")

    monkeypatch.setattr(twine_images, "delete_stage", broken)
    assert (await delete_twine_story(STORY, address=AUTHOR))["ok"] is True
    assert await db.twine_stories.find_one({"storyId": STORY}) is None


# --- Duplicate -----------------------------------------------------------------


async def test_duplicate_copies_the_working_images(db, storage):
    # The copy isn't synced yet (local-first): it counts as the caller's.
    await _story(db)
    result = await copy_twine_story_images(COPY, STORY, address=AUTHOR)
    assert (result["ok"], result["copied"]) == (True, 3)
    assert storage == [("copy", AUTHOR, STORY, AUTHOR, COPY)]


async def test_nobody_copies_another_authors_images(db, storage):
    await _story(db, owner=OTHER)
    with pytest.raises(HTTPException) as refused:
        await copy_twine_story_images(COPY, STORY, address=AUTHOR)
    assert refused.value.status_code == 403
    assert storage == []


async def test_an_admin_copies_into_their_own_story(db, storage):
    await _story(db, owner=OTHER)
    await copy_twine_story_images(COPY, STORY, address=ADMIN)
    assert storage == [("copy", OTHER, STORY, ADMIN, COPY)]


async def test_a_story_never_copies_onto_itself(db, storage):
    with pytest.raises(HTTPException) as refused:
        await copy_twine_story_images(STORY, STORY, address=AUTHOR)
    assert refused.value.status_code == 400
    assert storage == []


# --- the cleanup script --------------------------------------------------------

NOW = datetime(2026, 11, 26, 12, 0, tzinfo=timezone.utc)


def _blob(name: str, days_ago: float, size: int = 1000):
    return SimpleNamespace(name=name, size=size, time_created=NOW - timedelta(days=days_ago))


def test_blobs_are_grouped_into_story_folders():
    folders, unknown = cleanup.folders_from_blobs([
        _blob("twine-images/5W/create/s1/a.webp", 40),
        _blob("twine-images/5W/create/s1/thumbs/a.webp", 10),
        _blob("twine-images/5W/review/s2/b.webp", 40),
        _blob("twine-images/served/s3/c.webp", 40),
        _blob("twine-images/stray.webp", 40),
        _blob("other/thing.txt", 40),
    ])
    first = folders["twine-images/5W/create/s1/"]
    assert (first.stage, first.wallet, first.story_id, first.files) == ("create", "5W", "s1", 2)
    assert first.newest == NOW - timedelta(days=10)  # the thumbnail is newer
    assert folders["twine-images/5W/review/s2/"].stage == "review"
    served = folders["twine-images/served/s3/"]
    assert (served.stage, served.wallet, served.story_id) == ("served", None, "s3")
    assert unknown == ["twine-images/stray.webp", "other/thing.txt"]


def test_a_folder_goes_only_without_its_story_and_after_30_days():
    folders, _ = cleanup.folders_from_blobs([
        _blob("twine-images/5W/create/known/a.webp", 400),    # its story is known: stays
        _blob("twine-images/5W/review/known/a.webp", 400),    # known in another stage: stays
        _blob("twine-images/served/known/a.webp", 400),
        _blob("twine-images/5W/create/young/a.webp", 29),     # unknown but young: stays
        _blob("twine-images/5W/create/mixed/a.webp", 90),
        _blob("twine-images/5W/create/mixed/b.webp", 5),      # one new file keeps the folder
        _blob("twine-images/5W/create/gone/a.webp", 31),      # unknown and old: goes
        _blob("twine-images/served/gone-live/a.webp", 60),    # a live copy whose story is gone
    ])
    delete, keep = cleanup.plan(folders, {"known"}, NOW, 30)
    assert [f.prefix for f in delete] == [
        "twine-images/5W/create/gone/",
        "twine-images/served/gone-live/",
    ]
    reasons = {f.story_id: why for f, why in keep}
    assert reasons["known"] == "its story is in the database"
    assert reasons["young"] == reasons["mixed"] == "a file is newer than 30 days"


def test_the_grace_time_can_be_longer():
    folders, _ = cleanup.folders_from_blobs([_blob("twine-images/5W/create/gone/a.webp", 45)])
    assert [f.story_id for f in cleanup.plan(folders, set(), NOW, 30)[0]] == ["gone"]
    assert cleanup.plan(folders, set(), NOW, 60)[0] == []


def test_apply_is_refused_when_the_database_lists_no_story():
    folders, _ = cleanup.folders_from_blobs([_blob("twine-images/5W/create/gone/a.webp", 45)])
    assert "the database lists no story" in cleanup.apply_refusal(set(), folders)
    assert cleanup.apply_refusal({"some"}, folders) is None
    assert cleanup.apply_refusal(set(), {}) is None


async def test_known_ids_come_from_all_three_collections(mongodb_uri):
    database = get_database()
    ids = ("test-cleanup-editor", "test-cleanup-review", "test-cleanup-live")
    owner = "5TestCleanupOwner"

    async def purge():
        await database.twine_stories.delete_many({"address": owner})
        await database.twine_review.delete_many({"address": owner})
        await database.twine_live.delete_many({"address": owner})

    await purge()
    try:
        await database.twine_stories.insert_one({"address": owner, "storyId": ids[0]})
        await database.twine_review.insert_one({"address": owner, "storyId": ids[1], "status": "submitted"})
        await database.twine_live.insert_one({"_id": ids[2], "address": owner, "storyId": ids[2]})
        known = await cleanup.known_story_ids(database)
        assert set(ids) <= known
    finally:
        await purge()
