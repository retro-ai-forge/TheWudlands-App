"""The story engine (twinejs-integrated/engine) reports only changes to the
Legend names; its list must be the backend's (backend/legend.py LEGEND_PAIRS),
pair by pair, or a story's Legend change would be lost or misnamed."""

import re
from pathlib import Path

import pytest

from backend.legend import LEGEND_PAIRS

ENGINE_NAMES = Path(__file__).resolve().parent.parent / "twinejs-integrated" / "engine" / "src" / "legend-names.js"


@pytest.mark.skipif(not ENGINE_NAMES.exists(), reason="the twinejs-integrated submodule isn't checked out")
def test_engine_legend_pairs_match_the_backend():
    text = ENGINE_NAMES.read_text(encoding="utf-8")
    pairs = tuple(re.findall(r"\['(\w+)', '(\w+)'\]", text))
    assert pairs == tuple(LEGEND_PAIRS)
