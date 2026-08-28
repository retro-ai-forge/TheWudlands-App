"""
Run test with:

python -m pytest tests/test_hydration_rpc.py -v -s
(-s for log output)

Verifies Hydration can be read over its own public RPC, bypassing Subscan
entirely - the counterpart to test_subscan_connection.py, and the reason it
exists: Subscan's Hydration endpoint (https://hydration.api.subscan.io)
currently 404s, which silently zeroes the Hydration half of every balance
lookup in backend/balances.py.

These are live network tests. Endpoints go down, so a single unreachable
node is not a failure - the suite only fails if *no* node answers, or if a
node that does answer returns something structurally wrong.

The wallet these read is SUBSCAN_TEST_ADDRESS in .env (shared with the
Subscan tests) - change it there, not here.
"""

import pytest

from backend import hydration_rpc
from scripts.query_hydration_rpc import (
    HYDRATION_RPC_ENDPOINTS,
    NATIVE_SYMBOL,
    WUD_ASSET_ID,
    WUD_SYMBOL,
    _connect,
    fetch_asset_decimals,
    fetch_native,
    fetch_token,
)

# WUD's registry entry on Hydration, pinned so a chain-side change is caught
# rather than silently rescaling every balance this reads.
WUD_EXPECTED_DECIMALS = 10
WUD_EXPECTED_NAME = "Gavun Wud"

CHAIN_NAME = "Hydration"


# --- Offline: endpoint selection ---------------------------------------------


@pytest.fixture
def rotation(monkeypatch):
    """
    Drive fetch_tokens against stubbed nodes, recording what it tried.

    Returns a helper taking the set of dead endpoint URLs; each call to it
    performs one fetch_tokens and reports the url used and whether it
    worked, without touching the network.
    """
    monkeypatch.setattr(hydration_rpc, "_endpoint_index", 0, raising=False)
    attempted: list[str] = []

    def run(dead: set[str]) -> tuple[str, bool]:
        def stub(url, address):
            attempted.append(url)
            if url in dead:
                raise ConnectionError("simulated node down")
            return [{"symbol": WUD_SYMBOL, "decimals": 10, "balance": "1"}]

        monkeypatch.setattr(hydration_rpc, "_fetch_from", stub)
        try:
            hydration_rpc.fetch_tokens("1abc")
            return attempted[-1], True
        except RuntimeError:
            return attempted[-1], False

    run.attempted = attempted
    return run


def test_a_working_endpoint_is_kept(rotation):
    """A healthy node must serve every call, not rotate for no reason."""
    used = [rotation(set())[0] for _ in range(4)]

    assert len(set(used)) == 1, f"selection moved while healthy: {used}"
    assert len(rotation.attempted) == 4, "each call must make exactly one attempt"


def test_one_attempt_per_call_even_when_it_fails(rotation):
    """
    A failing call must not walk the rest of the list.

    This is the whole latency guarantee: one attempt, so one connect
    timeout, rather than a sweep through every dead endpoint.
    """
    url, ok = rotation(set(hydration_rpc.endpoints()))

    assert ok is False
    assert len(rotation.attempted) == 1, (
        f"expected a single attempt, got {rotation.attempted}"
    )


def test_failure_advances_to_the_next_endpoint(rotation):
    """The node that failed must not be retried by the following call."""
    first = hydration_rpc.current_endpoint()

    failed_url, ok = rotation({first})
    assert (failed_url, ok) == (first, False)

    # The next call skips the dead node and sticks to whatever answers.
    second_url, ok = rotation({first})
    assert ok is True
    assert second_url != first
    assert rotation(({first}))[0] == second_url, "should stay on the working node"


def test_selection_wraps_at_the_end_of_the_list(monkeypatch):
    """Advancing past the last endpoint returns to the first."""
    available = hydration_rpc.endpoints()
    monkeypatch.setattr(hydration_rpc, "_endpoint_index", len(available) - 1)

    assert hydration_rpc.current_endpoint() == available[-1]
    assert hydration_rpc.advance_endpoint() == available[0]


# --- Live: the chain itself ---------------------------------------------------


@pytest.fixture(scope="module")
def live_endpoints() -> list[str]:
    """Every configured endpoint that answers, probed once for the module."""
    reachable = []
    for url in HYDRATION_RPC_ENDPOINTS:
        substrate = None
        try:
            substrate = _connect(url)
            assert substrate.chain == CHAIN_NAME, f"{url} served {substrate.chain}"
            reachable.append(url)
            print(f"[ ok ] {url} runtime={substrate.runtime_version}")
        except Exception as e:
            print(f"[fail] {url} {type(e).__name__}: {str(e)[:80]}")
        finally:
            if substrate is not None:
                try:
                    substrate.close()
                except Exception:
                    pass

    if not reachable:
        pytest.skip("No Hydration RPC endpoint reachable - network down or all nodes out")
    return reachable


@pytest.fixture(scope="module")
def substrate(live_endpoints):
    """A connection to the first reachable endpoint, reused across tests."""
    connection = _connect(live_endpoints[0])
    yield connection
    try:
        connection.close()
    except Exception:
        pass


def test_at_least_one_endpoint_is_reachable(live_endpoints):
    """The configured list must not rot into being entirely dead."""
    print(f"\n{len(live_endpoints)}/{len(HYDRATION_RPC_ENDPOINTS)} endpoints reachable")
    assert live_endpoints


def test_endpoints_agree_on_the_chain(live_endpoints):
    """
    Every reachable node must serve the same chain and runtime.

    A node lagging a runtime upgrade is worth seeing, since it would decode
    storage differently from the rest.
    """
    versions = {}
    for url in live_endpoints:
        substrate = _connect(url)
        try:
            versions[url] = substrate.runtime_version
        finally:
            substrate.close()

    for url, version in versions.items():
        print(f"{url}: runtime {version}")

    assert len(set(versions.values())) == 1, f"Nodes disagree on runtime: {versions}"


def test_wud_is_registered_as_expected(substrate):
    """WUD's registry entry - the id/decimals every balance read depends on."""
    entry = substrate.query("AssetRegistry", "Assets", [WUD_ASSET_ID])
    assert entry is not None and entry.value, f"asset {WUD_ASSET_ID} not in AssetRegistry"

    value = entry.value
    print(f"AssetRegistry[{WUD_ASSET_ID}]: {value}")

    assert value["symbol"] == WUD_SYMBOL
    assert value["name"] == WUD_EXPECTED_NAME
    assert int(value["decimals"]) == WUD_EXPECTED_DECIMALS

    # The helper must agree with what the chain actually says, since it is
    # what scales every figure the script prints.
    assert fetch_asset_decimals(substrate, WUD_ASSET_ID) == WUD_EXPECTED_DECIMALS


def test_native_balance_reads(substrate, subscan_test_address):
    """System.Account parses - the wallet may legitimately hold no HDX."""
    native = fetch_native(substrate, subscan_test_address)
    print(f"Hydration: {native['free']:,.4f} {native['symbol']} free")

    assert native["symbol"] == NATIVE_SYMBOL
    assert native["free"] >= 0
    assert native["reserved"] >= 0


def test_wud_balance_reads(substrate, subscan_test_address):
    """
    Tokens.Accounts parses and scales.

    Zero is a valid answer - a wallet need not hold WUD - so this asserts
    the shape and the scaling relationship, not a specific amount.
    """
    wud = fetch_token(substrate, subscan_test_address, WUD_ASSET_ID, WUD_SYMBOL)
    print(
        f"Hydration: {wud['free']:,.4f} {wud['symbol']} free "
        f"(raw {wud['raw_free']}, {wud['decimals']} decimals)"
    )

    assert wud["symbol"] == WUD_SYMBOL
    assert wud["asset_id"] == WUD_ASSET_ID
    assert wud["decimals"] == WUD_EXPECTED_DECIMALS
    assert wud["raw_free"] >= 0
    assert wud["free"] == pytest.approx(wud["raw_free"] / 10**WUD_EXPECTED_DECIMALS)


def test_same_balance_from_a_second_endpoint(live_endpoints, subscan_test_address):
    """
    Two independent nodes must report the same holding.

    Guards against reading from a stale or forked node - the balance is only
    trustworthy if more than one operator agrees on it. Skips when only one
    endpoint is up, since there is nothing to compare against.
    """
    if len(live_endpoints) < 2:
        pytest.skip("Need two reachable endpoints to cross-check")

    readings = {}
    for url in live_endpoints[:2]:
        substrate = _connect(url)
        try:
            readings[url] = fetch_token(
                substrate, subscan_test_address, WUD_ASSET_ID, WUD_SYMBOL
            )["raw_free"]
        finally:
            substrate.close()

    for url, raw in readings.items():
        print(f"{url}: raw WUD {raw}")

    # Read a block or two apart, so an incoming transfer between the two
    # calls is a real possibility - compare within a tolerance rather than
    # demanding equality.
    values = list(readings.values())
    largest = max(values) or 1
    drift = abs(values[0] - values[1]) / largest
    assert drift < 0.01, f"Endpoints disagree by more than 1%: {readings}"
