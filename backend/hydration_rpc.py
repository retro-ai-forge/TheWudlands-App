"""
Hydration balance lookups straight off the chain's own RPC.

Subscan's Hydration host (https://hydration.api.subscan.io) 404s, which
silently zeroed the Hydration half of every lookup in backend.balances.
This reads the same figures from Hydration's public RPC nodes instead.
AssetHub is unaffected and still goes through Subscan.

The rows returned here are deliberately shaped like Subscan's
`account/tokens` entries (symbol / decimals / balance / reserved / lock)
so backend.balances can consume either source through the same parsing -
see `fetch_tokens`.

Where the numbers come from:
  * HDX (native)  - System.Account(who).data
  * DOT, WUD      - Tokens.Accounts(who, asset_id), Hydration's ORML tokens
                    pallet, keyed by its own registry ids (not AssetHub's).

Endpoints live in backend/data/hydration-rpc-endpoints.json - see that
file for how the list was built and why it is ordered the way it is.

No API key: these are public nodes, read-only, no signing.
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path

_ENDPOINTS_PATH = Path(__file__).resolve().parent / "data" / "hydration-rpc-endpoints.json"


def _load_endpoints() -> tuple[str, ...]:
    data = json.loads(_ENDPOINTS_PATH.read_text())
    return tuple(entry["url"] for entry in data["endpoints"])


# Ordered; the first that answers is used. Override with a single URL via
# HYDRATION_RPC for a local node or to pin one during debugging.
HYDRATION_RPC_ENDPOINTS: tuple[str, ...] = _load_endpoints()
_ENDPOINT_OVERRIDE = os.getenv("HYDRATION_RPC")

# Hydration's own registry ids - unrelated to AssetHub's (WUD is 31337
# there, 1000085 here). Decimals are pinned rather than read from
# AssetRegistry on every call: that would cost an extra round-trip per
# lookup, and tests/test_hydration_rpc.py asserts these against the chain
# so a registry change fails loudly instead of silently rescaling balances.
HYDRATION_ASSETS: dict[str, dict] = {
    "DOT": {"asset_id": 5, "decimals": 10},
    "WUD": {"asset_id": 1000085, "decimals": 10},
}

NATIVE_SYMBOL = "HDX"
NATIVE_DECIMALS = 12

# Guards a hung TCP connect; substrate-interface has no connect timeout of
# its own, and without this a black-holed node stalls the whole lookup.
CONNECT_TIMEOUT_SECONDS = 8


def endpoints() -> tuple[str, ...]:
    """The endpoints available, honouring the HYDRATION_RPC override."""
    if _ENDPOINT_OVERRIDE:
        return (_ENDPOINT_OVERRIDE,)
    return HYDRATION_RPC_ENDPOINTS


# Which endpoint the next call will use. Sticky: it only moves when the
# current node fails, so a healthy node keeps serving every lookup rather
# than the load being sprayed across ten nodes for no reason.
#
# Guarded by a lock because fetch_tokens runs under asyncio.to_thread, so
# concurrent logins genuinely do call it from different threads.
_endpoint_index = 0
_endpoint_lock = threading.Lock()


def current_endpoint() -> str:
    """The endpoint the next call will use."""
    with _endpoint_lock:
        return endpoints()[_endpoint_index % len(endpoints())]


def advance_endpoint() -> str:
    """
    Move to the next endpoint, wrapping at the end, and return it.

    Called when the current node fails, so the *next* request tries a
    different one instead of hitting the same dead node again.
    """
    global _endpoint_index
    with _endpoint_lock:
        available = endpoints()
        _endpoint_index = (_endpoint_index + 1) % len(available)
        return available[_endpoint_index]


def _connect(url: str):
    # Imported lazily, same as backend/nfts.py: constructing a
    # SubstrateInterface opens the websocket immediately, so importing at
    # module scope would slow every backend import.
    from substrateinterface import SubstrateInterface

    return SubstrateInterface(url=url, ws_options={"timeout": CONNECT_TIMEOUT_SECONDS})


def _row(symbol: str, decimals: int, free: int, reserved: int, frozen: int) -> dict:
    """
    One holding, in the shape backend.balances' TokenBalance expects.

    Subscan reports `balance` as free + reserved, so match that rather than
    passing free alone - otherwise the same wallet would total differently
    depending on which source answered.
    """
    return {
        "symbol": symbol,
        "decimals": decimals,
        "balance": str(free + reserved),
        "reserved": str(reserved),
        "lock": str(frozen),
        "category": "Native" if symbol == NATIVE_SYMBOL else "Assets",
    }


def _native_row(substrate, address: str) -> dict:
    account = substrate.query("System", "Account", [address])
    data = (account.value or {}).get("data", {}) if account else {}
    return _row(
        NATIVE_SYMBOL,
        NATIVE_DECIMALS,
        int(data.get("free") or 0),
        int(data.get("reserved") or 0),
        int(data.get("frozen") or data.get("misc_frozen") or 0),
    )


def _token_row(substrate, address: str, symbol: str, asset: dict) -> dict:
    entry = substrate.query("Tokens", "Accounts", [address, asset["asset_id"]])
    value = (entry.value or {}) if entry else {}
    return _row(
        symbol,
        asset["decimals"],
        int(value.get("free") or 0),
        int(value.get("reserved") or 0),
        int(value.get("frozen") or 0),
    )


def _fetch_from(url: str, address: str) -> list[dict]:
    substrate = _connect(url)
    try:
        rows = [_native_row(substrate, address)]
        for symbol, asset in HYDRATION_ASSETS.items():
            rows.append(_token_row(substrate, address, symbol, asset))
        return rows
    finally:
        try:
            substrate.close()
        except Exception:
            pass


def fetch_tokens(address: str) -> list[dict]:
    """
    Every tracked Hydration holding for `address`, Subscan-row shaped.

    **One endpoint, one attempt, sticky.** Each call uses whichever endpoint
    is currently selected and tries it exactly once. On success that node
    stays selected, so a healthy node keeps serving every subsequent call.
    Only on failure does the selection advance, so a retry (the player
    hitting "Reload", the next login) lands on a different node - a dead
    endpoint costs one request each, not one per call forever.

    Never walking the whole list is the point: it caps a call at roughly
    CONNECT_TIMEOUT_SECONDS rather than the ~80s a full sweep of ten dead
    endpoints would take, and nobody should wait through nine timeouts to
    be told no. The trade is that the call which discovers a node has died
    fails even though healthy nodes exist; backend.balances degrades that
    to an empty Hydration result rather than failing the whole lookup, and
    the following call succeeds on the next node.

    Synchronous - callers on the event loop should wrap it in
    asyncio.to_thread, the same way backend.balances does.
    """
    url = current_endpoint()

    try:
        return _fetch_from(url, address)
    except Exception as e:
        following = advance_endpoint()
        print(
            f"[hydration_rpc] {url} failed: {type(e).__name__}: {e} "
            f"- switching to {following} for the next call"
        )
        raise RuntimeError(
            f"Hydration RPC {url} failed: {type(e).__name__}: {e}"
        ) from e
