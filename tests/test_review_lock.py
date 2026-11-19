"""The 7-day review window: once it runs out, a submission is locked against
resubmission until reviewed (see _review_window_closed in auth_routes). A story
that passed review is live and locked for its author for good (_submit_refusal;
the database side is in test_live_story_lock.py)."""

from datetime import datetime, timedelta, timezone

from backend.auth_routes import _LIVE_STORY_LOCKED, _review_window_closed, _submit_refusal

NOW = datetime(2026, 11, 6, 12, 0, tzinfo=timezone.utc)


def _review(days_ago: float, **extra) -> dict:
    stamp = (NOW - timedelta(days=days_ago)).isoformat()
    return {"status": "submitted", "lastUpdate": stamp, "submittedAt": stamp, **extra}


def test_open_within_the_window():
    assert _review_window_closed(_review(0), NOW) is False
    assert _review_window_closed(_review(6.99), NOW) is False


def test_locked_once_the_window_runs_out():
    assert _review_window_closed(_review(7), NOW) is True
    assert _review_window_closed(_review(30), NOW) is True


def test_first_submission_is_never_locked():
    assert _review_window_closed(None, NOW) is False


def test_falls_back_to_submitted_at_for_older_entries():
    old = {"status": "submitted", "submittedAt": (NOW - timedelta(days=8)).isoformat()}
    assert _review_window_closed(old, NOW) is True


def test_entry_without_a_timestamp_is_not_locked():
    assert _review_window_closed({"status": "submitted"}, NOW) is False
    assert _review_window_closed(_review(8, lastUpdate="garbage", submittedAt=None), NOW) is False


def test_only_submitted_entries_are_locked():
    # The window only concerns waiting entries; later statuses are _submit_refusal's.
    assert _review_window_closed(_review(30, status="approved"), NOW) is False


def test_new_and_waiting_stories_may_be_submitted():
    # A rejected story has no entry any more (rejection deletes it).
    assert _submit_refusal(None, NOW) is None
    assert _submit_refusal(_review(6.99), NOW) is None


def test_closed_window_is_refused():
    assert "Review window closed" in _submit_refusal(_review(7), NOW)


def test_live_story_is_never_resubmitted():
    # Approved = live: locked for its author for good, however recent.
    assert _submit_refusal(_review(0, status="approved"), NOW) == _LIVE_STORY_LOCKED
    assert _submit_refusal(_review(400, status="approved"), NOW) == _LIVE_STORY_LOCKED


def test_any_other_status_is_locked_too():
    # A status a later review step adds, or none at all, never reopens a story.
    assert _submit_refusal(_review(0, status="retired"), NOW) == _LIVE_STORY_LOCKED
    assert _submit_refusal({"storyId": "x"}, NOW) == _LIVE_STORY_LOCKED
