import asyncio
import os
from pathlib import Path

import pytest
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")


@pytest.fixture(scope="session")
def mongodb_uri() -> str:
    uri = os.getenv("MONGODB_URI")
    if not uri:
        pytest.skip("MONGODB_URI not set in .env")
    return uri


@pytest.fixture(scope="session")
def subscan_api_key() -> str:
    key = os.getenv("SUBSCAN_API_KEY")
    if not key:
        pytest.skip("SUBSCAN_API_KEY not set in .env")
    return key


@pytest.fixture(scope="session")
def subscan_test_address() -> str:
    """The wallet the live balance/NFT tests read - kept in .env, not in code."""
    address = os.getenv("SUBSCAN_TEST_ADDRESS")
    if not address:
        pytest.skip("SUBSCAN_TEST_ADDRESS not set in .env")
    return address


# Indexes are provisioned once via scripts/setup_db_indexes.py, not per test
# run - creating them takes minutes on Firestore's MongoDB-compatibility
# layer (real server-side index builds), far too slow to redo on every
# `pytest` invocation.


@pytest.fixture
async def warm_pool(mongodb_uri):
    """Open enough pooled connections for truly parallel requests. The driver
    opens two connections at a time, and Firestore's wrong findAndModify
    answers (CLAUDE.md, "Firestore note") only show once the requests really
    run side by side - a cold pool runs a race almost one by one."""
    from backend.db import get_database

    db = get_database()
    for _ in range(4):
        await asyncio.gather(*(db.command("ping") for _ in range(12)))
    return db
