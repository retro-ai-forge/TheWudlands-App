"""
Exercises the Mongo-backed session and nonce storage in backend.auth against
the real database configured via MONGODB_URI - this is what makes a login on
one Cloud Run instance visible to a request handled by another.
"""

from datetime import datetime, timezone

import pytest

from backend.auth import MessageValidator, clear_session, create_session, verify_session_token
from backend.db import get_database


@pytest.mark.asyncio
async def test_create_and_verify_session(mongodb_uri):
    session = await create_session(address="5TestSessionAddress", session_duration_hours=1)

    try:
        fetched = await verify_session_token(session.token)
        assert fetched is not None
        assert fetched.address == "5TestSessionAddress"
        assert fetched.token == session.token
    finally:
        await clear_session(session.token)

    assert await verify_session_token(session.token) is None


@pytest.mark.asyncio
async def test_nonce_replay_is_rejected(mongodb_uri):
    nonce = f"test-nonce-{datetime.now(timezone.utc).timestamp()}"
    db = get_database()

    try:
        is_valid, _ = await MessageValidator.validate_nonce_uniqueness(nonce)
        assert is_valid is True

        is_valid, error = await MessageValidator.validate_nonce_uniqueness(nonce)
        assert is_valid is False
        assert "already used" in error
    finally:
        await db.nonces.delete_one({"nonce": nonce})
