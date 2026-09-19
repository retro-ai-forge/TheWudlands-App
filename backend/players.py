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

    return Player(
        address=doc["address"],
        first_login_at=_as_utc(doc["first_login_at"]),
        characters=doc.get("characters", []),
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


def _recycle_destination_bucket(character: dict) -> str:
    """
    Which of this character's own gear.resources buckets recycled
    materials land in - never the player's shared vault, recycling always
    hands materials straight to whatever this character is physically
    carrying it in. Prefers a worn backpack, then a mount's saddlepack
    (Mbagpack), and only falls back to "camp" (owned, not packed anywhere)
    when neither is equipped - so recycling never fails or discards
    materials just because nothing's currently worn to carry them in.
    """
    if items_catalog.has_backpack_equipped(character):
        return "backpack"
    if items_catalog.has_saddlepack_equipped(character):
        return "saddlepack"
    return "camp"


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
    the vault). Either way, the recovered materials always land on THIS
    character - never the player's shared vault, even when recycling a
    vault item - in whichever of its own gear.resources buckets it can
    actually carry them in right now (see _recycle_destination_bucket).

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
    bucket = _recycle_destination_bucket(character)
    inc_ops = {f"characters.$.gear.resources.{bucket}.{rid}": qty for rid, qty in amounts.items()}

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
        update = {"$pull": {"characters.$.gear.items": {"instanceId": instance_id}}}
        if inc_ops:
            update["$inc"] = inc_ops
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
            update,
            return_document=ReturnDocument.AFTER,
        )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def recycle_item_balance(
    address: str, character_id: str, item_id: str, amount: int = 1, from_vault: bool = False
) -> Optional[Player]:
    """
    The item_balances/itemBalances equivalent of recycle_item_instance -
    same from_vault split for which pool `amount` is consumed FROM
    (character's own gear.itemBalances.camp vs. the player's shared
    vault.itemBalances), for stackable finished goods (food, potions, misc
    trinkets) rather than instance-tracked gear. Either way, the recovered
    materials always land on THIS character's own gear.resources (see
    _recycle_destination_bucket), never the player's shared vault.
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
        held = character.get("gear", {}).get("itemBalances", {}).get("camp", {}).get(item_id, 0)
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
    bucket = _recycle_destination_bucket(character)

    if from_vault:
        update: Dict[str, object] = {"$inc": {f"vault.itemBalances.{item_id}": -amount}}
        for rid, qty in amounts.items():
            update["$inc"][f"characters.$.gear.resources.{bucket}.{rid}"] = qty
        doc = await db.players.find_one_and_update(
            {"address": address, "characters.id": character_id, f"vault.itemBalances.{item_id}": {"$gte": amount}},
            update,
            return_document=ReturnDocument.AFTER,
        )
    else:
        update = {"$inc": {f"characters.$.gear.itemBalances.camp.{item_id}": -amount}}
        for rid, qty in amounts.items():
            update["$inc"][f"characters.$.gear.resources.{bucket}.{rid}"] = qty
        doc = await db.players.find_one_and_update(
            {
                "address": address,
                "characters": {"$elemMatch": {"id": character_id, f"gear.itemBalances.camp.{item_id}": {"$gte": amount}}},
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
    character already has an unfinished craft), checks ingredients (each
    consumed quantity scaled by `count` - see `_resolve_recipe_ingredients`)
    against the character vault + player's shared vault combined and the
    required tool similarly, then transfers onto the character whatever
    wasn't already there (so it shows up in the character's own crafting
    list right away) and starts a single timer (Character.activeCraft),
    its length scaled by the recipe's own full raw-material chain, `tier`,
    AND `count` - see `_craft_duration_seconds`. The output isn't
    produced yet - call finish_craft once the timer elapses, which
    produces all `count` units at once.

    Instance-tracked tool alternatives (e.g. axe_stone) are never
    auto-transferred here, and only ever need to be owned once regardless
    of `count` - see `_resolve_tool_for_craft`. Also pays out raw-material
    crafting XP right away (see `_crafting_xp_increments`) - to every
    profession slot whose category lists a raw material used directly by
    this recipe's own ingredients (not recursively through a "processed"
    ingredient's own sub-recipe), scaled by `count`. A recipe with no
    direct raw ingredient (e.g. dagger, purely processed metal_bar) earns
    none from this step - crafting the processed intermediate is its own
    separate step that already paid that out. The README's final-item
    assembly-bonus XP is a separate mechanic paid at finish_craft time
    instead - see there. Raises ValueError for an unknown recipe/output
    row, an unsupported recipe shape, or `count < 1`. Returns None if the
    character is already mid-craft, is currently out on a story
    (Character.availability.inAdventure - mutually exclusive with
    crafting, see set_in_adventure's own matching check), can't afford
    the (count-scaled) ingredients even combined, has no access to a
    listed tool, hasn't learned the required blueprint, or the
    address/character pair doesn't match any player document.
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
    # does, below.
    resolved = _resolve_recipe_ingredients(
        recipe, tier, {}, doc.get("crafting", {}).get("resources", {}), character, count,
        player_items=doc.get("vault", {}).get("items", []),
        character_item_balances={}, player_item_balances=doc.get("vault", {}).get("itemBalances", {}),
    )
    if resolved is None:
        return None
    _, player_decrements, _, player_item_balance_decrements, ingredient_moves = resolved

    tool_candidates = recipe.get("tool")
    tool_transfer_id: Optional[str] = None
    tool_move: Optional[tuple] = None
    if tool_candidates is not None:
        if isinstance(tool_candidates, str):
            tool_candidates = [tool_candidates]
        found = _resolve_tool_for_craft(
            character,
            doc.get("crafting", {}).get("tools", {}),
            tool_candidates,
            tier,
            check_character_flat_balance=False,
            player_items=doc.get("vault", {}).get("items", []),
        )
        if found is None:
            return None
        if found[0] == "flat_transfer":
            tool_transfer_id = found[1]
        elif found[0] == "instance_move":
            tool_move = found

    blueprint_family_id = recipe.get("blueprintFamilyId")
    if blueprint_family_id is not None:
        if not _owns_blueprint_at_or_above(character, blueprint_family_id, tier):
            return None

    # Every instance-tracked tool this craft needs to borrow: the recipe's
    # own "tool" field (tool_move) plus any ingredient-level "final"/
    # unconsumed alternative that also resolved to one (ingredient_moves).
    # Deduplicated by instanceId - no current recipe needs the same
    # instance twice, but cheap to guard.
    all_moves: List[tuple] = []
    seen_instance_ids: set = set()
    for move in ingredient_moves + ([tool_move] if tool_move else []):
        if move[1] not in seen_instance_ids:
            seen_instance_ids.add(move[1])
            all_moves.append(move)

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
    # shape each branch below builds, not $inc.
    xp_grants = _crafting_xp_increments(character, family_id, count)

    ready_at = datetime.now(timezone.utc) + timedelta(
        seconds=_craft_duration_seconds(recipe, family_id, tier, character, count)
    )
    active_craft: Dict = {
        "familyId": family_id,
        "tier": tier,
        "count": count,
        "readyAt": ready_at.isoformat(),
        # Only set when this call actually moved a tool from the player's
        # shared pool - a tool the character already had (found on hand,
        # nothing transferred) is never returned by finish_craft, only
        # what was specifically borrowed here.
        "toolTransferId": tool_transfer_id,
        # Every instance-tracked tool physically moved to location:
        # "crafting" for this craft (see _resolve_tool_for_craft) -
        # {instanceId, source, slotRef}, source being "pool"/"backpack"/
        # "body" so finish_craft can put each one back exactly where it
        # came from (a "body" source's slotRef is what it was equipped
        # into, restored on release).
        "borrowedInstances": [
            {"instanceId": instance_id, "source": source, "slotRef": slot_ref}
            for _kind, instance_id, source, slot_ref in all_moves
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
    for idx, (_kind, instance_id, source, _slot_ref) in enumerate(all_moves):
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
    its quality docked by `count` when released back here - one point of
    wear per unit actually crafted in the batch. Unlike degrade_item_quality's
    own "quality can go negative, treat <= 0 as broken" convention, a
    borrowed tool/weapon whose quality would drop to 0 or below from this
    wear doesn't just sit there broken - it's removed entirely, gone from
    wherever it would have been returned to (pool or backpack/body alike).

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
    # No current recipe needs more than one instance-tracked tool at once,
    # so borrowed_instances is a single-element list in practice, and every
    # element shares one source. This only implements that reachable shape
    # (asserted below) rather than a general multi-instance/mixed-source
    # release - MongoDB rejects a $pull and a $set both touching
    # characters.$[char].gear.items in one update (one path prefixes the
    # other), which a real mix would require untangling; add that handling
    # if a future recipe actually needs two simultaneous instance tools.
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

    if source == "pool":
        # $pull the borrowed instance(s) off the character. A survivor
        # (quality still above 0 after this batch's -count wear, see the
        # README's tool-wear note) gets $push'd back into the shared vault
        # as an ordinary unassigned pool item; one whose quality drops to
        # 0 or below is gone for good instead - it just vanishes, never
        # pushed back anywhere.
        instance_ids = [bi["instanceId"] for bi in borrowed_instances]
        returned = []
        for iid in instance_ids:
            new_quality = held_by_id[iid].get("quality", 0) - count
            if new_quality > 0:
                returned.append({**held_by_id[iid], "location": "pool", "slotRef": [], "quality": new_quality})
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
        # backpack/body source - restore in place, unless its quality
        # would drop to 0 or below after this batch's -count wear (same
        # vanish rule as the pool branch above), in which case it's
        # $pull'd out entirely instead of restored. Only reachable with
        # exactly one borrowed instance in today's recipes (see the
        # sources-mixing guard above) - a $pull and a $set can't both
        # touch characters.$[char].gear.items in one update, so a hypothetical
        # mixed survive/break batch of more than one instance isn't
        # handled; raise rather than silently doing the wrong thing if
        # that ever becomes reachable.
        broken_ids = [
            bi["instanceId"] for bi in borrowed_instances
            if held_by_id[bi["instanceId"]].get("quality", 0) - count <= 0
        ]
        if broken_ids and len(borrowed_instances) > 1:
            raise ValueError(
                "Releasing a mixed batch of surviving/broken instance tools in a single craft is not supported yet"
            )

        if broken_ids:
            update["$pull"] = {"characters.$[char].gear.items": {"instanceId": {"$in": broken_ids}}}
        else:
            set_ops: Dict = {}
            for idx, bi in enumerate(borrowed_instances):
                filt_id = f"relItem{idx}"
                array_filters.append({f"{filt_id}.instanceId": bi["instanceId"], f"{filt_id}.location": "crafting"})
                set_ops[f"characters.$[char].gear.items.$[{filt_id}].location"] = bi["source"]
                set_ops[f"characters.$[char].gear.items.$[{filt_id}].slotRef"] = bi.get("slotRef") or []
                # Tool wear - see the "pool" branch above for the same
                # -count per unit crafted. Deliberately a SEPARATE
                # array-filter identifier (matched on instanceId alone,
                # not also location:"crafting" like relItem's) rather
                # than reusing relItem's own filt_id here: this backend's
                # Mongo-compatible layer silently drops an $inc that
                # shares an array-filter identifier with a $set already
                # changing the very field (location) that identifier's
                # own match condition depends on (confirmed live - the
                # $set applies, the co-identified $inc quietly no-ops). A
                # plain instanceId-only filter isn't affected by that
                # field changing mid-update.
                wear_filt_id = f"wearItem{idx}"
                array_filters.append({f"{wear_filt_id}.instanceId": bi["instanceId"]})
                inc_ops[f"characters.$[char].gear.items.$[{wear_filt_id}].quality"] = -count
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

    if destination == "backpack" and not items_catalog.has_backpack_equipped(character):
        raise ValueError("No backpack equipped")
    if destination == "saddlepack" and not items_catalog.has_saddlepack_equipped(character):
        raise ValueError("No saddlepack equipped")

    target_location = destination or ("camp" if character.get("availability", {}).get("inAdventure", False) else "pool")

    if target_location == "pool":
        pooled_instance = {**instance, "location": "pool", "slotRef": []}
        doc = await db.players.find_one_and_update(
            {
                "address": address,
                "characters": {
                    "$elemMatch": {"id": character_id, "gear.items": {"$elemMatch": {"instanceId": instance_id, "location": "body"}}}
                },
            },
            {
                "$pull": {"characters.$[char].gear.items": {"instanceId": instance_id}},
                "$push": {"vault.items": pooled_instance},
            },
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

    pooled_instance = {**instance, "location": "pool", "slotRef": []}
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {"$elemMatch": {"id": character_id, "gear.items.instanceId": instance_id}},
        },
        {
            "$pull": {"characters.$[char].gear.items": {"instanceId": instance_id}},
            "$push": {"vault.items": pooled_instance},
        },
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


async def check_in_item_balance(address: str, character_id: str, item_id: str, amount: int = 1) -> Optional[Player]:
    """The reverse of check_out_item_balance."""
    if amount <= 0:
        raise ValueError("amount must be positive")
    db = get_database()
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {"$elemMatch": {"id": character_id, f"gear.itemBalances.camp.{item_id}": {"$gte": amount}}},
        },
        {"$inc": {
            f"vault.itemBalances.{item_id}": amount,
            f"characters.$.gear.itemBalances.camp.{item_id}": -amount,
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
    """The reverse of load_resource_to_backpack - never capacity-gated."""
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
            f"characters.$.crafting.resources.{resource_id}": amount,
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
