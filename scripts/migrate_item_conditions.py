"""
Migration: crafting stations held as stacked counts -> condition items.

Crafting stations (anvil, furnace, loom... - item kind "tool") are now
condition-tracked items (backend/item_condition.py), one instance per piece.
This turns every stacked count of them into new items in the same place:
vault itemBalances -> vault items, home/camp itemBalances -> their items,
carried backpack/saddlepack/cart balances -> gear.items in that bag. A
station staged in a running craft is turned into an item when the craft
finishes (players._return_craft_balances). Safe to run again - a converted
stack is gone.

(The earlier one-off conversion of item quality points to condition levels
already ran - marker "item_conditions_v1" in the `migrations` collection -
and needed the since-removed qualityMax data, so it's no longer here.)

Usage:
    source .venv/bin/activate
    python scripts/migrate_item_conditions.py           # dry run: shows what would change
    python scripts/migrate_item_conditions.py --apply   # writes the changes
"""

import asyncio
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from backend.db import get_database  # noqa: E402
from backend.players import _is_tracked_item, _new_instance  # noqa: E402

# (collection, balances field, items field, location of the new items)
STACK_TARGETS = [
    ("player_vaults", "itemBalances", "items", "pool"),
    ("character_homes", "itemBalances", "items", "home"),
    ("character_camp", "itemBalances", "items", "camp"),
] + [("characters", f"gear.itemBalances.{bucket}", "gear.items", bucket)
     for bucket in ("backpack", "saddlepack", "cart")]


def _get(doc: dict, dotted: str):
    for key in dotted.split("."):
        doc = (doc or {}).get(key)
    return doc


async def main(apply: bool) -> None:
    db = get_database()
    pieces: Counter = Counter()
    for collection, bal_field, items_field, location in STACK_TARGETS:
        changed_docs = 0
        async for doc in db[collection].find({bal_field: {"$exists": True}}):
            balances = _get(doc, bal_field) or {}
            tracked = {i: n for i, n in balances.items() if n and n > 0 and _is_tracked_item(i)}
            if not tracked:
                continue
            changed_docs += 1
            for i, n in tracked.items():
                pieces[collection] += n
            if apply:
                await db[collection].update_one(
                    {"_id": doc["_id"]},
                    {"$push": {items_field: {"$each": [_new_instance(i, location)
                                                       for i, n in tracked.items() for _ in range(n)]}},
                     "$unset": {f"{bal_field}.{i}": "" for i in tracked}},
                )
        print(f"{collection} ({bal_field}): {changed_docs} doc(s) {'converted' if apply else 'to convert'}")
    for collection, n in sorted(pieces.items()):
        print(f"  {collection:<16} {n} station(s) -> items")
    print("Done." if apply else "Dry run - run again with --apply to write.")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
