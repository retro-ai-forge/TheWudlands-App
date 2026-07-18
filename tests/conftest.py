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


# Indexes are provisioned once via scripts/setup_db_indexes.py, not per test
# run - creating them takes minutes on Firestore's MongoDB-compatibility
# layer (real server-side index builds), far too slow to redo on every
# `pytest` invocation.
