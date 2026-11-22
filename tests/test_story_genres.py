"""The genre list (backend/data/story-genres.json): the curated story tags the
submit check requires one of and the review page draws."""

from pathlib import Path

from backend import story_genres

ICONS = Path(__file__).resolve().parent.parent / "public" / "icons"


def test_genre_ids_are_unique_lowercase_words():
    ids = [g["id"] for c in story_genres.CATEGORIES for g in c["genres"]]
    assert len(ids) == len(set(ids))
    assert all(i.isalpha() and i == i.lower() for i in ids), ids
    assert set(ids) == story_genres.GENRE_IDS


def test_every_genre_has_an_icon_a_colour_and_a_description():
    for c in story_genres.CATEGORIES:
        for g in c["genres"]:
            assert (ICONS / f"tag-{g['id']}.png").is_file(), g["id"]
            assert g["color"].startswith("#") and len(g["color"]) == 7, g
            assert g["desc"].strip(), g


def test_other_is_the_free_catch_all():
    free = [c for c in story_genres.CATEGORIES if c["title"] == "Free"]
    assert [g["id"] for g in free[0]["genres"]] == ["other"]


def test_is_genre_ignores_case_and_spaces():
    assert story_genres.is_genre(" Horror ")
    assert story_genres.is_genre("other")
    assert not story_genres.is_genre("pirates")
