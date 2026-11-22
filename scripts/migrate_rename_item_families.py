"""
Migration: eleven item families were renamed so every family names its
material or kind first (like wooden_shield) - stories refer to items by these
ids (docs/STORY-RULES.md), so they had to be consistent before any story did:

    axe_stone                 -> stone_axe
    barding_iron              -> metal_barding     (its tiers go copper ... star metal)
    barding_leather           -> leather_barding
    charm_aquatic/flying/ghost/other -> aquatic_charm/flying_charm/ghost_charm/other_charm
    meteoric_iron_head_armor/chest_armor/leg_armor/shield -> meteoric_head_armor/... (tiers go copper ... star metal)

Rewrites every stored item id (family_tier), family id and blueprint id
(blueprint_family[_tier]) - as values and as keys (itemBalances) - in every
collection except the authors' story texts. Safe to run again: a migrated
document has no old ids left. Each document is only written if the fields it
changes still hold what was read (a conditional update), so nothing written
meanwhile is lost - such a document is reported and picked up by the next run.
Run it together with the deploy of the renamed catalog: old ids are unknown to
the new code and the new ids to the old code.

Usage:
    source .venv/bin/activate
    python scripts/migrate_rename_item_families.py           # dry run: shows what would change
    python scripts/migrate_rename_item_families.py --apply   # writes the changes
"""

import asyncio
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from backend.db import get_database  # noqa: E402

RENAMES = {
    "axe_stone": "stone_axe",
    "barding_iron": "metal_barding",
    "barding_leather": "leather_barding",
    "charm_aquatic": "aquatic_charm",
    "charm_flying": "flying_charm",
    "charm_ghost": "ghost_charm",
    "charm_other": "other_charm",
    "meteoric_iron_head_armor": "meteoric_head_armor",
    "meteoric_iron_chest_armor": "meteoric_chest_armor",
    "meteoric_iron_leg_armor": "meteoric_leg_armor",
    "meteoric_iron_shield": "meteoric_shield",
}
# The authors' own texts are never rewritten.
SKIP_COLLECTIONS = {"twine_stories", "twine_review", "twine_rejected", "story_snapshots"}


def make_renamer(renames: dict, not_after: tuple = ()):
    """A function giving (value with every old family id swapped, number of
    swaps), in strings and dict keys. A whole family id inside an id or path:
    "axe_stone", "axe_stone_3", "blueprint_axe_stone_3",
    "/images/items/axe_stone_t3.png" - never part of a longer word, and never
    right after one of `not_after` (such as "meteoric_")."""
    guards = "".join(f"(?<!{re.escape(prefix)})" for prefix in not_after)
    pattern = re.compile(
        r"(?<![A-Za-z0-9])" + guards + "("
        + "|".join(sorted(map(re.escape, renames), key=len, reverse=True))
        + r")(?![A-Za-z])"
    )

    def renamed(value):
        if isinstance(value, str):
            return pattern.subn(lambda m: renames[m.group(1)], value)
        if isinstance(value, dict):
            out, count = {}, 0
            for key, item in value.items():
                new_key, n_key = renamed(key) if isinstance(key, str) else (key, 0)
                new_item, n_item = renamed(item)
                out[new_key] = new_item
                count += n_key + n_item
            return out, count
        if isinstance(value, list):
            out, count = [], 0
            for item in value:
                new_item, n = renamed(item)
                out.append(new_item)
                count += n
            return out, count
        return value, 0

    return renamed


renamed = make_renamer(RENAMES)


async def migrate(renamer, apply: bool) -> None:
    """Rewrites every stored id `renamer` changes, in every collection except
    the authors' story texts; each document only if what it changes still
    holds what was read. Story texts that still use old ids are listed."""
    db = get_database()
    documents = written = skipped = 0
    for name in sorted(await db.list_collection_names()):
        if name in SKIP_COLLECTIONS:
            continue
        async for doc in db[name].find({}):
            changes = {}
            for field, value in doc.items():
                if field == "_id":
                    continue
                new_value, swaps = renamer(value)
                if swaps:
                    changes[field] = (value, new_value, swaps)
            if not changes:
                continue
            documents += 1
            summary = ", ".join(f"{field} ({swaps})" for field, (_, _, swaps) in changes.items())
            print(f"{name} {doc['_id']}: {summary}")
            if apply:
                result = await db[name].update_one(
                    {"_id": doc["_id"], **{field: old for field, (old, _, _) in changes.items()}},
                    {"$set": {field: new for field, (_, new, _) in changes.items()}},
                )
                if result.modified_count:
                    written += 1
                else:
                    skipped += 1
                    print("  changed meanwhile - skipped, run again")
    for name in sorted(SKIP_COLLECTIONS):
        async for doc in db[name].find({}, {"name": 1, "storyId": 1, "passages": 1}):
            _, swaps = renamer(doc.get("passages", []))
            if swaps:
                print(f"  story text not rewritten, uses old ids {swaps}x: {name} {doc.get('storyId') or doc['_id']} ({doc.get('name', '')})")
    if apply:
        print(f"{documents} document(s) with old ids: {written} updated, {skipped} skipped")
    else:
        print(f"{documents} document(s) would be updated")
        print("Dry run - nothing written. Run with --apply to write.")


async def main(apply: bool) -> None:
    await migrate(renamed, apply)


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
