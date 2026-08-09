"""
Soul-creation slot unlocks.

Ten slots sit on the welcome page. The first is free; the other nine each
need the player's wallet to hold something - an NFT from a collection, a
number of Grid Miner stars, or a token balance.

Two speeds of check:

  * `token` slots resolve from two Subscan calls (balances plus the NFT
    collection counts that ride along in the same response), fast enough to
    block the page on;
  * `star` slots need every Grid Miner's metadata fetched from IPFS, which
    takes seconds - those resolve separately so the page never waits.

Results are cached per address in the `soul_slots` collection. Re-checking
on every login would burn the Subscan quota for data that rarely changes,
so a cached entry is only re-verified on roughly one login in ten.
"""

from __future__ import annotations

import asyncio
import random
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from backend.balances import (
    DOT_SYMBOL,
    FIRST_ANNIVERSARY_COLLECTION_ID,
    OG_WUD_BURN_COLLECTION_ID,
    SECOND_ANNIVERSARY_COLLECTION_ID,
    WUD_SYMBOL,
    fetch_holdings,
)
from backend.db import get_database
from backend.nfts import (
    WUD_MINERS_COLLECTION_ID,
    fetch_collection_items,
    sum_attribute,
)

# The Grid Miner trait that carries the star count. Position 2 in the
# metadata's attribute list; see backend.nfts.
STARS_ATTRIBUTE_POSITION = 2

# Fraction of logins that re-verify an already-cached entry.
REVERIFY_PROBABILITY = 0.1

# Stored records hold slot *numbers*, so any change to the order or meaning
# of SOUL_SLOTS makes existing records mean something else. Bump this when
# that happens: records stamped with an older version are re-verified on the
# next login instead of being trusted.
SLOT_LAYOUT_VERSION = 3

FREE = "free"
NFT = "nft"
STARS = "stars"
TOKEN = "token"


@dataclass(frozen=True)
class SoulSlot:
    """One slot on the welcome grid and what unlocks it."""

    number: int
    kind: str
    label: str
    image: Optional[str] = None
    collection_id: Optional[int] = None
    symbol: Optional[str] = None
    amount: float = 0.0

    @property
    def is_slow(self) -> bool:
        """Whether resolving this slot needs the IPFS metadata pass."""
        return self.kind == STARS

    def to_dict(self) -> dict:
        return {
            "number": self.number,
            "kind": self.kind,
            "label": self.label,
            "image": self.image,
            "slow": self.is_slow,
        }


SOUL_SLOTS: tuple[SoulSlot, ...] = (
    SoulSlot(1, FREE, "FREE"),
    SoulSlot(
        2, NFT, "WUD 1st YEAR NFT",
        image="nft-wud-1st-year.jpg", collection_id=FIRST_ANNIVERSARY_COLLECTION_ID,
    ),
    SoulSlot(
        3, NFT, "WUD 2nd YEAR NFT",
        image="nft-wud-2nd-year.jpg", collection_id=SECOND_ANNIVERSARY_COLLECTION_ID,
    ),
    SoulSlot(
        4, NFT, "OG WUD BURN NFT",
        image="nft-wud-og-burn.jpg", collection_id=OG_WUD_BURN_COLLECTION_ID,
    ),
    SoulSlot(5, TOKEN, "1B WUD", image="assset-wud.jpg", symbol=WUD_SYMBOL, amount=1e9),
    SoulSlot(6, TOKEN, "5B WUD", image="assset-wud.jpg", symbol=WUD_SYMBOL, amount=5e9),
    SoulSlot(7, TOKEN, "1000 DOT", image="asset-dot.png", symbol=DOT_SYMBOL, amount=1000),
    SoulSlot(8, TOKEN, "5000 DOT", image="asset-dot.png", symbol=DOT_SYMBOL, amount=5000),
    # Grid Miner slots sit last: they resolve on the slow IPFS pass, so their
    # spinners keep running after the rest of the grid has settled, and that
    # reads better at the end of the list than in the middle of it.
    SoulSlot(9, STARS, "20 STARS", image="nft-wud-grid-miner.jpg", amount=20),
    SoulSlot(10, STARS, "100 STARS", image="nft-wud-grid-miner.jpg", amount=100),
)

FREE_SLOT_NUMBERS = tuple(s.number for s in SOUL_SLOTS if s.kind == FREE)
STAR_SLOT_NUMBERS = tuple(s.number for s in SOUL_SLOTS if s.kind == STARS)
FAST_SLOT_NUMBERS = tuple(s.number for s in SOUL_SLOTS if not s.is_slow)


def unlocked_from_holdings(holdings) -> list[int]:
    """
    Which non-star slots `holdings` unlocks.

    The free slot is always in the result, so a wallet holding nothing still
    gets slot 1.
    """
    unlocked = list(FREE_SLOT_NUMBERS)

    for slot in SOUL_SLOTS:
        if slot.kind == NFT and holdings.owns_nft_from_collection(slot.collection_id):
            unlocked.append(slot.number)
        elif slot.kind == TOKEN:
            held = holdings.totals.get(slot.symbol)
            if held and held.total >= slot.amount:
                unlocked.append(slot.number)

    return sorted(unlocked)


def unlocked_from_stars(stars: float) -> list[int]:
    """Which star slots a total of `stars` unlocks."""
    return sorted(s.number for s in SOUL_SLOTS if s.kind == STARS and stars >= s.amount)


async def evaluate_fast_slots(address: str) -> Optional[list[int]]:
    """
    Resolve every non-star slot for `address`.

    Returns None when the lookup could not run at all (no Subscan key), so
    callers can leave the grid locked rather than record a false negative.
    """
    holdings = await fetch_holdings(address)
    if holdings is None:
        return None
    return unlocked_from_holdings(holdings)


async def evaluate_star_slots(address: str) -> tuple[float, list[int]]:
    """
    Resolve the star slots for `address`; returns (total stars, slot numbers).

    Slow - one RPC call per owned Grid Miner plus its IPFS document.
    """
    items = await asyncio.to_thread(
        fetch_collection_items, address, WUD_MINERS_COLLECTION_ID
    )
    stars, _, _ = sum_attribute(items, STARS_ATTRIBUTE_POSITION)
    return stars, unlocked_from_stars(stars)


# --- Persistence -------------------------------------------------------------


async def get_stored_slots(address: str) -> Optional[dict]:
    db = get_database()
    return await db.soul_slots.find_one({"address": address})


async def store_slots(address: str, changes: dict[str, Any]) -> None:
    """Upsert `changes` onto the address's slot record, stamping the time."""
    db = get_database()
    await db.soul_slots.update_one(
        {"address": address},
        {
            "$set": {
                **changes,
                "layout_version": SLOT_LAYOUT_VERSION,
                "updated_at": datetime.now(timezone.utc),
            },
            "$setOnInsert": {"address": address},
        },
        upsert=True,
    )


def should_reverify(stored: Optional[dict], roll: Optional[float] = None) -> bool:
    """
    Whether to re-check a wallet that already has a stored result.

    Always true when nothing is stored yet, and always true when the record
    predates the current slot layout - those numbers refer to a different
    set of slots and must not be trusted. Otherwise true for roughly one
    login in ten, so the Subscan quota is not spent re-confirming unlocks
    that almost never change.
    """
    if not stored or "unlocked" not in stored:
        return True
    if stored.get("layout_version") != SLOT_LAYOUT_VERSION:
        return True
    roll = random.random() if roll is None else roll
    return roll < REVERIFY_PROBABILITY


async def resolve_fast_slots(address: str, roll: Optional[float] = None) -> dict:
    """
    The non-star slot state for `address`, from cache or a fresh lookup.

    Returns {"unlocked": [...], "checked": bool, "stars": float|None} where
    `checked` is False only when there was nothing stored and the live
    lookup could not run - the case the UI shows as "still locked".
    """
    stored = await get_stored_slots(address)

    if not should_reverify(stored, roll):
        return {
            "unlocked": stored.get("unlocked", list(FREE_SLOT_NUMBERS)),
            "stars": stored.get("stars"),
            "checked": True,
            "cached": True,
        }

    unlocked = await evaluate_fast_slots(address)

    if unlocked is None:
        # Lookup unavailable - fall back to whatever was stored before.
        if (
            stored
            and "unlocked" in stored
            and stored.get("layout_version") == SLOT_LAYOUT_VERSION
        ):
            return {
                "unlocked": stored["unlocked"],
                "stars": stored.get("stars"),
                "checked": True,
                "cached": True,
            }
        return {"unlocked": list(FREE_SLOT_NUMBERS), "stars": None, "checked": False,
                "cached": False}

    # Keep any star slots already earned; this pass did not re-check them.
    stars = stored.get("stars") if stored else None
    if stars is not None:
        unlocked = sorted(set(unlocked) | set(unlocked_from_stars(stars)))

    await store_slots(address, {"unlocked": unlocked, "tokens_checked_at":
                                datetime.now(timezone.utc)})

    return {"unlocked": unlocked, "stars": stars, "checked": True, "cached": False}


async def resolve_star_slots(address: str) -> dict:
    """
    The star slot state for `address`, always freshly counted.

    Merges the result into the stored record so the next login serves it
    from cache instead of walking IPFS again.
    """
    stored = await get_stored_slots(address)
    previous = set(stored.get("unlocked", FREE_SLOT_NUMBERS)) if stored else set(
        FREE_SLOT_NUMBERS
    )

    stars, star_slots = await evaluate_star_slots(address)

    # Drop star slots that are no longer earned, keep everything else.
    unlocked = sorted((previous - set(STAR_SLOT_NUMBERS)) | set(star_slots))

    await store_slots(
        address,
        {"unlocked": unlocked, "stars": stars, "stars_checked_at": datetime.now(timezone.utc)},
    )

    return {"unlocked": unlocked, "stars": stars, "checked": True}
