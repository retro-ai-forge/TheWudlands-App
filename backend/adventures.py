"""
Running adventures: a party of characters playing one Twine story.

Every container is stateless (Cloud Run may serve each request from a
different one), so the database is the only source of truth for a run.

Collections
-----------
adventure_sessions  One doc per RUNNING adventure. Holds the party (`members`),
                    the pinned story version, and the progress: current
                    `passage`, the SugarCube variables (`vars`), and a step
                    counter `seq`. Removed once the adventure is over.
adventure_log       One write-once doc per finished adventure (same `_id` as
                    the session it came from): who played, how it ended.
story_snapshots     Immutable copy of a story version (passages + the step
                    graph), shared by every session that plays that version.
                    A story edited or resubmitted mid-run can't strand a party
                    on a scene that no longer exists.

Each member character points back at its session through
`availability.adventure` = {sessionId, storyId, title}, on both the character
doc and its `player_characters` summary entry - so the soul preview can group
characters by adventure, and any member leads to the run.

Session lifecycle
-----------------
    starting -> active -> ending -> done -> (deleted, logged)

starting  Session doc written, members being claimed one by one. A claim is
          a conditional update that only succeeds while the character is
          free, so a character can never be in two runs. If a claim fails,
          the already-claimed members are released and the session deleted.
active    Steps are recorded. Each step is a conditional update on `seq`,
          so a double click, a second tab, or a retried request can never
          apply twice or out of order.
ending    An ending (or LastResort) was reached. The log is written and each
          member released; a member's release and its outcome counters are
          one conditional write, so retries never count twice.
done      Every member released; the session doc is deleted next.

No multi-document transactions are used (Firestore's MongoDB layer is not
relied on for them). Instead every step above is safe to repeat, and
`recover_adventures` finishes whatever a crashed request left half done.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from pymongo import ReturnDocument

from backend.db import get_database
from backend.twine_graph import LAST_RESORT_PASSAGE, build_story_graph, step_allowed

# Review statuses a story may be played from. Stories are only "submitted" today;
# once an approval step exists, drop "submitted" here so only approved ones run.
PLAYABLE_REVIEW_STATUSES = ("submitted", "approved")

# Hard party-size cap, whatever a story declares in $meta_maxCharNum.
MAX_PARTY_SIZE = 4

# Size cap on the stored SugarCube variables (serialised JSON).
MAX_VARS_BYTES = 64 * 1024

# How many recent passage names the session keeps in `trail`.
TRAIL_LENGTH = 50

# A session still "starting" after this long was abandoned by a crashed request.
STALE_START = timedelta(minutes=2)

# Variables the server owns. Sent to the client in `serverVars`; never accepted
# back from it.
SERVER_VARS = ("char", "lead")

ACTIVE_STATUSES = ("starting", "active")


class AdventureError(Exception):
    """A request that can't be carried out; `status_code` maps to HTTP."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


class StepConflict(Exception):
    """A step was based on stale state. Carries the current view to resync to."""

    def __init__(self, view: Optional[dict]):
        super().__init__("Adventure state has moved on - resync and retry")
        self.view = view


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Story snapshots ─────────────────────────────────────────────────────────

# Snapshots never change, so each container can cache their graphs freely.
_GRAPH_CACHE: dict = {}
_GRAPH_CACHE_SIZE = 256


def _max_party(metadata: dict) -> int:
    value = metadata.get("meta_maxCharNum")
    if isinstance(value, int) and not isinstance(value, bool) and value >= 1:
        return min(value, MAX_PARTY_SIZE)
    return MAX_PARTY_SIZE


async def _snapshot_story(db, story_author: str, story_id: str) -> dict:
    """Pin the current version of a story and return its snapshot doc."""
    review = await db.twine_review.find_one({"address": story_author, "storyId": story_id})
    if not review or review.get("status") not in PLAYABLE_REVIEW_STATUSES:
        raise AdventureError("Story not found or not playable", 404)

    passages = review.get("passages", [])
    story_data = review.get("storyData", {})
    digest = hashlib.sha256(
        json.dumps({"p": passages, "s": story_data}, sort_keys=True, default=str).encode()
    ).hexdigest()[:16]
    snapshot_id = f"{story_author}:{story_id}:{digest}"

    graph = build_story_graph(passages, story_data)
    if not graph["start"]:
        raise AdventureError("Story has no start passage", 422)

    metadata = review.get("metadata", {})
    snapshot = {
        "storyAuthor": story_author,
        "storyId": story_id,
        "title": str(metadata.get("meta_title") or review.get("name") or story_id),
        "maxCharNum": _max_party(metadata),
        "storyData": story_data,
        "passages": passages,
        # Stored as JSON text: passage names become dict keys, and may hold
        # characters ('.', leading '$') that aren't valid document field names.
        "graph": json.dumps(graph),
        "createdAt": _now(),
    }
    await db.story_snapshots.update_one(
        {"_id": snapshot_id}, {"$setOnInsert": snapshot}, upsert=True
    )
    _cache_graph(snapshot_id, graph)
    return {"_id": snapshot_id, **snapshot, "graph": graph}


def _cache_graph(snapshot_id: str, graph: dict) -> None:
    if len(_GRAPH_CACHE) >= _GRAPH_CACHE_SIZE:
        _GRAPH_CACHE.clear()
    _GRAPH_CACHE[snapshot_id] = graph


async def _story_graph(db, snapshot_id: str) -> dict:
    graph = _GRAPH_CACHE.get(snapshot_id)
    if graph is None:
        snapshot = await db.story_snapshots.find_one({"_id": snapshot_id}, {"graph": 1})
        if not snapshot:
            raise AdventureError("Story version for this adventure is missing", 500)
        graph = json.loads(snapshot["graph"])
        _cache_graph(snapshot_id, graph)
    return graph


# ── Character <-> session links ─────────────────────────────────────────────

def _adventure_stub(session: dict) -> dict:
    """The back-pointer each member carries in availability.adventure."""
    return {
        "sessionId": session["_id"],
        "storyId": session["storyId"],
        "title": session["title"],
    }


async def _sync_pc(db, address: str, character_id: str, char_doc: dict) -> None:
    """Mirror a character's adventure state into its player_characters entry.

    Copied from the character doc (the authority) rather than applied as a
    delta, so running it twice - or after a crash - always converges.
    """
    pc = await db.player_characters.find_one(
        {"address": address, "characters.characterId": character_id}, {"characters": 1}
    )
    if not pc:
        return
    entry = next(e for e in pc["characters"] if e.get("characterId") == character_id)
    availability = char_doc.get("availability", {})
    in_adventure = bool(availability.get("inAdventure"))
    resting = bool(availability.get("resting"))

    status = [s for s in entry.get("status", []) if s not in ("free", "adventuring", "resting")]
    status.insert(0, "adventuring" if in_adventure else "free")
    if resting:
        status.append("resting")

    await db.player_characters.update_one(
        {"address": address, "characters.characterId": character_id},
        {"$set": {
            "characters.$.status": status,
            "characters.$.availability": {
                "inAdventure": in_adventure,
                "resting": resting,
                "restLocation": availability.get("restLocation"),
                "adventure": availability.get("adventure"),
            },
        }},
    )


def _pc_in_sync(entry: dict, char_doc: dict) -> bool:
    char_av = char_doc.get("availability", {})
    pc_av = entry.get("availability", {})
    return (
        bool(pc_av.get("inAdventure")) == bool(char_av.get("inAdventure"))
        and (pc_av.get("adventure") or None) == (char_av.get("adventure") or None)
    )


async def _claim_character(db, address: str, character_id: str, stub: dict) -> Optional[dict]:
    """Put a free character into the session. None if it isn't free (anymore)."""
    doc = await db.characters.find_one_and_update(
        {
            "address": address,
            "id": character_id,
            "availability.inAdventure": {"$ne": True},
            "availability.adventure": None,
        },
        {"$set": {
            "availability.inAdventure": True,
            "availability.adventure": stub,
            "availability.resting": False,
            "availability.restLocation": None,
        }},
        return_document=ReturnDocument.AFTER,
    )
    if doc is not None:
        await _sync_pc(db, address, character_id, doc)
    return doc


async def _release_character(
    db, address: str, character_id: str, session_id: str,
    outcome: Optional[str] = None, story_id: Optional[str] = None,
) -> None:
    """Take a character out of a session and apply the run's outcome to it.

    The release and the outcome counters are one conditional write on the
    character still pointing at this session - repeating it is a no-op. The
    camp (temporary adventure storage) is discarded once the character is
    out, as when an adventure is ended by hand.
    """
    update: dict = {"$set": {
        "availability.inAdventure": False,
        "availability.adventure": None,
        "availability.resting": False,
        "availability.restLocation": None,
    }}
    if outcome == "finished":
        update["$inc"] = {"stats.adventureFinished": 1}
        if story_id:
            update["$addToSet"] = {"completedStories": story_id}
    elif outcome == "run_away":
        update["$inc"] = {"stats.adventureRunAway": 1}

    doc = await db.characters.find_one_and_update(
        {"address": address, "id": character_id, "availability.adventure.sessionId": session_id},
        update,
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        # Already released (a retry), or the character was deleted.
        doc = await db.characters.find_one({"address": address, "id": character_id})
        if doc is None:
            return
    await _sync_pc(db, address, character_id, doc)
    if not doc.get("availability", {}).get("inAdventure"):
        await db.character_camp.delete_one({"address": address, "characterId": character_id})


# ── Views ───────────────────────────────────────────────────────────────────

def _session_view(session: dict, include_vars: bool = True) -> dict:
    view = {
        "sessionId": session["_id"],
        "storyAuthor": session.get("storyAuthor"),
        "storyId": session.get("storyId"),
        "storyVersion": session.get("storyVersion"),
        "title": session.get("title"),
        "members": session.get("members", []),
        "status": session.get("status"),
        "seq": session.get("seq", 0),
        "passage": session.get("passage"),
        "trail": session.get("trail", []),
        "outcome": session.get("outcome"),
        "endingPassage": session.get("endingPassage"),
        "startedAt": session.get("startedAt"),
        "updatedAt": session.get("updatedAt"),
        "endedAt": session.get("endedAt"),
    }
    if include_vars:
        view["vars"] = json.loads(session.get("vars") or "{}")
        view["serverVars"] = session.get("serverVars", {})
    return view


def _log_view(log: dict) -> dict:
    """A finished adventure, shaped like a session view with status "done"."""
    return {
        "sessionId": log["_id"],
        "storyAuthor": log.get("storyAuthor"),
        "storyId": log.get("storyId"),
        "storyVersion": log.get("storyVersion"),
        "title": log.get("title"),
        "members": log.get("members", []),
        "status": "done",
        "seq": log.get("steps", 0),
        "passage": log.get("endingPassage"),
        "trail": log.get("trail", []),
        "outcome": log.get("outcome"),
        "endingPassage": log.get("endingPassage"),
        "startedAt": log.get("startedAt"),
        "updatedAt": log.get("endedAt"),
        "endedAt": log.get("endedAt"),
    }


def _character_var(doc: dict, lead_id: str) -> dict:
    """One entry of the server-injected $char array."""
    return {
        "id": doc.get("id"),
        "firstName": doc.get("firstName"),
        "lastName": doc.get("lastName"),
        "gender": doc.get("gender"),
        "race": doc.get("race"),
        "raceGroup": doc.get("raceGroup"),
        "birthsign": doc.get("birthsign"),
        "vitalStatus": doc.get("vitalStatus"),
        "attr": doc.get("attr", {}),
        "classes": doc.get("classes", {}),
        "lead": doc.get("id") == lead_id,
    }


# ── Finishing and recovery ──────────────────────────────────────────────────

async def _rollback_start(db, session: dict) -> None:
    """Undo a session that never got all its members: free them, drop it."""
    for member in session.get("members", []):
        await _release_character(db, member["address"], member["characterId"], session["_id"])
    await db.adventure_sessions.delete_one({"_id": session["_id"], "status": "starting"})


async def _finalize(db, session: dict) -> dict:
    """Carry an ending/done session through to logged and deleted.

    Every step is repeatable, so this is also how a crashed finish resumes.
    """
    session_id = session["_id"]
    if session.get("status") == "ending":
        log = {
            "address": session["address"],
            "storyAuthor": session.get("storyAuthor"),
            "storyId": session.get("storyId"),
            "storyVersion": session.get("storyVersion"),
            "title": session.get("title"),
            "members": session.get("members", []),
            "outcome": session.get("outcome"),
            "endingPassage": session.get("endingPassage"),
            "trail": session.get("trail", []),
            "steps": session.get("seq", 0),
            "startedAt": session.get("startedAt"),
            "endedAt": session.get("endedAt"),
        }
        await db.adventure_log.replace_one({"_id": session_id}, log, upsert=True)

        for member in session.get("members", []):
            await _release_character(
                db, member["address"], member["characterId"], session_id,
                session.get("outcome"), session.get("storyId"),
            )

        await db.adventure_sessions.update_one(
            {"_id": session_id, "status": "ending"},
            {"$set": {"status": "done", "updatedAt": _now()}},
        )

    await db.adventure_sessions.delete_one({"_id": session_id, "status": "done"})
    return _session_view({**session, "status": "done"}, include_vars=False)


async def recover_adventures(address: str) -> None:
    """Finish or undo whatever a crashed request left half done for a player.

    - ending/done sessions are finalized
    - sessions stuck in "starting" are rolled back
    - characters pointing at a session that no longer runs are freed
    - player_characters entries out of step with their character are resynced
    """
    db = get_database()
    now = datetime.now(timezone.utc)

    running: set = set()
    async for session in db.adventure_sessions.find({"address": address}):
        status = session.get("status")
        if status in ("ending", "done"):
            await _finalize(db, session)
        elif status == "starting":
            started = datetime.fromisoformat(session["startedAt"])
            if now - started > STALE_START:
                await _rollback_start(db, session)
            else:
                running.add(session["_id"])
        else:
            running.add(session["_id"])

    pc = await db.player_characters.find_one({"address": address}, {"characters": 1})
    pc_entries = {e.get("characterId"): e for e in (pc or {}).get("characters", [])}

    async for char_doc in db.characters.find({"address": address}, {"id": 1, "availability": 1}):
        character_id = char_doc["id"]
        pointer = (char_doc.get("availability") or {}).get("adventure")
        session_id = (pointer or {}).get("sessionId")
        if pointer and session_id not in running:
            # Re-check: a session started after the scan above is not in
            # `running` yet, and its members must not be freed.
            live = await db.adventure_sessions.find_one({"_id": session_id}, {"status": 1})
            if live is None:
                await _release_character(db, address, character_id, session_id)
                continue
        entry = pc_entries.get(character_id)
        if entry is not None and not _pc_in_sync(entry, char_doc):
            await _sync_pc(db, address, character_id, char_doc)


# ── Public API ──────────────────────────────────────────────────────────────

async def start_adventure(
    address: str,
    story_author: str,
    story_id: str,
    character_ids: List[str],
    lead_id: Optional[str] = None,
) -> dict:
    """Send a party of the player's characters into a story.

    `character_ids` is the marching order. The lead defaults to the first.
    """
    db = get_database()
    await recover_adventures(address)

    if not character_ids:
        raise AdventureError("Choose at least one character")
    if len(set(character_ids)) != len(character_ids):
        raise AdventureError("A character can only be in the party once")
    lead_id = lead_id or character_ids[0]
    if lead_id not in character_ids:
        raise AdventureError("The lead must be one of the party")

    snapshot = await _snapshot_story(db, story_author, story_id)
    if len(character_ids) > snapshot["maxCharNum"]:
        raise AdventureError(f"This story allows at most {snapshot['maxCharNum']} characters")

    # Friendly up-front checks. The conditional claims below are the real guard.
    docs = {}
    async for doc in db.characters.find({"address": address, "id": {"$in": character_ids}}):
        docs[doc["id"]] = doc
    now_dt = datetime.now(timezone.utc)
    for character_id in character_ids:
        doc = docs.get(character_id)
        if doc is None:
            raise AdventureError("Character not found", 404)
        name = doc.get("firstName") or character_id
        availability = doc.get("availability", {})
        if doc.get("vitalStatus", "alive") != "alive":
            raise AdventureError(f"{name} can't go on an adventure ({doc.get('vitalStatus')})", 409)
        if availability.get("inAdventure") or availability.get("adventure"):
            raise AdventureError(f"{name} is already on an adventure", 409)
        active_craft = (doc.get("crafting") or {}).get("activeCraft")
        if active_craft and datetime.fromisoformat(active_craft["readyAt"]) > now_dt:
            raise AdventureError(f"{name} is still crafting", 409)

    now = _now()
    graph = snapshot["graph"]
    session = {
        "_id": uuid.uuid4().hex,
        "address": address,
        "storyAuthor": story_author,
        "storyId": story_id,
        "storyVersion": snapshot["_id"],
        "title": snapshot["title"],
        "members": [
            {"address": address, "characterId": cid, "lead": cid == lead_id}
            for cid in character_ids
        ],
        "status": "starting",
        "seq": 0,
        "passage": graph["start"],
        "prevPassage": None,
        "trail": [graph["start"]],
        "vars": "{}",
        "serverVars": {},
        "startedAt": now,
        "updatedAt": now,
    }
    await db.adventure_sessions.insert_one(session)

    stub = _adventure_stub(session)
    claimed: dict = {}
    for character_id in character_ids:
        doc = await _claim_character(db, address, character_id, stub)
        if doc is None:
            await _rollback_start(db, session)
            name = docs[character_id].get("firstName") or character_id
            raise AdventureError(f"{name} is no longer available", 409)
        claimed[character_id] = doc

    server_vars = {
        "char": [_character_var(claimed[cid], lead_id) for cid in character_ids],
        "lead": lead_id,
    }
    active = await db.adventure_sessions.find_one_and_update(
        {"_id": session["_id"], "status": "starting"},
        {"$set": {"status": "active", "serverVars": server_vars, "updatedAt": _now()}},
        return_document=ReturnDocument.AFTER,
    )
    if active is None:
        # Rolled back underneath us by recovery - treat as a failed start.
        await _rollback_start(db, session)
        raise AdventureError("The adventure could not be started - try again", 409)
    return _session_view(active)


async def list_adventures(address: str) -> List[dict]:
    """The player's running adventures (no variables - see get_adventure)."""
    db = get_database()
    await recover_adventures(address)
    sessions = []
    async for session in db.adventure_sessions.find(
        {"address": address, "status": {"$in": list(ACTIVE_STATUSES)}}
    ):
        sessions.append(_session_view(session, include_vars=False))
    sessions.sort(key=lambda s: s.get("startedAt") or "")
    return sessions


async def get_adventure(address: str, session_id: str) -> dict:
    """Full state of one adventure, to resume it (e.g. after a reload).

    A finished adventure comes back from the log with status "done".
    """
    db = get_database()
    session = await db.adventure_sessions.find_one({"_id": session_id, "address": address})
    if session is not None:
        if session.get("status") in ("ending", "done"):
            return await _finalize(db, session)
        return _session_view(session)
    log = await db.adventure_log.find_one({"_id": session_id, "address": address})
    if log is not None:
        return _log_view(log)
    raise AdventureError("Adventure not found", 404)


async def get_adventure_story(address: str, session_id: str) -> dict:
    """The pinned story version a running adventure plays."""
    db = get_database()
    session = await db.adventure_sessions.find_one(
        {"_id": session_id, "address": address}, {"storyVersion": 1}
    )
    if session is None:
        raise AdventureError("Adventure not found", 404)
    snapshot = await db.story_snapshots.find_one(
        {"_id": session["storyVersion"]},
        {"title": 1, "storyData": 1, "passages": 1, "storyId": 1, "storyAuthor": 1},
    )
    if snapshot is None:
        raise AdventureError("Story version for this adventure is missing", 500)
    return {
        "storyVersion": snapshot["_id"],
        "storyId": snapshot.get("storyId"),
        "storyAuthor": snapshot.get("storyAuthor"),
        "title": snapshot.get("title"),
        "storyData": snapshot.get("storyData", {}),
        "passages": snapshot.get("passages", []),
    }


def _clean_vars(story_vars) -> str:
    """Validate the client's SugarCube variables and serialise them."""
    if story_vars is None:
        story_vars = {}
    if not isinstance(story_vars, dict):
        raise AdventureError("vars must be an object")
    cleaned = {k: v for k, v in story_vars.items() if k not in SERVER_VARS}
    encoded = json.dumps(cleaned, separators=(",", ":"))
    if len(encoded.encode()) > MAX_VARS_BYTES:
        raise AdventureError(f"Story variables exceed {MAX_VARS_BYTES // 1024} KB", 413)
    return encoded


def _is_replay(session: dict, seq: int, from_passage: str, to_passage: str) -> bool:
    """The step was already applied (a retry of a request whose reply was lost)."""
    return (
        session.get("seq") == seq + 1
        and session.get("passage") == to_passage
        and session.get("prevPassage") == from_passage
    )


async def record_step(
    address: str,
    session_id: str,
    seq: int,
    from_passage: str,
    to_passage: str,
    story_vars: Optional[dict] = None,
) -> dict:
    """Record the party moving from one scene to the next.

    `seq` is the step counter the client last saw. The step only applies if
    the session is still at that `seq` and on `from_passage` - otherwise
    StepConflict carries the current state for the client to resync to.
    Reaching an ending (or LastResort) finishes the adventure in the same call;
    the returned view then has status "done" and the outcome.
    """
    db = get_database()
    session = await db.adventure_sessions.find_one({"_id": session_id, "address": address})
    if session is None:
        log = await db.adventure_log.find_one({"_id": session_id, "address": address})
        if log is not None:
            view = _log_view(log)
            if log.get("steps") == seq + 1 and log.get("endingPassage") == to_passage:
                return view  # replay of the step that ended it
            raise StepConflict(view)
        raise AdventureError("Adventure not found", 404)

    status = session.get("status")
    if status in ("ending", "done"):
        view = await _finalize(db, session)
        if _is_replay(session, seq, from_passage, to_passage):
            return view
        raise StepConflict(view)
    if status != "active":
        raise StepConflict(_session_view(session))
    if _is_replay(session, seq, from_passage, to_passage):
        return _session_view(session)
    if seq != session.get("seq") or from_passage != session.get("passage"):
        raise StepConflict(_session_view(session))

    graph = await _story_graph(db, session["storyVersion"])
    if not step_allowed(graph, from_passage, to_passage):
        raise AdventureError(f"'{to_passage}' can't be reached from '{from_passage}'")

    vars_json = _clean_vars(story_vars)
    outcome = "aborted" if to_passage == LAST_RESORT_PASSAGE else graph["endings"].get(to_passage)

    now = _now()
    changes = {
        "passage": to_passage,
        "prevPassage": from_passage,
        "seq": seq + 1,
        "vars": vars_json,
        "trail": (session.get("trail", []) + [to_passage])[-TRAIL_LENGTH:],
        "updatedAt": now,
    }
    if outcome:
        changes.update({
            "status": "ending",
            "outcome": outcome,
            "endingPassage": to_passage,
            "endedAt": now,
        })

    updated = await db.adventure_sessions.find_one_and_update(
        {
            "_id": session_id,
            "address": address,
            "status": "active",
            "seq": seq,
            "passage": from_passage,
        },
        {"$set": changes},
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        # Someone else moved the session on between our read and write.
        current = await db.adventure_sessions.find_one({"_id": session_id, "address": address})
        if current is not None and _is_replay(current, seq, from_passage, to_passage):
            if current.get("status") in ("ending", "done"):
                return await _finalize(db, current)
            return _session_view(current)
        raise StepConflict(_session_view(current) if current else None)

    if outcome:
        return await _finalize(db, updated)
    return _session_view(updated)
