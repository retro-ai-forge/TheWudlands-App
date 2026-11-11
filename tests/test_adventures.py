"""
Adventure sessions (backend.adventures): a party playing a story.

The graph tests are pure. The session tests run against the real database
(MONGODB_URI), like test_players.py, because what they check - conditional
updates, idempotent finishing - is the database's behaviour.
"""

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from backend import adventures
from backend.character import Character
from backend.db import get_database
from backend.players import add_character, delete_character, set_in_adventure
from backend.twine_graph import build_story_graph, step_allowed

ADDRESS = "5TestAdventurePlayer"
AUTHOR = "5TestAdventureAuthor"
STORY_ID = "test-adventure-story"

PASSAGES = [
    {"id": "0", "name": "StoryInit", "text": (
        '<<set $meta_title to "Test Crypt">>\n'
        "<<set $meta_maxCharNum to 2>>\n"
        "<<set $meta_access to 'free'>>\n"
        "<<set $meta_allowRunAway to true>>"
    )},
    {"id": "1", "name": "Start", "text": "A door. [[Enter->Hall]]"},
    {"id": "2", "name": "Hall", "text": "[[Fight|Victory]] [[Back->Start]] [img[door.png][Vault]]"},
    {"id": "3", "name": "Vault", "text": "Gold. [[Search again->Vault]] [[Hall]]"},
    {"id": "4", "name": "Victory", "text": "You win. <<set $isEnding to true>>"},
    {"id": "5", "name": "Retreat", "text": "You turn back. [[Flee->Fled]]"},
    {"id": "6", "name": "Fled", "text": "Safe. <<set $isEnding to true>>"},
    {"id": "7", "name": "LastResort", "text": "Something broke. <<set $isEnding to false>>"},
]
STORY_DATA = {"startPassage": "1", "storyFormat": "SugarCube"}


# ── Step graph (pure) ───────────────────────────────────────────────────────

def test_graph_links_endings_and_outcomes():
    graph = build_story_graph(PASSAGES, STORY_DATA)
    assert graph["start"] == "Start"
    assert graph["links"]["Hall"] == ["Victory", "Start", "Vault"]
    assert "StoryInit" not in graph["links"]
    assert graph["endings"] == {"Victory": "finished", "Fled": "run_away"}
    assert graph["allowRunAway"] is True


def test_steps_follow_links_retreat_and_last_resort():
    graph = build_story_graph(PASSAGES, STORY_DATA)
    assert step_allowed(graph, "Start", "Hall")
    assert step_allowed(graph, "Hall", "Vault")  # image-link
    assert not step_allowed(graph, "Start", "Victory")  # skipping ahead
    assert step_allowed(graph, "Vault", "Retreat")  # run away from any scene
    assert not step_allowed(graph, "Retreat", "Retreat")  # Retreat isn't a main scene
    assert step_allowed(graph, "Hall", "LastResort")  # fault route
    assert step_allowed(graph, "Vault", "Vault")  # a scene that links to itself


def test_retreat_needs_allow_run_away():
    passages = [dict(p) for p in PASSAGES]
    passages[0]["text"] = passages[0]["text"].replace("to true", "to false")
    graph = build_story_graph(passages, STORY_DATA)
    assert not step_allowed(graph, "Hall", "Retreat")


def test_scene_can_switch_off_run_away():
    passages = [dict(p) for p in PASSAGES]
    passages[2]["text"] += " <<set $meta_allowRunAway to false>>"  # Hall: an ambush
    passages[3]["text"] += " <<set $meta_allowRunAway to true>>"  # Vault: after it
    graph = build_story_graph(passages, STORY_DATA)
    assert graph["noRetreat"] == ["Hall"]
    assert not step_allowed(graph, "Hall", "Retreat")
    assert step_allowed(graph, "Vault", "Retreat")
    assert step_allowed(graph, "Start", "Retreat")  # no own value: story default
    assert step_allowed(graph, "Hall", "LastResort")  # the fault route stays


def test_scene_can_switch_on_run_away():
    passages = [dict(p) for p in PASSAGES]
    passages[0]["text"] = passages[0]["text"].replace("to true", "to false")
    passages[3]["text"] += " <<set $meta_allowRunAway to true>>"  # Vault only
    graph = build_story_graph(passages, STORY_DATA)
    assert step_allowed(graph, "Vault", "Retreat")
    assert not step_allowed(graph, "Hall", "Retreat")


def test_graph_saved_before_per_scene_run_away():
    graph = build_story_graph(PASSAGES, STORY_DATA)
    del graph["noRetreat"]
    assert step_allowed(graph, "Hall", "Retreat")
    graph["allowRunAway"] = False
    assert not step_allowed(graph, "Hall", "Retreat")


# ── Sessions (live DB) ──────────────────────────────────────────────────────

_PLAYER_COLLECTIONS = (
    "characters",
    "player_characters",
    "player_vaults",
    "character_homes",
    "character_camp",
    "character_blueprints",
    "adventure_sessions",
    "adventure_log",
    "story_plays",
)


async def _purge(db) -> None:
    for name in _PLAYER_COLLECTIONS:
        await db[name].delete_many({"address": ADDRESS})
    await db.twine_review.delete_many({"address": AUTHOR})
    await db.story_snapshots.delete_many({"storyAuthor": AUTHOR})


@pytest.fixture
async def world(mongodb_uri):
    """A submitted test story and two fresh characters; cleaned up after."""
    db = get_database()
    await _purge(db)
    await db.twine_review.insert_one({
        "address": AUTHOR,
        "storyId": STORY_ID,
        "name": "Test Crypt",
        "status": "submitted",
        "storyData": STORY_DATA,
        "passages": PASSAGES,
        "metadata": {"meta_title": "Test Crypt", "meta_maxCharNum": 2, "meta_access": "free"},
    })
    await add_character(ADDRESS, Character(first_name="Ada", last_name="One", slot_number=1))
    player = await add_character(ADDRESS, Character(first_name="Bo", last_name="Two", slot_number=2))
    ids = [c["id"] for c in sorted(player.characters, key=lambda c: c["firstName"])]
    try:
        yield db, ids
    finally:
        await _purge(db)


async def _char(db, character_id):
    return await db.characters.find_one({"address": ADDRESS, "id": character_id})


async def _pc_entry(db, character_id):
    pc = await db.player_characters.find_one({"address": ADDRESS})
    return next(e for e in pc["characters"] if e["characterId"] == character_id)


async def _start(ids):
    return await adventures.start_adventure(ADDRESS, AUTHOR, STORY_ID, ids)


async def test_start_links_party_both_ways(world):
    db, ids = world
    session = await _start(ids)

    assert session["status"] == "active"
    assert session["passage"] == "Start"
    assert session["title"] == "Test Crypt"
    assert [m["characterId"] for m in session["members"]] == ids
    assert session["members"][0]["lead"] is True
    assert [c["firstName"] for c in session["serverVars"]["char"]] == ["Ada", "Bo"]
    assert session["serverVars"]["lead"] == ids[0]

    pointer = {"sessionId": session["sessionId"], "storyId": STORY_ID, "title": "Test Crypt"}
    for cid in ids:
        doc = await _char(db, cid)
        assert doc["availability"]["inAdventure"] is True
        assert doc["availability"]["adventure"] == pointer
        entry = await _pc_entry(db, cid)
        assert entry["availability"]["adventure"] == pointer
        assert "adventuring" in entry["status"] and "free" not in entry["status"]

    listed = await adventures.list_adventures(ADDRESS)
    assert [s["sessionId"] for s in listed] == [session["sessionId"]]


async def test_character_cannot_join_two_adventures(world):
    db, ids = world
    await _start([ids[0]])
    with pytest.raises(adventures.AdventureError) as err:
        await _start(ids)
    assert err.value.status_code == 409
    # The failed party left nothing behind: Bo is still free.
    assert (await _char(db, ids[1]))["availability"].get("adventure") is None
    assert len(await adventures.list_adventures(ADDRESS)) == 1


async def test_party_size_and_story_checks(world):
    _, ids = world
    with pytest.raises(adventures.AdventureError):
        await adventures.start_adventure(ADDRESS, AUTHOR, STORY_ID, [ids[0], ids[0]])
    with pytest.raises(adventures.AdventureError) as err:
        await adventures.start_adventure(ADDRESS, AUTHOR, "no-such-story", ids)
    assert err.value.status_code == 404


async def test_steps_survive_reload_and_reject_stale_or_invalid(world):
    _, ids = world
    session = await _start(ids)
    sid = session["sessionId"]

    after = await adventures.record_step(ADDRESS, sid, 0, "Start", "Hall", {"gold": 3, "char": "hacked"})
    assert after["seq"] == 1 and after["passage"] == "Hall"
    assert after["vars"] == {"gold": 3}  # server vars are never taken from the client

    # A reload (any container) sees exactly that state.
    resumed = await adventures.get_adventure(ADDRESS, sid)
    assert (resumed["seq"], resumed["passage"], resumed["vars"]) == (1, "Hall", {"gold": 3})

    # The same request again (lost reply, retry) is accepted without applying twice.
    again = await adventures.record_step(ADDRESS, sid, 0, "Start", "Hall", {"gold": 3})
    assert again["seq"] == 1

    # A second tab still on the old step is told to resync.
    with pytest.raises(adventures.StepConflict) as conflict:
        await adventures.record_step(ADDRESS, sid, 0, "Start", "Vault", {})
    assert conflict.value.view["seq"] == 1

    # Jumping to a scene that isn't linked is refused.
    with pytest.raises(adventures.AdventureError):
        await adventures.record_step(ADDRESS, sid, 1, "Hall", "Fled", {})


async def test_self_loop_steps_apply_once_each(world):
    """A scene linking to itself: passage and prevPassage stay the same, so
    only `seq` tells consecutive loop steps apart from a retried one."""
    _, ids = world
    sid = (await _start(ids))["sessionId"]
    await adventures.record_step(ADDRESS, sid, 0, "Start", "Hall", {})
    await adventures.record_step(ADDRESS, sid, 1, "Hall", "Vault", {})

    first = await adventures.record_step(ADDRESS, sid, 2, "Vault", "Vault", {"tries": 1})
    assert (first["seq"], first["passage"], first["vars"]) == (3, "Vault", {"tries": 1})

    # Retrying that same loop step is a replay, not a second loop.
    retry = await adventures.record_step(ADDRESS, sid, 2, "Vault", "Vault", {"tries": 1})
    assert retry["seq"] == 3

    # Looping again with the new seq applies.
    second = await adventures.record_step(ADDRESS, sid, 3, "Vault", "Vault", {"tries": 2})
    assert (second["seq"], second["vars"]) == (4, {"tries": 2})
    assert second["trail"][-3:] == ["Vault", "Vault", "Vault"]

    # A late duplicate of the first loop step is now stale.
    with pytest.raises(adventures.StepConflict) as conflict:
        await adventures.record_step(ADDRESS, sid, 2, "Vault", "Vault", {"tries": 1})
    assert conflict.value.view["seq"] == 4


async def test_concurrent_starts_never_share_characters(world, warm_pool):
    """Two starts with the same characters at the same moment: at most one
    adventure runs, and every character points at it (or at nothing). On
    Firestore a plain find_one_and_update let both claim the characters."""
    db, ids = world
    for _ in range(4):
        results = await asyncio.gather(_start(ids), _start(ids), return_exceptions=True)
        assert all(isinstance(r, (dict, adventures.AdventureError)) for r in results), results
        sessions = await db.adventure_sessions.find({"address": ADDRESS}).to_list(None)
        started = [r for r in results if isinstance(r, dict)]
        assert len(sessions) <= 1 and len(started) == len(sessions)
        running = sessions[0]["_id"] if sessions else None
        if running:
            assert sessions[0]["status"] == "active"
        for cid in ids:
            link = (await _char(db, cid))["availability"].get("adventure")
            assert (link or {}).get("sessionId") == running
        if running:
            await adventures.record_step(ADDRESS, running, 0, "Start", "LastResort", {})


async def test_concurrent_steps_one_applies_one_conflicts(world, warm_pool):
    """Two tabs leave the same scene for different scenes at the same moment:
    one step applies, the other is told to resync to it."""
    db, ids = world
    for _ in range(3):
        sid = (await _start(ids))["sessionId"]
        await adventures.record_step(ADDRESS, sid, 0, "Start", "Hall", {})
        results = await asyncio.gather(
            adventures.record_step(ADDRESS, sid, 1, "Hall", "Vault", {}),
            adventures.record_step(ADDRESS, sid, 1, "Hall", "Start", {}),
            return_exceptions=True,
        )
        applied = [r for r in results if isinstance(r, dict)]
        conflicts = [r for r in results if isinstance(r, adventures.StepConflict)]
        assert len(applied) == 1 and len(conflicts) == 1, results
        stored = await db.adventure_sessions.find_one({"_id": sid})
        assert (stored["seq"], stored["passage"]) == (2, applied[0]["passage"])
        assert conflicts[0].view["passage"] == stored["passage"]
        await adventures.record_step(ADDRESS, sid, 2, stored["passage"], "LastResort", {})


async def test_reaching_an_ending_logs_releases_and_counts(world):
    db, ids = world
    session = await _start(ids)
    sid = session["sessionId"]
    await adventures.record_step(ADDRESS, sid, 0, "Start", "Hall", {})
    done = await adventures.record_step(ADDRESS, sid, 1, "Hall", "Victory", {"won": True})

    assert done["status"] == "done" and done["outcome"] == "finished"
    assert await db.adventure_sessions.find_one({"_id": sid}) is None
    log = await db.adventure_log.find_one({"_id": sid})
    assert log["outcome"] == "finished"
    assert log["trail"] == ["Start", "Hall", "Victory"]

    for cid in ids:
        doc = await _char(db, cid)
        assert doc["availability"]["inAdventure"] is False
        assert doc["availability"]["adventure"] is None
        assert doc["stats"]["adventureFinished"] == 1
        assert doc["completedStories"] == [STORY_ID]
        entry = await _pc_entry(db, cid)
        assert entry["availability"]["adventure"] is None
        assert "free" in entry["status"] and "adventuring" not in entry["status"]

    # Retrying the ending step after it finished is harmless.
    replay = await adventures.record_step(ADDRESS, sid, 1, "Hall", "Victory", {})
    assert replay["status"] == "done"
    assert (await _char(db, ids[0]))["stats"]["adventureFinished"] == 1
    assert (await adventures.get_adventure(ADDRESS, sid))["outcome"] == "finished"
    assert await adventures.list_adventures(ADDRESS) == []


async def test_retreat_counts_as_run_away(world):
    db, ids = world
    sid = (await _start([ids[0]]))["sessionId"]
    await adventures.record_step(ADDRESS, sid, 0, "Start", "Retreat", {})
    done = await adventures.record_step(ADDRESS, sid, 1, "Retreat", "Fled", {})
    assert done["outcome"] == "run_away"
    doc = await _char(db, ids[0])
    assert doc["stats"]["adventureRunAway"] == 1
    assert doc.get("completedStories", []) == []


async def test_last_resort_aborts_without_counting(world):
    db, ids = world
    sid = (await _start([ids[0]]))["sessionId"]
    done = await adventures.record_step(ADDRESS, sid, 0, "Start", "LastResort", {})
    assert done["outcome"] == "aborted"
    stats = (await _char(db, ids[0]))["stats"]
    assert stats["adventureFinished"] == 0 and stats["adventureRunAway"] == 0


async def test_recovery_finishes_a_crashed_ending_once(world):
    db, ids = world
    sid = (await _start(ids))["sessionId"]
    # Simulate a request that marked the ending, released one member, then died.
    await db.adventure_sessions.update_one(
        {"_id": sid},
        {"$set": {"status": "ending", "outcome": "finished", "endingPassage": "Victory"}},
    )
    await adventures._release_character(db, ADDRESS, ids[0], sid, "finished", STORY_ID)

    await adventures.recover_adventures(ADDRESS)

    assert await db.adventure_sessions.find_one({"_id": sid}) is None
    assert await db.adventure_log.find_one({"_id": sid}) is not None
    for cid in ids:
        doc = await _char(db, cid)
        assert doc["availability"]["adventure"] is None
        assert doc["stats"]["adventureFinished"] == 1  # counted exactly once each


async def test_recovery_rolls_back_a_stuck_start(world):
    db, ids = world
    sid = (await _start(ids))["sessionId"]
    long_ago = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    await db.adventure_sessions.update_one(
        {"_id": sid}, {"$set": {"status": "starting", "startedAt": long_ago}}
    )
    await adventures.recover_adventures(ADDRESS)
    assert await db.adventure_sessions.find_one({"_id": sid}) is None
    for cid in ids:
        assert (await _char(db, cid))["availability"]["adventure"] is None


async def test_recovery_frees_characters_of_a_vanished_session(world):
    db, ids = world
    sid = (await _start([ids[0]]))["sessionId"]
    await db.adventure_sessions.delete_one({"_id": sid})
    await adventures.recover_adventures(ADDRESS)
    doc = await _char(db, ids[0])
    assert doc["availability"]["adventure"] is None
    assert doc["availability"]["inAdventure"] is False
    assert (await _pc_entry(db, ids[0]))["availability"]["adventure"] is None


async def test_toggle_and_delete_refuse_characters_in_a_session(world):
    _, ids = world
    await _start([ids[0]])
    with pytest.raises(ValueError):
        await set_in_adventure(ADDRESS, ids[0], False)
    with pytest.raises(ValueError):
        await delete_character(ADDRESS, ids[0])


# ── Run counter ─────────────────────────────────────────────────────────────

async def _set_access(db, access):
    await db.twine_review.update_one(
        {"address": AUTHOR, "storyId": STORY_ID}, {"$set": {"metadata.meta_access": access}}
    )


async def _runs():
    return (await adventures.story_runs(ADDRESS, AUTHOR, STORY_ID))["remaining"]


async def _finish(sid):
    await adventures.record_step(ADDRESS, sid, 0, "Start", "Hall", {})
    return await adventures.record_step(ADDRESS, sid, 1, "Hall", "Victory", {})


async def test_free_story_has_no_counter(world):
    db, ids = world
    assert await _runs() is None
    await _finish((await _start([ids[0]]))["sessionId"])
    await _finish((await _start([ids[0]]))["sessionId"])  # again and again
    assert await db.story_plays.count_documents({"address": ADDRESS}) == 0


async def test_trial_gives_one_run_then_refuses(world):
    db, ids = world
    await _set_access(db, "trial")
    assert await _runs() == 1

    sid = (await _start([ids[0]]))["sessionId"]
    assert await _runs() == 0  # spent at start
    await _finish(sid)
    assert await _runs() == 0  # a finished run stays spent

    with pytest.raises(adventures.AdventureError) as err:
        await _start([ids[0]])
    assert err.value.status_code == 402
    assert len(await adventures.list_adventures(ADDRESS)) == 0  # nothing left behind


async def test_paid_starts_at_zero_and_purchase_adds_three(world):
    db, ids = world
    await _set_access(db, "paid")
    assert await _runs() == 0
    with pytest.raises(adventures.AdventureError) as err:
        await _start([ids[0]])
    assert err.value.status_code == 402

    assert (await adventures.grant_runs(ADDRESS, AUTHOR, STORY_ID))["remaining"] == 3
    await _finish((await _start([ids[0]]))["sessionId"])
    assert await _runs() == 2


async def test_trial_purchase_adds_to_the_free_run(world):
    db, ids = world
    await _set_access(db, "trial")
    assert (await adventures.grant_runs(ADDRESS, AUTHOR, STORY_ID))["remaining"] == 4


async def test_run_away_uses_a_run(world):
    db, ids = world
    await _set_access(db, "trial")
    sid = (await _start([ids[0]]))["sessionId"]
    await adventures.record_step(ADDRESS, sid, 0, "Start", "Retreat", {})
    done = await adventures.record_step(ADDRESS, sid, 1, "Retreat", "Fled", {})
    assert done["outcome"] == "run_away"
    assert await _runs() == 0


async def test_last_resort_gives_the_run_back(world):
    db, ids = world
    await _set_access(db, "trial")
    sid = (await _start([ids[0]]))["sessionId"]
    assert await _runs() == 0
    done = await adventures.record_step(ADDRESS, sid, 0, "Start", "LastResort", {})
    assert done["outcome"] == "aborted"
    assert await _runs() == 1
    # Finishing it again (a retried request) doesn't refund twice.
    await adventures.get_adventure(ADDRESS, sid)
    assert await _runs() == 1


async def test_failed_start_gives_the_run_back(world):
    db, ids = world
    await _set_access(db, "trial")
    sid = (await _start([ids[0]]))["sessionId"]
    long_ago = (datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat()
    await db.adventure_sessions.update_one(
        {"_id": sid}, {"$set": {"status": "starting", "startedAt": long_ago}}
    )
    await adventures.recover_adventures(ADDRESS)  # rolls the stuck start back
    assert await _runs() == 1
    await adventures.recover_adventures(ADDRESS)
    assert await _runs() == 1  # refunded once only
