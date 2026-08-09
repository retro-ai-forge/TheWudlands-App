"""
Run test with:

python -m pytest tests/test_subscan_connection.py -v -s
(-s for log output)

Verifies the app can reach the Subscan API with the key in .env
(SUBSCAN_API_KEY) and read the balances we care about: DOT and WUD
(AssetHub asset id 31337) on both Polkadot AssetHub and Hydration.
Skips instead of failing if no key is configured yet.

The wallet these read is SUBSCAN_TEST_ADDRESS in .env - change it there,
not here.
"""

import time

import requests

ASSETHUB_API = "https://assethub-polkadot.api.subscan.io"
HYDRATION_API = "https://hydration.api.subscan.io"

# WUD on AssetHub. On Hydration the same token is registry id 1000085, but
# Subscan keys Hydration balances by symbol rather than by numeric id.
WUD_ASSETHUB_ASSET_ID = 31337
WUD_SYMBOL = "WUD"

# The free key allows 5 requests/second across all Subscan endpoints, so
# space the calls out rather than risk a 429 mid-suite.
REQUEST_SPACING_SECONDS = 0.3


def subscan_post(base_url: str, path: str, api_key: str, payload: dict) -> dict:
    time.sleep(REQUEST_SPACING_SECONDS)
    response = requests.post(
        f"{base_url}{path}",
        headers={"X-API-Key": api_key, "Content-Type": "application/json"},
        json=payload,
        timeout=15,
    )
    assert response.status_code == 200, (
        f"{path} returned HTTP {response.status_code}: {response.text[:200]}"
    )

    body = response.json()
    assert body.get("code") == 0, f"{path} returned Subscan error: {body}"
    return body["data"]


def find_token(tokens: list[dict], symbol: str) -> dict | None:
    return next((t for t in tokens if t.get("symbol") == symbol), None)


def _describe(token: dict | None, symbol: str) -> str:
    """Format a holding for the log, including the 'not held at all' case."""
    if not token:
        return f"no {symbol}"
    amount = int(token["balance"]) / 10 ** token["decimals"]
    return f"{amount:,.4f} {symbol}"


def test_wud_asset_metadata(subscan_api_key):
    """Asset 31337 on AssetHub is the WUD token we expect."""
    data = subscan_post(
        ASSETHUB_API,
        "/api/scan/assets/asset",
        subscan_api_key,
        {"asset_id": WUD_ASSETHUB_ASSET_ID},
    )

    metadata = data["metadata"]
    assert metadata["symbol"] == WUD_SYMBOL
    assert metadata["decimals"] == 10
    print(
        f"AssetHub asset {WUD_ASSETHUB_ASSET_ID}: {metadata['name']} "
        f"({metadata['symbol']}), {data['holders']} holders"
    )


def test_assethub_dot_and_wud_balances(subscan_api_key, subscan_test_address):
    """One call to AssetHub returns both the native DOT and the WUD balance."""
    data = subscan_post(
        ASSETHUB_API,
        "/api/v2/scan/account/tokens",
        subscan_api_key,
        {"address": subscan_test_address},
    )

    tokens = data["list"]
    dot = find_token(tokens, "DOT")
    wud = find_token(tokens, WUD_SYMBOL)

    # Subscan omits tokens the wallet does not hold, so absence is a valid
    # answer - what matters is that the call parses and is labelled correctly.
    assert isinstance(tokens, list)
    if dot:
        assert dot["category"] == "Native"
    if wud:
        assert wud["asset_id"] == str(WUD_ASSETHUB_ASSET_ID)

    print(f"AssetHub: {_describe(dot, 'DOT')}, {_describe(wud, WUD_SYMBOL)}")


def test_hydration_dot_and_wud_balances(subscan_api_key, subscan_test_address):
    """Hydration holds both tokens in its ORML tokens pallet, keyed by symbol."""
    data = subscan_post(
        HYDRATION_API,
        "/api/v2/scan/account/tokens",
        subscan_api_key,
        {"address": subscan_test_address},
    )

    tokens = data["list"]
    dot = find_token(tokens, "DOT")
    wud = find_token(tokens, WUD_SYMBOL)

    # Hydration keys these by symbol, not by numeric id - and omits whatever
    # the wallet does not hold.
    assert isinstance(tokens, list)
    for token in (t for t in (dot, wud) if t):
        assert token["symbol"] in ("DOT", WUD_SYMBOL)

    print(f"Hydration: {_describe(dot, 'DOT')}, {_describe(wud, WUD_SYMBOL)}")


def test_rate_limit_headers_are_present(subscan_api_key):
    """The key is accepted and Subscan reports the quota we can budget against."""
    time.sleep(REQUEST_SPACING_SECONDS)
    response = requests.post(
        f"{ASSETHUB_API}/api/scan/metadata",
        headers={"X-API-Key": subscan_api_key, "Content-Type": "application/json"},
        json={},
        timeout=15,
    )

    assert response.status_code == 200, (
        f"Subscan rejected the API key: HTTP {response.status_code} "
        f"{response.text[:200]}"
    )
    limit = response.headers.get("ratelimit-limit")
    assert limit is not None, "Expected a ratelimit-limit header from Subscan"
    print(
        f"Subscan quota: {limit} req/s, "
        f"{response.headers.get('ratelimit-remaining')} remaining"
    )
