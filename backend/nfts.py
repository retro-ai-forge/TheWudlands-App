"""
NFT item lookups on Polkadot AssetHub.

Where backend.balances answers "how many of collection X does this wallet
hold", this answers "which items exactly, and what are their traits".

That needs two sources Subscan cannot provide:

  * the item ids, read from AssetHub's `nfts` pallet over RPC - Subscan's
    account/tokens reports only a per-collection count, and it exposes no
    NFT item endpoint at all;
  * the traits, read from the item's metadata document on IPFS - these
    collections store an `ipfs://` CID on chain rather than on-chain
    attributes, so `Nfts.Attribute` comes back empty.

No API key is involved; both sources are public.
"""

import json
import os
from typing import Any, Optional

import requests

ASSETHUB_RPC = os.getenv("ASSETHUB_RPC", "wss://polkadot-asset-hub-rpc.polkadot.io")
IPFS_GATEWAY = os.getenv("IPFS_GATEWAY", "https://ipfs.io/ipfs/")

WUD_MINERS_COLLECTION_ID = 852

IPFS_TIMEOUT_SECONDS = 20


class NftItem:
    """One NFT and the traits from its metadata document."""

    def __init__(self, collection_id: int, item_id: int, metadata: Optional[dict] = None):
        metadata = metadata or {}
        self.collection_id = collection_id
        self.item_id = item_id
        self.name = metadata.get("name") or f"#{item_id}"
        self.image = metadata.get("image")
        self.attributes: list[dict] = metadata.get("attributes") or []

    def attribute(self, position: int = 1) -> Optional[dict]:
        """
        The attribute at a 1-based position - attribute 1 is the first listed.

        Returns None when the item has fewer attributes than that, which is
        normal for items whose metadata failed to load.
        """
        if position < 1 or position > len(self.attributes):
            return None
        return self.attributes[position - 1]

    def attribute_text(self, position: int = 1) -> str:
        attribute = self.attribute(position)
        if not attribute:
            return "(no attribute)"
        return f"{attribute.get('trait_type', '?')}: {attribute.get('value', '?')}"

    def attribute_number(self, position: int = 1) -> Optional[float]:
        """
        The attribute's value as a number, or None if it is not numeric.

        Traits like Stars come through as real integers, but a metadata
        author is free to write "4" as a string, so accept both. Text values
        such as Rarity return None rather than raising.
        """
        attribute = self.attribute(position)
        if not attribute:
            return None

        value = attribute.get("value")
        if isinstance(value, bool):  # bools are ints in Python; not a score
            return None
        if isinstance(value, (int, float)):
            return value
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    def __str__(self) -> str:
        return f"#{self.item_id} {self.name}"


def sum_attribute(items: list[NftItem], position: int = 2) -> tuple[float, int, int]:
    """
    Total one numeric attribute over a set of items.

    Returns (total, counted, skipped) - `skipped` covers items whose trait is
    missing or non-numeric, so a caller can tell a genuine zero apart from a
    collection whose metadata never loaded.
    """
    total = 0.0
    counted = 0
    skipped = 0

    for item in items:
        value = item.attribute_number(position)
        if value is None:
            skipped += 1
            continue
        total += value
        counted += 1

    return (int(total) if total == int(total) else total), counted, skipped


def attribute_name(items: list[NftItem], position: int = 2) -> str:
    """The trait_type at `position`, taken from the first item that has one."""
    for item in items:
        attribute = item.attribute(position)
        if attribute and attribute.get("trait_type"):
            return str(attribute["trait_type"])
    return f"attribute {position}"


def ipfs_to_http(uri: str) -> str:
    """Turn an ipfs:// URI into a gateway URL, leaving http(s) URLs alone."""
    if uri.startswith("ipfs://"):
        return IPFS_GATEWAY + uri[len("ipfs://") :]
    return uri


def _connect():
    # Imported lazily: substrate-interface opens a websocket on construction,
    # so importing it at module scope would slow every backend import.
    from substrateinterface import SubstrateInterface

    return SubstrateInterface(url=ASSETHUB_RPC)


def fetch_owned_item_ids(address: str, collection_id: int, substrate=None) -> list[int]:
    """
    Every item id of `collection_id` held by `address`, ascending.

    Deliberately unbounded: query_map pages until the prefix is exhausted.
    Capping it with max_results would silently drop items from a large
    holding, and a wallet quietly missing NFTs is worse than a slow query.
    """
    connection = substrate or _connect()
    rows = connection.query_map("Nfts", "Account", [address, collection_id])
    return sorted(int(getattr(key, "value", key)) for key, _ in rows)


def fetch_item_metadata_uri(collection_id: int, item_id: int, substrate=None) -> Optional[str]:
    """The metadata URI stored on chain for one item, if it has one."""
    connection = substrate or _connect()
    stored = connection.query("Nfts", "ItemMetadataOf", [collection_id, item_id])
    if not stored or not stored.value:
        return None
    return (stored.value or {}).get("data") or None


def fetch_metadata_document(uri: str, cache: Optional[dict] = None) -> Optional[dict]:
    """
    Fetch and parse one metadata document.

    `cache` keys on the URI so a collection where many items share a document
    is not fetched repeatedly.
    """
    if cache is not None and uri in cache:
        return cache[uri]

    document: Optional[dict] = None
    try:
        response = requests.get(ipfs_to_http(uri), timeout=IPFS_TIMEOUT_SECONDS)
        response.raise_for_status()
        parsed = response.json()
        if isinstance(parsed, dict):
            document = parsed
    except (requests.RequestException, json.JSONDecodeError, ValueError):
        document = None

    if cache is not None:
        cache[uri] = document
    return document


def fetch_collection_items(
    address: str,
    collection_id: int = WUD_MINERS_COLLECTION_ID,
    substrate=None,
) -> list[NftItem]:
    """
    Every item of `collection_id` held by `address`, with traits resolved.

    Items whose metadata cannot be fetched still come back, just with an
    empty attribute list - a slow gateway must not hide an owned NFT.
    """
    connection = substrate or _connect()
    item_ids = fetch_owned_item_ids(address, collection_id, substrate=connection)

    cache: dict[str, Any] = {}
    items: list[NftItem] = []

    for item_id in item_ids:
        uri = fetch_item_metadata_uri(collection_id, item_id, substrate=connection)
        document = fetch_metadata_document(uri, cache) if uri else None
        items.append(NftItem(collection_id, item_id, document))

    return items
