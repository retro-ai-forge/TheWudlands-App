"""
Admin script: seed a player's inventory for testing/admin purposes.

Configuration flags (edit the block below):
  DROP_BLUEPRINTS  True  → grant all blueprints of the chosen tier to character slot 1
  DROP_MATERIALS   True  → grant raw materials (RAW_MATERIAL_QTY each) to crafting.resources
  DROP_ITEMS       True  → grant instance items + balance items (armor/weapons/food/potions/gear)
  DROP_TOOLS       True  → grant flat crafting tools (anvil, furnace, …) to crafting.tools
  TIER_LVL         1-6   → which tier to drop (used when TIER_RANDOM is False)
  TIER_RANDOM      True  → pick a random tier each run, overrides TIER_LVL

Usage:
    source .venv/bin/activate
    python scripts/admin_seed_player.py
"""

from __future__ import annotations

import asyncio
import json
import random
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

DROP_BLUEPRINTS = False
DROP_MATERIALS  = False    # raw materials → crafting.resources
DROP_ITEMS      = True   # instance items + vault.itemBalances (armor, weapons, food, potions, …)
DROP_TOOLS      = False   # flat crafting tools (anvil, furnace, workbench, …)

TIER_RANDOM     = False  # True = pick a random tier, overrides TIER_LVL
TIER_LVL        = 6      # tier to drop when TIER_RANDOM is False (1–6)

# ---------------------------------------------------------------------------

ROOT = Path(__file__).parent.parent
DATA = ROOT / "backend" / "data"

ITEM_FILES = [
    "base-tools.json",
    "base-items-armor.json",
    "base-items-shield.json",
    "base-items-weapon.json",
    "base-items-food.json",
    "base-items-potion.json",
    "base-items-adventuring-gear.json",
    "base-items-essentials.json",
    "base-items-companion.json",
    "base-items-mount.json",
]


def resolve_tier() -> int:
    if TIER_RANDOM:
        tier = random.randint(1, 6)
        print(f"TIER_RANDOM=True → using tier {tier}")
        return tier
    return TIER_LVL


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
                        "quality": fam_props.get("qualityMax", 1),
                        "location": "pool",
                        "slotRef": [],
                        "createdAt": now,
                    }
                )
            elif is_tool_file:
                crafting_tools[it["id"]] = 1
            else:
                item_balances[it["id"]] = 1

    return instances, crafting_tools, item_balances


async def main() -> None:
    tier = resolve_tier()
    print(f"Settings: DROP_BLUEPRINTS={DROP_BLUEPRINTS}  DROP_MATERIALS={DROP_MATERIALS}  DROP_ITEMS={DROP_ITEMS}  DROP_TOOLS={DROP_TOOLS}  tier={tier}\n")

    db = get_database()

    player = await db.players.find_one({"address": PLAYER_ADDRESS})
    if not player:
        print(f"ERROR: Player {PLAYER_ADDRESS} not found.")
        return

    characters = player.get("characters", [])
    slot = next((c for c in characters if c.get("slotNumber") == 1), None)
    if slot is None:
        print("ERROR: No character on slot 1.")
        return
    char_id = slot["id"]
    print(f"Character: {slot.get('firstName', '')} {slot.get('lastName', '')} (id={char_id})\n")

    # 1 — Blueprints → character
    if DROP_BLUEPRINTS:
        blueprint_ids = load_blueprints(tier)
        print(f"[blueprints] Adding {len(blueprint_ids)} tier-{tier} blueprints to character...")
        result = await db.players.update_one(
            {"address": PLAYER_ADDRESS, "characters.id": char_id},
            {"$addToSet": {"characters.$.blueprints": {"$each": blueprint_ids}}},
        )
        print(f"  matched={result.matched_count} modified={result.modified_count}")
    else:
        print("[blueprints] skipped (DROP_BLUEPRINTS=False)")

    # 2 — Raw materials
    if DROP_MATERIALS:
        raw_ids = load_raw_materials(tier)
        print(f"\n[materials] Granting {len(raw_ids)} tier-{tier} raw materials ({RAW_MATERIAL_QTY} each)...")
        if raw_ids:
            inc_resources = {f"crafting.resources.{rid}": RAW_MATERIAL_QTY for rid in raw_ids}
            result = await db.players.update_one({"address": PLAYER_ADDRESS}, {"$inc": inc_resources})
            print(f"  matched={result.matched_count} modified={result.modified_count}")
        else:
            print("  (none found)")
    else:
        print("\n[materials] skipped (DROP_MATERIALS=False)")

    # 3 — Instance items + balance items
    if DROP_ITEMS:
        instances, _, item_balances = load_items(tier)

        print(f"\n[items] Pushing {len(instances)} tier-{tier} instance-tracked items to vault.items...")
        if instances:
            result = await db.players.update_one(
                {"address": PLAYER_ADDRESS},
                {"$push": {"vault.items": {"$each": instances}}},
            )
            print(f"  matched={result.matched_count} modified={result.modified_count}")
        else:
            print("  (none found)")

        print(f"\n[balances] Granting {len(item_balances)} tier-{tier} balance items to vault.itemBalances...")
        if item_balances:
            result = await db.players.update_one(
                {"address": PLAYER_ADDRESS},
                {"$inc": {f"vault.itemBalances.{iid}": qty for iid, qty in item_balances.items()}},
            )
            print(f"  matched={result.matched_count} modified={result.modified_count}")
        else:
            print("  (none found)")
    else:
        print("\n[items/balances] skipped (DROP_ITEMS=False)")

    # 3 — Crafting tools
    if DROP_TOOLS:
        _, crafting_tools, _ = load_items(tier)
        print(f"\n[tools] Granting {len(crafting_tools)} tier-{tier} crafting tools to crafting.tools...")
        if crafting_tools:
            result = await db.players.update_one(
                {"address": PLAYER_ADDRESS},
                {"$inc": {f"crafting.tools.{tid}": qty for tid, qty in crafting_tools.items()}},
            )
            print(f"  matched={result.matched_count} modified={result.modified_count}")
        else:
            print("  (none found)")
    else:
        print("\n[tools] skipped (DROP_TOOLS=False)")

    print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
