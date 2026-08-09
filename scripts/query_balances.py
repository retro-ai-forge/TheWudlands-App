"""
Ad-hoc holdings lookup: reads a wallet's real DOT and WUD balances on
Polkadot AssetHub and Hydration, plus the NFT collections it owns on
AssetHub, and prints them.

Takes any public SS58 address - no private key, no signing, read-only.
Needs SUBSCAN_API_KEY in .env.

Usage:
    source .venv/bin/activate
    python scripts/query_balances.py <address> [<address> ...]
    python scripts/query_balances.py     # uses SUBSCAN_TEST_ADDRESS from .env
"""

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from backend.balances import (  # noqa: E402
    DOT_SYMBOL,
    WUD_SYMBOL,
    fetch_holdings,
)


async def report(address: str) -> bool:
    try:
        holdings = await fetch_holdings(address)
    except Exception as e:
        print(f"{address}\n  lookup failed: {type(e).__name__}: {e}")
        return False

    if holdings is None:
        print("SUBSCAN_API_KEY is not set in .env - cannot query Subscan.")
        return False

    print(address)
    for chain, per_chain in holdings.balances.items():
        print(f"  {chain:<10} {per_chain[DOT_SYMBOL]}")
        print(f"  {'':<10} {per_chain[WUD_SYMBOL]}")

    totals = holdings.totals
    print(f"  {'TOTAL':<10} {totals[DOT_SYMBOL].total:,.4f} {DOT_SYMBOL}")
    print(f"  {'':<10} {totals[WUD_SYMBOL].total:,.4f} {WUD_SYMBOL}")

    tracked = holdings.tracked_nfts
    print(f"  {'TRACKED':<10} {sum(1 for n in tracked.values() if n.owned)} of "
          f"{len(tracked)} tracked collection(s)")
    for nft in tracked.values():
        mark = "yes" if nft.owned else "no "
        print(f"  {'':<10} [{mark}] #{nft.collection_id}: {nft}")

    others = {i: n for i, n in holdings.nfts.items() if i not in tracked}
    if others:
        print(f"  {'OTHER':<10} {len(others)} untracked collection(s)")
        for nft in sorted(others.values(), key=lambda h: -h.count):
            print(f"  {'':<10} #{nft.collection_id}: {nft}")

    return True


async def main() -> int:
    # With no argument, fall back to the wallet in .env so the script is
    # runnable bare during development.
    addresses = sys.argv[1:] or [a for a in (os.getenv("SUBSCAN_TEST_ADDRESS"),) if a]
    if not addresses:
        print(__doc__.strip())
        return 2

    # Sequential rather than concurrent: each address costs two Subscan
    # calls and the free tier allows only 5 requests/second in total.
    results = [await report(address) for address in addresses]
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
