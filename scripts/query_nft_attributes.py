"""
Ad-hoc NFT lookup: lists the items of one collection held by a public
address and prints one attribute from each item's metadata.

Reads AssetHub over public RPC and the metadata from IPFS - no API key.

Usage:
    source .venv/bin/activate
    python scripts/query_nft_attributes.py                    # .env address, collection 852
    python scripts/query_nft_attributes.py <address>
    python scripts/query_nft_attributes.py <address> --collection 244
    python scripts/query_nft_attributes.py --attribute 1      # print the 1st trait
    python scripts/query_nft_attributes.py --all              # print every trait

Prints the second attribute by default; pass --attribute to pick another.
"""

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from backend.nfts import (  # noqa: E402
    WUD_MINERS_COLLECTION_ID,
    attribute_name,
    fetch_collection_items,
    sum_attribute,
)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "address",
        nargs="?",
        default=os.getenv("SUBSCAN_TEST_ADDRESS"),
        help="public SS58 address (defaults to SUBSCAN_TEST_ADDRESS in .env)",
    )
    parser.add_argument(
        "--collection", type=int, default=WUD_MINERS_COLLECTION_ID, help="collection id"
    )
    parser.add_argument(
        "--attribute",
        type=int,
        default=2,
        help="which attribute to print, 1-based (default: 2, the second listed)",
    )
    parser.add_argument("--all", action="store_true", help="print every attribute")
    args = parser.parse_args()

    if not args.address:
        parser.error("no address given and SUBSCAN_TEST_ADDRESS is not set in .env")

    print(f"{args.address}\ncollection #{args.collection}")

    try:
        items = fetch_collection_items(args.address, args.collection)
    except Exception as e:
        print(f"  lookup failed: {type(e).__name__}: {e}")
        return 1

    if not items:
        print("  holds no items from this collection")
        return 0

    print(f"  {len(items)} item(s)\n")
    for item in items:
        print(f"  {item}")
        if args.all:
            for position in range(1, len(item.attributes) + 1):
                print(f"      [{position}] {item.attribute_text(position)}")
        else:
            print(f"      attribute {args.attribute}: {item.attribute_text(args.attribute)}")

    total, counted, skipped = sum_attribute(items, args.attribute)
    name = attribute_name(items, args.attribute)
    summary = f"\n  TOTAL {name}: {total:,} across {counted} item(s)"
    if skipped:
        summary += f" ({skipped} item(s) had no numeric {name})"
    print(summary)

    return 0


if __name__ == "__main__":
    sys.exit(main())
