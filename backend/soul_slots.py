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
so a cached entry is only re-verified on roughly one login in thirty-three.
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
REVERIFY_PROBABILITY = 0.03

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
    # Where a locked slot sends the player to go earn it - a marketplace
    # listing, the DEX, the mining game. Placeholder links for now; expect
    # these to be replaced once in-app soul creation covers this itself.
    link: Optional[str] = None

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
            # Lets the client draw the star-progress overlay (e.g. "14 of 20
            # filled") without parsing the target out of the label text.
            "amount": self.amount,
            "link": self.link,
        }


SOUL_SLOTS: tuple[SoulSlot, ...] = (
    SoulSlot(1, FREE, "FREE"),
    SoulSlot(
        2, NFT, "WUD 1st YEAR NFT",
        image="nft-wud-1st-year.jpg", collection_id=FIRST_ANNIVERSARY_COLLECTION_ID,
        link="https://www.chaotic.art/ahp/collection/441",
    ),
    SoulSlot(
        3, NFT, "WUD 2nd YEAR NFT",
        image="nft-wud-2nd-year.jpg", collection_id=SECOND_ANNIVERSARY_COLLECTION_ID,
        link="https://www.chaotic.art/ahp/collection/842",
    ),
    SoulSlot(
        4, NFT, "OG WUD BURN NFT",
        image="nft-wud-og-burn.jpg", collection_id=OG_WUD_BURN_COLLECTION_ID,
        link="https://www.chaotic.art/ahp/collection/244",
    ),
    SoulSlot(5, TOKEN, "1B WUD", image="assset-wud.jpg", symbol=WUD_SYMBOL, amount=1e9,
             link="https://app.hydration.net/"),
    SoulSlot(6, TOKEN, "5B WUD", image="assset-wud.jpg", symbol=WUD_SYMBOL, amount=5e9,
             link="https://app.hydration.net/"),
    SoulSlot(7, TOKEN, "1000 DOT", image="asset-dot.png", symbol=DOT_SYMBOL, amount=1000,
             link="https://app.hydration.net/"),
    SoulSlot(8, TOKEN, "5000 DOT", image="asset-dot.png", symbol=DOT_SYMBOL, amount=5000,
             link="https://app.hydration.net/"),
    # Grid Miner slots sit last: they resolve on the slow IPFS pass, so their
    # spinners keep running after the rest of the grid has settled, and that
    # reads better at the end of the list than in the middle of it.
    SoulSlot(9, STARS, "20 MINING STARS", image="nft-wud-grid-miner.jpg", amount=20,
             link="https://gavunminer.xyz/"),
    SoulSlot(10, STARS, "100 MINING STARS", image="nft-wud-grid-miner.jpg", amount=100,
             link="https://gavunminer.xyz/"),
)

FREE_SLOT_NUMBERS = tuple(s.number for s in SOUL_SLOTS if s.kind == FREE)
STAR_SLOT_NUMBERS = tuple(s.number for s in SOUL_SLOTS if s.kind == STARS)
FAST_SLOT_NUMBERS = tuple(s.number for s in SOUL_SLOTS if not s.is_slow)
TOKEN_SLOT_NUMBERS = tuple(s.number for s in SOUL_SLOTS if s.kind == TOKEN)


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


def token_progress_from_holdings(holdings) -> list[float]:
    """
    Percent of its required amount `holdings` holds for each token slot, in
    TOKEN_SLOT_NUMBERS order. Capped at 100 - once a slot is unlocked its
    line is simply full, not overflowing past the edge.
    """
    progress = []
    for slot in SOUL_SLOTS:
        if slot.kind != TOKEN:
            continue
        held = holdings.totals.get(slot.symbol)
        held_amount = held.total if held else 0.0
        progress.append(round(min(100.0, held_amount / slot.amount * 100), 1))
    return progress


async def evaluate_fast_slots(address: str) -> Optional[tuple[list[int], list[float]]]:
    """
    Resolve every non-star slot for `address`, plus each token slot's
    percent progress toward its required amount.

    Returns None when the lookup could not run at all (no Subscan key), so
    callers can leave the grid locked rather than record a false negative.
    """
    holdings = await fetch_holdings(address)
    if holdings is None:
        return None
    return unlocked_from_holdings(holdings), token_progress_from_holdings(holdings)


async def evaluate_star_slots(address: str) -> tuple[float, list[int]]:
    """
    Resolve the star slots for `address`; returns (total stars, slot numbers).

    Slow - one RPC call per owned Grid Miner plus its IPFS document. The RPC
    calls have no retry of their own, so a single dropped connection to the
    public AssetHub node would otherwise fail the whole check; retried once
    here before giving up.
    """
    try:
        items = await asyncio.to_thread(
            fetch_collection_items, address, WUD_MINERS_COLLECTION_ID
        )
    except Exception:
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


async def apply_slot_membership(
    address: str,
    candidate_numbers: tuple[int, ...],
    qualifying_numbers: set[int],
    extra_fields: dict[str, Any],
) -> None:
    """
    Make `unlocked` agree with `qualifying_numbers` for exactly the slots in
    `candidate_numbers`, leaving every other slot number in the array alone.

    The fast-slot pass and the star-slot pass each own a disjoint slice of
    slot numbers (evaluate_fast_slots never decides a star slot and vice
    versa). Writing through $pull/$addToSet scoped to just its own slice,
    instead of overwriting the whole array from a locally-held snapshot,
    means the two passes can run concurrently - the page's own background
    star check overlapping a Reload click, for instance - without one
    silently discarding a slot number the other just confirmed. That used to
    be possible: both passes read the full stored array, recomputed the
    whole thing including the other pass's slots from whatever was cached
    at that moment, and blindly `$set` it back - so whichever write landed
    second could revert a slot the other had only just correctly unlocked.
    """
    db = get_database()
    now = datetime.now(timezone.utc)
    stamp = {"layout_version": SLOT_LAYOUT_VERSION, "updated_at": now, **extra_fields}
    qualifying_numbers = qualifying_numbers & set(candidate_numbers)
    to_remove = [n for n in candidate_numbers if n not in qualifying_numbers]

    # $pull and $addToSet cannot target the same field in one update, so a
    # pass that both drops and gains slot numbers needs two round trips.
    if to_remove:
        await db.soul_slots.update_one(
            {"address": address},
            {
                "$pull": {"unlocked": {"$in": to_remove}},
                "$set": stamp,
                "$setOnInsert": {"address": address},
            },
            upsert=True,
        )
    if qualifying_numbers:
        await db.soul_slots.update_one(
            {"address": address},
            {
                "$addToSet": {"unlocked": {"$each": sorted(qualifying_numbers)}},
                "$set": stamp,
                "$setOnInsert": {"address": address},
            },
            upsert=True,
        )
    if not to_remove and not qualifying_numbers:
        # Neither branch above ran, so the freshness stamp (and, for a
        # wallet seen for the first time, the record itself) still needs
        # writing even though membership didn't change.
        await db.soul_slots.update_one(
            {"address": address},
            {"$set": stamp, "$setOnInsert": {"address": address, "unlocked": []}},
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


def should_recheck_stars(stored: Optional[dict], roll: Optional[float] = None) -> bool:
    """
    Whether to run the slow star pass this request.

    Deliberately tracked by its own timestamp (stars_checked_at) rather than
    by whether a star count is already stored: a count of 37, or even 0, is
    still a valid previous result, and "we have a number" is not the same
    question as "is it time to check again". Conflating the two meant a
    wallet's stars were checked exactly once, ever, and every login after
    that - including a forced reload - silently reused that first number
    forever, because the client only re-fetches stars when it sees none
    stored at all.
    """
    if not stored or "stars_checked_at" not in stored:
        return True
    if stored.get("layout_version") != SLOT_LAYOUT_VERSION:
        return True
    roll = random.random() if roll is None else roll
    return roll < REVERIFY_PROBABILITY


async def resolve_fast_slots(
    address: str, roll: Optional[float] = None, force: bool = False
) -> dict:
    """
    The non-star slot state for `address`, from cache or a fresh lookup.

    Returns {"unlocked": [...], "checked": bool, "stars": float|None,
    "token_progress": [...], "stars_pending": bool}. `checked` is False
    whenever the live lookup
    could not run (no Subscan key configured, or the API is unreachable).
    What happens to the fast slots in that case depends on whether this was
    a passive check or an explicit Reload (`force`):

      * Passive - the fast slots are left exactly as already stored, since
        there is nothing to verify them against and a routine page load
        should not flicker a wallet's confirmed slots back to locked over a
        transient hiccup.
      * Forced - the player explicitly asked for a fresh answer and none
        could be produced, so pretending the old cached result is still
        good would be misleading. The fast slots reset to just the free
        slot, the same as a wallet that has never been checked at all.

    A forced reload additionally clears the *star* slots up front, because
    it always schedules a fresh star check (stars_pending is necessarily
    true at roll 0). Without that, the stored star slots would come straight
    back in this response and light slots 9/10 up again for the seconds
    until the slow check finishes - which is exactly the flash of
    still-unverified state Reload is meant to clear. They are re-earned
    only by resolve_star_slots actually completing.

    Apart from that deliberate clear, each write only ever touches its own
    slice of slot numbers (see apply_slot_membership), so the fast and star
    passes cannot clobber one another whatever order they complete in.
    `unlocked` in the return value is always read back from the stored
    record after writing, so it reflects the star pass's latest result too,
    not just what this pass itself just decided. `stars_pending` tells the
    caller whether the slow star pass should run this request; it shares
    the fast slots' roll, so on the rare login that reverifies at all, it
    reverifies everything at once rather than ageing the two independently.
    """
    stored = await get_stored_slots(address)
    effective_roll = random.random() if roll is None else roll
    stars_pending = should_recheck_stars(stored, effective_roll)

    default_progress = [0.0] * len(TOKEN_SLOT_NUMBERS)

    if not should_reverify(stored, effective_roll):
        return {
            "unlocked": stored.get("unlocked", list(FREE_SLOT_NUMBERS)),
            "stars": stored.get("stars"),
            "token_progress": stored.get("token_progress", default_progress),
            "checked": True,
            "cached": True,
            "stars_pending": stars_pending,
        }

    result = await evaluate_fast_slots(address)
    checked = result is not None

    if checked:
        unlocked, token_progress = result
        await apply_slot_membership(
            address,
            FAST_SLOT_NUMBERS,
            set(unlocked),
            {
                "tokens_checked_at": datetime.now(timezone.utc),
                "token_progress": token_progress,
            },
        )
    elif force:
        # Explicit Reload, but the lookup could not run at all - reset to
        # just the free slot rather than go on reporting a stale prior
        # result as if it were the fresh answer the player asked for.
        await apply_slot_membership(
            address, FAST_SLOT_NUMBERS, set(FREE_SLOT_NUMBERS),
            {"token_progress": default_progress},
        )
    # else: passive load, lookup unavailable - leave the stored fast slots
    # (and their progress) untouched; see the docstring above.

    # Clear the star slots for the duration of the re-check they are about
    # to get, so this response cannot hand back the previous run's result
    # and briefly re-light slots 9/10 before it has actually been redone.
    if force and stars_pending:
        await apply_slot_membership(address, STAR_SLOT_NUMBERS, set(), {"stars": None})

    stored_now = await get_stored_slots(address)
    return {
        "unlocked": stored_now.get("unlocked", list(FREE_SLOT_NUMBERS)) if stored_now else list(FREE_SLOT_NUMBERS),
        "stars": stored_now.get("stars") if stored_now else None,
        "token_progress": stored_now.get("token_progress", default_progress) if stored_now else default_progress,
        "checked": checked,
        "cached": False,
        "stars_pending": stars_pending,
    }


async def resolve_star_slots(address: str) -> dict:
    """
    The star slot state for `address`, always freshly counted.

    The write only ever touches STAR_SLOT_NUMBERS (see
    apply_slot_membership), so it can never affect the fast slots' own
    unlocked state - no read-modify-write over the whole array, so nothing
    here can revert a fast-slot unlock that happened to land while this was
    still walking IPFS. `unlocked` in the return value is read back from the
    stored record after writing, so it reflects the fast pass's latest
    result too, not just the star slots this pass just decided.
    """
    stars, star_slots = await evaluate_star_slots(address)

    await apply_slot_membership(
        address,
        STAR_SLOT_NUMBERS,
        set(star_slots),
        {"stars": stars, "stars_checked_at": datetime.now(timezone.utc)},
    )

    stored_now = await get_stored_slots(address)
    unlocked = stored_now.get("unlocked", list(FREE_SLOT_NUMBERS)) if stored_now else list(FREE_SLOT_NUMBERS)
    return {"unlocked": unlocked, "stars": stars, "checked": True}
