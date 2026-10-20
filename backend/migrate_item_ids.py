#!/usr/bin/env python3
"""
MongoDB migration: rename item IDs from thematic names to {familyId}_{tier}.

Affects these collections:
  - player_vaults:        items[].itemId, itemBalances keys
  - characters:           gear.items[].itemId,
                          gear.itemBalances.{backpack,saddlepack,cart} keys,
                          crafting.itemBalances keys
  - character_homes:      items[].itemId, itemBalances keys
  - character_camp:       items[].itemId, itemBalances keys
  - character_blueprints: blueprints[] values

Usage:
    # Dry run (default) — prints what would change
    python3 backend/migrate_item_ids.py

    # Actually apply changes
    python3 backend/migrate_item_ids.py --apply

Requires: pymongo
Set MONGODB_URI and MONGODB_DB_NAME env vars (or place them in .env).
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

_SCRIPT_DIR = Path(__file__).resolve().parent
_MAP_PATH = _SCRIPT_DIR / "data" / "id-migration-map.json"

_ENV_PATH = _SCRIPT_DIR.parent / ".env"
if _ENV_PATH.exists():
    for line in _ENV_PATH.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))

from pymongo import MongoClient

DRY_RUN = "--apply" not in sys.argv

with open(_MAP_PATH) as f:
    ID_MAP: dict[str, str] = json.load(f)


def get_db():
    uri = os.getenv("MONGODB_URI")
    if not uri:
        raise RuntimeError("MONGODB_URI not set")
    db_name = os.getenv("MONGODB_DB_NAME", "thewudlands")
    return MongoClient(uri)[db_name]


def rename_balance_keys(balances: dict) -> tuple[dict, bool]:
    if not balances:
        return balances, False
    out: dict[str, int] = {}
    changed = False
    for k, v in balances.items():
        new_k = ID_MAP.get(k, k)
        if new_k != k:
            changed = True
        out[new_k] = v
    return out, changed


def rename_item_ids(items: list) -> bool:
    changed = False
    for item in items:
        old = item.get("itemId")
        if old and old in ID_MAP:
            item["itemId"] = ID_MAP[old]
            changed = True
    return changed


def rename_blueprint_ids(blueprints: list) -> tuple[list, bool]:
    if not blueprints:
        return blueprints, False
    out = []
    changed = False
    for bp in blueprints:
        new_bp = ID_MAP.get(bp, bp)
        if new_bp != bp:
            changed = True
        out.append(new_bp)
    return out, changed


def migrate_player_vaults(db):
    coll = db.player_vaults
    total = 0
    for doc in coll.find():
        updates = {}

        items = doc.get("items", [])
        if rename_item_ids(items):
            updates["items"] = items

        bal = doc.get("itemBalances", {})
        new_bal, bal_changed = rename_balance_keys(bal)
        if bal_changed:
            updates["itemBalances"] = new_bal

        if updates:
            total += 1
            addr = doc.get("address", "?")
            if DRY_RUN:
                print(f"  [DRY] player_vaults {addr}: {list(updates.keys())}")
            else:
                coll.update_one({"_id": doc["_id"]}, {"$set": updates})
                print(f"  player_vaults {addr}: updated {list(updates.keys())}")
    print(f"  player_vaults: {total} docs {'would be ' if DRY_RUN else ''}updated")


def migrate_characters(db):
    coll = db.characters
    total = 0
    for doc in coll.find():
        updates = {}
        gear = doc.get("gear", {})

        items = gear.get("items", [])
        if rename_item_ids(items):
            updates["gear.items"] = items

        item_balances = gear.get("itemBalances", {})
        for bucket in ("backpack", "saddlepack", "cart"):
            bal = item_balances.get(bucket, {})
            new_bal, changed = rename_balance_keys(bal)
            if changed:
                updates[f"gear.itemBalances.{bucket}"] = new_bal

        crafting = doc.get("crafting", {})
        craft_bal = crafting.get("itemBalances", {})
        new_craft_bal, craft_changed = rename_balance_keys(craft_bal)
        if craft_changed:
            updates["crafting.itemBalances"] = new_craft_bal

        if updates:
            total += 1
            addr = doc.get("address", "?")
            cid = doc.get("id", "?")
            if DRY_RUN:
                print(f"  [DRY] characters {addr}/{cid}: {list(updates.keys())}")
            else:
                coll.update_one({"_id": doc["_id"]}, {"$set": updates})
                print(f"  characters {addr}/{cid}: updated {list(updates.keys())}")
    print(f"  characters: {total} docs {'would be ' if DRY_RUN else ''}updated")


def migrate_storage(db, collection_name: str):
    coll = db[collection_name]
    total = 0
    for doc in coll.find():
        updates = {}

        items = doc.get("items", [])
        if rename_item_ids(items):
            updates["items"] = items

        bal = doc.get("itemBalances", {})
        new_bal, bal_changed = rename_balance_keys(bal)
        if bal_changed:
            updates["itemBalances"] = new_bal

        if updates:
            total += 1
            addr = doc.get("address", "?")
            cid = doc.get("characterId", "?")
            if DRY_RUN:
                print(f"  [DRY] {collection_name} {addr}/{cid}: {list(updates.keys())}")
            else:
                coll.update_one({"_id": doc["_id"]}, {"$set": updates})
                print(f"  {collection_name} {addr}/{cid}: updated {list(updates.keys())}")
    print(f"  {collection_name}: {total} docs {'would be ' if DRY_RUN else ''}updated")


def migrate_blueprints(db):
    coll = db.character_blueprints
    total = 0
    for doc in coll.find():
        bps = doc.get("blueprints", [])
        new_bps, changed = rename_blueprint_ids(bps)
        if changed:
            total += 1
            addr = doc.get("address", "?")
            cid = doc.get("characterId", "?")
            if DRY_RUN:
                print(f"  [DRY] character_blueprints {addr}/{cid}: blueprints")
            else:
                coll.update_one({"_id": doc["_id"]}, {"$set": {"blueprints": new_bps}})
                print(f"  character_blueprints {addr}/{cid}: updated blueprints")
    print(f"  character_blueprints: {total} docs {'would be ' if DRY_RUN else ''}updated")


def main():
    if DRY_RUN:
        print("=== DRY RUN (pass --apply to write changes) ===\n")
    else:
        print("=== APPLYING CHANGES ===\n")

    print(f"Loaded {len(ID_MAP)} ID mappings\n")

    db = get_db()

    print("Migrating player_vaults...")
    migrate_player_vaults(db)
    print()

    print("Migrating characters...")
    migrate_characters(db)
    print()

    print("Migrating character_homes...")
    migrate_storage(db, "character_homes")
    print()

    print("Migrating character_camp...")
    migrate_storage(db, "character_camp")
    print()

    print("Migrating character_blueprints...")
    migrate_blueprints(db)
    print()

    if DRY_RUN:
        print("Done (dry run). Re-run with --apply to commit changes.")
    else:
        print("Done. All collections migrated.")


if __name__ == "__main__":
    main()
