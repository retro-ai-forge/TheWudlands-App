"""
Permanent player registry, backed by the Mongo `players` collection.

Unlike active_players.py (which tracks who's online right now and is
evicted after 8 hours idle via TTL index), documents here have no TTL and
are meant to persist indefinitely - a player's character roster must
survive logout and any amount of time between sessions.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Dict, List, Optional

from pymongo import ReturnDocument

from backend.character import Character
from backend.db import get_database
from backend.resources_catalog import RESOURCE_ITEMS_BY_ID
from backend.processed_catalog import PROCESSED_RESOURCE_ITEMS_BY_ID


@dataclass
class Player:
    """A permanent player record, keyed by wallet address."""

    address: str
    first_login_at: datetime
    characters: List[dict] = field(default_factory=list)
    # Player inventory: tools, raw resources, processed resources, and items
    # shared across every character this player owns, pooled in a shared
    # vault - everything the player owns (that isn't soulbound to a specific
    # character) lives under this one object, not scattered top-level fields.
    inventory: dict = field(default_factory=lambda: {
        "tools": {},
        "resources": {},
        "items": {},
    })

    def to_dict(self) -> dict:
        return {
            "address": self.address,
            "firstLoginAt": self.first_login_at.isoformat(),
            "characters": self.characters,
            "inventory": self.inventory,
        }


def _as_utc(value: datetime) -> datetime:
    """Mongo returns naive UTC datetimes; normalize to timezone-aware."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _doc_to_player(doc: dict) -> Player:
    # Support migration from old "tools" field to new "inventory.tools"
    inventory = doc.get("inventory", {})
    if not inventory and "tools" in doc:
        # Migrate old tools field into new inventory structure
        inventory = {
            "tools": doc.get("tools", {}),
            "resources": {},
            "items": {},
        }

    return Player(
        address=doc["address"],
        first_login_at=_as_utc(doc["first_login_at"]),
        characters=doc.get("characters", []),
        inventory=inventory or {
            "tools": {},
            "resources": {},
            "items": {},
        },
    )


async def get_or_create_player(address: str) -> Player:
    """
    Fetch the permanent record for `address`, creating it on first-ever
    login. Called from the /api/auth/verify flow alongside add_active_player.
    """
    db = get_database()

    doc = await db.players.find_one({"address": address})
    if doc is not None:
        return _doc_to_player(doc)

    doc = {
        "address": address,
        "first_login_at": datetime.now(timezone.utc),
        "characters": [],
        "inventory": {
            "tools": {},
            "resources": {},
            "items": {},
        },
    }
    await db.players.insert_one(doc)
    return _doc_to_player(doc)


async def get_player(address: str) -> Optional[Player]:
    db = get_database()
    doc = await db.players.find_one({"address": address})

    if doc is None:
        return None

    return _doc_to_player(doc)


async def add_character(address: str, character: Character) -> Optional[Player]:
    """
    Append a new character to `address`'s permanent roster. Requires the
    player record to already exist (see get_or_create_player) - returns
    None if it doesn't, same contract as the old active_players.add_character.
    """
    db = get_database()

    doc = await db.players.find_one_and_update(
        {"address": address},
        {"$push": {"characters": character.to_dict()}},
        return_document=ReturnDocument.AFTER,
    )

    if doc is None:
        return None

    return _doc_to_player(doc)


async def delete_character(address: str, character_id: str) -> Optional[Player]:
    """
    Remove one character from `address`'s roster by id. Idempotent - pulling
    a character_id that doesn't match anything just leaves the roster
    unchanged, same as any other $pull. Returns None only if there's no
    player record for `address` at all.
    """
    db = get_database()

    doc = await db.players.find_one_and_update(
        {"address": address},
        {"$pull": {"characters": {"id": character_id}}},
        return_document=ReturnDocument.AFTER,
    )

    if doc is None:
        return None

    return _doc_to_player(doc)


async def update_character_portrait(
    address: str,
    character_id: str,
    portrait_url: str,
    portrait_zoom: float,
    portrait_pan: Dict[str, float],
    portrait_frame_area: Optional[dict],
    portrait_face_area: Optional[dict],
) -> Optional[Player]:
    """
    Overwrite one of `address`'s characters' portrait fields - the standalone
    re-framing editor opened from the character preview page (as opposed to
    the Soul Creation wizard, which sets these once at creation via
    add_character). Returns None if the address/character pair doesn't match
    any player document.
    """
    db = get_database()

    doc = await db.players.find_one_and_update(
        {"address": address, "characters.id": character_id},
        {
            "$set": {
                "characters.$.portraitUrl": portrait_url,
                "characters.$.portraitZoom": portrait_zoom,
                "characters.$.portraitPan": portrait_pan,
                "characters.$.portraitFrameArea": portrait_frame_area,
                "characters.$.portraitFaceArea": portrait_face_area,
            }
        },
        return_document=ReturnDocument.AFTER,
    )

    if doc is None:
        return None

    return _doc_to_player(doc)


def _validate_resource_grant(resource_id: str, amount: int) -> None:
    if resource_id not in RESOURCE_ITEMS_BY_ID and resource_id not in PROCESSED_RESOURCE_ITEMS_BY_ID:
        raise ValueError(f"Unknown resource id: {resource_id}")
    if amount <= 0:
        raise ValueError("amount must be positive")


async def grant_resource(
    address: str, character_id: str, resource_id: str, amount: int
) -> Optional[Player]:
    """
    Credit `amount` of `resource_id` to one of `address`'s characters'
    own stacked resource storage (backpack) - a running total, never
    per-unit item instances. Returns None if the address/character pair
    doesn't match any player document.
    """
    _validate_resource_grant(resource_id, amount)
    db = get_database()

    doc = await db.players.find_one_and_update(
        {"address": address, "characters.id": character_id},
        {"$inc": {f"characters.$.resources.{resource_id}": amount}},
        return_document=ReturnDocument.AFTER,
    )

    if doc is None:
        return None

    return _doc_to_player(doc)


async def grant_shared_resource(address: str, resource_id: str, amount: int) -> Optional[Player]:
    """
    Credit `amount` of `resource_id` to `address`'s shared resource vault -
    pooled storage available to every character that player owns, separate
    from any single character's own resources.
    """
    _validate_resource_grant(resource_id, amount)
    db = get_database()

    doc = await db.players.find_one_and_update(
        {"address": address},
        {"$inc": {f"inventory.resources.{resource_id}": amount}},
        return_document=ReturnDocument.AFTER,
    )

    if doc is None:
        return None

    return _doc_to_player(doc)


# The player's shared tool pool, stacked and checked out/in identically
# across all characters.
_TOOL_POOLS = ("inventory.tools",)


def _validate_tool_pool(pool: str) -> None:
    if pool not in _TOOL_POOLS:
        raise ValueError(f"Unknown tool pool: {pool}")


async def grant_tool(address: str, tool_id: str, amount: int = 1, pool: str = "tools") -> Optional[Player]:
    """
    Credit `amount` of `tool_id` to `address`'s shared tool pool - stacked
    the same way grant_shared_resource stacks resources, since a player can
    own more than one of the same tool (e.g. two anvils).
    """
    _validate_tool_pool(pool)
    if amount <= 0:
        raise ValueError("amount must be positive")
    db = get_database()

    doc = await db.players.find_one_and_update(
        {"address": address},
        {"$inc": {f"{pool}.{tool_id}": amount}},
        return_document=ReturnDocument.AFTER,
    )

    if doc is None:
        return None

    return _doc_to_player(doc)


async def check_out_tool(
    address: str, character_id: str, tool_id: str, amount: int = 1, pool: str = "tools"
) -> Optional[Player]:
    """
    Move `amount` of `tool_id` from `address`'s shared tool pool onto one of
    their characters (Character.tools) - the character now holds it, so
    it's unavailable to the player's other characters until checked back in.
    Requires the pool to actually have `amount` available; returns None if
    the address/character pair doesn't match any player document OR the pool
    doesn't have enough (same "no match" signal as the other grant/spend
    functions here - callers distinguish the two by re-fetching if needed).
    """
    _validate_tool_pool(pool)
    if amount <= 0:
        raise ValueError("amount must be positive")
    db = get_database()

    # `pool` (e.g. "inventory.tools") is where the player's own shared pool
    # lives, but a character's own tools are stored flatly as Character.tools
    # ("tools", never nested under "inventory") - the two sides of this
    # transfer are NOT the same path.
    doc = await db.players.find_one_and_update(
        {"address": address, "characters.id": character_id, f"{pool}.{tool_id}": {"$gte": amount}},
        {"$inc": {f"{pool}.{tool_id}": -amount, f"characters.$.tools.{tool_id}": amount}},
        return_document=ReturnDocument.AFTER,
    )

    if doc is None:
        return None

    return _doc_to_player(doc)


async def check_in_tool(
    address: str, character_id: str, tool_id: str, amount: int = 1, pool: str = "tools"
) -> Optional[Player]:
    """
    The reverse of check_out_tool: move `amount` of `tool_id` from one of
    `address`'s characters back into the shared tool pool. Requires that
    character to actually be holding `amount`.
    """
    _validate_tool_pool(pool)
    if amount <= 0:
        raise ValueError("amount must be positive")
    db = get_database()

    # Same path asymmetry as check_out_tool: the character side is always
    # flat "tools", regardless of what `pool` names on the player's own side.
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {"$elemMatch": {"id": character_id, f"tools.{tool_id}": {"$gte": amount}}},
        },
        {"$inc": {f"{pool}.{tool_id}": amount, f"characters.$.tools.{tool_id}": -amount}},
        return_document=ReturnDocument.AFTER,
    )

    if doc is None:
        return None

    return _doc_to_player(doc)


async def check_out_resource(
    address: str, character_id: str, resource_id: str, amount: int = 1
) -> Optional[Player]:
    """
    Move `amount` of `resource_id` from `address`'s shared inventory
    (inventory.resources - raw and processed pooled together, same as
    Character.resources) onto one of their characters' own resources - the
    resource equivalent of check_out_tool. Requires the pool to actually
    have `amount` available.
    """
    _validate_resource_grant(resource_id, amount)
    db = get_database()

    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters.id": character_id,
            f"inventory.resources.{resource_id}": {"$gte": amount},
        },
        {"$inc": {
            f"inventory.resources.{resource_id}": -amount,
            f"characters.$.resources.{resource_id}": amount,
        }},
        return_document=ReturnDocument.AFTER,
    )

    if doc is None:
        return None

    return _doc_to_player(doc)


async def check_in_resource(
    address: str, character_id: str, resource_id: str, amount: int = 1
) -> Optional[Player]:
    """
    The reverse of check_out_resource: move `amount` of `resource_id` from
    one of `address`'s characters' own resources back into the shared
    inventory's resources pool. Requires that character to actually be
    holding `amount`.
    """
    _validate_resource_grant(resource_id, amount)
    db = get_database()

    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {
                "$elemMatch": {"id": character_id, f"resources.{resource_id}": {"$gte": amount}}
            },
        },
        {"$inc": {
            f"inventory.resources.{resource_id}": amount,
            f"characters.$.resources.{resource_id}": -amount,
        }},
        return_document=ReturnDocument.AFTER,
    )

    if doc is None:
        return None

    return _doc_to_player(doc)
