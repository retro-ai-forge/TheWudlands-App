"""
Permanent player registry, backed by the Mongo `players` collection.

Unlike active_players.py (which tracks who's online right now and is
evicted after 8 hours idle via TTL index), documents here have no TTL and
are meant to persist indefinitely - a player's character roster must
survive logout and any amount of time between sessions.
"""

from __future__ import annotations

import json
import math
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional

from pymongo import ReturnDocument

from backend import items_catalog, recycling
from backend.character import Character
from backend.db import get_database
from backend.resources_catalog import RESOURCE_ITEMS, RESOURCE_ITEMS_BY_ID, PROFESSION_RESOURCE_FAMILIES
from backend.processed_catalog import PROCESSED_RESOURCE_ITEMS, PROCESSED_RESOURCE_ITEMS_BY_ID
from backend.tools_catalog import TOOL_ITEMS_BY_ID
from backend.professions_catalog import PROFESSION_CATEGORIES

_RECIPES_PATH = Path(__file__).resolve().parent / "data" / "craft-recipes.json"


def _load_recipes() -> dict[str, dict]:
    data = json.loads(_RECIPES_PATH.read_text())
    return {row["familyId"]: row for row in data}


# Loaded once at import time, same pattern as the other catalog modules.
_RECIPES_BY_FAMILY: dict[str, dict] = _load_recipes()

# (familyId, tier) -> concrete resource/processed id, resolved once at import
# time the same way items_catalog.FINAL_ITEM_ROWS_BY_FAMILY_TIER resolves
# crafted-output rows - craft-recipes.json ingredients reference a family+tier,
# never a concrete id directly.
_RAW_ID_BY_FAMILY_TIER: dict[tuple[str, int], str] = {
    (item.family_id, item.tier): item.id for item in RESOURCE_ITEMS
}
_PROCESSED_ID_BY_FAMILY_TIER: dict[tuple[str, int], str] = {
    (item.family_id, item.tier): item.id for item in PROCESSED_RESOURCE_ITEMS
}


def _load_blueprint_ids() -> dict[tuple[str, int], str]:
    path = Path(__file__).resolve().parent / "data" / "base-blueprint.json"
    data = json.loads(path.read_text())
    return {(row["familyId"], row["tier"]): row["id"] for row in data}


# A recipe's blueprintFamilyId (when set) gates crafting on the character
# having learned that blueprint - resolved the same family+tier -> concrete
# id way as ingredients and outputs.
_BLUEPRINT_ID_BY_FAMILY_TIER: dict[tuple[str, int], str] = _load_blueprint_ids()

# Blueprints span tiers 1-6, same as every other tiered catalog.
_BLUEPRINT_MAX_TIER = 6


def _owns_blueprint_at_or_above(character: dict, blueprint_family_id: str, tier: int) -> bool:
    """
    A blueprint learned at `tier` or higher satisfies crafting at `tier` -
    a character who's learned the more advanced version of a recipe
    already knows how to make the simpler one too, same "any tier works,
    no minimum" rule _resolve_tool_for_craft already applies to tools.
    Checks every tier from `tier` up to the highest one that exists for
    this family, not just an exact match.
    """
    owned = character.get("blueprints", [])
    for t in range(tier, _BLUEPRINT_MAX_TIER + 1):
        blueprint_id = _BLUEPRINT_ID_BY_FAMILY_TIER.get((blueprint_family_id, t))
        if blueprint_id is not None and blueprint_id in owned:
            return True
    return False


@dataclass
class Player:
    """A permanent player record, keyed by wallet address."""

    address: str
    first_login_at: datetime
    characters: List[dict] = field(default_factory=list)
    # Crafting-only shared pool: raw/processed resources and tools, drawn on
    # by start_craft to stage an active craft (see Character.crafting for
    # the per-character staging side of that same transfer). Never holds a
    # finished item - that's vault's job.
    crafting: dict = field(default_factory=lambda: {
        "resources": {},
        "tools": {},
    })
    # Everything the player owns that isn't a raw/processed material and
    # isn't soulbound to a specific character: unassigned item instances
    # (location:"pool") and finished-good balances (food, potions, misc
    # trinkets), pooled across every character this player owns.
    vault: dict = field(default_factory=lambda: {
        "items": [],
        "itemBalances": {},
    })

    def to_dict(self) -> dict:
        return {
            "address": self.address,
            "firstLoginAt": self.first_login_at.isoformat(),
            "characters": self.characters,
            "crafting": self.crafting,
            "vault": self.vault,
        }


def _as_utc(value: datetime) -> datetime:
    """Mongo returns naive UTC datetimes; normalize to timezone-aware."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _doc_to_player(doc: dict) -> Player:
    crafting = doc.get("crafting") or {"resources": {}, "tools": {}}
    crafting.setdefault("resources", {})
    crafting.setdefault("tools", {})

    vault = doc.get("vault") or {"items": [], "itemBalances": {}}
    if not isinstance(vault.get("items"), list):
        vault["items"] = []
    vault.setdefault("itemBalances", {})

    characters = doc.get("characters", [])
    for character in characters:
        # Computed, not stored - items_catalog.backpack_slots_used/
        # backpack_capacity read straight off this same character dict's
        # own gear/attr fields every time, so these two are always in sync
        # with whatever else changed in this response. Read by the
        # frontend's "Filled: X/Y" line on any backpack-family item's own
        # popup (BodyTab/CampView) - character-level, not tied to which
        # specific backpack instance was clicked, since backpack storage
        # itself is (see Character.gear's own docstring).
        character.setdefault("gear", {})
        character["gear"]["backpackSlotsUsed"] = items_catalog.backpack_slots_used(character)
        character["gear"]["backpackCapacity"] = items_catalog.backpack_capacity(character)

    return Player(
        address=doc["address"],
        first_login_at=_as_utc(doc["first_login_at"]),
        characters=characters,
        crafting=crafting,
        vault=vault,
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
        "crafting": {"resources": {}, "tools": {}},
        "vault": {"items": [], "itemBalances": {}},
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


_PRIME_PROFESSION_SLOTS = ("prof1", "prof2", "prof3", "none")


async def set_prime_profession(address: str, character_id: str, slot: str) -> Optional[Player]:
    """
    Sets which profession slot ("prof1"|"prof2"|"prof3", or "none" to
    clear) is this character's prime profession - the sole slot that
    receives final-item assembly-bonus XP on finishing a blueprint-gated
    item (see finish_craft). Raises ValueError for an unrecognized slot
    name, or for a real slot ("prof1".."prof3") that doesn't actually have
    a profession assigned (character.profession.profN == "none") - nothing
    to mark prime there. Returns None if the address/character pair
    doesn't match any player document.
    """
    if slot not in _PRIME_PROFESSION_SLOTS:
        raise ValueError(f"Unknown profession slot: {slot}")
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None
    if slot != "none":
        prof_field = {"prof1": "prof1", "prof2": "prof2", "prof3": "prof3"}[slot]
        if character.get("profession", {}).get(prof_field, "none") == "none":
            raise ValueError(f"Character has no profession assigned to {slot}")

    doc = await db.players.find_one_and_update(
        {"address": address, "characters.id": character_id},
        {"$set": {"characters.$.profession.prime": slot}},
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
        {"$inc": {f"characters.$.crafting.resources.{resource_id}": amount}},
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
        {"$inc": {f"crafting.resources.{resource_id}": amount}},
        return_document=ReturnDocument.AFTER,
    )

    if doc is None:
        return None

    return _doc_to_player(doc)


# The player's shared tool pool, stacked and checked out/in identically
# across all characters.
_TOOL_POOLS = ("crafting.tools",)


def _validate_tool_pool(pool: str) -> None:
    if pool not in _TOOL_POOLS:
        raise ValueError(f"Unknown tool pool: {pool}")


async def grant_tool(address: str, tool_id: str, amount: int = 1, pool: str = "crafting.tools") -> Optional[Player]:
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


async def check_in_tool(
    address: str, character_id: str, tool_id: str, amount: int = 1, pool: str = "crafting.tools"
) -> Optional[Player]:
    """
    Move `amount` of `tool_id` from one of `address`'s characters back into
    the shared tool pool. Requires that character to actually be holding
    `amount`, and that it has no in-progress craft - whatever start_craft
    staged there is locked for the crafting duration; pulling it back out
    from under an active craft would leave finish_craft unable to find it.
    The only direction this moves in now - a character's own tools are a
    temporary crafting-session staging area (populated by start_craft,
    never by a direct player-initiated transfer), so there's no
    check_out_tool counterpart; this stays as the drain path for whatever a
    finished craft left behind, or old data.
    """
    _validate_tool_pool(pool)
    if amount <= 0:
        raise ValueError("amount must be positive")
    db = get_database()

    # `pool` (e.g. "crafting.tools") is the player's own shared pool, but a
    # character's own tools are always stored flatly as Character.tools
    # ("tools", never nested under "inventory") - the two sides of this
    # transfer are NOT the same path.
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {
                "$elemMatch": {
                    "id": character_id,
                    f"crafting.tools.{tool_id}": {"$gte": amount},
                    "$or": [{"crafting.activeCraft": {"$exists": False}}, {"crafting.activeCraft": None}],
                }
            },
        },
        {"$inc": {f"{pool}.{tool_id}": amount, f"characters.$.crafting.tools.{tool_id}": -amount}},
        return_document=ReturnDocument.AFTER,
    )

    if doc is None:
        return None

    return _doc_to_player(doc)


async def check_in_resource(
    address: str, character_id: str, resource_id: str, amount: int = 1
) -> Optional[Player]:
    """
    Move `amount` of `resource_id` from one of `address`'s characters' own
    resources back into the shared inventory's resources pool. Requires
    that character to actually be holding `amount`, and that it has no
    in-progress craft - same reasoning as check_in_tool: pulling staged
    materials back out from under an active craft would leave finish_craft
    unable to find what start_craft transferred. The only direction this
    moves in now - a character's own resources are a temporary
    crafting-session staging area, not somewhere a player parks materials
    directly.
    """
    _validate_resource_grant(resource_id, amount)
    db = get_database()

    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {
                "$elemMatch": {
                    "id": character_id,
                    f"crafting.resources.{resource_id}": {"$gte": amount},
                    "$or": [{"crafting.activeCraft": {"$exists": False}}, {"crafting.activeCraft": None}],
                }
            },
        },
        {"$inc": {
            f"crafting.resources.{resource_id}": amount,
            f"characters.$.crafting.resources.{resource_id}": -amount,
        }},
        return_document=ReturnDocument.AFTER,
    )

    if doc is None:
        return None

    return _doc_to_player(doc)


async def check_out_resource_to_backpack(
    address: str, character_id: str, resource_id: str, amount: int = 1
) -> Optional[Player]:
    """
    Move `amount` of `resource_id` straight from the player's own shared
    crafting stock (crafting.resources - the same pool check_in_resource
    empties into, shown as "Party's Resources") into one of their
    characters' own backpack (gear.resources.backpack) - physically
    packing shared materials for that character to carry into an
    adventure. Deliberately skips the character's own crafting.resources
    entirely (that pool is populated exclusively by start_craft - see
    check_in_resource's own docstring - not somewhere a direct transfer
    should park materials even in passing). Capacity-gated exactly like
    load_resource_to_backpack (same marginal-slot math, never a partial
    fill) - this is the direct-to-backpack replacement for the old
    check_out_resource (shared -> character's own vault), removed when the
    character-level crafting vault itself went away.

    Raises ValueError if the character has no backpack equipped, or the
    backpack doesn't have room for the whole amount. Returns None if the
    shared pool doesn't hold `amount`, or the address/character pair
    doesn't match.
    """
    _validate_resource_grant(resource_id, amount)
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None
    if doc.get("crafting", {}).get("resources", {}).get(resource_id, 0) < amount:
        return None

    capacity = items_catalog.backpack_capacity(character)
    if capacity == 0:
        raise ValueError("No backpack equipped")
    used = items_catalog.backpack_slots_used(character)
    marginal = _resource_marginal_backpack_slots(character, {resource_id: amount})
    if used + marginal > capacity:
        raise ValueError("Backpack is full")

    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters.id": character_id,
            f"crafting.resources.{resource_id}": {"$gte": amount},
        },
        {"$inc": {
            f"crafting.resources.{resource_id}": -amount,
            f"characters.$.gear.resources.backpack.{resource_id}": amount,
        }},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def preview_recycle(
    address: str, character_id: str, item_id: str, count: int = 1, from_vault: bool = False
) -> Optional[List[recycling.RawMaterialRecovery]]:
    """
    Read-only: what recycling `count` unit(s) of concrete item `item_id`
    would hand back, using `character_id`'s own profession/tool/charm
    either way - but the station-tool bonus itself depends on `from_vault`,
    same restriction recycle_item_instance/recycle_item_balance actually
    enforce: recycling something off the character's own body/backpack
    (from_vault=False) can only draw on tools the character is physically
    carrying (character.tools) - never the player's shared pool, sitting
    back at the vault. Recycling a vault item (from_vault=True) can use
    that full shared pool too, since the character is right there at the
    vault already. Returns None if the address/character pair doesn't
    match; raises ValueError for an item id with no catalog entry or whose
    family has no recipe.
    """
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None
    entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(item_id)
    if entry is None:
        raise ValueError(f"Unknown item id: {item_id}")
    player_tools = doc.get("crafting", {}).get("tools", {}) if from_vault else {}
    player_items = doc.get("vault", {}).get("items", []) if from_vault else []
    recoveries = recycling.resolve_recycle_preview(
        entry.family_id, entry.tier, character, player_tools, player_items, count
    )
    if not recoveries:
        raise ValueError(f"{entry.family_id} has no recipe to recycle materials from")
    return recoveries


def _resource_marginal_backpack_slots(character: dict, amounts: Dict[str, int]) -> int:
    """
    Extra backpack slots the whole `amounts` batch (potentially several raw/
    processed material ids at once, from one recycle) would cost on top of
    whatever's already packed - same ceil(new/stack_size) - ceil(existing/
    stack_size) math load_resource_to_backpack uses per id, just summed
    across every id recycling handed back in one go.
    """
    existing_backpack = character.get("gear", {}).get("resources", {}).get("backpack", {})
    total = 0
    for rid, qty in amounts.items():
        stack_size = items_catalog.RAW_STACK_SIZE if rid in RESOURCE_ITEMS_BY_ID else items_catalog.PROCESSED_STACK_SIZE
        existing = existing_backpack.get(rid, 0)
        total += math.ceil((existing + qty) / stack_size) - math.ceil(existing / stack_size)
    return total


def _recycle_resource_updates(character: dict, amounts: Dict[str, int], from_vault: bool) -> Dict[str, int]:
    """
    Ready-to-merge $inc fragment for recycling's recovered raw/processed
    materials. Recycling a VAULT item (from_vault=True) credits the
    player's own shared crafting stock directly (top-level crafting.
    resources - the same "Party's Resources" pool check_in_resource moves
    into) since there's no specific character standing there to hand
    physically-carried materials to. Recycling something a character is
    actually carrying (from_vault=False) hands the materials to THAT
    character instead - preferring its own worn backpack when there's
    room for the WHOLE batch (never a partial fill - same all-or-nothing
    rule load_resource_to_backpack itself enforces), then a mount's
    saddlepack (uncapped, no slot system of its own), and only camp
    (also uncapped) when neither is equipped or the backpack has no room
    left - so recycling never fails or discards materials just because
    nothing's currently worn to carry them in, or what's worn is full.
    """
    if from_vault:
        return {f"crafting.resources.{rid}": qty for rid, qty in amounts.items()}

    bucket = "camp"
    if items_catalog.has_backpack_equipped(character):
        capacity = items_catalog.backpack_capacity(character)
        used = items_catalog.backpack_slots_used(character)
        if used + _resource_marginal_backpack_slots(character, amounts) <= capacity:
            bucket = "backpack"
        elif items_catalog.has_saddlepack_equipped(character):
            bucket = "saddlepack"
    elif items_catalog.has_saddlepack_equipped(character):
        bucket = "saddlepack"
    return {f"characters.$.gear.resources.{bucket}.{rid}": qty for rid, qty in amounts.items()}


async def recycle_item_instance(
    address: str, character_id: str, instance_id: str, from_vault: bool = False
) -> Optional[Player]:
    """
    Break one item instance down into a fraction of its recipe's raw-
    material chain (backend.recycling), using `character_id`'s own
    profession/skill and worn charm either way - but NOT the same tool
    access. `from_vault=False` (default) recycles one of the CHARACTER's
    own instances (backpack or body - not "crafting", which is borrowed
    for an in-progress craft), scored using only tools physically carried
    (character.tools, never the player's shared pool). `from_vault=True`
    recycles one of the PLAYER's shared pool instances instead, scored
    with the full shared tool pool too (the character is right there at
    the vault). Where the recovered materials land depends on which of
    those two: a vault item's materials go straight into the player's own
    shared crafting stock (crafting.resources, same pool "Party's
    Resources" reads); a character-carried item's materials go to THAT
    character instead, into whichever of its own gear.resources buckets
    it can actually carry them in right now (see
    _recycle_resource_updates).

    Raises ValueError if the item's family has no recipe. Returns None if
    no matching instance exists in the searched location, or the address/
    character pair doesn't match.
    """
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None

    if from_vault:
        instance = next(
            (i for i in doc.get("vault", {}).get("items", []) if i["instanceId"] == instance_id),
            None,
        )
    else:
        instance = next(
            (
                i for i in character.get("gear", {}).get("items", [])
                if i["instanceId"] == instance_id and i.get("location") in ("backpack", "body", "camp", "saddlepack")
            ),
            None,
        )
    if instance is None:
        return None

    entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(instance["itemId"])
    if entry is None:
        raise ValueError(f"Unknown item id: {instance['itemId']}")

    # Off the character's own body/backpack: only tools physically carried
    # (character.tools, or an owned instance in character.items) count
    # toward the station-tool bonus - never the player's shared pool,
    # sitting back at the vault. A vault item is recycled right there at
    # the vault, so the full shared pool applies.
    player_tools = doc.get("crafting", {}).get("tools", {}) if from_vault else {}
    player_items = doc.get("vault", {}).get("items", []) if from_vault else []
    recoveries = recycling.resolve_recycle_preview(
        entry.family_id, entry.tier, character, player_tools, player_items
    )
    if not recoveries:
        raise ValueError(f"{entry.family_id} has no recipe to recycle materials from")
    amounts = recycling.flatten_recovery(recoveries)
    inc_ops = _recycle_resource_updates(character, amounts, from_vault)

    if from_vault:
        update: Dict[str, object] = {"$pull": {"vault.items": {"instanceId": instance_id}}}
        if inc_ops:
            update["$inc"] = inc_ops
        doc = await db.players.find_one_and_update(
            {
                "address": address,
                "characters.id": character_id,
                "vault.items": {"$elemMatch": {"instanceId": instance_id, "location": "pool"}},
            },
            update,
            return_document=ReturnDocument.AFTER,
        )
    else:
        # Two sequential updates rather than one combined $pull+$inc - both
        # would share the same bare positional "$" (resolved off this same
        # "characters" $elemMatch), an operator combination not otherwise
        # exercised elsewhere in this file. Every OTHER bare-"$" $inc in
        # this module (see check_out_resource_to_backpack) is either alone
        # in its own update or paired only with another $inc, never a
        # $pull on a different subfield of the same matched element - given
        # this environment's MongoDB-compatible backend's documented history
        # of silently dropping one half of a combined update under subtler
        # conditions than that (see finish_craft's own two-phase workaround
        # for $pull+$set), crediting the recovered materials as its own
        # separate call is the safe option rather than trusting this
        # untested combination.
        doc = await db.players.find_one_and_update(
            {
                "address": address,
                "characters": {
                    "$elemMatch": {
                        "id": character_id,
                        "gear.items": {"$elemMatch": {"instanceId": instance_id, "location": instance["location"]}},
                    }
                },
            },
            {"$pull": {"characters.$.gear.items": {"instanceId": instance_id}}},
            return_document=ReturnDocument.AFTER,
        )
        if doc is not None and inc_ops:
            doc = await db.players.find_one_and_update(
                {"address": address, "characters.id": character_id},
                {"$inc": inc_ops},
                return_document=ReturnDocument.AFTER,
            )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def recycle_item_balance(
    address: str, character_id: str, item_id: str, amount: int = 1, from_vault: bool = False, location: str = "camp"
) -> Optional[Player]:
    """
    The item_balances/itemBalances equivalent of recycle_item_instance -
    same from_vault split for which pool `amount` is consumed FROM
    (character's own gear.itemBalances.{location} vs. the player's shared
    vault.itemBalances), for stackable finished goods (food, potions, misc
    trinkets) rather than instance-tracked gear. `location` ("camp" or
    "backpack") is ignored when from_vault - it only matters for picking
    which of the character's own two itemBalances buckets to deduct from,
    matching whichever one the popup that triggered this actually opened
    on (see ItemDetailPopup's own `location` prop). Where the recovered
    materials land follows the same from_vault split as
    recycle_item_instance (see _recycle_resource_updates) - independent of
    which bucket the source amount came out of.
    Raises ValueError for a non-positive amount, an unknown item id, or a
    family with no recipe. Returns None if `amount` isn't held wherever
    this looks.
    """
    if amount <= 0:
        raise ValueError("amount must be positive")

    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None

    if from_vault:
        held = doc.get("vault", {}).get("itemBalances", {}).get(item_id, 0)
    else:
        held = character.get("gear", {}).get("itemBalances", {}).get(location, {}).get(item_id, 0)
    if held < amount:
        return None

    entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(item_id)
    if entry is None:
        raise ValueError(f"Unknown item id: {item_id}")

    # Same physically-carried-tools-only restriction as recycle_item_instance.
    player_tools = doc.get("crafting", {}).get("tools", {}) if from_vault else {}
    player_items = doc.get("vault", {}).get("items", []) if from_vault else []
    recoveries = recycling.resolve_recycle_preview(
        entry.family_id, entry.tier, character, player_tools, player_items, amount
    )
    if not recoveries:
        raise ValueError(f"{entry.family_id} has no recipe to recycle materials from")
    amounts = recycling.flatten_recovery(recoveries)
    resource_inc_ops = _recycle_resource_updates(character, amounts, from_vault)

    if from_vault:
        update: Dict[str, object] = {"$inc": {f"vault.itemBalances.{item_id}": -amount, **resource_inc_ops}}
        doc = await db.players.find_one_and_update(
            {"address": address, "characters.id": character_id, f"vault.itemBalances.{item_id}": {"$gte": amount}},
            update,
            return_document=ReturnDocument.AFTER,
        )
    else:
        update = {"$inc": {f"characters.$.gear.itemBalances.{location}.{item_id}": -amount, **resource_inc_ops}}
        doc = await db.players.find_one_and_update(
            {
                "address": address,
                "characters": {
                    "$elemMatch": {"id": character_id, f"gear.itemBalances.{location}.{item_id}": {"$gte": amount}}
                },
            },
            update,
            return_document=ReturnDocument.AFTER,
        )
    if doc is None:
        return None
    return _doc_to_player(doc)


def _instance_tier(instance: dict) -> Optional[int]:
    """An item instance's own tier, resolved from its stored itemId via
    items_catalog.ITEM_CATALOG_ENTRIES_BY_ID - None if somehow not found
    in the catalog (never blocks a match on its own; only used where a
    tier requirement is being actively checked)."""
    entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(instance.get("itemId"))
    return entry.tier if entry else None


def _resolve_tool_for_craft(
    character: dict,
    player_tools: Dict[str, int],
    tool_families: List[str],
    tier: int,
    check_character_flat_balance: bool = True,
    player_items: Optional[List[dict]] = None,
) -> Optional[tuple]:
    """
    For a recipe's tool alternatives, find one `character` can use.

    An instance-tracked tool-weapon (a needsItemDefinition:true family like
    axe_stone that doubles as a tool) always gets physically MOVED onto
    Character.items with location:"crafting" for the duration - visibly
    listed in the character's own crafting section, and gone from wherever
    it was (never in the player vault, never sitting in the character's own
    backpack/equip listing while in use - see start_craft/finish_craft).
    Never backpack-capacity-gated: "crafting" is a distinct location from
    "backpack", so borrowing doesn't compete for pack space. Source
    priority, only meaningful when `player_items` is given (the player's
    shared vault.items pool - only start_craft passes this): the vault
    is checked FIRST (an unassigned copy sitting there is fair game, and
    freeing it up for this craft doesn't cost the character anything they
    were using), the character's own backpack/equipped instance SECOND (so
    an axe already in hand only gets pulled if the vault has no spare).
    `player_items` left None (finish_craft's re-verification, and every
    ingredient-level "final"/unconsumed alternative check via
    _resolve_ingredient_option) means only the character's own items count.
    Unlike a flat-balance tool (see below), an instance-tracked one must be
    at LEAST `tier` - only candidates meeting that are ever considered, so
    a T1 Dagger can't stand in for a T3 recipe's own "tool" requirement,
    matching the recipe viewer's own "missing" cosmetic tag for these
    (ownsFamily's ">= requiredTier" rule) rather than disagreeing with it.

    For an ordinary flat-balance family, crafting only ever checks the
    player's shared vault (same "character vault is a temporary staging
    area, not a persistent balance" reasoning as resources) - unless
    `check_character_flat_balance` is left True, which also accepts one
    already sitting in Character.tools; finish_craft uses that to
    re-verify what start_craft transferred is still there, passing
    `player_tools={}` so it can only ever find it on the character. A
    flat-balance tool (an anvil, a furnace, ...) is generic work
    infrastructure, not personal gear that scales with the item being
    made - ANY tier satisfies ANY recipe tier here, no minimum at all.

    Returns `("instance_move", instance_id, source, slot_ref)` for an
    instance-tracked tool that needs moving to "crafting" - `source` is
    "pool" (came from the shared vault) or "backpack"/"body" (came from the
    character's own gear, `slot_ref` carrying whatever it was equipped into
    so finish_craft can restore it exactly; `slot_ref` is `[]` for "pool"
    and "backpack" sources). Returns `("owned", None)` for a flat balance
    already on the character (only when `check_character_flat_balance`) -
    nothing to move, it's already exactly where it needs to be. Returns
    `("flat_transfer", concrete_id)` if a flat-balance tool is only
    available in `player_tools` and would need transferring first. Returns
    None if nothing usable is found anywhere.
    """
    held_tools = character.get("crafting", {}).get("tools", {})
    held_items = character.get("gear", {}).get("items", []) or []

    # Tried in the order `tool_families` lists them - craft-recipes.json's
    # own multi-option "tool" lists (e.g. fishing_pole's
    # ["axe_stone", "dagger", "axe"]) are curated cheapest-full-raw-chain-
    # cost-first, so a plain first-match walk already reaches for the
    # cheap Stone Axe before the moderately-priced Dagger before the
    # expensive Axe. Keep new multi-option "tool" lists in that same
    # cheapest-first order when adding one.
    for family_id in tool_families:
        family = items_catalog.ITEM_FAMILIES_BY_ID.get(family_id)
        if family and family.needs_item_definition:
            # Already staged for THIS craft (finish_craft's re-verification,
            # after start_craft already moved it to "crafting") - present
            # and nothing further to do, same "owned" tag the flat-balance
            # branch uses for "already fine as-is". No tier re-check needed:
            # start_craft already verified this exact instance met the
            # requirement before moving it here.
            if any(
                instance.get("familyId") == family_id and instance.get("location") == "crafting"
                for instance in held_items
            ):
                return ("owned", None)
            # When more than one instance of this family qualifies (e.g. two
            # owned daggers, one of them too low tier), always pick the
            # WORST-quality one AMONG THOSE AT OR ABOVE `tier` - crafting
            # wears down whichever eligible tool/weapon is already the most
            # beat-up first, rather than spreading wear evenly or grabbing
            # whichever happens to sort first, so a fresh one stays fresh
            # until the worn one is actually used up. A too-low-tier
            # instance is filtered out entirely, never picked regardless of
            # quality.
            if player_items:
                pool_candidates = [
                    instance for instance in player_items
                    if instance.get("familyId") == family_id
                    and instance.get("location") == "pool"
                    and (_instance_tier(instance) or 0) >= tier
                ]
                if pool_candidates:
                    worst = min(pool_candidates, key=lambda i: i.get("quality", 0))
                    return ("instance_move", worst["instanceId"], "pool", [])
            held_candidates = [
                instance for instance in held_items
                if instance.get("familyId") == family_id
                and instance.get("location") in ("backpack", "body", "camp", "saddlepack")
                and (_instance_tier(instance) or 0) >= tier
            ]
            if held_candidates:
                worst = min(held_candidates, key=lambda i: i.get("quality", 0))
                return ("instance_move", worst["instanceId"], worst.get("location"), worst.get("slotRef") or [])
            continue
        if check_character_flat_balance and any(
            held_tools.get(tool.id, 0) > 0 for tool in TOOL_ITEMS_BY_ID.values() if tool.family_id == family_id
        ):
            return ("owned", None)
        for tool in TOOL_ITEMS_BY_ID.values():
            if tool.family_id == family_id and player_tools.get(tool.id, 0) > 0:
                return ("flat_transfer", tool.id)
    return None


def _resolve_tool_instances_for_craft(
    character: dict,
    player_tools: Dict[str, int],
    tool_families: List[str],
    tier: int,
    count: int,
    player_items: List[dict],
) -> Optional[tuple]:
    """
    start_craft's own resolution of the recipe's top-level "tool" field -
    quality-aware and, unlike _resolve_tool_for_craft (used for an
    ingredient-level "final" alternative, which only ever needs a tool
    OWNED, never scaled by count), able to span more than one instance of
    the same family. The recipe's own tool wears down by 1 quality per
    unit actually crafted (see finish_craft), so a single worn instance -
    _resolve_tool_for_craft's own "always pick the worst-quality eligible
    one" choice - might not have enough quality left to cover the whole
    requested `count` on its own.

    When that happens, this keeps pulling the next worst-quality eligible
    instance to make up the shortfall - but ONLY from the SAME source the
    first (worst) one came from (the shared vault pool, or this
    character's own backpack/body/camp/saddlepack - never both in one
    craft, matching _resolve_tool_for_craft's own vault-checked-first
    priority: if the vault has ANY eligible instance, only the vault is
    ever drawn from for this craft, regardless of what the character
    might also be holding). If even every eligible instance in that one
    source together can't cover `count`, the craft proceeds at whatever
    REDUCED count they combined can actually support instead of failing
    outright - "however many the tool(s) on hand can actually do".

    Returns `("flat_transfer", tool_id, count)` for a flat-balance tool
    (never quality-gated, so `count` always comes back unchanged) - only
    ever this shape, never _resolve_tool_for_craft's own "owned" case,
    since start_craft (this function's only caller) never already has one
    sitting on Character.crafting.tools the way that check needs. Returns
    `("instance_moves", [(instance_id, source, slot_ref, wear), ...],
    actual_count)` for an instance-tracked tool - one entry per instance
    actually needed (worst-quality first), each with exactly how much of
    its own quality this batch spends; `actual_count` is `count` itself
    unless quality forced it down. Returns None if nothing usable exists
    at all (same failure the caller already returns None for), the same
    as _resolve_tool_for_craft.
    """
    held_items = character.get("gear", {}).get("items", []) or []

    for family_id in tool_families:
        family = items_catalog.ITEM_FAMILIES_BY_ID.get(family_id)
        if family and family.needs_item_definition:
            pool_candidates = [
                instance for instance in player_items
                if instance.get("familyId") == family_id
                and instance.get("location") == "pool"
                and (_instance_tier(instance) or 0) >= tier
            ]
            if pool_candidates:
                candidates, from_pool = pool_candidates, True
            else:
                candidates = [
                    instance for instance in held_items
                    if instance.get("familyId") == family_id
                    and instance.get("location") in ("backpack", "body", "camp", "saddlepack")
                    and (_instance_tier(instance) or 0) >= tier
                ]
                from_pool = False
            if not candidates:
                continue

            moves: List[tuple] = []
            remaining = count
            for instance in sorted(candidates, key=lambda i: i.get("quality", 0)):
                if remaining <= 0:
                    break
                available = instance.get("quality", 0)
                if available <= 0:
                    continue
                wear = min(available, remaining)
                source = "pool" if from_pool else instance.get("location")
                slot_ref = [] if from_pool else (instance.get("slotRef") or [])
                moves.append((instance["instanceId"], source, slot_ref, wear))
                remaining -= wear
            if not moves:
                continue
            return ("instance_moves", moves, count - remaining)

        # Flat-balance tool (anvil, furnace, ...) - no quality/wear concept
        # at all, so `count` is never affected by this branch. Mirrors
        # _resolve_tool_for_craft's own flat-balance branch called with
        # check_character_flat_balance=False (start_craft's own usage) -
        # only the player's shared vault.tools pool counts, never
        # Character.crafting.tools directly.
        for tool in TOOL_ITEMS_BY_ID.values():
            if tool.family_id == family_id and player_tools.get(tool.id, 0) > 0:
                return ("flat_transfer", tool.id, count)
    return None


# --- Crafting duration ---
# Pure linear scaling, no floor - one unit's duration is exactly
# CRAFT_SECONDS_PER_RAW times the recipe's own FULL raw-material chain
# total (_resolve_recipe_full_chain_raw_total, below - the same metric
# _assembly_bonus_xp already uses for the README's final-item XP), not
# just its direct ingredients: a recipe built from a lot of raw material
# takes longer to craft than one built from very little, even if most of
# that raw material was actually spent on an earlier processing step. A
# genuinely blueprint-gated recipe's finishing step uses the same rate but
# each unit is capped at CRAFT_BLUEPRINT_MAX_SECONDS so a top-tier item
# doesn't take an absurd real-world duration; an ordinary processing
# recipe's own per-unit time is never capped. `tier` multiplies both the
# per-raw rate AND the blueprint cap linearly - T1 is exactly this base
# rate/cap, T2 is double both, ..., T6 is six times both - a higher tier
# item is both slower per raw material to work AND allowed to take
# proportionally longer at the finishing step before the cap kicks in.
# A batch of `count` units takes exactly `count` times one unit's own
# (tier-scaled, possibly capped) duration - the cap protects one
# absurdly expensive single item, not a big batch of reasonably-priced
# ones. See _craft_duration_seconds.
CRAFT_SECONDS_PER_RAW = 30  # T1: 30s of craft time per raw material in the full chain
CRAFT_BLUEPRINT_MAX_SECONDS = 3600  # T1: 1 hour hard cap per unit on the blueprint finishing time


def _craft_duration_seconds(recipe: dict, family_id: str, tier: int, character: dict, count: int) -> int:
    """
    How long start_craft's timer runs for one call (see the constants
    above) - scaled by this recipe's own full raw-material chain total,
    not just its direct ingredients, then by `tier` (T1 = 1x, T2 = 2x, ...,
    T6 = 6x the base rate and the blueprint cap alike), THEN multiplied by
    `count`: a batch of `count` units takes `count` times as long as
    crafting just one, same as the ingredients themselves already scale
    with count.
    """
    full_chain_total = _resolve_recipe_full_chain_raw_total(family_id, 1, character)
    per_unit_seconds = CRAFT_SECONDS_PER_RAW * tier * full_chain_total
    if recipe.get("blueprintFamilyId"):
        per_unit_seconds = min(per_unit_seconds, CRAFT_BLUEPRINT_MAX_SECONDS * tier)
    return per_unit_seconds * count


# Cumulative "Total XP" needed to REACH each level, 1-30 - index i (0-based)
# holds level (i+1)'s threshold. Mirrors the README's "Class & Profession
# Level Progression" table exactly; that table is the single source of
# truth both here and there - update both together.
_PROFESSION_LEVEL_TOTAL_XP = [
    0, 100, 220, 360, 540, 740, 1000, 1300, 1600, 2100,
    2600, 3200, 4000, 4800, 5900, 7200, 8700, 11000, 13000, 15000,
    19000, 23000, 27000, 33000, 39000, 47000, 57000, 68000, 82000, 100000,
]


def _profession_level_for_xp(total_xp: int) -> int:
    """Highest level (1-30) whose cumulative Total XP threshold `total_xp`
    has reached or passed, per _PROFESSION_LEVEL_TOTAL_XP above."""
    level = 1
    for i, threshold in enumerate(_PROFESSION_LEVEL_TOTAL_XP):
        if total_xp >= threshold:
            level = i + 1
    return level


def _profession_daily_xp_cap(level: int) -> int:
    """
    30% of the XP cost of advancing from `level` to `level + 1` (the
    README table's own "Diff to previous" for the next level) - grinding
    the same craft over and over, in any number of batches or one single
    large one, can't earn a profession more than this much XP in one UTC
    calendar day. Scales up as a profession advances (a level 20
    profession's daily cap is much larger than a level 1's, whose cap is
    30% of 100 = 30) rather than staying a fixed number forever. Level 30
    has no "next level" cost to measure - reuses the cost of reaching 30
    itself, so play at the level cap still earns some capped XP instead of
    none.
    """
    idx = min(max(level, 1), 30)
    if idx >= 30:
        diff = _PROFESSION_LEVEL_TOTAL_XP[29] - _PROFESSION_LEVEL_TOTAL_XP[28]
    else:
        diff = _PROFESSION_LEVEL_TOTAL_XP[idx] - _PROFESSION_LEVEL_TOTAL_XP[idx - 1]
    return round(diff * 0.30)


def _profession_xp_grant_set_ops(
    character: dict, grants: Dict[str, int], prefix: str = "characters.$."
) -> Dict[str, object]:
    """
    Turns {"exp1": 12, "exp2": 4}-style raw XP grants (see
    _crafting_xp_increments's raw-material XP and finish_craft's
    assembly-bonus grant) into concrete "$set" entries under `prefix`
    (either "characters.$." for the plain-elemMatch update shape, or
    "characters.$[char]." for the array-filter shape start_craft/
    finish_craft also use when an instance-tracked tool is involved) -
    applying the 30%-of-current-level-cost daily XP cap
    (_profession_daily_xp_cap, tracked per profession slot in
    profession.dailyXp) and re-deriving that slot's level
    (_profession_level_for_xp) from the resulting total.

    $set rather than $inc: both the capped delta and the resulting level
    depend on the character's own current state (current level, today's
    already-granted amount), not just a fixed increment - so this always
    needs the freshly-read `character` dict the caller already has in
    hand, same accepted pre-read-then-write style the rest of this file's
    capacity/precondition checks already use. The cap applies to the WHOLE
    grant at once regardless of how it was earned - a single 50-unit batch
    craft is clamped exactly the same as 50 separate 1-unit crafts would
    be, never a bigger allowance for a bigger batch.
    """
    profession = character.get("profession", {})
    today = datetime.now(timezone.utc).date().isoformat()
    ops: Dict[str, object] = {}
    for exp_key, amount in grants.items():
        if not amount:
            continue
        n = exp_key[-1]
        slot = f"prof{n}"
        current_xp = profession.get(exp_key, 0)
        current_level = profession.get(f"lvl{n}") or 1
        daily = (profession.get("dailyXp") or {}).get(slot) or {}
        gained_today = daily.get("gained", 0) if daily.get("date") == today else 0
        cap = _profession_daily_xp_cap(current_level)
        granted = min(amount, max(0, cap - gained_today))
        ops[f"{prefix}profession.dailyXp.{slot}"] = {"date": today, "gained": gained_today + granted}
        if granted <= 0:
            continue
        new_xp = current_xp + granted
        ops[f"{prefix}profession.{exp_key}"] = new_xp
        ops[f"{prefix}profession.lvl{n}"] = _profession_level_for_xp(new_xp)
    return ops


def _resolve_ingredient_option(
    option: dict,
    tier: int,
    character: dict,
    character_resources: Dict[str, int],
    player_resources: Dict[str, int],
    count: int = 1,
    player_items: Optional[List[dict]] = None,
    character_item_balances: Optional[Dict[str, int]] = None,
    player_item_balances: Optional[Dict[str, int]] = None,
) -> Optional[dict]:
    """
    Checks whether ONE ingredient option (the sole option for a plain
    ingredient, or one entry inside an "alternatives" list, e.g. carcass's
    bone_blade-consumed-or-dagger-not-consumed choice) can be satisfied
    right now, for crafting `count` units in one batch - `count` only
    scales a consumed resource's quantity (2x metal_bar for count=2); an
    unconsumed "held" option (a tool-like requirement - own it, don't use
    it up) still only needs ONE, regardless of count, same as a recipe's
    "tool" field doesn't need `count` anvils to make `count` daggers.
    Returns None if it can't be satisfied. Otherwise a small plan dict:
    `{"held": True, "move": <_resolve_tool_for_craft's instance_move tuple, or None>}`
    for an unconsumed option that's simply owned (resolved the same way
    `_resolve_tool_for_craft` resolves the "tool" field, since "own a
    needsItemDefinition:true family, don't use it up" is the identical
    question - `move` carries the same move-to-"crafting" instruction when
    `player_items` surfaces one, same as the "tool" field gets), or
    `{"held": False, "bucket", "concrete_id", "from_character", "from_player"}`
    for something that would actually be consumed - `bucket` is
    "resources" for a raw/processed ingredient, or "itemBalances" for a
    consumed "final" ingredient (e.g. iron_ration consuming a whole
    salt_horse) - a genuinely finished, needsItemDefinition:false item,
    checked/decremented against character_item_balances/
    player_item_balances instead of the resources dicts, mirroring the
    exact same "character vault first, shared vault for the shortfall"
    logic one bucket over. A consumed "final" ingredient that happens to
    be needsItemDefinition:true isn't supported here - every current one
    is a flat-count food/good, never an item instance.
    """
    category = option["category"]
    qty = option["qty"] * count
    consumed = option.get("consumed", True)
    family_id = option["familyId"]

    if category == "final":
        if not consumed:
            found = _resolve_tool_for_craft(character, {}, [family_id], tier, player_items=player_items)
            if found is None:
                return None
            return {"held": True, "move": found if found[0] == "instance_move" else None}

        output_row = items_catalog.resolve_output_row(family_id, tier)
        if output_row is None:
            raise ValueError(f"No tier {tier} id for ingredient family {family_id}")
        concrete_id = output_row["id"]
        held_by_character = (character_item_balances or {}).get(concrete_id, 0)
        held_by_player = (player_item_balances or {}).get(concrete_id, 0)
        if held_by_character + held_by_player < qty:
            return None
        from_character = min(held_by_character, qty)
        from_player = qty - from_character
        return {
            "held": False,
            "bucket": "itemBalances",
            "concrete_id": concrete_id,
            "from_character": from_character,
            "from_player": from_player,
        }

    if category == "raw":
        concrete_id = _RAW_ID_BY_FAMILY_TIER.get((family_id, tier))
    elif category == "processed":
        concrete_id = _PROCESSED_ID_BY_FAMILY_TIER.get((family_id, tier))
    else:
        raise ValueError(f"Unsupported ingredient category: {category}")
    if concrete_id is None:
        raise ValueError(f"No tier {tier} id for ingredient family {family_id}")

    held_by_character = character_resources.get(concrete_id, 0)
    held_by_player = player_resources.get(concrete_id, 0)
    if held_by_character + held_by_player < qty:
        return None
    if not consumed:
        return {"held": True}
    from_character = min(held_by_character, qty)
    from_player = qty - from_character
    return {
        "held": False,
        "bucket": "resources",
        "concrete_id": concrete_id,
        "from_character": from_character,
        "from_player": from_player,
    }


def _resolve_recipe_ingredients(
    recipe: dict,
    tier: int,
    character_resources: Dict[str, int],
    player_resources: Dict[str, int],
    character: Optional[dict] = None,
    count: int = 1,
    player_items: Optional[List[dict]] = None,
    character_item_balances: Optional[Dict[str, int]] = None,
    player_item_balances: Optional[Dict[str, int]] = None,
) -> Optional[tuple[Dict[str, int], Dict[str, int], Dict[str, int], Dict[str, int], List[tuple]]]:
    """
    Resolves one recipe's ingredients (at `tier`) to concrete resource ids
    and checks the character vault + player shared vault hold enough
    combined - same "counts either way" reasoning the recipe viewer's
    owned/needed check already uses for tools. `count` crafts that many
    units in one batch: each consumed ingredient's quantity scales by
    `count` (2x metal_bar for count=2), but an unconsumed "held" option
    (a tool-like requirement) still only needs owning one, same as a
    recipe's "tool" field doesn't need `count` anvils to make `count`
    daggers - see `_resolve_ingredient_option`. Returns
    (character_resource_decrements, player_resource_decrements,
    character_item_balance_decrements, player_item_balance_decrements,
    instance_moves) - amounts to take from each vault (character vault
    first, shared vault only for whatever's still short), split into the
    "resources" bucket (raw/processed ingredients) and the "itemBalances"
    bucket (a consumed "final" ingredient - e.g. iron_ration consuming a
    whole salt_horse - see _resolve_ingredient_option's own `bucket` tag),
    plus any instance-tracked tools an unconsumed "final" alternative
    resolved to a move (see `_resolve_tool_for_craft`'s `instance_move`
    tuples) - or None if there isn't enough even combined.

    An ingredient with an "alternatives" list (e.g. carcass's
    bone_blade-or-dagger choice) tries each option, preferring an
    already-owned unconsumed one (free to use) before falling back to the
    first affordable consumed one - the same priority
    recipe-viewer.template.html's pickBestAlternative uses, so what the
    button shows as craftable matches what this actually accepts. `character`
    is only needed to resolve an unconsumed "final"-category option
    (e.g. dagger) - omit it for calls that can't have one satisfied anyway
    (finish_craft's re-check already gets this from its own character read).
    `player_items` is only ever passed by start_craft (see
    _resolve_tool_for_craft) - finish_craft's re-check leaves it None so an
    unconsumed alternative can only resolve against what's already on the
    character, never trigger a fresh move.

    Raises ValueError for an unsupported ingredient category or a missing
    tier row.
    """
    character_resource_decrements: Dict[str, int] = {}
    player_resource_decrements: Dict[str, int] = {}
    character_item_balance_decrements: Dict[str, int] = {}
    player_item_balance_decrements: Dict[str, int] = {}
    instance_moves: List[tuple] = []
    character = character or {}
    for ingredient in recipe["ingredients"]:
        options = ingredient["alternatives"] if "alternatives" in ingredient else [ingredient]

        plan = None
        for option in options:
            if option.get("consumed", True):
                continue
            plan = _resolve_ingredient_option(
                option, tier, character, character_resources, player_resources, count, player_items,
                character_item_balances, player_item_balances,
            )
            if plan is not None:
                break
        if plan is None:
            for option in options:
                if not option.get("consumed", True):
                    continue
                plan = _resolve_ingredient_option(
                    option, tier, character, character_resources, player_resources, count, player_items,
                    character_item_balances, player_item_balances,
                )
                if plan is not None:
                    break
        if plan is None:
            return None

        if not plan["held"]:
            concrete_id = plan["concrete_id"]
            character_decrements, player_decrements = (
                (character_item_balance_decrements, player_item_balance_decrements)
                if plan["bucket"] == "itemBalances"
                else (character_resource_decrements, player_resource_decrements)
            )
            if plan["from_character"]:
                character_decrements[concrete_id] = character_decrements.get(concrete_id, 0) + plan["from_character"]
            if plan["from_player"]:
                player_decrements[concrete_id] = player_decrements.get(concrete_id, 0) + plan["from_player"]
        elif plan.get("move") is not None:
            instance_moves.append(plan["move"])
    return (
        character_resource_decrements,
        player_resource_decrements,
        character_item_balance_decrements,
        player_item_balance_decrements,
        instance_moves,
    )


def _resolve_recipe_output(family_id: str, tier: int) -> Optional[tuple[dict, bool]]:
    """
    Resolves a recipe's output to a concrete {"id", "name"} row, checked
    against the processed-resource catalog first (many recipes - plank,
    metal_bar, leather, and 44 others - produce an ordinary processed
    material, the exact same ids ingredients elsewhere resolve through
    _PROCESSED_ID_BY_FAMILY_TIER, not a "final" weapon/armor/tool/food/etc.
    row) and items_catalog's final-catalog files second. Returns
    (output_row, is_processed_resource) - the bool tells the caller which
    inventory bucket the output belongs in (resources vs items/itemBalances,
    since a processed material was never in item-inventory-properties.json
    to begin with, so `family.needs_item_definition` doesn't apply to it).

    A handful of families (arrow, bolt, oil) are dual-cataloged: their
    concrete ids/names are resolved via the processed-resource catalog like
    any other processed material (that's simply where their tiered rows
    live), but they're ALSO real item-inventory-properties.json families -
    ammo belongs in the vault (itemBalances) like any other crafted item,
    not in resources, so a family found in both catalogs reports
    is_processed_resource=False despite resolving its id/name the
    processed-resource way.
    """
    concrete_id = _PROCESSED_ID_BY_FAMILY_TIER.get((family_id, tier))
    if concrete_id is not None:
        is_processed_resource = items_catalog.ITEM_FAMILIES_BY_ID.get(family_id) is None
        return {"id": concrete_id, "name": PROCESSED_RESOURCE_ITEMS_BY_ID[concrete_id].name}, is_processed_resource
    output_row = items_catalog.resolve_output_row(family_id, tier)
    if output_row is not None:
        return output_row, False
    return None


def _resolve_recipe_direct_raw_totals(family_id: str, count: int, character: dict) -> Dict[str, int]:
    """
    This recipe's own DIRECT ingredients only, at this one crafting step -
    deliberately NOT recursive (unlike a full chain expansion): a
    "processed" ingredient (e.g. dagger's metal_bar) contributes nothing
    here, since its own raw materials already paid out XP whenever THAT
    was crafted as its own separate step - same one-level "Materials"
    scoping the recipe viewer's own Materials section uses, just for XP
    instead of display. A recipe with no direct "raw" ingredient at all
    (dagger's only ingredient is processed) earns no raw-material XP from
    this step.

    An "alternatives" slot (e.g. carcass's bone_blade-or-dagger choice)
    resolves via the same priority _resolve_ingredient_option uses (prefer
    an already-owned unconsumed option) so this reflects what THIS craft
    actually used - an unconsumed "final" choice contributes nothing
    either way, same as a "final"/"final_unresolved" ingredient never
    contributes (a held tool, or another already-crafted item that earned
    its own XP when IT was crafted).
    """
    recipe = _RECIPES_BY_FAMILY.get(family_id)
    if recipe is None:
        return {}
    held_items = character.get("gear", {}).get("items", []) or []
    totals: Dict[str, int] = {}
    for ing0 in recipe["ingredients"]:
        options = ing0["alternatives"] if "alternatives" in ing0 else [ing0]
        chosen = None
        for opt in options:
            if opt.get("consumed", True):
                continue
            family = items_catalog.ITEM_FAMILIES_BY_ID.get(opt["familyId"])
            if family and family.needs_item_definition and any(
                item.get("familyId") == opt["familyId"] and item.get("location") in ("backpack", "body", "camp", "saddlepack", "crafting")
                for item in held_items
            ):
                chosen = opt
                break
        if chosen is None:
            chosen = next((opt for opt in options if opt.get("consumed", True)), None)
        if chosen is None or chosen["category"] != "raw":
            continue
        totals[chosen["familyId"]] = totals.get(chosen["familyId"], 0) + chosen["qty"] * count
    return totals


def _crafting_xp_increments(character: dict, family_id: str, count: int) -> Dict[str, int]:
    """
    Raw-material XP - see the README's "Crafting XP" section - scoped to
    this recipe's own direct ingredients (see
    _resolve_recipe_direct_raw_totals) - a recipe with no direct raw
    ingredient (e.g. dagger, which only needs processed metal_bar) earns
    none; the raw materials it's ultimately built from already paid out
    when the processed intermediate was crafted as its own step. Each raw
    family used grants XP equal to the amount consumed to EVERY profession
    slot (prof1/2/3) whose category lists that family - a single craft can
    pay out to more than one profession slot at once if the recipe's raw
    materials span more than one category. Returns {"exp1": ..., "exp2":
    ..., "exp3": ...} deltas to add, only for slots that actually gained
    something. Paid out at start_craft time (see there) - the separate
    final-item assembly bonus (_assembly_bonus_xp) pays out at finish_craft
    instead.
    """
    raw_totals = _resolve_recipe_direct_raw_totals(family_id, count, character)
    if not raw_totals:
        return {}
    profession = character.get("profession", {})
    increments: Dict[str, int] = {}
    for prof_key, exp_key in (("prof1", "exp1"), ("prof2", "exp2"), ("prof3", "exp3")):
        profession_id = profession.get(prof_key)
        category = PROFESSION_CATEGORIES.get(profession_id) if profession_id else None
        if not category:
            continue
        families = PROFESSION_RESOURCE_FAMILIES.get(category, ())
        gained = sum(qty for fam, qty in raw_totals.items() if fam in families)
        if gained:
            increments[exp_key] = gained
    return increments


def _resolve_recipe_full_chain_raw_total(
    family_id: str, count: int, character: dict, seen: frozenset = frozenset()
) -> int:
    """
    Recursively expands a recipe's ingredients down through every
    "processed" sub-recipe to a single raw-material total across its
    *full* creation chain - used only for the final-item assembly bonus
    (see _assembly_bonus_xp), which the README defines as
    `10% x this total x tier`. Deliberately different from
    _resolve_recipe_direct_raw_totals (which only earns XP for one step's
    own direct raw ingredients, paid out every time that step runs): this
    total re-counts raw materials already paid out at an earlier step, by
    design - the assembly bonus rewards finishing the whole item, not just
    its last step.

    Same alternatives-resolution priority as
    _resolve_recipe_direct_raw_totals (prefer an already-owned unconsumed
    option) and the same "final"/"final_unresolved" skip (a held tool or
    another crafted item already earned its own XP when IT was crafted).
    `seen` guards against a pathological recipe cycle looping forever.
    """
    if family_id in seen:
        return 0
    recipe = _RECIPES_BY_FAMILY.get(family_id)
    if recipe is None:
        return 0
    seen = seen | {family_id}
    held_items = character.get("gear", {}).get("items", []) or []
    total = 0
    for ing0 in recipe["ingredients"]:
        options = ing0["alternatives"] if "alternatives" in ing0 else [ing0]
        chosen = None
        for opt in options:
            if opt.get("consumed", True):
                continue
            family = items_catalog.ITEM_FAMILIES_BY_ID.get(opt["familyId"])
            if family and family.needs_item_definition and any(
                item.get("familyId") == opt["familyId"] and item.get("location") in ("backpack", "body", "camp", "saddlepack", "crafting")
                for item in held_items
            ):
                chosen = opt
                break
        if chosen is None:
            chosen = next((opt for opt in options if opt.get("consumed", True)), None)
        if chosen is None:
            continue
        qty = chosen["qty"] * count
        if chosen["category"] == "raw":
            total += qty
        elif chosen["category"] == "processed":
            total += _resolve_recipe_full_chain_raw_total(chosen["familyId"], qty, character, seen)
        # "final"/"final_unresolved": a held tool or another crafted item - already earned its own XP, skip.
    return total


def _assembly_bonus_xp(recipe: dict, family_id: str, tier: int, count: int, character: dict) -> int:
    """
    The README's "Final-item XP": finishing a genuinely blueprint-gated
    item (recipe.blueprintFamilyId set) pays a flat, tier-scaled bonus -
    `10% x the item's full raw-material chain x tier` - on top of whatever
    raw-material XP was already earned crafting its ingredients along the
    way. Returns 0 for a recipe with no blueprintFamilyId (a plain
    processing step - refining ore, tanning leather, etc. - never earns
    this). Not tied to a fixed profession the way raw-material XP is -
    always goes to whichever profession slot the player has marked "prime"
    (see set_prime_profession), decided per-character rather than
    per-craft; the caller resolves which slot that is (defaulting to
    "prof1" until the player ever picks one - see finish_craft) and
    credits the returned amount there.
    """
    if not recipe.get("blueprintFamilyId"):
        return 0
    full_chain_total = _resolve_recipe_full_chain_raw_total(family_id, count, character)
    return round(0.10 * full_chain_total * tier)


def _validate_recipe(family_id: str, tier: int) -> tuple[dict, dict, bool]:
    """Shared start_craft/finish_craft validation: known recipe, known tier
    row. Raises ValueError otherwise. Returns
    (recipe, output_row, output_is_processed_resource)."""
    recipe = _RECIPES_BY_FAMILY.get(family_id)
    if recipe is None:
        raise ValueError(f"Unknown recipe family: {family_id}")
    resolved_output = _resolve_recipe_output(family_id, tier)
    if resolved_output is None:
        raise ValueError(f"No tier {tier} row for family {family_id}")
    output_row, output_is_processed = resolved_output
    return recipe, output_row, output_is_processed


async def start_craft(
    address: str, character_id: str, family_id: str, tier: int, count: int = 1
) -> Optional[Player]:
    """
    Begins crafting `count` units of `family_id` at `tier` in one batch for
    one of `address`'s characters: one job at a time (rejects if the
    character already has an unfinished craft), resolves the recipe's own
    tool requirement FIRST (see _resolve_tool_instances_for_craft - may
    reduce the actual batch size below `count` if the tool's own quality
    can't cover it), then checks ingredients (each consumed quantity
    scaled by that possibly-reduced actual count - see
    `_resolve_recipe_ingredients`) against the character vault + player's
    shared vault combined, then transfers onto the character whatever
    wasn't already there (so it shows up in the character's own crafting
    list right away) and starts a single timer (Character.activeCraft),
    its length scaled by the recipe's own full raw-material chain, `tier`,
    AND the actual count - see `_craft_duration_seconds`. The output isn't
    produced yet - call finish_craft once the timer elapses, which
    produces all of the actual count's units at once.

    An ingredient-level "final"/unconsumed alternative (e.g. carcass's
    dagger option, as opposed to the recipe's own top-level "tool" field
    above) is never auto-transferred here, and only ever needs to be owned
    once regardless of count - see `_resolve_tool_for_craft`. Also pays
    out raw-material crafting XP right away (see `_crafting_xp_increments`) -
    to every profession slot whose category lists a raw material used
    directly by this recipe's own ingredients (not recursively through a
    "processed" ingredient's own sub-recipe), scaled by the actual count.
    A recipe with no direct raw ingredient (e.g. dagger, purely processed
    metal_bar) earns none from this step - crafting the processed
    intermediate is its own separate step that already paid that out. The
    README's final-item assembly-bonus XP is a separate mechanic paid at
    finish_craft time instead - see there. Raises ValueError for an
    unknown recipe/output row, an unsupported recipe shape, or `count < 1`.
    Returns None if the character is already mid-craft, is currently out
    on a story (Character.availability.inAdventure - mutually exclusive
    with crafting, see set_in_adventure's own matching check), has no
    access to a listed tool at all (quality alone never causes this - see
    above, only a total absence of any eligible tool does), can't afford
    the (actual-count-scaled) ingredients even combined, hasn't learned
    the required blueprint, or the address/character pair doesn't match
    any player document.
    """
    if count < 1:
        raise ValueError("count must be at least 1")
    recipe, _output_row, _output_is_processed = _validate_recipe(family_id, tier)

    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None

    active = character.get("crafting", {}).get("activeCraft")
    if active and datetime.fromisoformat(active["readyAt"]) > datetime.now(timezone.utc):
        return None

    # Mutually exclusive with being out on a story - see set_in_adventure's
    # own matching check (the other half of this).
    if character.get("availability", {}).get("inAdventure", False):
        return None

    # The recipe's own top-level tool is resolved FIRST, before ingredients
    # - unlike ingredients (which just need to be affordable), an
    # instance-tracked tool wears down by 1 quality per unit crafted (see
    # finish_craft), so a single worn instance might not have enough
    # quality left to cover the whole requested `count` on its own. When
    # that happens, _resolve_tool_instances_for_craft keeps pulling the
    # next worst-quality eligible instance (same family/source) to make up
    # the shortfall, and if even all of them together still can't cover
    # `count`, hands back however much they CAN cover instead of failing
    # outright - "however many the tool(s) on hand can actually do".
    # Ingredients are then resolved against that possibly-reduced
    # actual_count, never the raw request, so nothing gets consumed for
    # units the tool can't actually help produce. A recipe with no "tool"
    # field at all is never capped this way - actual_count stays the
    # requested count.
    tool_candidates = recipe.get("tool")
    tool_transfer_id: Optional[str] = None
    tool_instance_moves: List[tuple] = []  # (instance_id, source, slot_ref, wear)
    actual_count = count
    if tool_candidates is not None:
        if isinstance(tool_candidates, str):
            tool_candidates = [tool_candidates]
        found = _resolve_tool_instances_for_craft(
            character,
            doc.get("crafting", {}).get("tools", {}),
            tool_candidates,
            tier,
            count,
            doc.get("vault", {}).get("items", []),
        )
        if found is None:
            return None
        if found[0] == "flat_transfer":
            tool_transfer_id, actual_count = found[1], found[2]
        elif found[0] == "instance_moves":
            tool_instance_moves, actual_count = found[1], found[2]

    # Crafting only ever checks the player's shared vault, never the
    # character's own - the character vault is purely a temporary staging
    # area for an active craft (populated here, drained by finish_craft),
    # not a persistent balance a player manages directly. Passing {} for
    # the character side means the full amount always comes from the
    # player vault (character_decrements stays empty) - same for
    # itemBalances (a consumed "final" ingredient, e.g. iron_ration's
    # smoked_salt_horse) as it already is for resources. player_items lets
    # an unconsumed ingredient alternative (e.g. carcass's dagger option)
    # resolve to a vault-borrow the same way the recipe's own "tool" field
    # does, above - always at ONE unit regardless of count (see
    # _resolve_ingredient_option), so actual_count never affects whether
    # that specific alternative resolves, only how much wear it takes
    # below.
    resolved = _resolve_recipe_ingredients(
        recipe, tier, {}, doc.get("crafting", {}).get("resources", {}), character, actual_count,
        player_items=doc.get("vault", {}).get("items", []),
        character_item_balances={}, player_item_balances=doc.get("vault", {}).get("itemBalances", {}),
    )
    if resolved is None:
        return None
    _, player_decrements, _, player_item_balance_decrements, ingredient_moves = resolved

    blueprint_family_id = recipe.get("blueprintFamilyId")
    if blueprint_family_id is not None:
        if not _owns_blueprint_at_or_above(character, blueprint_family_id, tier):
            return None

    # Every instance-tracked tool this craft needs to borrow: the recipe's
    # own "tool" field (tool_instance_moves, each already carrying its own
    # pre-computed wear - see _resolve_tool_instances_for_craft) plus any
    # ingredient-level "final"/unconsumed alternative that also resolved
    # to one (ingredient_moves - a single instance each, wearing
    # actual_count same as the recipe's own tool would if it only needed
    # one). Deduplicated by instanceId - no current recipe needs the same
    # instance twice, but cheap to guard.
    all_moves: List[tuple] = []  # (instance_id, source, slot_ref, wear)
    seen_instance_ids: set = set()
    for _kind, instance_id, source, slot_ref in ingredient_moves:
        if instance_id not in seen_instance_ids:
            seen_instance_ids.add(instance_id)
            all_moves.append((instance_id, source, slot_ref, actual_count))
    for instance_id, source, slot_ref, wear in tool_instance_moves:
        if instance_id not in seen_instance_ids:
            seen_instance_ids.add(instance_id)
            all_moves.append((instance_id, source, slot_ref, wear))

    # Only the shortfall drawn from the player's shared vault actually
    # moves - whatever was already on the character (character_decrements)
    # stays put until finish_craft consumes it.
    match_filter: Dict = {"address": address}
    elem_match: Dict = {"id": character_id}
    inc_ops: Dict[str, int] = {}
    for concrete_id, qty in player_decrements.items():
        match_filter[f"crafting.resources.{concrete_id}"] = {"$gte": qty}
        inc_ops[f"crafting.resources.{concrete_id}"] = -qty
        inc_ops[f"characters.$.crafting.resources.{concrete_id}"] = inc_ops.get(
            f"characters.$.crafting.resources.{concrete_id}", 0
        ) + qty
    for concrete_id, qty in player_item_balance_decrements.items():
        match_filter[f"vault.itemBalances.{concrete_id}"] = {"$gte": qty}
        inc_ops[f"vault.itemBalances.{concrete_id}"] = -qty
        inc_ops[f"characters.$.crafting.itemBalances.{concrete_id}"] = inc_ops.get(
            f"characters.$.crafting.itemBalances.{concrete_id}", 0
        ) + qty
    if tool_transfer_id is not None:
        match_filter[f"crafting.tools.{tool_transfer_id}"] = {"$gte": 1}
        inc_ops[f"crafting.tools.{tool_transfer_id}"] = -1
        inc_ops[f"characters.$.crafting.tools.{tool_transfer_id}"] = 1

    # Raw-material crafting XP (see the README's "Crafting XP" section) -
    # paid out the moment the timer starts, not on finish_craft, same as
    # the ingredients themselves are already spoken for at this point.
    # Final-item assembly-bonus XP is a separate mechanic paid at
    # finish_craft instead - see there. Subject to the daily XP cap (see
    # _profession_xp_grant_set_ops) - folded into whichever "$set" ops
    # shape each branch below builds, not $inc. Uses actual_count, same as
    # everything else below - a tool-capped batch only ever earns/costs/
    # takes as long as the units it can actually produce.
    xp_grants = _crafting_xp_increments(character, family_id, actual_count)

    ready_at = datetime.now(timezone.utc) + timedelta(
        seconds=_craft_duration_seconds(recipe, family_id, tier, character, actual_count)
    )
    active_craft: Dict = {
        "familyId": family_id,
        "tier": tier,
        "count": actual_count,
        "readyAt": ready_at.isoformat(),
        # Only set when this call actually moved a tool from the player's
        # shared pool - a tool the character already had (found on hand,
        # nothing transferred) is never returned by finish_craft, only
        # what was specifically borrowed here.
        "toolTransferId": tool_transfer_id,
        # Every instance-tracked tool physically moved to location:
        # "crafting" for this craft - {instanceId, source, slotRef, wear},
        # source being "pool"/"backpack"/"body" so finish_craft can put
        # each one back exactly where it came from (a "body" source's
        # slotRef is what it was equipped into, restored on release), wear
        # being exactly how much quality THIS instance spends (see
        # _resolve_tool_instances_for_craft) - not always actual_count
        # anymore, now that one requirement can span several instances.
        "borrowedInstances": [
            {"instanceId": instance_id, "source": source, "slotRef": slot_ref, "wear": wear}
            for instance_id, source, slot_ref, wear in all_moves
        ],
    }

    if not all_moves:
        # No instance-tracked tool involved - the simple, original shape:
        # plain positional $ against the query's own characters.$elemMatch.
        update: Dict = {
            "$set": {
                "characters.$.crafting.activeCraft": active_craft,
                **_profession_xp_grant_set_ops(character, xp_grants, "characters.$."),
            }
        }
        if inc_ops:
            update["$inc"] = inc_ops
        match_filter["characters"] = {"$elemMatch": elem_match}
        doc = await db.players.find_one_and_update(match_filter, update, return_document=ReturnDocument.AFTER)
        if doc is None:
            return None
        return _doc_to_player(doc)

    # At least one instance needs moving to "crafting" - switch every
    # characters-array field in this update to $[char]/array_filters
    # instead of mixing with plain $, since a backpack/body-sourced move
    # also needs characters.$[char].gear.items.$[itemN] (a nested array filter
    # on the SAME "characters" field) in the same update document.
    # The vault-side sufficiency checks (crafting.resources.X >= qty,
    # crafting.tools.X >= 1) already sit in match_filter above - nothing
    # about the character's own current balance needs preconditioning
    # here, these are increments landing on the character, not decrements.
    set_ops: Dict = {"characters.$[char].crafting.activeCraft": active_craft}
    set_ops.update(_profession_xp_grant_set_ops(character, xp_grants, "characters.$[char]."))
    array_filters: List[Dict] = [{"char.id": character_id}]

    pool_pull_ids: List[str] = []
    pool_push_instances: List[dict] = []
    inventory_items_by_id = {i["instanceId"]: i for i in doc.get("vault", {}).get("items", [])}
    for idx, (instance_id, source, _slot_ref, _wear) in enumerate(all_moves):
        if source == "pool":
            pool_pull_ids.append(instance_id)
            src_instance = inventory_items_by_id[instance_id]
            pool_push_instances.append({**src_instance, "location": "crafting", "slotRef": []})
        else:
            filt_id = f"moveItem{idx}"
            array_filters.append({f"{filt_id}.instanceId": instance_id, f"{filt_id}.location": source})
            set_ops[f"characters.$[char].gear.items.$[{filt_id}].location"] = "crafting"
            set_ops[f"characters.$[char].gear.items.$[{filt_id}].slotRef"] = []

    update = {"$set": set_ops}
    if inc_ops:
        update["$inc"] = {k.replace("characters.$.", "characters.$[char]."): v for k, v in inc_ops.items()}
    if pool_pull_ids:
        match_filter["$and"] = [
            {"vault.items": {"$elemMatch": {"instanceId": iid, "location": "pool"}}} for iid in pool_pull_ids
        ]
        # Pull off the vault, push onto the character - different top-level
        # fields, so no path collision (unlike pulling and pushing the
        # same "vault.items" field, which Mongo rejects outright).
        update["$pull"] = {"vault.items": {"instanceId": {"$in": pool_pull_ids}}}
        update["$push"] = {"characters.$[char].gear.items": {"$each": pool_push_instances}}

    match_filter["characters"] = {"$elemMatch": elem_match}
    doc = await db.players.find_one_and_update(
        match_filter, update, array_filters=array_filters, return_document=ReturnDocument.AFTER
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def finish_craft(address: str, character_id: str) -> Optional[Player]:
    """
    Completes one of `address`'s character's in-progress craft
    (Character.activeCraft), once its timer has elapsed: consumes the
    ingredients/tool that start_craft already transferred onto the
    character (nothing left to draw from the player's shared vault at this
    point) and produces `activeCraft.count` units of the output at once -
    vault.items for a needsItemDefinition:true family (each unit its
    own instance, per the instance-per-physical-item invariant - never a
    single instance with a quantity); otherwise a flat-count output
    incremented by `count` - crafting.tools if the concrete output id is
    a known flat-balance tool (TOOL_ITEMS_BY_ID - an anvil, a furnace, a
    tanning rack, ...), crafting.resources for a processed material,
    vault.itemBalances for everything else (food, potions, misc
    gear) - always into the player's shared vault, never straight onto
    the character. Also pays out the README's final-item assembly-bonus XP
    (see `_assembly_bonus_xp`) when the recipe is genuinely blueprint-gated -
    unlike raw-material XP (paid at start_craft time), this only pays out
    once the item is actually collected here. Goes to whichever profession
    slot is marked prime (`set_prime_profession`), defaulting to "prof1"
    until the player has ever picked one - so this always has somewhere to
    land, not silently nothing for a character who's never visited the
    Stats page.

    Any instance-tracked tool/weapon borrowed for this craft (see
    start_craft's borrowedInstances - axe_stone/axe/dagger doubling as a
    recipe's "tool" or an ingredient's unconsumed "final" alternative) has
    its own quality docked by its own recorded "wear" when released back
    here - one point of wear per unit it was actually used to help craft,
    which is `count` for a single-instance requirement but can be LESS for
    one that spanned several instances to cover the batch (see
    _resolve_tool_instances_for_craft) - each instance only ever pays for
    the units it personally covered. Unlike degrade_item_quality's own
    "quality can go negative, treat <= 0 as broken" convention, a borrowed
    tool/weapon whose quality would drop to 0 or below from its own wear
    doesn't just sit there broken - it's removed entirely, gone from
    wherever it would have been returned to (pool or backpack/body alike),
    independently of whatever happens to any OTHER instance released in
    the same batch (one dying and another surviving in the same release is
    normal, not an edge case).

    Returns None if there's no active craft, its timer hasn't elapsed yet,
    the character somehow no longer has enough of what was transferred (an
    accepted edge case, not actively guarded against elsewhere), or the
    address/character pair doesn't match any player document.
    """
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None

    active = character.get("crafting", {}).get("activeCraft")
    if active is None or datetime.fromisoformat(active["readyAt"]) > datetime.now(timezone.utc):
        return None

    family_id = active["familyId"]
    tier = active["tier"]
    count = active.get("count", 1)
    recipe, output_row, output_is_processed = _validate_recipe(family_id, tier)

    # Everything needed should already be sitting on the character (see
    # start_craft) - resolved purely against the character's own vault now,
    # with an empty player vault so nothing can be drawn from there. An
    # instance-tracked tool borrowed for this craft is, by now, sitting at
    # location:"crafting" - _resolve_tool_for_craft/_resolve_ingredient_option
    # recognize that as "already staged, present" (see their docstrings),
    # so an ingredient's unconsumed "final" alternative re-verifies
    # correctly here without trying to move anything again.
    resolved = _resolve_recipe_ingredients(
        recipe, tier, character.get("crafting", {}).get("resources", {}), {}, character, count,
        character_item_balances=character.get("crafting", {}).get("itemBalances", {}), player_item_balances={},
    )
    if resolved is None:
        return None
    character_decrements, _, character_item_balance_decrements, _, _ = resolved

    # borrowedInstances (see start_craft) is the authoritative record of
    # what got moved to location:"crafting" and needs releasing now - no
    # separate re-resolution of recipe.tool needed here; the fact that
    # activeCraft exists at all with a tool requirement already proves it
    # was satisfied at start_craft time, and each release below re-verifies
    # (via its own precondition) that it's still there before letting go.
    borrowed_instances = active.get("borrowedInstances") or []

    family = items_catalog.ITEM_FAMILIES_BY_ID.get(family_id)

    # Final-item assembly-bonus XP (see _assembly_bonus_xp) - only for a
    # genuinely blueprint-gated recipe. Defaults to "prof1" until the
    # player explicitly picks a prime profession on the Stats page (see
    # set_prime_profession) - so the bonus has somewhere to land even for
    # a character who's never visited that page, rather than silently
    # earning nothing. Computed once here so both the "no borrowed
    # instances" and "$[char]" update shapes below can fold it into their
    # own "$set" ops the same way raw-material XP already does in
    # start_craft - subject to the same daily XP cap
    # (_profession_xp_grant_set_ops).
    prime_slot = character.get("profession", {}).get("prime", "none")
    if prime_slot not in ("prof1", "prof2", "prof3"):
        prime_slot = "prof1"
    prime_exp_key = {"prof1": "exp1", "prof2": "exp2", "prof3": "exp3"}[prime_slot]
    assembly_bonus = _assembly_bonus_xp(recipe, family_id, tier, count, character)
    assembly_grants = {prime_exp_key: assembly_bonus} if assembly_bonus else {}

    def _output_ops() -> tuple[Dict[str, int], Dict]:
        """Returns (extra inc_ops, extra $push) for crediting this craft's output."""
        inc: Dict[str, int] = {}
        push: Dict = {}
        if output_is_processed:
            # A crafted processed material (plank, metal_bar, leather, ...)
            # is the exact same kind of thing already stacked in
            # crafting.resources - it belongs in the shared resources
            # pool, not itemBalances, so other recipes' ingredient checks
            # (which only ever look at resources) can actually see it.
            inc[f"crafting.resources.{output_row['id']}"] = count
        elif family and family.needs_item_definition:
            instances = [
                {
                    "instanceId": uuid.uuid4().hex,
                    "itemId": output_row["id"],
                    "familyId": family_id,
                    "quality": family.quality_max,
                    "location": "pool",
                    "slotRef": [],
                    "createdAt": datetime.now(timezone.utc).isoformat(),
                }
                for _ in range(count)
            ]
            push["vault.items"] = {"$each": instances}
        elif output_row["id"] in TOOL_ITEMS_BY_ID:
            # A flat-balance tool (anvil, furnace, tanning_rack, ...) - the
            # exact same catalog _resolve_tool_for_craft's own flat-balance
            # branch reads from crafting.tools, so a crafted one has to
            # land there too, not itemBalances, or it would never be
            # recognized as an owned tool for a later recipe that needs it.
            inc[f"crafting.tools.{output_row['id']}"] = count
        else:
            inc[f"vault.itemBalances.{output_row['id']}"] = count
        return inc, push

    if not borrowed_instances:
        # ORIGINAL simple shape - no instance-tracked tool was borrowed for
        # this craft, plain positional $ against the query's own
        # characters.$elemMatch.
        elem_match: Dict = {"id": character_id}
        inc_ops: Dict[str, int] = {}
        for concrete_id, qty in character_decrements.items():
            elem_match[f"crafting.resources.{concrete_id}"] = {"$gte": qty}
            inc_ops[f"characters.$.crafting.resources.{concrete_id}"] = -qty
        for concrete_id, qty in character_item_balance_decrements.items():
            elem_match[f"crafting.itemBalances.{concrete_id}"] = {"$gte": qty}
            inc_ops[f"characters.$.crafting.itemBalances.{concrete_id}"] = -qty

        # A flat-balance tool start_craft borrowed from the player's shared
        # pool (not one the character already had) goes back once the
        # craft is done - "locked" only for the crafting duration, not
        # indefinitely.
        tool_transfer_id = active.get("toolTransferId")
        if tool_transfer_id is not None:
            elem_match[f"crafting.tools.{tool_transfer_id}"] = {"$gte": 1}
            inc_ops[f"characters.$.crafting.tools.{tool_transfer_id}"] = inc_ops.get(
                f"characters.$.crafting.tools.{tool_transfer_id}", 0
            ) - 1
            inc_ops[f"crafting.tools.{tool_transfer_id}"] = 1

        extra_inc, extra_push = _output_ops()
        inc_ops.update(extra_inc)

        update: Dict = {"$unset": {"characters.$.crafting.activeCraft": ""}}
        xp_set_ops = _profession_xp_grant_set_ops(character, assembly_grants, "characters.$.")
        if xp_set_ops:
            update["$set"] = xp_set_ops
        if extra_push:
            update["$push"] = extra_push
        if inc_ops:
            update["$inc"] = inc_ops

        doc = await db.players.find_one_and_update(
            {"address": address, "characters": {"$elemMatch": elem_match}},
            update,
            return_document=ReturnDocument.AFTER,
        )
        if doc is None:
            return None
        return _doc_to_player(doc)

    # At least one instance-tracked tool was borrowed - release each back
    # to its recorded source (see start_craft's borrowedInstances). Same
    # $[char]/array_filters-throughout approach as start_craft, to avoid
    # mixing the plain positional $ with an array filter on the same
    # "characters" field in one update.
    #
    # Every borrowed instance in one craft still shares a single source
    # (see _resolve_tool_instances_for_craft's own "never mix pool and
    # character-held in one requirement" rule, and no current recipe
    # combines an ingredient-level alternative with a different-sourced
    # top-level tool) - this only implements that reachable shape (asserted
    # below), not an arbitrary mixed-source release.
    sources = {bi["source"] for bi in borrowed_instances}
    if len(sources) > 1:
        raise ValueError("Releasing instance tools borrowed from more than one source in a single craft is not supported yet")
    source = next(iter(sources))

    elem_match = {"id": character_id}
    for concrete_id, qty in character_decrements.items():
        elem_match[f"crafting.resources.{concrete_id}"] = {"$gte": qty}
    for concrete_id, qty in character_item_balance_decrements.items():
        elem_match[f"crafting.itemBalances.{concrete_id}"] = {"$gte": qty}
    tool_transfer_id = active.get("toolTransferId")
    if tool_transfer_id is not None:
        elem_match[f"crafting.tools.{tool_transfer_id}"] = {"$gte": 1}

    inc_ops = {}
    for concrete_id, qty in character_decrements.items():
        inc_ops[f"characters.$[char].crafting.resources.{concrete_id}"] = -qty
    for concrete_id, qty in character_item_balance_decrements.items():
        inc_ops[f"characters.$[char].crafting.itemBalances.{concrete_id}"] = -qty
    if tool_transfer_id is not None:
        inc_ops[f"characters.$[char].crafting.tools.{tool_transfer_id}"] = inc_ops.get(
            f"characters.$[char].crafting.tools.{tool_transfer_id}", 0
        ) - 1
        inc_ops[f"crafting.tools.{tool_transfer_id}"] = 1
    extra_inc, extra_push = _output_ops()
    inc_ops.update(extra_inc)
    xp_set_ops = _profession_xp_grant_set_ops(character, assembly_grants, "characters.$[char].")

    array_filters: List[Dict] = [{"char.id": character_id}]
    update: Dict = {"$unset": {"characters.$[char].crafting.activeCraft": ""}}
    query: Dict = {"address": address, "characters": {"$elemMatch": elem_match}}

    held_by_id = {i["instanceId"]: i for i in character.get("gear", {}).get("items", [])}

    broken_ids: List[str] = []
    surviving: List[dict] = []
    if source == "pool":
        # $pull the borrowed instance(s) off the character. A survivor
        # (quality still above 0 after ITS OWN recorded wear, see
        # start_craft's borrowedInstances) gets $push'd back into the
        # shared vault as an ordinary unassigned pool item; one whose
        # quality drops to 0 or below is gone for good instead - it just
        # vanishes, never pushed back anywhere. Independent per instance -
        # one dying while another (with more quality, or less wear, to
        # begin with) survives in the same release is normal.
        instance_ids = [bi["instanceId"] for bi in borrowed_instances]
        returned = []
        for bi in borrowed_instances:
            iid = bi["instanceId"]
            wear = bi.get("wear", count)
            new_quality = held_by_id[iid].get("quality", 0) - wear
            if new_quality > 0:
                returned.append({**held_by_id[iid], "location": "pool", "slotRef": [], "quality": new_quality})
            else:
                broken_ids.append(iid)
        update["$pull"] = {"characters.$[char].gear.items": {"instanceId": {"$in": instance_ids}}}
        push_items = list(returned)
        if extra_push:
            push_items += extra_push["vault.items"]["$each"]
        if push_items:
            update["$push"] = {"vault.items": {"$each": push_items}}
        query["$and"] = [
            {"characters": {"$elemMatch": {"id": character_id, "gear.items": {
                "$elemMatch": {"instanceId": iid, "location": "crafting"}
            }}}}
            for iid in instance_ids
        ]
    else:
        # backpack/body source - a survivor (quality still above 0 after
        # ITS OWN recorded wear) gets restored in place; one that drops to
        # 0 or below is $pull'd out entirely instead (same vanish rule as
        # the pool branch above), independent per instance same as there.
        # A $pull and a $set can't both touch characters.$[char].gear.items
        # in the SAME update (MongoDB rejects one path prefixing the
        # other) - when a batch has BOTH at least one broken and one
        # surviving instance, this update only removes the broken one(s);
        # a SECOND, separate call below restores the survivor(s) once the
        # conflicting $pull is out of the way.
        broken_ids = [
            bi["instanceId"] for bi in borrowed_instances
            if held_by_id[bi["instanceId"]].get("quality", 0) - bi.get("wear", count) <= 0
        ]
        surviving = [bi for bi in borrowed_instances if bi["instanceId"] not in broken_ids]

        if broken_ids:
            update["$pull"] = {"characters.$[char].gear.items": {"instanceId": {"$in": broken_ids}}}
        if surviving and not broken_ids:
            # Nothing broke, so no conflicting $pull in THIS update -
            # restore every survivor in place here, in one call.
            set_ops: Dict = {}
            for idx, bi in enumerate(surviving):
                filt_id = f"relItem{idx}"
                array_filters.append({f"{filt_id}.instanceId": bi["instanceId"], f"{filt_id}.location": "crafting"})
                set_ops[f"characters.$[char].gear.items.$[{filt_id}].location"] = bi["source"]
                set_ops[f"characters.$[char].gear.items.$[{filt_id}].slotRef"] = bi.get("slotRef") or []
                # Deliberately a SEPARATE array-filter identifier (matched
                # on instanceId alone, not also location:"crafting" like
                # relItem's) rather than reusing relItem's own filt_id
                # here: this backend's Mongo-compatible layer silently
                # drops an $inc that shares an array-filter identifier
                # with a $set already changing the very field (location)
                # that identifier's own match condition depends on
                # (confirmed live - the $set applies, the co-identified
                # $inc quietly no-ops). A plain instanceId-only filter
                # isn't affected by that field changing mid-update.
                wear_filt_id = f"wearItem{idx}"
                array_filters.append({f"{wear_filt_id}.instanceId": bi["instanceId"]})
                inc_ops[f"characters.$[char].gear.items.$[{wear_filt_id}].quality"] = -bi.get("wear", count)
            update["$set"] = set_ops
        if extra_push:
            update["$push"] = extra_push

    if xp_set_ops:
        update["$set"] = {**update.get("$set", {}), **xp_set_ops}

    if inc_ops:
        update["$inc"] = inc_ops

    doc = await db.players.find_one_and_update(
        query, update, array_filters=array_filters, return_document=ReturnDocument.AFTER
    )
    if doc is None:
        return None

    # A backpack/body-sourced release with BOTH a broken and a surviving
    # instance needed the $pull above to go out on its own (see the
    # comment there) - restore the survivor(s) now, in a second call, with
    # nothing left in the array to conflict with.
    if source != "pool" and broken_ids and surviving:
        survivor_array_filters: List[Dict] = [{"char.id": character_id}]
        survivor_set_ops: Dict = {}
        survivor_inc_ops: Dict[str, int] = {}
        for idx, bi in enumerate(surviving):
            rel_filt_id = f"survivorRel{idx}"
            survivor_array_filters.append({f"{rel_filt_id}.instanceId": bi["instanceId"]})
            survivor_set_ops[f"characters.$[char].gear.items.$[{rel_filt_id}].location"] = bi["source"]
            survivor_set_ops[f"characters.$[char].gear.items.$[{rel_filt_id}].slotRef"] = bi.get("slotRef") or []
            wear_filt_id = f"survivorWear{idx}"
            survivor_array_filters.append({f"{wear_filt_id}.instanceId": bi["instanceId"]})
            survivor_inc_ops[f"characters.$[char].gear.items.$[{wear_filt_id}].quality"] = -bi.get("wear", count)
        doc = await db.players.find_one_and_update(
            {"address": address, "characters.id": character_id},
            {"$set": survivor_set_ops, "$inc": survivor_inc_ops},
            array_filters=survivor_array_filters,
            return_document=ReturnDocument.AFTER,
        )
        if doc is None:
            return None

    return _doc_to_player(doc)


# Race ids under characterOptions.ts's "Giants" category (ogre, goliath,
# giant) - too large to sit comfortably on anything but a Colossal mount.
GIANT_RACES = frozenset({"ogre", "goliath", "giant"})


async def equip_item(address: str, character_id: str, instance_id: str, slots: List[str]) -> Optional[Player]:
    """
    Equip one of a character's own item instances into `slots` - exactly
    the slot names its family requires: one slot for an ordinary item, or
    both of a twoHanded family's two named slots at once (order doesn't
    matter). Once equipped, slotRef holds every slot name the instance
    occupies - for a twoHanded item, both at once - which is what makes the
    occupancy check below correctly block a later attempt to equip
    something else into just one of those slots.

    Raises ValueError if `slots` doesn't exactly match one of the instance's
    family's equip_slots groups (e.g. both hands together for a two-handed
    item, or a single named slot for an ordinary one - see items_catalog.
    ItemFamily.equip_slots), or if a GIANT_RACES character tries to equip a
    mount whose size isn't "Colossal". Returns None if the instance isn't
    found backpacked/camped/saddlepacked/equipped on this character (a
    location:"crafting" one is borrowed for an in-progress craft and can't
    be touched until it's released - see start_craft/finish_craft), or if
    any of `slots` is already occupied by another equipped instance.

    Source location:"body" is allowed too - not just backpack/camp/
    saddlepack - so this same function doubles as the reslot action: moving
    an already-equipped instance to a DIFFERENT one of its own family's
    equip_slots groups (swap hands, move a dagger from Left Hand to Girdle,
    ...) without unequipping it first. The occupancy check below already
    excludes this instance's own id from "already occupied by another
    instance", so reslotting into overlapping slots (e.g. Left Hand ->
    Right Hand while nothing else is equipped there) works with no special
    casing.
    """
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None
    # "camp"/"saddlepack" count as equippable sources too - unequip_item can
    # leave an instance there, and there's no other path back to "body" for
    # it, so it must be re-equippable directly from either. "body" itself is
    # also allowed - see the reslot note above.
    instance = next(
        (
            i for i in character.get("gear", {}).get("items", [])
            if i["instanceId"] == instance_id and i.get("location") in ("backpack", "camp", "saddlepack", "body")
        ),
        None,
    )
    if instance is None:
        return None
    source_location = instance["location"]

    family = items_catalog.ITEM_FAMILIES_BY_ID.get(instance["familyId"])
    if family is None:
        raise ValueError(f"Unknown item family: {instance['familyId']}")

    if not any(sorted(slots) == sorted(group) for group in family.equip_slots):
        options = " or ".join("+".join(group) for group in family.equip_slots)
        raise ValueError(f"{family.family_id} must be equipped into one of: {options}")

    if "mount" in family.kind and character.get("race") in GIANT_RACES:
        entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(instance["itemId"])
        if entry is None or entry.size != "Colossal":
            raise ValueError(f"{character.get('race')} characters can only ride Colossal mounts")

    # One backpack (and separately, one saddlepack) per character, total -
    # see equip_item_from_pool's identical check for why. Only relevant
    # when this instance is actually MOVING onto the body from somewhere
    # else (camp/backpack/saddlepack) - a pure body->body reslot
    # (source_location == "body") is the SAME already-worn one changing
    # slots, never a second one appearing, so that case is exempt.
    if family.family_id in ("backpack", "saddlepack") and source_location != "body":
        other_exists = any(
            i.get("location") in ("body", "camp")
            and i.get("familyId") == family.family_id
            and i["instanceId"] != instance_id
            for i in character.get("gear", {}).get("items", [])
        )
        if other_exists:
            raise ValueError(f"Already have a {family.family_id} - only one at a time (worn or in camp)")

    # Replaces the whole matched array element in one $set, rather than two
    # separate dotted-path $set keys (location, slotRef) both routed
    # through the same $[item] array filter - see unequip_item's identical
    # fix for why (this environment's Firestore MongoDB-compatible backend
    # was observed silently dropping the second of two array-filtered $set
    # keys in one update).
    equipped_instance = {**instance, "location": "body", "slotRef": slots}
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {
                "$elemMatch": {
                    "id": character_id,
                    "$and": [
                        {"gear.items": {"$elemMatch": {"instanceId": instance_id, "location": source_location}}},
                        {
                            "gear.items": {
                                "$not": {
                                    "$elemMatch": {
                                        "instanceId": {"$ne": instance_id},
                                        "slotRef": {"$in": slots},
                                    }
                                }
                            }
                        },
                    ],
                }
            },
        },
        {"$set": {"characters.$[char].gear.items.$[item]": equipped_instance}},
        array_filters=[{"char.id": character_id}, {"item.instanceId": instance_id, "item.location": source_location}],
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def equip_item_from_pool(address: str, character_id: str, instance_id: str, slots: List[str]) -> Optional[Player]:
    """
    Equip one item instance straight from `address`'s shared pool
    (vault.items, location:"pool") into `slots` on one of their
    characters - unlike the check-out-then-equip flow (still used by the
    frontend's "Move to backpack" action), this never routes through the
    backpack at all, so it's never gated by backpack_capacity(): an item
    landing straight in a hand/body slot never occupies a backpack slot in
    the first place (backpack_slots_used only counts location:"backpack"
    instances), so requiring backpack room for it was never correct - it
    also meant a character with no backpack yet worn couldn't equip even a
    bare weapon into an empty hand, a chicken-and-egg gate purely from
    routing through an unrelated intermediate step.

    Same validation as equip_item otherwise: raises ValueError if `slots`
    doesn't exactly match one of the family's equip_slots groups, or a
    GIANT_RACES character tries to equip a non-Colossal mount, or the
    character is currently out on an adventure (Character.availability.
    inAdventure - there's no reaching the shared vault mid-adventure, same
    reasoning as unequip_item never sending a freed item back to it while
    that's true). Returns None if the instance isn't in the pool, the
    address/character pair doesn't match, or any of `slots` is already
    occupied by another equipped instance.
    """
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None
    if character.get("availability", {}).get("inAdventure", False):
        raise ValueError("Character is out on an adventure - no reaching the shared vault")
    instance = next(
        (i for i in doc.get("vault", {}).get("items", []) if i["instanceId"] == instance_id),
        None,
    )
    if instance is None:
        return None

    family = items_catalog.ITEM_FAMILIES_BY_ID.get(instance["familyId"])
    if family is None:
        raise ValueError(f"Unknown item family: {instance['familyId']}")

    if not any(sorted(slots) == sorted(group) for group in family.equip_slots):
        options = " or ".join("+".join(group) for group in family.equip_slots)
        raise ValueError(f"{family.family_id} must be equipped into one of: {options}")

    if "mount" in family.kind and character.get("race") in GIANT_RACES:
        entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(instance["itemId"])
        if entry is None or entry.size != "Colossal":
            raise ValueError(f"{character.get('race')} characters can only ride Colossal mounts")

    # One backpack (and separately, one saddlepack) per character, total -
    # not just one worn at a time. Slot occupancy alone (the query's own
    # "$not $elemMatch slotRef" check below) only blocks a SECOND one from
    # taking the same "Back"/"Mbagpack" slot while one is already worn -
    # it says nothing about a first one currently sitting unequipped in
    # camp (see items_catalog.has_backpack_available/
    # has_saddlepack_available), which is exactly the gap this closes.
    # Losing the one already held (recycle_item_instance/
    # destroy_item_instance, or however an adventure might one day take
    # one away) frees this back up again - nothing else needs to track it,
    # both checks always read the character's current live state fresh.
    if instance["familyId"] == "backpack" and items_catalog.has_backpack_available(character):
        raise ValueError("Already have a backpack - only one at a time (worn or in camp)")
    if instance["familyId"] == "saddlepack" and items_catalog.has_saddlepack_available(character):
        raise ValueError("Already have a saddlepack - only one at a time (worn or in camp)")

    equipped_instance = {**instance, "location": "body", "slotRef": slots}
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "vault.items": {"$elemMatch": {"instanceId": instance_id, "location": "pool"}},
            "characters": {
                "$elemMatch": {
                    "id": character_id,
                    "gear.items": {
                        "$not": {
                            "$elemMatch": {
                                "instanceId": {"$ne": instance_id},
                                "slotRef": {"$in": slots},
                            }
                        }
                    },
                }
            },
        },
        {
            "$pull": {"vault.items": {"instanceId": instance_id}},
            "$push": {"characters.$.gear.items": equipped_instance},
        },
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def unequip_item(
    address: str, character_id: str, instance_id: str, destination: Optional[str] = None
) -> Optional[Player]:
    """
    Unequip one of a character's item instances - clears slotRef to []
    (freeing both slots at once for a two-handed item) either way.

    `destination` picks where it lands:
    - None (default) - automatic, based on Character.in_adventure
      (player-toggled - see set_in_adventure): "camp" while True (still
      this character's own, but NOT counted against backpack capacity -
      there's no shared vault to send it back to mid-adventure), or the
      player's shared vault (location:"pool") while False - safely at
      base, there's no reason to keep it personally held at all.
    - "backpack" / "saddlepack" - skips the vault/camp choice entirely,
      landing straight in one of this character's own carry locations
      instead, regardless of in_adventure. Raises ValueError if the
      character doesn't actually have that container equipped (a worn
      backpack for "backpack"; a mount's saddlebags - see
      items_catalog.has_saddlepack_equipped - for "saddlepack").

    Never capacity-gated either way (see the item-instance plan's
    "Backpack capacity" section). Returns None if the instance isn't found
    equipped ("body") on this character - a location:"crafting" one is
    borrowed for an in-progress craft and can't be touched until it's
    released (see start_craft/finish_craft).

    Unequipping a family:"backpack" instance straight to the shared vault
    (target_location "pool" - i.e. NOT "camp"/"backpack"/"saddlepack")
    also empties this character's whole backpack storage bucket
    (gear.items location:"backpack", gear.itemBalances.backpack,
    gear.resources.backpack) into the vault first, in the same update -
    backpack storage is character-level,
    not tied to this one instance (see Character.gear's own docstring), so
    it would otherwise become orphaned (still tagged "backpack", but
    unreachable - no backpack equipped, 0 capacity) the moment this
    backpack itself leaves. Unequipping to "camp" does NOT cascade - the
    bucket stays exactly as-is, still readable through this same instance
    once it's sitting in camp (see CampView's own packedItems).
    """
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None
    instance = next(
        (i for i in character.get("gear", {}).get("items", []) if i["instanceId"] == instance_id and i.get("location") == "body"),
        None,
    )
    if instance is None:
        return None

    if destination == "backpack" and not items_catalog.has_backpack_available(character):
        raise ValueError("No backpack equipped")
    if destination == "saddlepack" and not items_catalog.has_saddlepack_equipped(character):
        raise ValueError("No saddlepack equipped")

    target_location = destination or ("camp" if character.get("availability", {}).get("inAdventure", False) else "pool")

    if target_location == "pool":
        pooled_instances = [{**instance, "location": "pool", "slotRef": []}]
        pull_ids = [instance_id]
        balance_inc: Dict[str, int] = {}

        # This instance IS the currently-equipped backpack (location:
        # "body" was just required to find it above), so its storage
        # bucket is unambiguously "in use" right now - cascade whatever's
        # in it along with it. See this function's own docstring.
        if instance["familyId"] == "backpack":
            for other in character.get("gear", {}).get("items", []):
                if other.get("location") == "backpack":
                    pooled_instances.append({**other, "location": "pool", "slotRef": []})
                    pull_ids.append(other["instanceId"])
            for item_id, qty in character.get("gear", {}).get("itemBalances", {}).get("backpack", {}).items():
                if qty > 0:
                    balance_inc[f"vault.itemBalances.{item_id}"] = qty
            for resource_id, qty in character.get("gear", {}).get("resources", {}).get("backpack", {}).items():
                if qty > 0:
                    balance_inc[f"crafting.resources.{resource_id}"] = qty

        update: Dict = {
            "$pull": {"characters.$[char].gear.items": {"instanceId": {"$in": pull_ids}}},
            "$push": {"vault.items": {"$each": pooled_instances}},
        }
        if balance_inc:
            update["$inc"] = balance_inc
            update["$set"] = {
                "characters.$[char].gear.itemBalances.backpack": {},
                "characters.$[char].gear.resources.backpack": {},
            }

        doc = await db.players.find_one_and_update(
            {
                "address": address,
                "characters": {
                    "$elemMatch": {"id": character_id, "gear.items": {"$elemMatch": {"instanceId": instance_id, "location": "body"}}}
                },
            },
            update,
            array_filters=[{"char.id": character_id}],
            return_document=ReturnDocument.AFTER,
        )
    else:
        # "camp", "backpack", or "saddlepack" - all three stay on this
        # character, just changing location/slotRef. Replaces the whole
        # matched array element in one $set (rather than two separate
        # dotted-path $set keys, location and slotRef, both routed through
        # the same $[item] array filter) - this environment's MongoDB-
        # compatible Firestore backend was observed silently dropping the
        # second of two array-filtered $set keys in one update (location
        # changed, slotRef didn't), so every field on this element is
        # written together as a single path instead.
        moved_instance = {**instance, "location": target_location, "slotRef": []}
        doc = await db.players.find_one_and_update(
            {
                "address": address,
                "characters": {
                    "$elemMatch": {"id": character_id, "gear.items": {"$elemMatch": {"instanceId": instance_id, "location": "body"}}}
                },
            },
            {"$set": {"characters.$[char].gear.items.$[item]": moved_instance}},
            array_filters=[{"char.id": character_id}, {"item.instanceId": instance_id, "item.location": "body"}],
            return_document=ReturnDocument.AFTER,
        )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def set_in_adventure(address: str, character_id: str, in_adventure: bool) -> Optional[Player]:
    """
    Player-toggled flag (see the Body/Soul tab's small corner button) -
    whether this character currently counts as out on an adventure, away
    from the player's shared vault. Read by unequip_item to decide where a
    freed item lands (see there). Returns None if the address/character
    pair doesn't match any player document.

    Crafting and being out on a story are mutually exclusive (see
    start_craft's own inAdventure check, the other half of this):
    switching to True raises ValueError if the character has a craft
    still running (Character.activeCraft with readyAt still in the
    future) - a finished-but-uncollected craft doesn't block this, same
    "running" definition start_craft/finish_craft already use elsewhere.
    Switching back to False (returning from a story) is never blocked.
    """
    db = get_database()
    if in_adventure:
        character_doc = await db.players.find_one(
            {"address": address, "characters.id": character_id}, {"characters.$": 1}
        )
        if character_doc is None:
            return None
        active = character_doc["characters"][0].get("crafting", {}).get("activeCraft")
        if active and datetime.fromisoformat(active["readyAt"]) > datetime.now(timezone.utc):
            raise ValueError("Character is still crafting")

    doc = await db.players.find_one_and_update(
        {"address": address, "characters.id": character_id},
        {"$set": {"characters.$.availability.inAdventure": in_adventure}},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def check_out_item_instance(
    address: str, character_id: str, instance_id: str, destination: str = "backpack"
) -> Optional[Player]:
    """
    Move one item instance from `address`'s shared pool (vault.items,
    location:"pool") onto one of their characters' own carry location -
    "backpack" (default) or "saddlepack".

    "backpack" is capacity-gated (see items_catalog.backpack_slots_used/
    backpack_capacity): raises ValueError if the character has no backpack
    equipped at all (capacity is 0 with nothing to carry it in) or the
    backpack has no free slot for this family's size class. "saddlepack"
    is never capacity-gated (no slot-count model exists for it, same as
    "camp") - raises ValueError only if the character has no saddlepack
    equipped at all (see items_catalog.has_saddlepack_equipped). Either
    way, also raises ValueError if the character is currently out on an
    adventure (Character.availability.inAdventure) - there's no reaching
    the shared vault mid-adventure, so this is checked first, before
    either container check.

    Returns None if the instance isn't in the pool (an instance borrowed
    for an in-progress craft is location:"crafting", not "pool" - see
    start_craft/finish_craft - so it's naturally excluded here rather than
    needing its own check), or the address/character pair doesn't match.
    """
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None
    if character.get("availability", {}).get("inAdventure", False):
        raise ValueError("Character is out on an adventure - no reaching the shared vault")
    instance = next(
        (i for i in doc.get("vault", {}).get("items", []) if i["instanceId"] == instance_id),
        None,
    )
    if instance is None:
        return None

    if destination == "saddlepack":
        if not items_catalog.has_saddlepack_equipped(character):
            raise ValueError("No saddlepack equipped")
    else:
        cost = items_catalog.slot_cost_for_family(instance["familyId"])
        capacity = items_catalog.backpack_capacity(character)
        if capacity == 0:
            raise ValueError("No backpack equipped")
        used = items_catalog.backpack_slots_used(character)
        if used + cost > capacity:
            raise ValueError("Backpack is full")

    # slotRef reset to [] - a pool instance can carry a stale non-empty
    # slotRef left over from before it was checked in (check_in_item_instance
    # already clears it there, but equip_item_from_pool's own pull doesn't -
    # see that function), and neither carry location is ever a valid place
    # for a non-empty slotRef to mean anything.
    backpacked_instance = {**instance, "location": destination, "slotRef": []}
    # Query filters the characters array via a bare "characters.id" match
    # alongside an UNRELATED $elemMatch on vault.items in the same
    # query - a real (Firestore MongoDB-compat) bug was observed under
    # exactly this shape: the bare positional $ in the update below
    # resolved against the wrong array, padding characters with nulls and
    # pushing items onto a bogus new element instead of the matched
    # character. array_filters + $[char] removes the ambiguity, matching
    # check_in_item_instance's already-reliable pattern.
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {"$elemMatch": {"id": character_id}},
            "vault.items": {"$elemMatch": {"instanceId": instance_id, "location": "pool"}},
        },
        {
            "$pull": {"vault.items": {"instanceId": instance_id}},
            "$push": {"characters.$[char].gear.items": backpacked_instance},
        },
        array_filters=[{"char.id": character_id}],
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def check_in_item_instance(address: str, character_id: str, instance_id: str) -> Optional[Player]:
    """
    The reverse of check_out_item_instance: move one item instance from a
    character's backpack, saddlepack, or camp (see unequip_item) back into the shared
    pool. Never capacity-gated (freeing space always succeeds). Returns
    None if the instance isn't found backpacked/camped on this character.

    Checking in a family:"backpack" instance also empties this character's
    whole backpack storage bucket (gear.items location:"backpack",
    gear.itemBalances.backpack, gear.resources.backpack) into the vault
    first, in the same update - same cascade unequip_item's own "straight
    to vault" branch does, and for the same reason (see its docstring) -
    but ONLY if no OTHER backpack is currently equipped
    (items_catalog.has_backpack_equipped). If one is, that other backpack's
    storage is what the bucket actually belongs to right now, still
    legitimately in use - left untouched.
    """
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None
    instance = next(
        (
            i for i in character.get("gear", {}).get("items", [])
            if i["instanceId"] == instance_id and i.get("location") in ("backpack", "camp", "saddlepack")
        ),
        None,
    )
    if instance is None:
        return None

    pooled_instances = [{**instance, "location": "pool", "slotRef": []}]
    pull_ids = [instance_id]
    balance_inc: Dict[str, int] = {}

    if instance["familyId"] == "backpack" and not items_catalog.has_backpack_equipped(character):
        for other in character.get("gear", {}).get("items", []):
            if other.get("location") == "backpack":
                pooled_instances.append({**other, "location": "pool", "slotRef": []})
                pull_ids.append(other["instanceId"])
        for item_id, qty in character.get("gear", {}).get("itemBalances", {}).get("backpack", {}).items():
            if qty > 0:
                balance_inc[f"vault.itemBalances.{item_id}"] = qty
        for resource_id, qty in character.get("gear", {}).get("resources", {}).get("backpack", {}).items():
            if qty > 0:
                balance_inc[f"crafting.resources.{resource_id}"] = qty

    update: Dict = {
        "$pull": {"characters.$[char].gear.items": {"instanceId": {"$in": pull_ids}}},
        "$push": {"vault.items": {"$each": pooled_instances}},
    }
    if balance_inc:
        update["$inc"] = balance_inc
        update["$set"] = {
            "characters.$[char].gear.itemBalances.backpack": {},
            "characters.$[char].gear.resources.backpack": {},
        }

    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {"$elemMatch": {"id": character_id, "gear.items.instanceId": instance_id}},
        },
        update,
        array_filters=[{"char.id": character_id}],
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def move_camp_item_to_backpack(address: str, character_id: str, instance_id: str) -> Optional[Player]:
    """
    Move one item instance straight from this character's own camp storage
    into their backpack - unlike check_out_item_instance, both ends are
    already this character's own holdings (see unequip_item's "camp"
    destination), so this never touches the shared pool and works fine
    mid-adventure (check_out_item_instance deliberately raises in that
    case - there's no reaching the shared vault - but camp isn't the vault).

    Capacity-gated the same way check_out_item_instance's backpack path is:
    raises ValueError if the character has no backpack equipped, or the
    backpack has no free slot for this family's size class. Returns None
    if the instance isn't sitting at location:"camp" on this character.
    """
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None
    instance = next(
        (
            i for i in character.get("gear", {}).get("items", [])
            if i["instanceId"] == instance_id and i.get("location") == "camp"
        ),
        None,
    )
    if instance is None:
        return None

    cost = items_catalog.slot_cost_for_family(instance["familyId"])
    capacity = items_catalog.backpack_capacity(character)
    if capacity == 0:
        raise ValueError("No backpack equipped")
    used = items_catalog.backpack_slots_used(character)
    if used + cost > capacity:
        raise ValueError("Backpack is full")

    # Replaces the whole matched array element in one $set - see
    # unequip_item's identical fix for why (this environment's Firestore
    # MongoDB-compatible backend was observed silently dropping the second
    # of two array-filtered $set keys in one update).
    moved_instance = {**instance, "location": "backpack", "slotRef": []}
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {
                "$elemMatch": {"id": character_id, "gear.items": {"$elemMatch": {"instanceId": instance_id, "location": "camp"}}}
            },
        },
        {"$set": {"characters.$[char].gear.items.$[item]": moved_instance}},
        array_filters=[{"char.id": character_id}, {"item.instanceId": instance_id, "item.location": "camp"}],
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def move_backpack_item_to_camp(address: str, character_id: str, instance_id: str) -> Optional[Player]:
    """
    The reverse of move_camp_item_to_backpack: move one item instance
    straight from this character's own backpack into camp - both ends are
    already this character's own holdings, so this works fine
    mid-adventure too (unlike check_in_item_instance, which sends it to
    the shared pool instead - unreachable while inAdventure). This is what
    lets a backpacked item's own popup offer a real "move to camp" action
    while out on a story, the same way an equipped item's own popup
    automatically offers camp instead of vault then (see unequip_item).

    Never capacity-gated (camp is uncapped, same as unequip_item's own
    "camp" destination). Returns None if the instance isn't sitting at
    location:"backpack" on this character.
    """
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None
    instance = next(
        (
            i for i in character.get("gear", {}).get("items", [])
            if i["instanceId"] == instance_id and i.get("location") == "backpack"
        ),
        None,
    )
    if instance is None:
        return None

    # Replaces the whole matched array element in one $set - see
    # unequip_item's identical fix for why (this environment's Firestore
    # MongoDB-compatible backend was observed silently dropping the second
    # of two array-filtered $set keys in one update).
    moved_instance = {**instance, "location": "camp", "slotRef": []}
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {
                "$elemMatch": {"id": character_id, "gear.items": {"$elemMatch": {"instanceId": instance_id, "location": "backpack"}}}
            },
        },
        {"$set": {"characters.$[char].gear.items.$[item]": moved_instance}},
        array_filters=[{"char.id": character_id}, {"item.instanceId": instance_id, "item.location": "backpack"}],
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def check_out_item_balance(address: str, character_id: str, item_id: str, amount: int = 1) -> Optional[Player]:
    """
    Move `amount` of `item_id` (a concrete crafted-item id) from
    `address`'s shared vault.itemBalances onto one of their characters'
    own itemBalances. Never capacity-gated - unlike resources/tools,
    itemBalances was never part of the crafting-vault redesign (nothing a
    recipe consumes ever lives there), so a character carrying crafted
    goods directly is still a normal, ungated transfer. Raises ValueError
    if the character is currently out on an adventure (Character.
    availability.inAdventure) - there's no reaching the shared vault
    mid-adventure, same as equip_item_from_pool/check_out_item_instance.
    """
    if amount <= 0:
        raise ValueError("amount must be positive")
    db = get_database()
    character_doc = await db.players.find_one(
        {"address": address, "characters.id": character_id}, {"characters.$": 1}
    )
    if character_doc is None:
        return None
    if character_doc["characters"][0].get("availability", {}).get("inAdventure", False):
        raise ValueError("Character is out on an adventure - no reaching the shared vault")
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters.id": character_id,
            f"vault.itemBalances.{item_id}": {"$gte": amount},
        },
        {"$inc": {
            f"vault.itemBalances.{item_id}": -amount,
            f"characters.$.gear.itemBalances.camp.{item_id}": amount,
        }},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def check_out_item_balance_to_backpack(
    address: str, character_id: str, item_id: str, amount: int = 1
) -> Optional[Player]:
    """
    Move `amount` of `item_id` straight from the player's shared
    vault.itemBalances into one of their characters' own backpack
    (gear.itemBalances.backpack), in one atomic, all-or-nothing hop -
    capacity checked BEFORE anything moves. This is the "Move to backpack"
    action's own endpoint (see InventoryTab's moveToBackpack), deliberately
    NOT the same as chaining check_out_item_balance (vault -> camp,
    uncapped) with load_item_balance_to_backpack (camp -> backpack,
    capacity-gated): if the second hop failed, the item was left stranded
    in camp instead of the backpack the player actually clicked for, with
    no way back to the vault in one click either. Dropping into camp on a
    full backpack is deliberately ONLY something recycling does (see
    _recycle_resource_updates) - a normal move either lands in the
    backpack whole, or doesn't move at all.

    Raises ValueError if the character is out on an adventure, has no
    backpack equipped, or the backpack has no room for the whole amount.
    Returns None if the shared vault doesn't hold `amount`, or the
    address/character pair doesn't match.
    """
    if amount <= 0:
        raise ValueError("amount must be positive")
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None
    if character.get("availability", {}).get("inAdventure", False):
        raise ValueError("Character is out on an adventure - no reaching the shared vault")
    if doc.get("vault", {}).get("itemBalances", {}).get(item_id, 0) < amount:
        return None

    family_id = items_catalog.FAMILY_ID_BY_FINAL_ITEM_ID.get(item_id)
    family = items_catalog.ITEM_FAMILIES_BY_ID.get(family_id) if family_id else None
    stack_size = family.stack_size if family else 1
    slot_cost = items_catalog.slot_cost_for_family(family_id) if family_id else 1

    existing = character.get("gear", {}).get("itemBalances", {}).get("backpack", {}).get(item_id, 0)
    marginal_slots = (
        math.ceil((existing + amount) / stack_size) - math.ceil(existing / stack_size)
    ) * slot_cost

    capacity = items_catalog.backpack_capacity(character)
    if capacity == 0:
        raise ValueError("No backpack equipped")
    used = items_catalog.backpack_slots_used(character)
    if used + marginal_slots > capacity:
        raise ValueError("Backpack is full")

    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters.id": character_id,
            f"vault.itemBalances.{item_id}": {"$gte": amount},
        },
        {"$inc": {
            f"vault.itemBalances.{item_id}": -amount,
            f"characters.$.gear.itemBalances.backpack.{item_id}": amount,
        }},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def check_in_item_balance(
    address: str, character_id: str, item_id: str, amount: int = 1, location: str = "camp"
) -> Optional[Player]:
    """
    The reverse of check_out_item_balance - `location` ("camp" or
    "backpack") picks which of the character's own two itemBalances
    buckets to deduct from, same reasoning as recycle_item_balance's own
    `location` param. A backpack row reaching the vault in one direct hop
    (rather than staging through camp first) matches how a packed item
    INSTANCE already works (see check_in_item_instance, which accepts
    "backpack"/"camp"/"saddlepack" alike) - there's no reason an itemBalance
    row should need an extra step just because it has no instance of its
    own to read a location off of.
    """
    if amount <= 0:
        raise ValueError("amount must be positive")
    db = get_database()
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {
                "$elemMatch": {"id": character_id, f"gear.itemBalances.{location}.{item_id}": {"$gte": amount}}
            },
        },
        {"$inc": {
            f"vault.itemBalances.{item_id}": amount,
            f"characters.$.gear.itemBalances.{location}.{item_id}": -amount,
        }},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def destroy_item_instance(address: str, character_id: str, instance_id: str) -> Optional[Player]:
    """
    Permanently remove one item instance from `address`'s shared pool
    (vault.items, location:"pool") - the Inventory tab's Vault grid
    "hold 5s to destroy" action (see InventoryTab.tsx). Only ever deletes
    from the pool, mirroring check_out_item_instance's own location:"pool"
    match, so an instance currently backpacked/equipped/borrowed for a
    craft (not reachable from that grid in the first place) can't be
    destroyed through this path. Returns None if no matching pooled
    instance exists, or the address/character pair doesn't match.
    """
    db = get_database()
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters.id": character_id,
            "vault.items": {"$elemMatch": {"instanceId": instance_id, "location": "pool"}},
        },
        {"$pull": {"vault.items": {"instanceId": instance_id}}},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def destroy_item_balance(address: str, character_id: str, item_id: str, amount: int = 1) -> Optional[Player]:
    """Permanently remove `amount` of `item_id` from `address`'s shared
    vault.itemBalances - the item-balance counterpart to
    destroy_item_instance."""
    if amount <= 0:
        raise ValueError("amount must be positive")
    db = get_database()
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters.id": character_id,
            f"vault.itemBalances.{item_id}": {"$gte": amount},
        },
        {"$inc": {f"vault.itemBalances.{item_id}": -amount}},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def destroy_character_item_instance(address: str, character_id: str, instance_id: str) -> Optional[Player]:
    """
    Permanently remove one item instance from `character_id`'s own backpack,
    body, or camp (not "crafting", borrowed for an in-progress craft) -
    character-owned counterpart to destroy_item_instance (which is vault-
    pool-only). The zero-recovery fallback the character-side item popup
    reaches for when recycle_item_instance(from_vault=False) finds no
    recipe to recycle. Returns None if no matching instance exists on this
    character.
    """
    db = get_database()
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {
                "$elemMatch": {
                    "id": character_id,
                    "gear.items": {"$elemMatch": {"instanceId": instance_id, "location": {"$in": ["backpack", "body", "camp", "saddlepack"]}}},
                }
            },
        },
        {"$pull": {"characters.$.gear.items": {"instanceId": instance_id}}},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def destroy_character_item_balance(address: str, character_id: str, item_id: str, amount: int = 1) -> Optional[Player]:
    """Permanently remove `amount` of `item_id` from `character_id`'s own
    itemBalances - the item-balance counterpart to
    destroy_character_item_instance."""
    if amount <= 0:
        raise ValueError("amount must be positive")
    db = get_database()
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {"$elemMatch": {"id": character_id, f"gear.itemBalances.camp.{item_id}": {"$gte": amount}}},
        },
        {"$inc": {f"characters.$.gear.itemBalances.camp.{item_id}": -amount}},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def destroy_all_camp(address: str, character_id: str) -> Optional[Player]:
    """
    Permanently deletes everything currently sitting in a character's own
    camp - gear.items at location:"camp", gear.itemBalances.camp, and
    gear.resources.camp, all at once. The camp view's own "Burn All" hold
    action (see CampView.tsx) - unlike a normal single-item destroy,
    nothing here is ever recovered or credited anywhere, it's just gone.
    Returns None if camp is already empty, or the address/character pair
    doesn't match.
    """
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None
    gear = character.get("gear", {})
    has_camp_instances = any(i.get("location") == "camp" for i in gear.get("items", []))
    has_camp_item_balances = any(qty > 0 for qty in gear.get("itemBalances", {}).get("camp", {}).values())
    has_camp_resources = any(qty > 0 for qty in gear.get("resources", {}).get("camp", {}).values())
    if not has_camp_instances and not has_camp_item_balances and not has_camp_resources:
        return None

    # Two sequential updates, not one combined $pull+$set - see
    # recycle_item_instance's own two-phase workaround for the identical
    # bare-"$" $pull-plus-another-operator combination on the same
    # matched "characters.$" element; crediting nothing back here (unlike
    # that case) still doesn't make trusting the untested combination
    # worth the risk for a permanent, unrecoverable delete.
    doc = await db.players.find_one_and_update(
        {"address": address, "characters.id": character_id},
        {"$pull": {"characters.$.gear.items": {"location": "camp"}}},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    doc = await db.players.find_one_and_update(
        {"address": address, "characters.id": character_id},
        {"$set": {
            "characters.$.gear.itemBalances.camp": {},
            "characters.$.gear.resources.camp": {},
        }},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


def _max_move_amount(existing: int, stack_size: int, slot_cost: int, free_slots: int, available: int) -> int:
    """
    Same math as check_out_resource_to_backpack's own marginal-slot check,
    solved for the largest amount instead of checked against one fixed
    amount - see move_all_camp_to_backpack, the only caller. Capped at
    `available` and never negative; 0 if there's no room for even one
    more unit.
    """
    if free_slots <= 0:
        return 0
    max_new_stacks = free_slots // slot_cost
    existing_stacks = math.ceil(existing / stack_size) if existing else 0
    max_total = (existing_stacks + max_new_stacks) * stack_size
    return max(0, min(available, max_total - existing))


async def move_all_camp_to_backpack(address: str, character_id: str) -> Optional[Player]:
    """
    Best-effort bulk move: everything currently sitting in a character's
    camp (gear.items location:"camp", gear.itemBalances.camp,
    gear.resources.camp) moves into their own backpack, as much as
    actually fits. The camp view's own "Move all to backpack" hold action
    (see CampView.tsx) - deliberately NOT all-or-nothing the way a single
    item/resource move is (see check_out_item_balance_to_backpack's own
    docstring on why that one stays strict): whatever doesn't fit simply
    stays behind in camp untouched, nothing is ever discarded or blocked
    by one item that happens not to fit. Item instances move whole (each
    one atomic - it either fits its own family's slot cost or it
    doesn't); itemBalances and resources fill partially, in whatever
    order backpack_slots_used already returns gear.items in dict order.

    Computed once as a full replacement of gear.items/itemBalances.camp/
    itemBalances.backpack/resources.camp/resources.backpack in a single
    $set, rather than per-id $inc/$pull calls - simpler to reason about
    for a bulk operation than chaining dozens of small updates, and avoids
    any of this module's documented operator-combination quirks entirely
    (this is a single $set, no $pull/$inc mixed in).

    Raises ValueError if the character has no backpack equipped at all
    while camp holds something. Returns None if camp is entirely empty,
    or the address/character pair doesn't match.
    """
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None

    gear = character.get("gear", {})
    all_items = gear.get("items", [])
    camp_instances = [i for i in all_items if i.get("location") == "camp"]
    camp_item_balances = gear.get("itemBalances", {}).get("camp", {})
    camp_resources = gear.get("resources", {}).get("camp", {})

    if (
        not camp_instances
        and not any(qty > 0 for qty in camp_item_balances.values())
        and not any(qty > 0 for qty in camp_resources.values())
    ):
        return None

    capacity = items_catalog.backpack_capacity(character)
    if capacity == 0:
        raise ValueError("No backpack equipped")
    free_slots = capacity - items_catalog.backpack_slots_used(character)

    moved_instance_ids: set = set()
    for instance in camp_instances:
        cost = items_catalog.slot_cost_for_family(instance["familyId"])
        if cost <= free_slots:
            moved_instance_ids.add(instance["instanceId"])
            free_slots -= cost
    new_items = [
        {**instance, "location": "backpack", "slotRef": []} if instance["instanceId"] in moved_instance_ids else instance
        for instance in all_items
    ]

    new_backpack_item_balances = dict(gear.get("itemBalances", {}).get("backpack", {}))
    new_camp_item_balances = dict(camp_item_balances)
    for item_id, qty in camp_item_balances.items():
        if qty <= 0 or free_slots <= 0:
            continue
        family_id = items_catalog.FAMILY_ID_BY_FINAL_ITEM_ID.get(item_id)
        family = items_catalog.ITEM_FAMILIES_BY_ID.get(family_id) if family_id else None
        stack_size = family.stack_size if family else 1
        slot_cost = items_catalog.slot_cost_for_family(family_id) if family_id else 1
        existing = new_backpack_item_balances.get(item_id, 0)
        move_amount = _max_move_amount(existing, stack_size, slot_cost, free_slots, qty)
        if move_amount <= 0:
            continue
        new_backpack_item_balances[item_id] = existing + move_amount
        new_camp_item_balances[item_id] = qty - move_amount
        free_slots -= (math.ceil((existing + move_amount) / stack_size) - math.ceil(existing / stack_size)) * slot_cost

    new_backpack_resources = dict(gear.get("resources", {}).get("backpack", {}))
    new_camp_resources = dict(camp_resources)
    for resource_id, qty in camp_resources.items():
        if qty <= 0 or free_slots <= 0:
            continue
        stack_size = (
            items_catalog.RAW_STACK_SIZE if resource_id in RESOURCE_ITEMS_BY_ID else items_catalog.PROCESSED_STACK_SIZE
        )
        existing = new_backpack_resources.get(resource_id, 0)
        move_amount = _max_move_amount(existing, stack_size, 1, free_slots, qty)
        if move_amount <= 0:
            continue
        new_backpack_resources[resource_id] = existing + move_amount
        new_camp_resources[resource_id] = qty - move_amount
        free_slots -= math.ceil((existing + move_amount) / stack_size) - math.ceil(existing / stack_size)

    doc = await db.players.find_one_and_update(
        {"address": address, "characters.id": character_id},
        {"$set": {
            "characters.$.gear.items": new_items,
            "characters.$.gear.itemBalances.camp": new_camp_item_balances,
            "characters.$.gear.itemBalances.backpack": new_backpack_item_balances,
            "characters.$.gear.resources.camp": new_camp_resources,
            "characters.$.gear.resources.backpack": new_backpack_resources,
        }},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


def _recyclable_camp_entries(character: dict):
    """
    Yields (kind, id, entry, count) for every camp item instance
    (location:"camp") and itemBalances.camp entry whose family has a
    recipe to recycle - "instance"/instanceId/1 for an instance (always
    exactly one unit), "balance"/item_id/owned-quantity for an
    itemBalance (its WHOLE stack, not a partial amount - there's no
    partial selection here, only include-or-exclude per row). Shared by
    preview_camp_refine and refine_camp so both agree on exactly what
    "refinable" means and in what order - the chopping block's own bulk
    recycle (see CampView.tsx).
    """
    gear = character.get("gear", {})
    for instance in gear.get("items", []):
        if instance.get("location") != "camp":
            continue
        entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(instance["itemId"])
        if entry is None:
            continue
        yield "instance", instance["instanceId"], entry, 1
    for item_id, qty in gear.get("itemBalances", {}).get("camp", {}).items():
        if qty <= 0:
            continue
        entry = items_catalog.ITEM_CATALOG_ENTRIES_BY_ID.get(item_id)
        if entry is None:
            continue
        yield "balance", item_id, entry, qty


async def preview_camp_refine(address: str, character_id: str) -> Optional[List[Dict[str, object]]]:
    """
    Read-only: every recyclable thing currently sitting in a character's
    own camp (see _recyclable_camp_entries), one row per distinct thing,
    with what recycling ALL of it would hand back - the chopping block's
    own preview list (see CampView.tsx), "as if each would be recycled"
    one by one, nothing actually recycled yet. Each row's own "recoveries"
    is the SAME List[RawMaterialRecovery] shape preview_recycle already
    returns for one item - auth_routes.py's own _to_recycle_preview_response
    turns it into the full per-raw-family breakdown (name, yield%,
    recovered/total units), not just a flattened total, since the
    chopping block's popup shows that same level of detail per row.
    Scored the same way a character-side recycle always is
    (character.tools only, never the shared pool - see
    recycle_item_instance's own docstring). Non-recyclable camp holdings
    (no recipe) are silently left out, same as ItemDetailPopup's own
    canRecycle gate. Returns None if the address/character pair doesn't
    match; [] if camp holds nothing recyclable right now.
    """
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None

    rows: List[Dict[str, object]] = []
    for kind, entry_id, entry, count in _recyclable_camp_entries(character):
        recoveries = recycling.resolve_recycle_preview(entry.family_id, entry.tier, character, {}, [], count)
        if not recoveries:
            continue
        rows.append({
            "id": entry_id,
            "kind": kind,
            "name": entry.name,
            "tier": entry.tier,
            "owned": count,
            "recoveries": recoveries,
        })
    return rows


async def refine_camp(address: str, character_id: str, selected_ids: List[str]) -> Optional[Player]:
    """
    The chopping block's own bulk action (see CampView.tsx): recycles
    every selected camp item instance/itemBalance entry (ids from
    preview_camp_refine's own rows) at once, crediting ALL the recovered
    raw/processed materials straight into gear.resources.camp - never the
    backpack (unlike a normal single-item recycle's own
    _recycle_resource_updates fallback chain), since dropping it in camp
    is the whole point of a camp-side chopping block. Computed once as a
    full replacement of gear.items/itemBalances.camp/resources.camp in a
    single $set (same reasoning as move_all_camp_to_backpack's own
    docstring) rather than per-id calls. An id that no longer qualifies
    (already gone, or no longer has a recipe) is silently skipped rather
    than failing the whole batch. Returns None if nothing in
    `selected_ids` actually recycled (none given, or none of it still
    qualifies), or the address/character pair doesn't match.
    """
    if not selected_ids:
        return None
    selected = set(selected_ids)
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None

    recycled_instance_ids: set = set()
    recycled_balance_ids: set = set()
    recovered_totals: Dict[str, int] = {}

    for kind, entry_id, entry, count in _recyclable_camp_entries(character):
        if entry_id not in selected:
            continue
        recoveries = recycling.resolve_recycle_preview(entry.family_id, entry.tier, character, {}, [], count)
        if not recoveries:
            continue
        amounts = recycling.flatten_recovery(recoveries)
        if not amounts:
            continue
        for rid, qty in amounts.items():
            recovered_totals[rid] = recovered_totals.get(rid, 0) + qty
        if kind == "instance":
            recycled_instance_ids.add(entry_id)
        else:
            recycled_balance_ids.add(entry_id)

    if not recycled_instance_ids and not recycled_balance_ids:
        return None

    gear = character.get("gear", {})
    new_items = [
        instance for instance in gear.get("items", [])
        if not (instance.get("location") == "camp" and instance["instanceId"] in recycled_instance_ids)
    ]
    new_camp_item_balances = {
        item_id: qty for item_id, qty in gear.get("itemBalances", {}).get("camp", {}).items()
        if item_id not in recycled_balance_ids
    }
    new_camp_resources = dict(gear.get("resources", {}).get("camp", {}))
    for rid, qty in recovered_totals.items():
        new_camp_resources[rid] = new_camp_resources.get(rid, 0) + qty

    doc = await db.players.find_one_and_update(
        {"address": address, "characters.id": character_id},
        {"$set": {
            "characters.$.gear.items": new_items,
            "characters.$.gear.itemBalances.camp": new_camp_item_balances,
            "characters.$.gear.resources.camp": new_camp_resources,
        }},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def load_resource_to_backpack(
    address: str, character_id: str, resource_id: str, amount: int = 1
) -> Optional[Player]:
    """
    Move `amount` of `resource_id` from a character's own crafting vault
    (resources - now only ever populated transiently by start_craft, since
    check_out_resource no longer exists) into their backpack
    (backpackResources, slot-limited) - physically packing materials for an
    adventure. The marginal slot cost is ceil((existing+amount)/stack_size) -
    ceil(existing/stack_size), since multiple units of the same id share a
    slot up to its stack size (rawStackSize:40 / processedStackSize:20).
    Returns None if the character doesn't hold `amount` in its vault, or
    there isn't room.
    """
    _validate_resource_grant(resource_id, amount)
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None
    if character.get("crafting", {}).get("resources", {}).get(resource_id, 0) < amount:
        return None

    if resource_id in RESOURCE_ITEMS_BY_ID:
        stack_size = items_catalog.RAW_STACK_SIZE
    else:
        stack_size = items_catalog.PROCESSED_STACK_SIZE
    existing = character.get("gear", {}).get("resources", {}).get("backpack", {}).get(resource_id, 0)
    marginal_slots = math.ceil((existing + amount) / stack_size) - math.ceil(existing / stack_size)

    capacity = items_catalog.backpack_capacity(character)
    if capacity == 0:
        raise ValueError("No backpack equipped")
    used = items_catalog.backpack_slots_used(character)
    if used + marginal_slots > capacity:
        raise ValueError("Backpack is full")

    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {"$elemMatch": {"id": character_id, f"crafting.resources.{resource_id}": {"$gte": amount}}},
        },
        {"$inc": {
            f"characters.$.crafting.resources.{resource_id}": -amount,
            f"characters.$.gear.resources.backpack.{resource_id}": amount,
        }},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def unload_resource_from_backpack(
    address: str, character_id: str, resource_id: str, amount: int = 1
) -> Optional[Player]:
    """
    Move `amount` of `resource_id` from a character's own backpack
    (gear.resources.backpack) straight into the player's shared crafting
    stock (crafting.resources - "Party's Resources", the same pool
    check_out_resource_to_backpack draws from) - the reverse of that
    function. Never capacity-gated on the shared-pool side (only backpacks
    have a slot ceiling). Raises ValueError if the character is currently
    out on an adventure - there's no reaching the shared vault mid-
    adventure, same as check_out_item_balance; a packed resource popup
    should offer move_backpack_resource_to_camp instead while inAdventure.
    Returns None if the character doesn't hold `amount` in its backpack.
    """
    _validate_resource_grant(resource_id, amount)
    db = get_database()
    character_doc = await db.players.find_one(
        {"address": address, "characters.id": character_id}, {"characters.$": 1}
    )
    if character_doc is None or not character_doc.get("characters"):
        return None
    if character_doc["characters"][0].get("availability", {}).get("inAdventure", False):
        raise ValueError("Character is out on an adventure - no reaching the shared vault")

    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {
                "$elemMatch": {"id": character_id, f"gear.resources.backpack.{resource_id}": {"$gte": amount}}
            },
        },
        {"$inc": {
            f"characters.$.gear.resources.backpack.{resource_id}": -amount,
            f"crafting.resources.{resource_id}": amount,
        }},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def move_backpack_resource_to_camp(
    address: str, character_id: str, resource_id: str, amount: int = 1
) -> Optional[Player]:
    """
    Move `amount` of `resource_id` straight from a character's own backpack
    (gear.resources.backpack) into their own camp (gear.resources.camp) -
    both ends already this character's own holdings, so (like
    move_backpack_item_to_camp) this works fine mid-adventure, unlike
    unload_resource_from_backpack which reaches the shared vault instead.
    This is what lets a packed resource's own popup offer a real "move to
    camp" action while out on a story, the same way a packed ITEM instance
    already does (see unstowToCamp). Never capacity-gated (camp is
    uncapped). Returns None if the character doesn't hold `amount` in its
    backpack.
    """
    _validate_resource_grant(resource_id, amount)
    db = get_database()
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {
                "$elemMatch": {"id": character_id, f"gear.resources.backpack.{resource_id}": {"$gte": amount}}
            },
        },
        {"$inc": {
            f"characters.$.gear.resources.backpack.{resource_id}": -amount,
            f"characters.$.gear.resources.camp.{resource_id}": amount,
        }},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def move_camp_resource_to_backpack(
    address: str, character_id: str, resource_id: str, amount: int = 1
) -> Optional[Player]:
    """
    Move `amount` of `resource_id` straight from a character's own camp
    (gear.resources.camp) into their own backpack (gear.resources.backpack)
    - the reverse of move_backpack_resource_to_camp, and the resource
    equivalent of move_camp_item_to_backpack. Capacity-gated exactly like
    check_out_resource_to_backpack (same marginal-slot math, never a
    partial fill) - camp itself stays uncapped either way. Raises
    ValueError if the character has no backpack equipped, or the backpack
    doesn't have room for the whole amount. Returns None if the character
    doesn't hold `amount` in its camp.
    """
    _validate_resource_grant(resource_id, amount)
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None
    if character.get("gear", {}).get("resources", {}).get("camp", {}).get(resource_id, 0) < amount:
        return None

    capacity = items_catalog.backpack_capacity(character)
    if capacity == 0:
        raise ValueError("No backpack equipped")
    used = items_catalog.backpack_slots_used(character)
    marginal = _resource_marginal_backpack_slots(character, {resource_id: amount})
    if used + marginal > capacity:
        raise ValueError("Backpack is full")

    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {
                "$elemMatch": {"id": character_id, f"gear.resources.camp.{resource_id}": {"$gte": amount}}
            },
        },
        {"$inc": {
            f"characters.$.gear.resources.camp.{resource_id}": -amount,
            f"characters.$.gear.resources.backpack.{resource_id}": amount,
        }},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def check_in_resource_from_camp(
    address: str, character_id: str, resource_id: str, amount: int = 1
) -> Optional[Player]:
    """
    Move `amount` of `resource_id` straight from a character's own camp
    (gear.resources.camp) into the player's shared crafting stock
    (crafting.resources - "Party's Resources") - the camp equivalent of
    unload_resource_from_backpack. Same inAdventure guard for the same
    reason: there's no reaching the shared vault mid-adventure, so a camp
    resource's own popup should offer move_camp_resource_to_backpack
    instead while out on a story. Returns None if the character doesn't
    hold `amount` in its camp.
    """
    _validate_resource_grant(resource_id, amount)
    db = get_database()
    character_doc = await db.players.find_one(
        {"address": address, "characters.id": character_id}, {"characters.$": 1}
    )
    if character_doc is None or not character_doc.get("characters"):
        return None
    if character_doc["characters"][0].get("availability", {}).get("inAdventure", False):
        raise ValueError("Character is out on an adventure - no reaching the shared vault")

    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {
                "$elemMatch": {"id": character_id, f"gear.resources.camp.{resource_id}": {"$gte": amount}}
            },
        },
        {"$inc": {
            f"characters.$.gear.resources.camp.{resource_id}": -amount,
            f"crafting.resources.{resource_id}": amount,
        }},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def load_item_balance_to_backpack(
    address: str, character_id: str, item_id: str, amount: int = 1
) -> Optional[Player]:
    """
    Move `amount` of `item_id` (a concrete crafted-item id) from a
    character's own itemBalances vault into backpackItemBalances - the
    itemBalances equivalent of load_resource_to_backpack. Stack size and
    slot cost come from the item's own family row in
    item-inventory-properties.json (resolved via
    items_catalog.FAMILY_ID_BY_FINAL_ITEM_ID), not the raw/processed
    fallback resources use.
    """
    if amount <= 0:
        raise ValueError("amount must be positive")
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None
    if character.get("gear", {}).get("itemBalances", {}).get("camp", {}).get(item_id, 0) < amount:
        return None

    family_id = items_catalog.FAMILY_ID_BY_FINAL_ITEM_ID.get(item_id)
    family = items_catalog.ITEM_FAMILIES_BY_ID.get(family_id) if family_id else None
    stack_size = family.stack_size if family else 1
    slot_cost = items_catalog.slot_cost_for_family(family_id) if family_id else 1

    existing = character.get("gear", {}).get("itemBalances", {}).get("backpack", {}).get(item_id, 0)
    marginal_slots = (
        math.ceil((existing + amount) / stack_size) - math.ceil(existing / stack_size)
    ) * slot_cost

    capacity = items_catalog.backpack_capacity(character)
    if capacity == 0:
        raise ValueError("No backpack equipped")
    used = items_catalog.backpack_slots_used(character)
    if used + marginal_slots > capacity:
        raise ValueError("Backpack is full")

    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {"$elemMatch": {"id": character_id, f"gear.itemBalances.camp.{item_id}": {"$gte": amount}}},
        },
        {"$inc": {
            f"characters.$.gear.itemBalances.camp.{item_id}": -amount,
            f"characters.$.gear.itemBalances.backpack.{item_id}": amount,
        }},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def unload_item_balance_from_backpack(
    address: str, character_id: str, item_id: str, amount: int = 1
) -> Optional[Player]:
    """The reverse of load_item_balance_to_backpack - never capacity-gated."""
    if amount <= 0:
        raise ValueError("amount must be positive")
    db = get_database()
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {
                "$elemMatch": {"id": character_id, f"gear.itemBalances.backpack.{item_id}": {"$gte": amount}}
            },
        },
        {"$inc": {
            f"characters.$.gear.itemBalances.backpack.{item_id}": -amount,
            f"characters.$.gear.itemBalances.camp.{item_id}": amount,
        }},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def degrade_item_quality(
    address: str, character_id: str, instance_id: str, amount: int = 1
) -> Optional[Player]:
    """
    Internal-only - not registered as a route; no combat/adventure system
    exists yet to legitimately call this. Lowers one item instance's
    quality by `amount`. A plain relative $inc, not floor-clamped at 0 -
    quality can go negative; treat quality <= 0 as broken wherever it's
    read/displayed.
    """
    db = get_database()
    doc = await db.players.find_one_and_update(
        {"address": address, "characters": {"$elemMatch": {"id": character_id, "gear.items.instanceId": instance_id}}},
        {"$inc": {"characters.$[char].gear.items.$[item].quality": -amount}},
        array_filters=[{"char.id": character_id}, {"item.instanceId": instance_id}],
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def consume_ammo(
    address: str, character_id: str, ammo_family_id: str, amount: int = 1
) -> Optional[Player]:
    """
    Internal-only - not registered as a route; no combat/adventure system
    exists yet to legitimately call this. Ammo (arrow/bolt/oil) is an
    ordinary tiered PROCESSED_RESOURCE_ITEMS_BY_ID entry flowing through
    Character.resources, not an instance - draws from the highest tier the
    character holds enough of.
    """
    if amount <= 0:
        raise ValueError("amount must be positive")
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None

    held = character.get("crafting", {}).get("resources", {})
    candidates = sorted(
        (item for item in PROCESSED_RESOURCE_ITEMS if item.family_id == ammo_family_id),
        key=lambda item: item.tier,
        reverse=True,
    )
    concrete_id = next((item.id for item in candidates if held.get(item.id, 0) >= amount), None)
    if concrete_id is None:
        return None

    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {"$elemMatch": {"id": character_id, f"crafting.resources.{concrete_id}": {"$gte": amount}}},
        },
        {"$inc": {f"characters.$.crafting.resources.{concrete_id}": -amount}},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)
