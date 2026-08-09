"""
Run test with:

python -m pytest tests/test_nfts.py -v -s
(-s for log output)

Exercises backend.nfts - listing the NFT items a wallet holds and reading
the traits out of their metadata documents.

Parsing is tested offline against stubbed documents; the live test reads
AssetHub over public RPC and IPFS, and skips without SUBSCAN_TEST_ADDRESS.
"""

import pytest

from backend import nfts
from backend.nfts import (
    WUD_MINERS_COLLECTION_ID,
    NftItem,
    attribute_name,
    fetch_collection_items,
    ipfs_to_http,
    sum_attribute,
)

SAMPLE_METADATA = {
    "name": "WUD Miner - Steady Hands",
    "image": "ipfs://bafkreiimage",
    "attributes": [
        {"trait_type": "Rarity", "value": "Uncommon"},
        {"trait_type": "Stars", "value": 4, "display_type": "number"},
        {"trait_type": "Element", "value": "Metal"},
    ],
}


# --- Offline: attribute access ----------------------------------------------


def test_attributes_are_one_based():
    """Attribute 1 is the first listed trait, not the second."""
    item = NftItem(WUD_MINERS_COLLECTION_ID, 99702, SAMPLE_METADATA)

    assert item.attribute(1)["trait_type"] == "Rarity"
    assert item.attribute(2)["trait_type"] == "Stars"
    assert item.attribute_text(1) == "Rarity: Uncommon"
    assert item.attribute_text(2) == "Stars: 4"


def test_out_of_range_attributes_read_as_none():
    """Position 0 and beyond-the-end must not wrap or raise."""
    item = NftItem(WUD_MINERS_COLLECTION_ID, 99702, SAMPLE_METADATA)

    assert item.attribute(0) is None
    assert item.attribute(4) is None
    assert item.attribute(-1) is None
    assert item.attribute_text(4) == "(no attribute)"


def test_item_without_metadata_still_describes_itself():
    """A failed metadata fetch must not lose the item."""
    item = NftItem(WUD_MINERS_COLLECTION_ID, 12345)

    assert item.name == "#12345"
    assert item.attributes == []
    assert item.attribute(1) is None
    assert str(item) == "#12345 #12345"


def test_ipfs_uris_become_gateway_urls():
    assert ipfs_to_http("ipfs://bafkreiabc").endswith("/bafkreiabc")
    assert ipfs_to_http("ipfs://bafkreiabc").startswith("http")
    # Already-resolvable URLs pass through untouched.
    assert ipfs_to_http("https://example.com/a.json") == "https://example.com/a.json"


# --- Offline: summing an attribute ------------------------------------------


def _item(item_id: int, stars) -> NftItem:
    return NftItem(
        WUD_MINERS_COLLECTION_ID,
        item_id,
        {
            "name": f"Miner {item_id}",
            "attributes": [
                {"trait_type": "Rarity", "value": "Uncommon"},
                {"trait_type": "Stars", "value": stars},
            ],
        },
    )


def test_stars_are_summed_across_items():
    total, counted, skipped = sum_attribute([_item(1, 7), _item(2, 5), _item(3, 1)], 2)

    assert total == 13
    assert isinstance(total, int)
    assert (counted, skipped) == (3, 0)


def test_numeric_strings_still_count():
    """A metadata author may write the value as "4" rather than 4."""
    total, counted, skipped = sum_attribute([_item(1, 4), _item(2, "6")], 2)

    assert total == 10
    assert (counted, skipped) == (2, 0)


def test_non_numeric_attributes_are_skipped_not_counted_as_zero():
    """Summing Rarity must report nothing summed, not a total of 0 over 3."""
    total, counted, skipped = sum_attribute([_item(1, 7), _item(2, 5)], 1)

    assert (total, counted, skipped) == (0, 0, 2)


def test_items_missing_the_attribute_are_skipped():
    """An item whose metadata failed to load must not drag the total down."""
    items = [_item(1, 7), NftItem(WUD_MINERS_COLLECTION_ID, 2)]

    total, counted, skipped = sum_attribute(items, 2)

    assert (total, counted, skipped) == (7, 1, 1)


def test_booleans_are_not_treated_as_scores():
    """True is an int in Python, but it is not a star count."""
    total, counted, skipped = sum_attribute([_item(1, True), _item(2, 3)], 2)

    assert (total, counted, skipped) == (3, 1, 1)


def test_attribute_name_comes_from_the_metadata():
    assert attribute_name([_item(1, 7)], 2) == "Stars"
    assert attribute_name([_item(1, 7)], 1) == "Rarity"
    # Nothing at that position anywhere - fall back to a positional label.
    assert attribute_name([_item(1, 7)], 9) == "attribute 9"


# --- Offline: assembling a collection ---------------------------------------


def test_items_are_assembled_with_their_metadata(monkeypatch):
    monkeypatch.setattr(nfts, "_connect", lambda: object())
    monkeypatch.setattr(
        nfts, "fetch_owned_item_ids", lambda address, collection, substrate=None: [7, 9]
    )
    monkeypatch.setattr(
        nfts,
        "fetch_item_metadata_uri",
        lambda collection, item, substrate=None: f"ipfs://doc{item}",
    )
    monkeypatch.setattr(
        nfts, "fetch_metadata_document", lambda uri, cache=None: SAMPLE_METADATA
    )

    items = fetch_collection_items("1abc", WUD_MINERS_COLLECTION_ID)

    assert [i.item_id for i in items] == [7, 9]
    assert all(i.attribute_text(1) == "Rarity: Uncommon" for i in items)


def test_unreachable_metadata_leaves_the_item_listed(monkeypatch):
    """A dead gateway must not make an owned NFT disappear."""
    monkeypatch.setattr(nfts, "_connect", lambda: object())
    monkeypatch.setattr(
        nfts, "fetch_owned_item_ids", lambda address, collection, substrate=None: [7]
    )
    monkeypatch.setattr(
        nfts, "fetch_item_metadata_uri", lambda collection, item, substrate=None: "ipfs://x"
    )
    monkeypatch.setattr(nfts, "fetch_metadata_document", lambda uri, cache=None: None)

    items = fetch_collection_items("1abc", WUD_MINERS_COLLECTION_ID)

    assert len(items) == 1
    assert items[0].item_id == 7
    assert items[0].attributes == []


def test_metadata_documents_are_fetched_once_per_uri(monkeypatch):
    """Items sharing a document must not refetch it."""
    fetched: list[str] = []

    def fake_get(url, timeout=None):
        fetched.append(url)

        class Response:
            @staticmethod
            def raise_for_status():
                return None

            @staticmethod
            def json():
                return SAMPLE_METADATA

        return Response()

    monkeypatch.setattr(nfts.requests, "get", fake_get)

    cache: dict = {}
    for _ in range(3):
        nfts.fetch_metadata_document("ipfs://same", cache)

    assert len(fetched) == 1


# --- Live: real chain and IPFS ----------------------------------------------


def test_live_collection_852_attributes(subscan_test_address):
    """Read the wallet's WUD Miners and print each one's first attribute."""
    items = fetch_collection_items(subscan_test_address, WUD_MINERS_COLLECTION_ID)

    if not items:
        pytest.skip(f"{subscan_test_address} holds no items in collection 852")

    for item in items:
        assert item.item_id > 0
        print(f"{item} -> {item.attribute_text(1)}, {item.attribute_text(2)}")

    total, counted, skipped = sum_attribute(items, 2)
    print(f"TOTAL {attribute_name(items, 2)}: {total} across {counted} item(s)")
    assert counted + skipped == len(items)

    # At least one item should have resolved its metadata; if none did, the
    # gateway is down and the traits are silently empty everywhere.
    assert any(item.attributes for item in items), "no metadata resolved for any item"
