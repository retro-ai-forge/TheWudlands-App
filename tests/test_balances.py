"""
Run test with:

python -m pytest tests/test_balances.py -v -s
(-s for log output)

Exercises backend.balances - the DOT/WUD lookup that runs after login.
Scaling and failure handling are tested offline against stubbed Subscan
payloads; the live tests hit the real API and skip without a key.

The wallet the live tests read is SUBSCAN_TEST_ADDRESS in .env - change it
there, not here.

For the raw Subscan connection itself, see test_subscan_connection.py.
"""

import pytest

from backend import balances, hydration_rpc
from backend.balances import (
    DOT_SYMBOL,
    OG_WUD_BURN_COLLECTION_ID,
    WUD_SYMBOL,
    TokenBalance,
    fetch_dot_and_wud,
    fetch_holdings,
    fetch_nft_holdings,
    log_login_balances,
    owns_nft_from_collection,
    total_across_chains,
)


@pytest.fixture(autouse=True)
def stub_hydration_rpc(monkeypatch):
    """
    Keep the Hydration half offline by default.

    Only AssetHub goes through Subscan now - Hydration reads over RPC (see
    backend.hydration_rpc) - so monkeypatching `_fetch_account_tokens`, as
    most tests here do, no longer intercepts it. Without this stub those
    tests would open real websockets to public nodes.

    Returns no holdings, which is a valid answer; tests that care about
    Hydration's contribution override this with their own patch.
    """
    monkeypatch.setattr(hydration_rpc, "fetch_tokens", lambda address: [])


# --- Offline: scaling and parsing -------------------------------------------


def test_balance_scales_out_of_planck_units():
    """Subscan's `balance` is free + reserved, so reserves come off the top."""
    balance = TokenBalance(
        DOT_SYMBOL,
        {"decimals": 10, "balance": "100000000000", "reserved": "40000000000", "lock": "0"},
    )

    assert balance.total == pytest.approx(10.0)
    assert balance.reserved == pytest.approx(4.0)
    assert balance.transferable == pytest.approx(6.0)


def test_locks_come_off_the_transferable_amount():
    balance = TokenBalance(
        WUD_SYMBOL,
        {"decimals": 10, "balance": "1000000000000", "reserved": "0", "lock": "400000000000"},
    )

    assert balance.total == pytest.approx(100.0)
    assert balance.transferable == pytest.approx(60.0)


def test_totals_add_up_across_both_chains():
    """The same token on two chains sums into one figure."""
    assethub = TokenBalance(
        DOT_SYMBOL, {"decimals": 10, "balance": "100000000000", "reserved": "40000000000"}
    )
    hydration = TokenBalance(DOT_SYMBOL, {"decimals": 10, "balance": "25000000000"})

    totals = total_across_chains(
        {"assethub": {DOT_SYMBOL: assethub}, "hydration": {DOT_SYMBOL: hydration}}
    )

    assert totals[DOT_SYMBOL].total == pytest.approx(12.5)
    assert totals[DOT_SYMBOL].reserved == pytest.approx(4.0)
    assert totals[DOT_SYMBOL].transferable == pytest.approx(8.5)


def test_totals_refuse_to_mix_tokens():
    """A DOT figure must never be folded into a WUD one."""
    dot = TokenBalance(DOT_SYMBOL, {"decimals": 10, "balance": "10000000000"})
    wud = TokenBalance(WUD_SYMBOL, {"decimals": 10, "balance": "10000000000"})

    with pytest.raises(ValueError):
        dot + wud


def test_missing_token_reads_as_zero(monkeypatch):
    """An account holding neither token still yields a full, zeroed result."""
    monkeypatch.setenv("SUBSCAN_API_KEY", "test-key")
    monkeypatch.setattr(balances, "_fetch_account_tokens", lambda *a, **kw: [])

    result = _run(fetch_dot_and_wud("1abc"))

    for chain in ("assethub", "hydration"):
        assert result[chain][DOT_SYMBOL].total == 0
        assert result[chain][WUD_SYMBOL].total == 0


def test_hydration_wud_comes_from_rpc_rows(monkeypatch):
    """
    Hydration's WUD is read over RPC and parses like any Subscan row.

    backend.hydration_rpc deliberately emits Subscan-shaped rows so the
    same TokenBalance parsing serves both sources; this pins that contract
    from the balances side.
    """
    monkeypatch.setenv("SUBSCAN_API_KEY", "test-key")
    monkeypatch.setattr(balances, "_fetch_account_tokens", lambda *a, **kw: [])
    monkeypatch.setattr(
        hydration_rpc,
        "fetch_tokens",
        lambda address: [
            {
                "symbol": "WUD",
                "decimals": 10,
                "balance": "10000000000",
                "reserved": "0",
                "lock": "0",
                "category": "Assets",
            }
        ],
    )

    result = _run(fetch_dot_and_wud("1abc"))

    assert result["hydration"][WUD_SYMBOL].total == pytest.approx(1.0)
    # AssetHub contributed nothing, so the cross-chain total is Hydration's.
    assert result["assethub"][WUD_SYMBOL].total == 0


def test_no_api_key_returns_none(monkeypatch):
    monkeypatch.delenv("SUBSCAN_API_KEY", raising=False)

    assert _run(fetch_dot_and_wud("1abc")) is None


def test_login_logging_survives_a_subscan_outage(monkeypatch, capsys):
    """
    Both chains failing must log and move on - the session already exists.

    fetch_holdings no longer lets a chain's exception propagate (see
    test_one_chain_failing_does_not_lose_the_other below), so this now
    resolves to an all-zero AccountHoldings rather than raising - the
    per-chain failure is still logged, and log_login_balances still prints
    its normal (zeroed) summary instead of crashing.
    """
    monkeypatch.setenv("SUBSCAN_API_KEY", "test-key")

    def explode(*args, **kwargs):
        raise ConnectionError("subscan unreachable")

    monkeypatch.setattr(balances, "_fetch_account_tokens", explode)

    _run(log_login_balances("1abc"))  # must not raise

    output = capsys.readouterr().out.lower()
    assert "lookup failed" in output
    assert "0.0000 dot" in output


def test_one_chain_failing_does_not_lose_the_other(monkeypatch, capsys):
    """Every Hydration RPC node being down must not hide AssetHub's balance."""
    monkeypatch.setenv("SUBSCAN_API_KEY", "test-key")

    def explode(address):
        raise ConnectionError("hydration unreachable")

    monkeypatch.setattr(
        balances,
        "_fetch_account_tokens",
        lambda *a, **kw: [
            {
                "symbol": DOT_SYMBOL,
                "decimals": 10,
                "balance": "10000000000",
                "category": "Native",
            }
        ],
    )
    monkeypatch.setattr(hydration_rpc, "fetch_tokens", explode)

    holdings = _run(fetch_holdings("1abc"))

    assert holdings is not None
    assert holdings.balances[balances.ASSETHUB_CHAIN][DOT_SYMBOL].total == pytest.approx(1.0)
    assert holdings.balances[balances.HYDRATION_CHAIN][DOT_SYMBOL].total == 0
    assert holdings.totals[DOT_SYMBOL].total == pytest.approx(1.0)
    assert "hydration lookup failed" in capsys.readouterr().out.lower()


# --- Offline: NFT collection ownership ---------------------------------------


def _nft_entry(collection_id: int, count: int, name: str = "Some Collection") -> dict:
    return {
        "symbol": name,
        "unique_id": f"standard_nfts/{collection_id}",
        "asset_id": str(collection_id),
        "decimals": 0,
        "balance": str(count),
        "category": "NFTs",
    }


def test_owning_an_nft_from_the_collection(monkeypatch):
    monkeypatch.setenv("SUBSCAN_API_KEY", "test-key")
    monkeypatch.setattr(
        balances,
        "_fetch_account_tokens",
        lambda *a, **kw: [_nft_entry(OG_WUD_BURN_COLLECTION_ID, 2, "OG WUD BURN")],
    )

    assert _run(owns_nft_from_collection("1abc", OG_WUD_BURN_COLLECTION_ID)) is True


def test_not_owning_an_nft_from_the_collection(monkeypatch):
    """Holding other collections must not satisfy the check."""
    monkeypatch.setenv("SUBSCAN_API_KEY", "test-key")
    monkeypatch.setattr(
        balances,
        "_fetch_account_tokens",
        lambda *a, **kw: [_nft_entry(852, 4, "WUD Miners")],
    )

    assert _run(owns_nft_from_collection("1abc", OG_WUD_BURN_COLLECTION_ID)) is False


def test_fungible_tokens_are_not_mistaken_for_nfts(monkeypatch):
    """WUD's asset id and an NFT collection id share a namespace shape."""
    monkeypatch.setenv("SUBSCAN_API_KEY", "test-key")
    monkeypatch.setattr(
        balances,
        "_fetch_account_tokens",
        lambda *a, **kw: [
            {
                "symbol": "WUD",
                "unique_id": "standard_assets/244",
                "asset_id": "244",
                "decimals": 10,
                "balance": "10000000000",
                "category": "Assets",
            }
        ],
    )

    assert _run(fetch_nft_holdings("1abc")) == {}
    assert _run(owns_nft_from_collection("1abc", 244)) is False


def test_nft_check_without_api_key_is_false(monkeypatch):
    """The gate closes rather than throwing when Subscan is unconfigured."""
    monkeypatch.delenv("SUBSCAN_API_KEY", raising=False)

    assert _run(fetch_nft_holdings("1abc")) is None
    assert _run(owns_nft_from_collection("1abc", OG_WUD_BURN_COLLECTION_ID)) is False


def test_one_call_per_chain_covers_balances_and_nfts(monkeypatch):
    """
    The whole point of AccountHoldings: no duplicate fetch per chain.

    AssetHub is the only chain on Subscan now, so exactly one Subscan call
    is expected - Hydration is fetched separately over RPC, stubbed here to
    return its own DOT so the cross-chain total is still exercised.
    """
    monkeypatch.setenv("SUBSCAN_API_KEY", "test-key")
    calls: list[str] = []

    dot_row = {
        "symbol": DOT_SYMBOL,
        "decimals": 10,
        "balance": "10000000000",
        "category": "Native",
    }

    def record(base_url, address, api_key):
        calls.append(base_url)
        return [dot_row, _nft_entry(OG_WUD_BURN_COLLECTION_ID, 2, "OG WUD BURN")]

    monkeypatch.setattr(balances, "_fetch_account_tokens", record)
    monkeypatch.setattr(hydration_rpc, "fetch_tokens", lambda address: [dot_row])

    holdings = _run(fetch_holdings("1abc"))

    assert calls == [balances.ASSETHUB_API], f"expected one AssetHub call, got {calls}"

    # Balances, totals and NFTs all came out of those same two responses.
    assert holdings.balances[balances.ASSETHUB_CHAIN][DOT_SYMBOL].total == pytest.approx(1.0)
    assert holdings.totals[DOT_SYMBOL].total == pytest.approx(2.0)
    assert holdings.owns_nft_from_collection(OG_WUD_BURN_COLLECTION_ID) is True
    assert holdings.owns_nft_from_collection(999) is False


def test_nfts_are_read_from_assethub_only(monkeypatch):
    """Hydration has no NFT pallet, so its response must not contribute."""
    monkeypatch.setenv("SUBSCAN_API_KEY", "test-key")

    monkeypatch.setattr(
        balances,
        "_fetch_account_tokens",
        lambda *a, **kw: [_nft_entry(OG_WUD_BURN_COLLECTION_ID, 1, "OG WUD BURN")],
    )
    monkeypatch.setattr(
        hydration_rpc,
        "fetch_tokens",
        lambda address: [_nft_entry(777, 5, "Impossible Hydration NFT")],
    )

    holdings = _run(fetch_holdings("1abc"))

    assert set(holdings.nfts) == {OG_WUD_BURN_COLLECTION_ID}


def test_tracked_collection_ids():
    """The collections the game gates on, pinned so they can't drift."""
    assert balances.OG_WUD_BURN_COLLECTION_ID == 244
    assert balances.FIRST_ANNIVERSARY_COLLECTION_ID == 441
    assert balances.SECOND_ANNIVERSARY_COLLECTION_ID == 842
    assert balances.TRACKED_NFT_COLLECTIONS == (244, 441, 842)


def test_tracked_collections_are_reported_even_when_absent(monkeypatch):
    """A collection the wallet lacks must read as zero, not go missing."""
    monkeypatch.setenv("SUBSCAN_API_KEY", "test-key")
    monkeypatch.setattr(
        balances,
        "_fetch_account_tokens",
        lambda *a, **kw: [
            _nft_entry(OG_WUD_BURN_COLLECTION_ID, 2, "OG WUD BURN"),
            _nft_entry(999, 7, "Something untracked"),
        ],
    )

    tracked = _run(fetch_holdings("1abc")).tracked_nfts

    assert set(tracked) == set(balances.TRACKED_NFT_COLLECTIONS)
    assert tracked[OG_WUD_BURN_COLLECTION_ID].owned is True
    assert tracked[balances.SECOND_ANNIVERSARY_COLLECTION_ID].count == 0
    assert tracked[balances.SECOND_ANNIVERSARY_COLLECTION_ID].owned is False
    assert 999 not in tracked


def test_nfts_are_owned_independently_of_any_token_balance(monkeypatch):
    """
    A wallet with zero DOT and zero WUD can still own NFTs.

    Subscan omits tokens the account does not hold, so such a wallet returns
    NFT rows only - the balances must read zero without the NFT check being
    dragged down with them.
    """
    monkeypatch.setenv("SUBSCAN_API_KEY", "test-key")
    monkeypatch.setattr(
        balances,
        "_fetch_account_tokens",
        lambda *a, **kw: [_nft_entry(OG_WUD_BURN_COLLECTION_ID, 1, "OG WUD BURN")],
    )

    holdings = _run(fetch_holdings("1abc"))

    assert holdings.totals[DOT_SYMBOL].total == 0
    assert holdings.totals[WUD_SYMBOL].total == 0
    assert holdings.owns_nft_from_collection(OG_WUD_BURN_COLLECTION_ID) is True
    assert holdings.tracked_nfts[OG_WUD_BURN_COLLECTION_ID].count == 1


def test_holdings_beyond_the_first_page_are_followed(monkeypatch):
    """
    Subscan defaults to 10 rows ordered by balance descending, so paging is
    what keeps single-item NFT collections from being dropped.
    """
    everything = [_nft_entry(i, 1, f"Collection {i}") for i in range(250)]
    requested: list[tuple[int, int]] = []

    def paged(base_url, address, api_key, page):
        requested.append((page, balances.PAGE_SIZE))
        start = page * balances.PAGE_SIZE
        return everything[start : start + balances.PAGE_SIZE], len(everything)

    monkeypatch.setattr(balances, "_fetch_token_page", paged)

    tokens = balances._fetch_account_tokens("https://x", "1abc", "test-key")

    assert len(tokens) == 250
    assert [page for page, _ in requested] == [0, 1, 2]
    # Every page must ask for the maximum row size, never Subscan's default.
    assert {row for _, row in requested} == {100}


def test_paging_stops_on_an_empty_page(monkeypatch):
    """A short or empty page ends the loop rather than spinning to MAX_PAGES."""
    pages = 0

    def one_short_page(base_url, address, api_key, page):
        nonlocal pages
        pages += 1
        # Claims more rows exist but never delivers them.
        return ([] if page else [_nft_entry(1, 1)]), 999

    monkeypatch.setattr(balances, "_fetch_token_page", one_short_page)

    tokens = balances._fetch_account_tokens("https://x", "1abc", "test-key")

    assert len(tokens) == 1
    assert pages == 2


# --- Live: real Subscan calls -----------------------------------------------


def test_live_lookup_returns_both_chains(subscan_api_key, subscan_test_address):
    result = _run(fetch_dot_and_wud(subscan_test_address))

    assert set(result) == {"assethub", "hydration"}
    for chain, holdings in result.items():
        # Only that the query works and parses - the amounts themselves are
        # whatever the account happens to hold today.
        assert set(holdings) == {DOT_SYMBOL, WUD_SYMBOL}
        assert holdings[DOT_SYMBOL].total >= 0
        assert holdings[WUD_SYMBOL].total >= 0
        print(f"{chain}: {holdings[DOT_SYMBOL]}, {holdings[WUD_SYMBOL]}")

    totals = total_across_chains(result)
    for symbol in (DOT_SYMBOL, WUD_SYMBOL):
        per_chain = sum(result[chain][symbol].total for chain in result)
        assert totals[symbol].total == pytest.approx(per_chain)
    print(
        f"total: {totals[DOT_SYMBOL].total:,.4f} {DOT_SYMBOL}, "
        f"{totals[WUD_SYMBOL].total:,.4f} {WUD_SYMBOL}"
    )


def test_live_nft_collection_check(subscan_api_key, subscan_test_address):
    """Read real NFT holdings and check one collection against them."""
    holdings = _run(fetch_nft_holdings(subscan_test_address))
    owns = _run(
        owns_nft_from_collection(subscan_test_address, OG_WUD_BURN_COLLECTION_ID)
    )

    # Whether this address holds the collection today is not the point - that
    # the check agrees with the holdings it read is.
    expected = OG_WUD_BURN_COLLECTION_ID in holdings
    assert owns is expected

    for holding in holdings.values():
        print(f"collection #{holding.collection_id}: {holding}")
    print(f"owns collection #{OG_WUD_BURN_COLLECTION_ID}: {owns}")


def test_live_login_logging(subscan_api_key, subscan_test_address, capsys):
    """The exact output a real login writes to the server log."""
    _run(log_login_balances(subscan_test_address))

    output = capsys.readouterr().out
    assert "[balances]" in output
    assert "assethub" in output and "hydration" in output
    print(output.strip())


def _run(coroutine):
    """
    Drive a coroutine on its own loop.

    conftest sets a session-scoped asyncio loop for the Mongo tests; these
    are plain sync tests, so they need their own.
    """
    import asyncio

    return asyncio.run(coroutine)
