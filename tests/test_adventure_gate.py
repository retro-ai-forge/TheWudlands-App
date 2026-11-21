"""Starting an adventure is for admins only until the engine replaces the step
API that trusts the browser (ARCHITECTURE.md "Today's adventure API"). Runs
against the real database (MONGODB_URI), like test_review_story_access.py."""

import pytest
from fastapi import HTTPException

from backend import adventures
from backend.auth_routes import StartAdventureRequest, start_my_adventure
from backend.db import get_database

PLAYER = "5TestAdventureGatePlayer"
REVIEWER = "5TestAdventureGateReviewer"
ADMIN = "5TestAdventureGateAdmin"

REQUEST = StartAdventureRequest(storyAuthor="5SomeAuthor", storyId="some-story", characterIds=["c1"])


@pytest.fixture
async def db(mongodb_uri):
    database = get_database()
    await database.roles.delete_many({"address": {"$in": [PLAYER, REVIEWER, ADMIN]}})
    await database.roles.insert_one({"address": REVIEWER, "roles": ["reviewer"]})
    await database.roles.insert_one({"address": ADMIN, "roles": ["admin"]})
    try:
        yield database
    finally:
        await database.roles.delete_many({"address": {"$in": [PLAYER, REVIEWER, ADMIN]}})


@pytest.mark.parametrize("who", [PLAYER, REVIEWER])
async def test_only_admins_may_start_an_adventure(db, who, monkeypatch):
    async def must_not_run(*args, **kwargs):
        raise AssertionError("start_adventure ran for a non-admin")

    monkeypatch.setattr(adventures, "start_adventure", must_not_run)
    with pytest.raises(HTTPException) as refused:
        await start_my_adventure(REQUEST, address=who)
    assert refused.value.status_code == 403


async def test_an_admin_gets_through_the_gate(db, monkeypatch):
    calls = []

    async def fake_start(*args):
        calls.append(args)
        return {"ok": True}

    monkeypatch.setattr(adventures, "start_adventure", fake_start)
    assert await start_my_adventure(REQUEST, address=ADMIN) == {"ok": True}
    assert calls == [(ADMIN, "5SomeAuthor", "some-story", ["c1"], None)]
