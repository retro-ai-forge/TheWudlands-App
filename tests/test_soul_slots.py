"""
Run test with:

python -m pytest tests/test_soul_slots.py -v -s
(-s for log output)

Exercises backend.soul_slots - which of the ten welcome-page slots a wallet
has unlocked.

The unlock rules are tested offline against stubbed holdings. The caching
tests need Mongo and skip without MONGODB_URI, same as test_players.py.
"""

import pytest

from backend import soul_slots
from backend.balances import (
    DOT_SYMBOL,
    FIRST_ANNIVERSARY_COLLECTION_ID,
    OG_WUD_BURN_COLLECTION_ID,
    SECOND_ANNIVERSARY_COLLECTION_ID,
    WUD_SYMBOL,
    NftHolding,
    TokenBalance,
)
from backend.soul_slots import (
    FREE_SLOT_NUMBERS,
    SOUL_SLOTS,
    STAR_SLOT_NUMBERS,
    get_stored_slots,
    should_reverify,
    store_slots,
    unlocked_from_holdings,
    unlocked_from_stars,
)

TEST_ADDRESS = "5TestSoulSlotAddress"


def _current_record(unlocked: list[int], stars=None) -> dict:
    """A stored record stamped with the layout the code currently uses."""
    record = {
        "address": TEST_ADDRESS,
        "unlocked": unlocked,
        "layout_version": soul_slots.SLOT_LAYOUT_VERSION,
    }
    if stars is not None:
        record["stars"] = stars
    return record


class FakeHoldings:
    """Stands in for balances.AccountHoldings without any network access."""

    def __init__(self, dot: float = 0, wud: float = 0, collections: tuple = ()):
        self.totals = {
            DOT_SYMBOL: _balance(DOT_SYMBOL, dot),
            WUD_SYMBOL: _balance(WUD_SYMBOL, wud),
        }
        self.nfts = {
            c: NftHolding(c, {"balance": "1", "symbol": "x"}) for c in collections
        }

    def owns_nft_from_collection(self, collection_id: int) -> bool:
        return collection_id in self.nfts


def _balance(symbol: str, amount: float) -> TokenBalance:
    return TokenBalance(symbol, {"decimals": 0, "balance": str(int(amount))})


# --- Offline: unlock rules ---------------------------------------------------


def test_there_are_ten_slots_and_only_the_first_is_free():
    assert [s.number for s in SOUL_SLOTS] == list(range(1, 11))
    assert FREE_SLOT_NUMBERS == (1,)
    # The slow Grid Miner slots sit last so their spinners trail the grid.
    assert STAR_SLOT_NUMBERS == (9, 10)


def test_each_label_matches_the_requirement_it_enforces():
    """
    The text shown under a slot must describe the check that slot performs.

    These are declared in one place but consumed in two (the unlock rules
    and the caption), so a reorder or a copy-paste can silently leave a slot
    advertising "1B WUD" while gating on 5B.
    """
    expected = {
        1: ("free", "FREE", None, None, 0),
        2: ("nft", "WUD 1st YEAR NFT", 441, None, 0),
        3: ("nft", "WUD 2nd YEAR NFT", 842, None, 0),
        4: ("nft", "OG WUD BURN NFT", 244, None, 0),
        5: ("token", "1B WUD", None, WUD_SYMBOL, 1e9),
        6: ("token", "5B WUD", None, WUD_SYMBOL, 5e9),
        7: ("token", "1000 DOT", None, DOT_SYMBOL, 1000),
        8: ("token", "5000 DOT", None, DOT_SYMBOL, 5000),
        9: ("stars", "20 MINING STARS", None, None, 20),
        10: ("stars", "100 MINING STARS", None, None, 100),
    }

    for slot in SOUL_SLOTS:
        kind, label, collection, symbol, amount = expected[slot.number]
        assert slot.kind == kind, f"slot {slot.number} kind"
        assert slot.label == label, f"slot {slot.number} label"
        assert slot.collection_id == collection, f"slot {slot.number} collection"
        assert slot.symbol == symbol, f"slot {slot.number} symbol"
        assert slot.amount == amount, f"slot {slot.number} amount"


def test_every_locked_slot_has_a_link_to_go_earn_it():
    """
    Slots 2-10 send the player somewhere to go get the requirement; only
    the free slot has nothing to link to.
    """
    expected_links = {
        1: None,
        2: "https://www.chaotic.art/ahp/collection/441",
        3: "https://www.chaotic.art/ahp/collection/842",
        4: "https://www.chaotic.art/ahp/collection/244",
        5: "https://app.hydration.net/",
        6: "https://app.hydration.net/",
        7: "https://app.hydration.net/",
        8: "https://app.hydration.net/",
        9: "https://gavunminer.xyz/",
        10: "https://gavunminer.xyz/",
    }

    for slot in SOUL_SLOTS:
        assert slot.link == expected_links[slot.number], f"slot {slot.number} link"
        assert slot.to_dict()["link"] == expected_links[slot.number]


def test_to_dict_exposes_the_star_targets_the_client_needs():
    """
    The star-progress overlay fills N of `amount` stars per slot, so the
    client needs the numeric target - not just the "20 MINING STARS" label text.
    """
    by_number = {slot.number: slot.to_dict() for slot in SOUL_SLOTS}

    assert by_number[9]["amount"] == 20
    assert by_number[10]["amount"] == 100


def test_slot_images_match_their_requirement_type():
    """The artwork must depict what the slot actually asks for."""
    for slot in SOUL_SLOTS:
        if slot.kind == "free":
            assert slot.image is None, "the free slot carries the portrait, not artwork"
        elif slot.kind == "stars":
            assert slot.image == "nft-wud-grid-miner.jpg"
        elif slot.symbol == WUD_SYMBOL:
            assert "wud" in slot.image
        elif slot.symbol == DOT_SYMBOL:
            assert "dot" in slot.image


def test_layout_version_invalidates_records_from_an_older_order():
    """
    Slot numbers changed meaning when the Grid Miner slots moved last, so a
    record written under the old layout must be re-checked, not trusted.
    """
    old = {"address": TEST_ADDRESS, "unlocked": [1, 2, 3, 4, 7, 8, 9], "layout_version": 1}
    current = {
        "address": TEST_ADDRESS,
        "unlocked": [1, 2],
        "layout_version": soul_slots.SLOT_LAYOUT_VERSION,
    }

    # Never trusted, no matter how the dice land.
    assert should_reverify(old, roll=0.99) is True
    # A record with no version at all predates versioning entirely.
    assert should_reverify({"address": TEST_ADDRESS, "unlocked": [1, 5]}, roll=0.99) is True
    # A current record still follows the one-in-thirty-three rule.
    assert should_reverify(current, roll=0.99) is False


def test_every_slot_image_exists_on_disk():
    """
    A renamed or missing artwork file would render as a broken image with
    no other warning, so check the paths the API hands the client.
    """
    from pathlib import Path

    image_dir = Path(__file__).parent.parent / "public" / "images" / "soul-creation"
    missing = [
        slot.image
        for slot in SOUL_SLOTS
        if slot.image and not (image_dir / slot.image).is_file()
    ]

    assert not missing, f"missing slot artwork in {image_dir}: {missing}"


def test_empty_wallet_still_gets_the_free_slot():
    """A wallet holding nothing must not end up with an empty grid."""
    assert unlocked_from_holdings(FakeHoldings()) == [1]


def test_each_nft_unlocks_its_own_slot():
    for collection, slot in (
        (FIRST_ANNIVERSARY_COLLECTION_ID, 2),
        (SECOND_ANNIVERSARY_COLLECTION_ID, 3),
        (OG_WUD_BURN_COLLECTION_ID, 4),
    ):
        unlocked = unlocked_from_holdings(FakeHoldings(collections=(collection,)))
        assert unlocked == [1, slot], f"collection {collection} unlocked {unlocked}"


def test_token_thresholds_are_inclusive_and_cumulative():
    """Holding 5B WUD unlocks the 1B slot as well as the 5B one."""
    assert unlocked_from_holdings(FakeHoldings(wud=999_999_999)) == [1]
    assert unlocked_from_holdings(FakeHoldings(wud=1e9)) == [1, 5]
    assert unlocked_from_holdings(FakeHoldings(wud=5e9)) == [1, 5, 6]

    assert unlocked_from_holdings(FakeHoldings(dot=999)) == [1]
    assert unlocked_from_holdings(FakeHoldings(dot=1000)) == [1, 7]
    assert unlocked_from_holdings(FakeHoldings(dot=5000)) == [1, 7, 8]


def test_star_thresholds():
    assert unlocked_from_stars(0) == []
    assert unlocked_from_stars(19) == []
    assert unlocked_from_stars(20) == [9]
    assert unlocked_from_stars(99) == [9]
    assert unlocked_from_stars(100) == [9, 10]


def test_token_slots_never_unlock_star_slots():
    """Stars come from a separate pass; a rich wallet must not get them free."""
    unlocked = unlocked_from_holdings(FakeHoldings(dot=99_999, wud=99e9))

    assert not set(unlocked) & set(STAR_SLOT_NUMBERS)


def test_nfts_unlock_without_any_token_balance():
    """Owning the NFT is enough - the wallet need hold no DOT or WUD."""
    holdings = FakeHoldings(collections=(OG_WUD_BURN_COLLECTION_ID,))

    assert holdings.totals[DOT_SYMBOL].total == 0
    assert unlocked_from_holdings(holdings) == [1, 4]


# --- Offline: re-verification policy -----------------------------------------


def test_first_ever_login_always_checks():
    assert should_reverify(None) is True
    assert should_reverify({}) is True
    assert should_reverify({"address": TEST_ADDRESS}) is True


def test_stored_result_is_reused_most_logins():
    stored = _current_record([1, 2])

    # Roughly one login in thirty-three re-checks; the rest serve the cached answer.
    assert should_reverify(stored, roll=0.02) is True
    assert should_reverify(stored, roll=0.5) is False
    assert should_reverify(stored, roll=0.99) is False


def test_reverify_rate_is_about_one_in_thirty_three():
    stored = _current_record([1])
    rolls = [i / 1000 for i in range(1000)]

    checked = sum(1 for roll in rolls if should_reverify(stored, roll))

    assert 25 <= checked <= 35


# --- Offline: fast resolve fallbacks -----------------------------------------


@pytest.mark.asyncio
async def test_unavailable_lookup_leaves_the_grid_locked(monkeypatch):
    """
    No Subscan key and nothing cached must report checked=False.

    The UI drops the spinner but keeps every slot greyed - claiming the
    wallet qualifies for nothing would be a lie, not a result.
    """
    monkeypatch.setattr(soul_slots, "get_stored_slots", _async_return(None))
    monkeypatch.setattr(soul_slots, "evaluate_fast_slots", _async_return(None))

    state = await soul_slots.resolve_fast_slots(TEST_ADDRESS, roll=0.0)

    assert state["checked"] is False
    assert state["unlocked"] == [1]


@pytest.mark.asyncio
async def test_unavailable_lookup_falls_back_to_stored_unlocks(monkeypatch):
    """A Subscan outage must not revoke slots the player already earned."""
    monkeypatch.setattr(
        soul_slots, "get_stored_slots", _async_return(_current_record([1, 2, 7], stars=40))
    )
    monkeypatch.setattr(soul_slots, "evaluate_fast_slots", _async_return(None))

    state = await soul_slots.resolve_fast_slots(TEST_ADDRESS, roll=0.0)

    assert state["checked"] is True
    assert state["unlocked"] == [1, 2, 7]


@pytest.mark.asyncio
async def test_outage_does_not_serve_unlocks_from_an_older_layout(monkeypatch):
    """
    Stale numbers are worse than no answer.

    A record from a previous slot order would grant whatever those numbers
    now point at, so an outage must fall back to the free slot instead.
    """
    monkeypatch.setattr(
        soul_slots,
        "get_stored_slots",
        _async_return({"unlocked": [1, 2, 3, 4, 7, 8, 9], "layout_version": 1}),
    )
    monkeypatch.setattr(soul_slots, "evaluate_fast_slots", _async_return(None))

    state = await soul_slots.resolve_fast_slots(TEST_ADDRESS, roll=0.99)

    assert state["checked"] is False
    assert state["unlocked"] == [1]


@pytest.mark.asyncio
async def test_fast_pass_keeps_previously_earned_star_slots(monkeypatch):
    """
    The fast pass does not re-count stars, so it must not drop star slots.

    Without this, every login would briefly revoke slots 5/6 until the slow
    pass finished.
    """
    stored = {"unlocked": [1, 9], "stars": 40}
    saved: dict = {}

    monkeypatch.setattr(soul_slots, "get_stored_slots", _async_return(stored))
    monkeypatch.setattr(soul_slots, "evaluate_fast_slots", _async_return([1, 5]))

    async def capture(address, changes):
        saved.update(changes)

    monkeypatch.setattr(soul_slots, "store_slots", capture)

    state = await soul_slots.resolve_fast_slots(TEST_ADDRESS, roll=0.0)

    assert state["unlocked"] == [1, 5, 9]
    assert saved["unlocked"] == [1, 5, 9]


def test_stars_are_rechecked_on_their_own_cadence_not_on_first_result_only():
    """
    A stored star count must not permanently suppress rechecking.

    Before this, "do we have a number" and "is it time to check again" were
    the same field, so a wallet's stars were counted once, ever, and every
    later login - including a forced reload - silently reused that first
    result forever.
    """
    never_checked = {"address": TEST_ADDRESS, "unlocked": [1]}
    assert soul_slots.should_recheck_stars(never_checked) is True

    checked_with_a_real_count = _current_record([1, 9], stars=37)
    checked_with_a_real_count["stars_checked_at"] = "2026-01-01T00:00:00"
    # A wallet with zero stars is still a completed check, not "unchecked".
    checked_zero = _current_record([1], stars=0)
    checked_zero["stars_checked_at"] = "2026-01-01T00:00:00"

    for record in (checked_with_a_real_count, checked_zero):
        assert soul_slots.should_recheck_stars(record, roll=0.02) is True
        assert soul_slots.should_recheck_stars(record, roll=0.5) is False


def test_forced_reload_always_recheck_stars_even_after_a_result_is_stored():
    """The exact bug: force=true must reach the star pass, not just the fast one."""
    record = _current_record([1, 9], stars=37)
    record["stars_checked_at"] = "2026-01-01T00:00:00"

    assert soul_slots.should_recheck_stars(record, roll=0.0) is True


@pytest.mark.asyncio
async def test_resolve_fast_slots_reports_stars_pending_from_its_own_cadence(monkeypatch):
    """
    The stale-value bug, reproduced through resolve_fast_slots directly:
    a stored star count must not silently flip stars_pending to False.
    """
    stored = _current_record([1, 9], stars=37)
    stored["stars_checked_at"] = "2026-01-01T00:00:00"

    monkeypatch.setattr(soul_slots, "get_stored_slots", _async_return(stored))
    monkeypatch.setattr(soul_slots, "evaluate_fast_slots", _async_return([1]))
    monkeypatch.setattr(soul_slots, "store_slots", _async_return(None))

    # A normal cache hit (not forced) still returns the last stars value...
    cached = await soul_slots.resolve_fast_slots(TEST_ADDRESS, roll=0.5)
    assert cached["stars"] == 37
    # ...but must not claim the star pass is settled just because a number
    # exists - that decision is should_recheck_stars's alone.
    assert cached["stars_pending"] is False  # roll 0.5 also skips the star recheck

    # A roll inside the reverify window must recheck both.
    reverified = await soul_slots.resolve_fast_slots(TEST_ADDRESS, roll=0.02)
    assert reverified["stars_pending"] is True

    # Force (roll=0.0) must always recheck stars, regardless of any stored value.
    forced = await soul_slots.resolve_fast_slots(TEST_ADDRESS, roll=0.0)
    assert forced["stars_pending"] is True


@pytest.mark.asyncio
async def test_natural_reverify_uses_one_shared_roll_for_both_passes(monkeypatch):
    """
    A natural (unforced) page load reverifies fast slots and stars together.

    Deliberate: on the rare login that reverifies at all, doing both at
    once is an acceptable cost, and it is simpler than ageing the two
    independently.
    """
    stored = _current_record([1, 9], stars=37)
    stored["stars_checked_at"] = "2026-01-01T00:00:00"

    monkeypatch.setattr(soul_slots, "get_stored_slots", _async_return(stored))
    monkeypatch.setattr(soul_slots, "evaluate_fast_slots", _async_return([1]))
    monkeypatch.setattr(soul_slots, "store_slots", _async_return(None))
    monkeypatch.setattr(soul_slots.random, "random", lambda: 0.02)

    state = await soul_slots.resolve_fast_slots(TEST_ADDRESS)  # roll=None

    assert state["cached"] is False
    assert state["stars_pending"] is True


@pytest.mark.asyncio
async def test_star_pass_revokes_stars_that_are_no_longer_held(monkeypatch):
    """Selling the miners must take slot 5 back, without touching the rest."""
    monkeypatch.setattr(
        soul_slots, "get_stored_slots", _async_return({"unlocked": [1, 2, 9, 10], "stars": 120})
    )

    async def no_stars(address):
        return 0, []

    monkeypatch.setattr(soul_slots, "evaluate_star_slots", no_stars)
    monkeypatch.setattr(soul_slots, "store_slots", _async_return(None))

    state = await soul_slots.resolve_star_slots(TEST_ADDRESS)

    assert state["unlocked"] == [1, 2]
    assert state["stars"] == 0


def _async_return(value):
    async def _inner(*args, **kwargs):
        return value

    return _inner


# --- Mongo-backed: the stored record -----------------------------------------


@pytest.mark.asyncio
async def test_slots_are_stored_and_read_back(mongodb_uri):
    from backend.db import get_database

    db = get_database()
    await db.soul_slots.delete_many({"address": TEST_ADDRESS})
    try:
        assert await get_stored_slots(TEST_ADDRESS) is None

        await store_slots(TEST_ADDRESS, {"unlocked": [1, 2], "stars": 40})
        stored = await get_stored_slots(TEST_ADDRESS)
        assert stored["unlocked"] == [1, 2]
        assert stored["stars"] == 40
        assert stored["updated_at"] is not None

        # A second write updates in place rather than inserting a duplicate.
        await store_slots(TEST_ADDRESS, {"unlocked": [1, 2, 7]})
        assert await db.soul_slots.count_documents({"address": TEST_ADDRESS}) == 1

        stored = await get_stored_slots(TEST_ADDRESS)
        assert stored["unlocked"] == [1, 2, 7]
        # Untouched fields survive a partial update.
        assert stored["stars"] == 40
        print(f"stored record: {stored['unlocked']}, {stored['stars']} stars")
    finally:
        await db.soul_slots.delete_many({"address": TEST_ADDRESS})
