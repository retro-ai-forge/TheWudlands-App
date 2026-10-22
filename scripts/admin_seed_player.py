"""
Admin script: seed a player's inventory for testing/admin purposes.

Configuration flags (edit the block below):
  DROP_BLUEPRINTS  True  → grant all blueprints of the chosen tier to character_blueprints collection
  DROP_MATERIALS   True  → grant raw materials (RAW_MATERIAL_QTY each) to player_vaults.itemBalances
  DROP_ITEMS       True  → grant instance items + balance items (armor/weapons/food/potions/gear)
  DROP_TOOLS       True  → grant flat crafting tools (anvil, furnace, …) to player_vaults.itemBalances
  TIER_MIN / TIER_MAX    → tier range to drop (loops from min to max inclusive)

Usage:
    source .venv/bin/activate
    python scripts/admin_seed_player.py
"""

from __future__ import annotations

import asyncio
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from backend.db import get_database  # noqa: E402

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PLAYER_ADDRESS = "1sFxBUESH2ztJzRFvP4s7Ehc8Sj8sFxpMxgA985yud1Yz34"
RAW_MATERIAL_QTY = 3000

DROP_BLUEPRINTS = True
DROP_MATERIALS  = True    # raw materials → player_vaults.itemBalances
DROP_ITEMS      = True   # instance items + player_vaults.itemBalances (armor, weapons, food, potions, …)
DROP_TOOLS      = True   # flat crafting tools (anvil, furnace, workbench, …) → player_vaults.itemBalances

TIER_MIN        = 1      # lowest tier to drop (1–6)
TIER_MAX        = 6      # highest tier to drop (1–6)

# ---------------------------------------------------------------------------

ROOT = Path(__file__).parent.parent
DATA = ROOT / "backend" / "data"

ITEM_FILES = [
    "base-items-weapon.json",
    "base-items-armor.json",
    "base-items-shield.json",
    "base-tools.json",
    "base-items-food.json",
    "base-items-potion.json",
    "base-items-adventuring-gear.json",
    "base-items-essentials.json",
    "base-items-companion.json",
    "base-items-mount.json",
]


def resolve_tiers() -> list[int]:
    return list(range(TIER_MIN, TIER_MAX + 1))


def load_blueprints(tier: int) -> list[str]:
    items = json.loads((DATA / "base-blueprint.json").read_text())
    return [it["id"] for it in items if it.get("tier") == tier]


def load_raw_materials(tier: int) -> list[str]:
    items = json.loads((DATA / "base-resources.json").read_text())
    return [it["id"] for it in items if it.get("tier") == tier]


def load_items(tier: int) -> tuple[list[dict], dict[str, int], dict[str, int]]:
    """Returns (vault_instances, crafting_tools {id:1}, vault_item_balances {id:1})."""
    props = json.loads((DATA / "item-inventory-properties.json").read_text())
    props_by_family = {row["familyId"]: row for row in props}

    now = datetime.now(timezone.utc).isoformat()
    instances: list[dict] = []
    crafting_tools: dict[str, int] = {}
    item_balances: dict[str, int] = {}

    for fname in ITEM_FILES:
        is_tool_file = fname == "base-tools.json"
        items = json.loads((DATA / fname).read_text())
        for it in items:
            if it.get("tier") != tier:
                continue
            fam_props = props_by_family.get(it["familyId"], {})
            if fam_props.get("needsItemDefinition", False):
                instances.append(
                    {
                        "instanceId": uuid.uuid4().hex,
                        "itemId": it["id"],
                        "familyId": it["familyId"],
                        "quality": (fam_props.get("qualityMax") or 0) * (2 ** (tier - 1)),
                        "location": "pool",
                        "slotRef": [],
                        "createdAt": now,
                    }
                )
            elif is_tool_file:
                crafting_tools[it["id"]] = 1
            else:
                item_balances[it["id"]] = fam_props.get("stackSize", 1) or 1

    processed = json.loads((DATA / "base-processed.json").read_text())
    for it in processed:
        if it.get("tier") != tier:
            continue
        fam_props = props_by_family.get(it["familyId"])
        if fam_props is not None:
            item_balances[it["id"]] = fam_props.get("stackSize", 1) or 1

    return instances, crafting_tools, item_balances


async def main() -> None:
    tiers = resolve_tiers()
    print(f"Settings: DROP_BLUEPRINTS={DROP_BLUEPRINTS}  DROP_MATERIALS={DROP_MATERIALS}  DROP_ITEMS={DROP_ITEMS}  DROP_TOOLS={DROP_TOOLS}  tiers={TIER_MIN}–{TIER_MAX}\n")

    db = get_database()

    char_doc = await db.characters.find_one({"address": PLAYER_ADDRESS, "slotNumber": 1})
    if not char_doc:
        print(f"ERROR: No character on slot 1 for {PLAYER_ADDRESS}.")
        return

    char_id = char_doc["id"]
    print(f"Character: {char_doc.get('firstName', '')} {char_doc.get('lastName', '')} (id={char_id})\n")

    for tier in tiers:
        print(f"{'='*40} TIER {tier} {'='*40}")

        if DROP_BLUEPRINTS:
            blueprint_ids = load_blueprints(tier)
            print(f"[blueprints] Adding {len(blueprint_ids)} tier-{tier} blueprints to character_blueprints...")
            result = await db.character_blueprints.update_one(
                {"address": PLAYER_ADDRESS, "characterId": char_id},
                {"$addToSet": {"blueprints": {"$each": blueprint_ids}}},
                upsert=True,
            )
            print(f"  matched={result.matched_count} modified={result.modified_count}")
        else:
            print("[blueprints] skipped")

        if DROP_MATERIALS:
            raw_ids = load_raw_materials(tier)
            print(f"[materials] Granting {len(raw_ids)} tier-{tier} raw materials ({RAW_MATERIAL_QTY} each)...")
            if raw_ids:
                inc_resources = {f"itemBalances.{rid}": RAW_MATERIAL_QTY for rid in raw_ids}
                result = await db.player_vaults.update_one(
                    {"address": PLAYER_ADDRESS},
                    {"$inc": inc_resources},
                    upsert=True,
                )
                print(f"  matched={result.matched_count} modified={result.modified_count}")
            else:
                print("  (none found)")
        else:
            print("[materials] skipped")

        if DROP_ITEMS:
            instances, _, item_balances = load_items(tier)

            print(f"[items] Pushing {len(instances)} tier-{tier} instance-tracked items to vault.items...")
            if instances:
                result = await db.player_vaults.update_one(
                    {"address": PLAYER_ADDRESS},
                    {"$push": {"items": {"$each": instances}}},
                    upsert=True,
                )
                print(f"  matched={result.matched_count} modified={result.modified_count}")
            else:
                print("  (none found)")

            print(f"[balances] Granting {len(item_balances)} tier-{tier} balance items to vault.itemBalances...")
            if item_balances:
                result = await db.player_vaults.update_one(
                    {"address": PLAYER_ADDRESS},
                    {"$inc": {f"itemBalances.{iid}": qty for iid, qty in item_balances.items()}},
                    upsert=True,
                )
                print(f"  matched={result.matched_count} modified={result.modified_count}")
            else:
                print("  (none found)")
        else:
            print("[items/balances] skipped")

        if DROP_TOOLS:
            _, crafting_tools, _ = load_items(tier)
            print(f"[tools] Granting {len(crafting_tools)} tier-{tier} crafting tools to vault.itemBalances...")
            if crafting_tools:
                result = await db.player_vaults.update_one(
                    {"address": PLAYER_ADDRESS},
                    {"$inc": {f"itemBalances.{tid}": qty for tid, qty in crafting_tools.items()}},
                    upsert=True,
                )
                print(f"  matched={result.matched_count} modified={result.modified_count}")
            else:
                print("  (none found)")
        else:
            print("[tools] skipped")

        print()

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
