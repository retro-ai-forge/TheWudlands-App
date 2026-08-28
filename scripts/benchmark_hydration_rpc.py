"""
Measure how fast each Hydration RPC endpoint responds, and rank them.

Companion to query_hydration_rpc.py, which reads balances off whichever
endpoint answers first - so which one leads its list is a latency decision,
and this is what informs it. Re-run whenever the list changes or a node
starts feeling slow, then reorder HYDRATION_RPC_ENDPOINTS fastest-first.

Two numbers per endpoint:

  * connect - websocket handshake plus init_runtime(), which downloads the
    chain metadata. Paid once per process, so it matters far less than the
    query figure; it is also the noisier of the two.
  * query   - a real storage read (Tokens.Accounts for WUD), repeated, with
    the median reported. This is what a balance lookup actually costs.

Read-only, no key, no signing.

Usage:
    source .venv/bin/activate
    python scripts/benchmark_hydration_rpc.py [<address>] [--reps N]
"""

import os
import statistics
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from scripts.query_hydration_rpc import (  # noqa: E402
    HYDRATION_RPC_ENDPOINTS,
    WUD_ASSET_ID,
    _connect,
)

DEFAULT_REPS = 3

# Any well-formed address works - the timing is the point, not the balance,
# and a miss costs the node the same lookup as a hit.
FALLBACK_ADDRESS = "13u7c8VRks3QKKaYVy3h9U9ZvEDmSfmH3pZJPLN13Q827KvB"


class Result:
    def __init__(self, url: str):
        self.url = url
        self.connect_ms: float | None = None
        self.query_ms: list[float] = []
        self.error: str | None = None

    @property
    def ok(self) -> bool:
        return self.error is None and bool(self.query_ms)

    @property
    def median_ms(self) -> float:
        return statistics.median(self.query_ms)


def measure(url: str, address: str, reps: int) -> Result:
    result = Result(url)
    substrate = None
    try:
        started = time.perf_counter()
        substrate = _connect(url)
        result.connect_ms = (time.perf_counter() - started) * 1000

        for _ in range(reps):
            started = time.perf_counter()
            substrate.query("Tokens", "Accounts", [address, WUD_ASSET_ID])
            result.query_ms.append((time.perf_counter() - started) * 1000)
    except Exception as e:
        result.error = f"{type(e).__name__}: {e}"
    finally:
        if substrate is not None:
            try:
                substrate.close()
            except Exception:
                pass
    return result


def main() -> int:
    args = [a for a in sys.argv[1:]]
    reps = DEFAULT_REPS
    if "--reps" in args:
        index = args.index("--reps")
        reps = int(args[index + 1])
        del args[index : index + 2]

    address = (
        args[0] if args else os.getenv("SUBSCAN_TEST_ADDRESS") or FALLBACK_ADDRESS
    )

    print(f"Benchmarking {len(HYDRATION_RPC_ENDPOINTS)} endpoint(s), {reps} queries each")
    print(f"Address: {address}\n")

    results = []
    for url in HYDRATION_RPC_ENDPOINTS:
        result = measure(url, address, reps)
        results.append(result)
        status = f"{result.median_ms:.0f}ms" if result.ok else "FAILED"
        print(f"  {status:>10}  {url}")

    live = sorted((r for r in results if r.ok), key=lambda r: r.median_ms)
    dead = [r for r in results if not r.ok]

    print(f"\n{'endpoint':<48}{'connect':>10}{'median':>9}{'min':>9}{'max':>9}")
    print("-" * 85)
    for r in live:
        print(
            f"{r.url:<48}{r.connect_ms:9.0f}ms{r.median_ms:8.0f}ms"
            f"{min(r.query_ms):8.0f}ms{max(r.query_ms):8.0f}ms"
        )
    for r in dead:
        print(f"{r.url:<48}{'FAILED':>10}  {r.error[:40]}")

    print(f"\n{len(live)}/{len(results)} reachable.")
    if live:
        print("Fastest-first ordering for HYDRATION_RPC_ENDPOINTS:")
        for r in live:
            print(f'    "{r.url}",  # ~{r.median_ms:.0f}ms')

    return 0 if live else 1


if __name__ == "__main__":
    sys.exit(main())
