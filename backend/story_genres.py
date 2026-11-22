"""Story genres: the curated story tags (data/story-genres.json).

A submitted story needs at least one of them (auth_routes._check_twine_syntax);
authors may add any other words too, which the story list shows under "other".
The review page reads the same file for its colours, descriptions and legend
(app/create/review/page.tsx).
"""

import json
from pathlib import Path

_DATA = json.loads(
    (Path(__file__).resolve().parent / "data" / "story-genres.json").read_text(encoding="utf-8")
)

# [{"title": ..., "genres": [{"id", "color", "desc"}, ...]}, ...] in legend order.
CATEGORIES: list = _DATA["categories"]

GENRE_IDS: frozenset = frozenset(g["id"] for c in CATEGORIES for g in c["genres"])


def is_genre(tag) -> bool:
    """Whether a story tag is one of the curated genres, in any letter case."""
    return str(tag).strip().lower() in GENRE_IDS
