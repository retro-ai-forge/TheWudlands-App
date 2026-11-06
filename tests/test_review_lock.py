"""The 7-day review window: once it runs out, a submission is locked against
resubmission until reviewed (see _review_window_closed in auth_routes)."""

from datetime import datetime, timedelta, timezone

from backend.auth_routes import _review_window_closed

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
    # Any later status (set by a future review step) is decided by that step.
    assert _review_window_closed(_review(30, status="approved"), NOW) is False
