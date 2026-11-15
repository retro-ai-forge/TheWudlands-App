"""
Migration: condition-tracked families held as stacked counts -> items.

Every needsItemDefinition family (crafting stations - anvil, furnace,
loom...; tent and bedroll; weapons, armor...) is condition-tracked
(backend/item_condition.py), one instance per piece. This turns every
stacked count of them into new items in the same place: vault itemBalances
-> vault items, home/camp itemBalances -> their items, carried
backpack/saddlepack/cart balances -> gear.items in that bag. It also gives
an instance of such a family that has no condition level yet (e.g. a
bedroll equipped while it was still a stacked item) the "new" level. A
piece staged in a running craft is turned into an item when the craft
finishes (players._return_craft_balances). Safe to run again - a converted
stack is gone and a set level is left alone.

(The earlier one-off conversion of item quality points to condition levels
already ran and needed the since-removed qualityMax data, so it's no longer
here.)

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

from backend import item_condition  # noqa: E402
from backend.db import get_database  # noqa: E402
from backend.players import _is_tracked_item, _new_instance  # noqa: E402

# (collection, balances field, items field, location of the new items)
STACK_TARGETS = [
    ("player_vaults", "itemBalances", "items", "pool"),
    ("character_homes", "itemBalances", "items", "home"),
    ("character_camp", "itemBalances", "items", "camp"),
] + [("characters", f"gear.itemBalances.{bucket}", "gear.items", bucket)
     for bucket in ("backpack", "saddlepack", "cart")]

# (collection, items field) - every place item instances live.
INSTANCE_TARGETS = [
    ("player_vaults", "items"),
    ("character_homes", "items"),
    ("character_camp", "items"),
    ("characters", "gear.items"),
]


def _get(doc: dict, dotted: str):
    for key in dotted.split("."):
        doc = (doc or {}).get(key)
    return doc


async def convert_stacks(db, apply: bool) -> None:
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
                pieces[i] += n
            if apply:
                await db[collection].update_one(
                    {"_id": doc["_id"]},
                    {"$push": {items_field: {"$each": [_new_instance(i, location)
                                                       for i, n in tracked.items() for _ in range(n)]}},
                     "$unset": {f"{bal_field}.{i}": "" for i in tracked}},
                )
        print(f"{collection} ({bal_field}): {changed_docs} doc(s) {'converted' if apply else 'to convert'}")
    for item_id, n in sorted(pieces.items()):
        print(f"  {item_id:<24} {n} stacked -> item(s)")


async def set_missing_levels(db, apply: bool) -> None:
    fixed: Counter = Counter()
    for collection, items_field in INSTANCE_TARGETS:
        changed_docs = 0
        async for doc in db[collection].find({items_field: {"$exists": True}}):
            ids = [i["instanceId"] for i in _get(doc, items_field) or []
                   if i.get("instanceId") and i.get("quality") is None and i.get("quantity") is None
                   and _is_tracked_item(i.get("itemId", ""))]
            if not ids:
                continue
            changed_docs += 1
            for i in _get(doc, items_field):
                if i.get("instanceId") in ids:
                    fixed[i["itemId"]] += 1
            if apply:
                await db[collection].update_one(
                    {"_id": doc["_id"]},
                    {"$set": {f"{items_field}.$[m].quality": item_condition.NEW}},
                    array_filters=[{"m.instanceId": {"$in": ids}}],
                )
        print(f"{collection} ({items_field}): {changed_docs} doc(s) "
              f"{'given a condition level' if apply else 'with items to give a condition level'}")
    for item_id, n in sorted(fixed.items()):
        print(f"  {item_id:<24} {n} item(s) -> new")


async def main(apply: bool) -> None:
    db = get_database()
    await convert_stacks(db, apply)
    await set_missing_levels(db, apply)
    print("Done." if apply else "Dry run - run again with --apply to write.")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
