"""
On-chain balance lookups, per chain from whichever source works.

Reads a wallet's DOT and WUD holdings on both Polkadot AssetHub and
Hydration, plus its AssetHub NFT collections.

  * AssetHub goes through the Subscan API. One request covers both tokens
    and the NFTs - Subscan's v2 account/tokens endpoint returns the native
    balance alongside every asset the account holds.
  * Hydration goes through the chain's own public RPC nodes instead, via
    backend.hydration_rpc. Subscan's Hydration host 404s, which used to
    silently zero this half of every lookup. The RPC path returns rows in
    the same shape Subscan does, so both parse through TokenBalance
    identically.

Requires SUBSCAN_API_KEY in .env for the AssetHub half; Subscan rejects
unauthenticated calls outright. The key must stay server-side, never
exposed to the browser. The Hydration half needs no key.
"""

import asyncio
import os
from typing import Optional

import requests

ASSETHUB_CHAIN = "assethub"
HYDRATION_CHAIN = "hydration"

ASSETHUB_API = "https://assethub-polkadot.api.subscan.io"

# Subscan's Hydration host, kept only to document why it is not used: it
# returns a bare HTTP 404 (verified 2026-08-28), so Hydration is read over
# RPC instead - see backend.hydration_rpc and the module docstring above.
HYDRATION_API = "https://hydration.api.subscan.io"

# WUD is registered separately on each chain and the ids differ: 31337 is
# the AssetHub asset id, Hydration's registry calls the same token 1000085
# (which is what backend.hydration_rpc queries by).
WUD_ASSETHUB_ASSET_ID = 31337
WUD_HYDRATION_ASSET_ID = 1000085
WUD_SYMBOL = "WUD"
DOT_SYMBOL = "DOT"

# NFT collections live in AssetHub's `nfts` pallet, where the collection id
# is what Subscan reports as `asset_id` under the "NFTs" category and the
# `balance` is how many items of that collection the address owns.
NFT_CATEGORY = "NFTs"

OG_WUD_BURN_COLLECTION_ID = 244
FIRST_ANNIVERSARY_COLLECTION_ID = 441
SECOND_ANNIVERSARY_COLLECTION_ID = 842

# The collections the game actually cares about. Narrowing to these does not
# make the lookup cheaper - Subscan ignores asset_id and category filters and
# returns every holding regardless - it just makes the gate explicit.
TRACKED_NFT_COLLECTIONS = (
    OG_WUD_BURN_COLLECTION_ID,
    FIRST_ANNIVERSARY_COLLECTION_ID,
    SECOND_ANNIVERSARY_COLLECTION_ID,
)

REQUEST_TIMEOUT_SECONDS = 10

# Subscan defaults to 10 rows when `row` is omitted, so always ask
# explicitly and page through the rest. The old assumption here was that
# Subscan rejected `row` above 100 outright; in practice this key's plan
# tier now 403s ("row_limit_exceeded") anywhere above ~20-49, confirmed by
# probing directly - 20 is the largest value that reliably returns 200.
PAGE_SIZE = 20
MAX_PAGES = 20


class TokenBalance:
    """A single token holding, already scaled out of its planck units."""

    def __init__(self, symbol: str, raw: dict):
        decimals = int(raw.get("decimals") or 0)
        scale = 10**decimals

        # Subscan's `balance` is free + reserved, so the spendable amount is
        # what remains after reserves and locks are taken off.
        total = int(raw.get("balance") or 0)
        reserved = int(raw.get("reserved") or 0)
        locked = int(raw.get("lock") or 0)

        self.symbol = symbol
        self.decimals = decimals
        self.total = total / scale
        self.reserved = reserved / scale
        self.locked = locked / scale
        self.transferable = (total - reserved - locked) / scale

    def __add__(self, other: "TokenBalance") -> "TokenBalance":
        """Combine the same token held across two chains into one figure."""
        if self.symbol != other.symbol:
            raise ValueError(f"Cannot add {self.symbol} to {other.symbol}")

        combined = TokenBalance(self.symbol, {})
        combined.decimals = max(self.decimals, other.decimals)
        combined.total = self.total + other.total
        combined.reserved = self.reserved + other.reserved
        combined.locked = self.locked + other.locked
        combined.transferable = self.transferable + other.transferable
        return combined

    def __str__(self) -> str:
        text = f"{self.total:,.4f} {self.symbol}"
        if self.reserved or self.locked:
            text += f" ({self.transferable:,.4f} transferable)"
        return text


class NftHolding:
    """How many items of one NFT collection an address owns."""

    def __init__(self, collection_id: int, raw: Optional[dict] = None):
        raw = raw or {}
        self.collection_id = collection_id
        self.name = raw.get("symbol") or f"Collection #{collection_id}"
        self.count = int(raw.get("balance") or 0)
        self.image = raw.get("token_image")

    @property
    def owned(self) -> bool:
        return self.count > 0

    def __str__(self) -> str:
        return f"{self.count} x {self.name}"


def _empty(symbol: str) -> TokenBalance:
    return TokenBalance(symbol, {"decimals": 0, "balance": 0})


def _fetch_token_page(
    base_url: str, address: str, api_key: str, page: int
) -> tuple[list[dict], int]:
    """Fetch one page of holdings; returns the rows and the reported total."""
    response = requests.post(
        f"{base_url}/api/v2/scan/account/tokens",
        headers={"X-API-Key": api_key, "Content-Type": "application/json"},
        json={"address": address, "row": PAGE_SIZE, "page": page},
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    response.raise_for_status()

    body = response.json()
    if body.get("code") != 0:
        raise RuntimeError(f"Subscan error: {body.get('message')}")

    data = body.get("data") or {}
    return (data.get("list") or []), int(data.get("count") or 0)


def _fetch_account_tokens(base_url: str, address: str, api_key: str) -> list[dict]:
    """
    Fetch every holding for `address` on one chain, following pagination.

    The row size must be sent explicitly: Subscan defaults to 10 rows and
    orders them by balance descending, so a wallet with more holdings than
    that silently loses its smallest ones - which for NFTs are exactly the
    single-item collections worth gating on.
    """
    tokens: list[dict] = []

    for page in range(MAX_PAGES):
        rows, count = _fetch_token_page(base_url, address, api_key, page)
        tokens.extend(rows)
        if not rows or len(tokens) >= count:
            break

    return tokens


def _pick(tokens: list[dict], symbol: str) -> TokenBalance:
    match = next((t for t in tokens if t.get("symbol") == symbol), None)
    return TokenBalance(symbol, match) if match else _empty(symbol)


async def _fetch_tokens(base_url: str, address: str, api_key: str) -> list[dict]:
    # requests is synchronous - keep it off the event loop so concurrent
    # logins aren't serialised behind these calls.
    return await asyncio.to_thread(_fetch_account_tokens, base_url, address, api_key)


def _balances_from(tokens: list[dict]) -> dict[str, TokenBalance]:
    """Pull the DOT and WUD figures out of one chain's token list."""
    return {
        DOT_SYMBOL: _pick(tokens, DOT_SYMBOL),
        WUD_SYMBOL: _pick(tokens, WUD_SYMBOL),
    }


def _nfts_from(tokens: list[dict]) -> dict[int, NftHolding]:
    """
    Pull NFT collections out of one chain's token list, keyed by collection id.

    Filtering on the category matters: asset ids and collection ids are
    separate namespaces that both surface as `asset_id`, so a fungible asset
    could otherwise be mistaken for a collection of the same number.
    """
    holdings: dict[int, NftHolding] = {}

    for token in tokens:
        if token.get("category") != NFT_CATEGORY:
            continue
        try:
            collection_id = int(token.get("asset_id"))
        except (TypeError, ValueError):
            continue
        holdings[collection_id] = NftHolding(collection_id, token)

    return holdings


class AccountHoldings:
    """
    Everything one Subscan response per chain tells us about an address.

    Balances and NFTs come out of the same `account/tokens` payload, so this
    parses both from a single round-trip per chain rather than re-fetching.
    """

    def __init__(self, tokens_by_chain: dict[str, list[dict]]):
        self.balances = {
            chain: _balances_from(tokens) for chain, tokens in tokens_by_chain.items()
        }
        self.totals = total_across_chains(self.balances)
        # NFT collections exist only on AssetHub - Hydration has no NFT pallet.
        self.nfts = _nfts_from(tokens_by_chain.get(ASSETHUB_CHAIN, []))

    def owns_nft_from_collection(self, collection_id: int) -> bool:
        holding = self.nfts.get(collection_id)
        return holding.owned if holding else False

    @property
    def tracked_nfts(self) -> dict[int, NftHolding]:
        """
        The tracked collections only, with absent ones filled in as zero.

        Every collection is always fetched - see TRACKED_NFT_COLLECTIONS - so
        this is a view over data already in hand, not a second lookup.
        """
        return {
            collection_id: self.nfts.get(collection_id) or NftHolding(collection_id)
            for collection_id in TRACKED_NFT_COLLECTIONS
        }


async def _fetch_hydration_tokens(address: str) -> list[dict]:
    """
    Hydration's holdings, read over the chain's own RPC rather than Subscan.

    Subscan's Hydration host 404s (see backend/hydration_rpc.py), so this
    half deliberately uses a different source from AssetHub's. The rows come
    back Subscan-shaped, so everything downstream parses them identically.
    """
    from backend import hydration_rpc

    return await asyncio.to_thread(hydration_rpc.fetch_tokens, address)


async def fetch_holdings(address: str) -> Optional[AccountHoldings]:
    """
    Read balances and NFT holdings for `address` in one pass.

    Both chains, queried concurrently, covering DOT, WUD and every NFT
    collection - but from two different sources: AssetHub via Subscan
    (which also carries the NFTs), Hydration via its own RPC nodes, since
    Subscan's Hydration endpoint is down. Returns None when no Subscan API
    key is configured, as AssetHub cannot be read without one.

    One chain failing degrades to an empty result for that chain rather
    than failing the whole lookup - a Hydration outage shouldn't also hide
    a wallet's perfectly good AssetHub balance, or vice versa.
    """
    api_key = os.getenv("SUBSCAN_API_KEY")
    if not api_key:
        return None

    assethub, hydration = await asyncio.gather(
        _fetch_tokens(ASSETHUB_API, address, api_key),
        _fetch_hydration_tokens(address),
        return_exceptions=True,
    )

    tokens_by_chain: dict[str, list[dict]] = {}
    for chain, result in ((ASSETHUB_CHAIN, assethub), (HYDRATION_CHAIN, hydration)):
        if isinstance(result, Exception):
            print(f"[balances] {chain} lookup failed for {address}: {type(result).__name__}: {result}")
            tokens_by_chain[chain] = []
        else:
            tokens_by_chain[chain] = result

    return AccountHoldings(tokens_by_chain)


async def fetch_dot_and_wud(address: str) -> Optional[dict[str, dict[str, TokenBalance]]]:
    """
    Read just the DOT and WUD balances for `address` on both chains.

    Prefer fetch_holdings when NFTs are wanted too - it costs the same two
    calls and carries both.
    """
    holdings = await fetch_holdings(address)
    return holdings.balances if holdings else None


async def fetch_nft_holdings(address: str) -> Optional[dict[int, NftHolding]]:
    """
    Read every NFT collection `address` holds on AssetHub, keyed by
    collection id.

    Only AssetHub is queried - the WUD collections are minted into its
    `nfts` pallet, and Hydration carries no NFT pallet at all - so this is a
    single call. Returns None when no API key is configured.
    """
    api_key = os.getenv("SUBSCAN_API_KEY")
    if not api_key:
        return None

    return _nfts_from(await _fetch_tokens(ASSETHUB_API, address, api_key))


async def owns_nft_from_collection(address: str, collection_id: int) -> bool:
    """
    Whether `address` holds at least one NFT from `collection_id`.

    Returns False when the lookup cannot run, so callers can use this as a
    plain gate without also handling None.
    """
    holdings = await fetch_nft_holdings(address)
    if holdings is None:
        return False

    holding = holdings.get(collection_id)
    return holding.owned if holding else False


def total_across_chains(
    balances: dict[str, dict[str, TokenBalance]],
) -> dict[str, TokenBalance]:
    """
    Sum each token over every chain in `balances`.

    Returns one combined DOT figure and one combined WUD figure - what the
    wallet holds in total, regardless of which chain it sits on.
    """
    totals: dict[str, TokenBalance] = {}

    for holdings in balances.values():
        for symbol, balance in holdings.items():
            totals[symbol] = totals[symbol] + balance if symbol in totals else balance

    return totals


async def log_login_balances(address: str) -> None:
    """
    Log a wallet's DOT and WUD holdings after login.

    Never raises - a balance lookup failing must not surface as a broken
    login, since the session is already created by the time this runs.
    """
    try:
        holdings = await fetch_holdings(address)
    except Exception as e:
        print(f"[balances] Lookup failed for {address}: {type(e).__name__}: {e}")
        return

    if holdings is None:
        print(f"[balances] SUBSCAN_API_KEY not set - skipping lookup for {address}")
        return

    for chain in (ASSETHUB_CHAIN, HYDRATION_CHAIN):
        per_chain = holdings.balances[chain]
        print(
            f"[balances] {address} on {chain}: "
            f"{per_chain[DOT_SYMBOL]}, {per_chain[WUD_SYMBOL]}"
        )

    totals = holdings.totals
    print(
        f"[balances] {address} total: "
        f"{totals[DOT_SYMBOL].total:,.4f} {DOT_SYMBOL}, "
        f"{totals[WUD_SYMBOL].total:,.4f} {WUD_SYMBOL}, "
        f"{len(holdings.nfts)} NFT collection(s)"
    )
