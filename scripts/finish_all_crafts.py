"""
Ends every running craft by collecting it now.

For each character with crafting.activeCraft, the ready time is moved to now
and the craft is finished through the normal players.finish_craft path: the
output, flat tools and borrowed items go back to the craft's storage, tool
wear is applied, the timer/status are cleared and the healing clock restarts.
Also lists player_characters entries still marked "crafting" without a
running craft (stale summaries).

Usage:
    source .venv/bin/activate
    python scripts/finish_all_crafts.py           # dry run: lists running crafts
    python scripts/finish_all_crafts.py --apply   # finishes them
"""

import asyncio
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")

from backend.db import get_database  # noqa: E402
from backend.players import finish_craft  # noqa: E402


async def main(apply: bool) -> None:
    db = get_database()
    running = []
    async for doc in db.characters.find({"crafting.activeCraft": {"$type": "object"}},
                                         {"address": 1, "id": 1, "name": 1, "crafting.activeCraft": 1}):
        running.append(doc)

    print(f"{len(running)} running craft(s)")
    finished = failed = 0
    for doc in running:
        active = doc["crafting"]["activeCraft"]
        label = (f"  {doc.get('name') or doc['id']:<20} {active.get('familyId')} T{active.get('tier')}"
                 f" x{active.get('count', 1)}  ready {active.get('readyAt')}"
                 f"  storage {active.get('storage') or 'vault (old craft)'}")
        print(label)
        if not apply:
            continue
        past = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        await db.characters.update_one(
            {"_id": doc["_id"], "crafting.activeCraft": {"$type": "object"}},
            {"$set": {"crafting.activeCraft.readyAt": past}},
        )
        if await finish_craft(doc["address"], doc["id"]) is None:
            failed += 1
            print("    -> could not be finished (left as is, now ready to collect)")
        else:
            finished += 1
            print("    -> finished")

    stale = []
    async for pc in db.player_characters.find({"characters.status": "crafting"}, {"address": 1, "characters": 1}):
        for c in pc.get("characters") or []:
            if "crafting" in (c.get("status") or []) and not c.get("activeCraft"):
                stale.append((pc["address"], c.get("characterId"), c.get("name")))
    if stale:
        print(f"{len(stale)} summary entr(y/ies) marked crafting without a running craft:")
        for address, cid, name in stale:
            print(f"  {name or cid} ({address[:10]}...)")

    if apply:
        print(f"Done: {finished} finished, {failed} failed.")
    else:
        print("Dry run - run again with --apply to finish them.")


if __name__ == "__main__":
    asyncio.run(main("--apply" in sys.argv))
