"""
Hydration-only balance lookup, straight off the chain's own RPC.

Subscan's Hydration endpoint (https://hydration.api.subscan.io) currently
404s, which takes backend.balances' Hydration half with it. This script
bypasses Subscan entirely: it talks to Hydration's public RPC nodes over
websocket and reads the balances out of the chain's storage directly.

It probes several candidate endpoints rather than trusting one, since
finding which nodes actually answer is half the point - each is reported
with its connect result, chain name and SS58 prefix, and the first one
that works is used for the balance queries.

Where the numbers come from:
  * HDX (native)  - System.Account(who).data
  * WUD and other - Tokens.Accounts(who, asset_id), Hydration's ORML
    tokens pallet; WUD is asset id 1000085 in its registry.

Takes any public SS58 address - no private key, no signing, read-only.
Needs no API key.

Usage:
    source .venv/bin/activate
    python scripts/query_hydration_rpc.py <address> [<address> ...]
    python scripts/query_hydration_rpc.py    # uses SUBSCAN_TEST_ADDRESS from .env
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

# The endpoint list, the asset ids and the connection helper all come from
# the backend module the live app uses, so this script and production can
# never drift apart. The list itself lives in
# backend/data/hydration-rpc-endpoints.json - see that file for how it was
# built and why it is ordered the way it is.
from backend import hydration_rpc  # noqa: E402
from backend.hydration_rpc import (  # noqa: E402
    HYDRATION_ASSETS,
    NATIVE_DECIMALS,
    NATIVE_SYMBOL,
)

HYDRATION_RPC_ENDPOINTS = hydration_rpc.endpoints()

WUD_SYMBOL = "WUD"
WUD_ASSET_ID = HYDRATION_ASSETS[WUD_SYMBOL]["asset_id"]


def _connect(url: str):
    substrate = hydration_rpc._connect(url)
    # substrate-interface 1.8.1 leaves ss58_format/runtime_version unset
    # until the runtime is loaded, and ss58_format=None then breaks the
    # address re-encoding below - so load it up front rather than on first
    # query. The backend path never touches ss58_format and so skips this.
    substrate.init_runtime()
    return substrate


def probe_endpoints(urls=HYDRATION_RPC_ENDPOINTS):
    """
    Try every endpoint, print what each one did, return the live URLs.

    Each probe connection is closed again rather than handed back: holding
    eight idle websockets open while the later ones are still being tried
    leaves the earliest of them stale by the time it would be used.
    """
    live = []
    print("Probing Hydration RPC endpoints:")
    for url in urls:
        substrate = None
        try:
            substrate = _connect(url)
            print(f"  [ ok ] {url}")
            print(
                f"         chain={substrate.chain} "
                f"ss58_format={substrate.ss58_format} "
                f"runtime={substrate.runtime_version}"
            )
            live.append(url)
        except Exception as e:
            print(f"  [fail] {url}")
            print(f"         {type(e).__name__}: {e}")
        finally:
            if substrate is not None:
                try:
                    substrate.close()
                except Exception:
                    pass
    return live


def _reencode(substrate, address: str) -> str:
    """
    Re-encode a public address into this chain's own SS58 format.

    Cosmetic only: storage is keyed by the underlying 32-byte public key,
    not by how it happens to be SS58-encoded, so a Polkadot-format address
    (prefix 0) already resolves correctly against Hydration's storage.
    Printing the local form just makes the two comparable by eye.

    Hydration's own node properties carry no ss58Format, so
    substrate-interface reports 0 for it rather than Hydration's nominal
    63 - hence the None/failure guard, which leaves the address as given.
    """
    from substrateinterface.utils.ss58 import ss58_decode, ss58_encode

    prefix = substrate.ss58_format
    if prefix is None:
        return address
    try:
        return ss58_encode(ss58_decode(address), ss58_format=prefix)
    except Exception:
        return address


def _scaled(raw: int, decimals: int) -> float:
    return raw / (10**decimals)


def fetch_native(substrate, address: str) -> dict:
    """HDX balance out of System.Account."""
    account = substrate.query("System", "Account", [address])
    data = (account.value or {}).get("data", {}) if account else {}
    free = int(data.get("free") or 0)
    reserved = int(data.get("reserved") or 0)
    frozen = int(data.get("frozen") or data.get("misc_frozen") or 0)
    return {
        "symbol": NATIVE_SYMBOL,
        "decimals": NATIVE_DECIMALS,
        "free": _scaled(free, NATIVE_DECIMALS),
        "reserved": _scaled(reserved, NATIVE_DECIMALS),
        "frozen": _scaled(frozen, NATIVE_DECIMALS),
    }


def fetch_asset_decimals(substrate, asset_id: int) -> int:
    """
    Decimals for one registry asset, read from chain rather than hardcoded.

    Falls back to 10 (WUD's known value) if the registry shape differs from
    what this expects - a wrong scale is better than no reading at all, and
    the raw planck figure is printed alongside anyway.
    """
    try:
        entry = substrate.query("AssetRegistry", "Assets", [asset_id])
        value = entry.value or {}
        decimals = value.get("decimals")
        if decimals is not None:
            return int(decimals)
    except Exception as e:
        print(f"  (asset registry lookup failed: {type(e).__name__}: {e})")
    return 10


def fetch_token(substrate, address: str, asset_id: int, symbol: str) -> dict:
    """One ORML Tokens.Accounts holding."""
    decimals = fetch_asset_decimals(substrate, asset_id)
    entry = substrate.query("Tokens", "Accounts", [address, asset_id])
    value = entry.value or {} if entry else {}
    free = int(value.get("free") or 0)
    reserved = int(value.get("reserved") or 0)
    frozen = int(value.get("frozen") or 0)
    return {
        "symbol": symbol,
        "asset_id": asset_id,
        "decimals": decimals,
        "raw_free": free,
        "free": _scaled(free, decimals),
        "reserved": _scaled(reserved, decimals),
        "frozen": _scaled(frozen, decimals),
    }


def report(substrate, address: str) -> None:
    local = _reencode(substrate, address)
    print(f"\n{address}")
    if local != address:
        print(f"  re-encoded for this chain (ss58 {substrate.ss58_format}): {local}")

    native = fetch_native(substrate, local)
    print(
        f"  {native['symbol']:<5} {native['free']:,.4f} free, "
        f"{native['reserved']:,.4f} reserved, {native['frozen']:,.4f} frozen"
    )

    wud = fetch_token(substrate, local, WUD_ASSET_ID, WUD_SYMBOL)
    print(
        f"  {wud['symbol']:<5} {wud['free']:,.4f} free, "
        f"{wud['reserved']:,.4f} reserved, {wud['frozen']:,.4f} frozen"
    )
    print(
        f"        (asset id {wud['asset_id']}, {wud['decimals']} decimals, "
        f"raw free {wud['raw_free']})"
    )


def main() -> int:
    addresses = sys.argv[1:] or [a for a in (os.getenv("SUBSCAN_TEST_ADDRESS"),) if a]
    if not addresses:
        print(__doc__.strip())
        return 2

    live = probe_endpoints()
    if not live:
        print("\nNo Hydration RPC endpoint answered - cannot query balances.")
        return 1

    url = live[0]
    print(f"\nUsing {url} for balance queries.")
    substrate = _connect(url)

    failed = False
    try:
        for address in addresses:
            try:
                report(substrate, address)
            except Exception as e:
                print(f"\n{address}\n  query failed: {type(e).__name__}: {e}")
                failed = True
    finally:
        try:
            substrate.close()
        except Exception:
            pass

    print(f"\n{len(live)} of {len(HYDRATION_RPC_ENDPOINTS)} endpoint(s) reachable.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
