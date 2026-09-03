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

from backend import items_catalog
from backend.character import Character
from backend.db import get_database
from backend.resources_catalog import RESOURCE_ITEMS, RESOURCE_ITEMS_BY_ID
from backend.processed_catalog import PROCESSED_RESOURCE_ITEMS, PROCESSED_RESOURCE_ITEMS_BY_ID
from backend.tools_catalog import TOOL_ITEMS_BY_ID

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
# having learned that blueprint - at the same tier as the item being
# crafted, resolved the same family+tier -> concrete id way as ingredients
# and outputs.
_BLUEPRINT_ID_BY_FAMILY_TIER: dict[tuple[str, int], str] = _load_blueprint_ids()


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
        "items": [],
        "itemBalances": {},
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
            "items": [],
            "itemBalances": {},
        }

    if inventory:
        # "items" used to be a placeholder dict ({}) before the item-instance
        # system existed - coerce any leftover pre-migration doc to the list
        # shape instances actually need. itemBalances didn't exist at all
        # before then, so it's always missing on those same old docs.
        if not isinstance(inventory.get("items"), list):
            inventory["items"] = []
        inventory.setdefault("itemBalances", {})

    return Player(
        address=doc["address"],
        first_login_at=_as_utc(doc["first_login_at"]),
        characters=doc.get("characters", []),
        inventory=inventory or {
            "tools": {},
            "resources": {},
            "items": [],
            "itemBalances": {},
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
            "items": [],
            "itemBalances": {},
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


async def check_in_tool(
    address: str, character_id: str, tool_id: str, amount: int = 1, pool: str = "tools"
) -> Optional[Player]:
    """
    Move `amount` of `tool_id` from one of `address`'s characters back into
    the shared tool pool. Requires that character to actually be holding
    `amount`. The only direction this moves in now - a character's own
    tools are a temporary crafting-session staging area (populated by
    start_craft, never by a direct player-initiated transfer), so there's
    no check_out_tool counterpart; this stays as the drain path for
    whatever a craft left behind, or old data.
    """
    _validate_tool_pool(pool)
    if amount <= 0:
        raise ValueError("amount must be positive")
    db = get_database()

    # `pool` (e.g. "inventory.tools") is the player's own shared pool, but a
    # character's own tools are always stored flatly as Character.tools
    # ("tools", never nested under "inventory") - the two sides of this
    # transfer are NOT the same path.
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


async def check_in_resource(
    address: str, character_id: str, resource_id: str, amount: int = 1
) -> Optional[Player]:
    """
    Move `amount` of `resource_id` from one of `address`'s characters' own
    resources back into the shared inventory's resources pool. Requires
    that character to actually be holding `amount`. The only direction this
    moves in now - same reasoning as check_in_tool: a character's own
    resources are a temporary crafting-session staging area, not somewhere
    a player parks materials directly.
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


def _resolve_tool_for_craft(
    character: dict,
    player_tools: Dict[str, int],
    tool_families: List[str],
    check_character_flat_balance: bool = True,
) -> Optional[tuple[bool, Optional[str]]]:
    """
    For a recipe's tool alternatives, find one `character` can use.

    Instance-tracked tool-weapons (a needsItemDefinition:true family like
    axe_stone that doubles as a tool) are a separate, unrelated mechanic -
    always checked against the character's own equip/backpack state
    (Character.items), never transferred here (that's a capacity-gated
    backpack check-out, a different operation).

    For an ordinary flat-balance family, crafting only ever checks the
    player's shared vault (same "character vault is a temporary staging
    area, not a persistent balance" reasoning as resources) - unless
    `check_character_flat_balance` is left True, which also accepts one
    already sitting in Character.tools; finish_craft uses that to
    re-verify what start_craft transferred is still there, passing
    `player_tools={}` so it can only ever find it on the character.

    Returns `(True, None)` if already usable without a transfer (an
    instance-tracked tool on the character, or - only when
    `check_character_flat_balance` - a flat balance on the character).
    Returns `(False, concrete_id)` if a flat-balance tool is only available
    in `player_tools` and would need transferring first. Returns None if
    nothing usable is found anywhere.
    """
    held_tools = character.get("tools", {})
    held_items = character.get("items", [])

    for family_id in tool_families:
        family = items_catalog.ITEM_FAMILIES_BY_ID.get(family_id)
        if family and family.needs_item_definition:
            if any(
                instance["familyId"] == family_id and instance.get("location") in ("backpack", "body")
                for instance in held_items
            ):
                return (True, None)
            continue
        if check_character_flat_balance and any(
            held_tools.get(tool.id, 0) > 0 for tool in TOOL_ITEMS_BY_ID.values() if tool.family_id == family_id
        ):
            return (True, None)
        for tool in TOOL_ITEMS_BY_ID.values():
            if tool.family_id == family_id and player_tools.get(tool.id, 0) > 0:
                return (False, tool.id)
    return None


# Flat for now - every recipe takes the same 2 minutes, regardless of
# family/tier/character stats. A future pass could scale this per recipe
# (a "craftSeconds" field) or by a profession-level/attribute formula.
CRAFT_DURATION_SECONDS = 120


def _resolve_ingredient_option(
    option: dict,
    tier: int,
    character: dict,
    character_resources: Dict[str, int],
    player_resources: Dict[str, int],
    count: int = 1,
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
    `{"held": True}` for an unconsumed option that's simply owned (nothing
    to decrement - resolved the same way `_resolve_tool_for_craft` resolves
    the "tool" field, since "own a needsItemDefinition:true family,
    don't use it up" is the identical question), or
    `{"held": False, "concrete_id", "qty", "from_character", "from_player"}`
    for a resource that would actually be consumed.
    """
    category = option["category"]
    qty = option["qty"] * count
    consumed = option.get("consumed", True)
    family_id = option["familyId"]

    if category == "final" and not consumed:
        if _resolve_tool_for_craft(character, {}, [family_id]) is None:
            return None
        return {"held": True}

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
    return {"held": False, "concrete_id": concrete_id, "from_character": from_character, "from_player": from_player}


def _resolve_recipe_ingredients(
    recipe: dict,
    tier: int,
    character_resources: Dict[str, int],
    player_resources: Dict[str, int],
    character: Optional[dict] = None,
    count: int = 1,
) -> Optional[tuple[Dict[str, int], Dict[str, int]]]:
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
    (character_decrements, player_decrements) - amounts to take from each,
    character vault first, shared vault only for whatever's still short -
    or None if there isn't enough even combined.

    An ingredient with an "alternatives" list (e.g. carcass's
    bone_blade-or-dagger choice) tries each option, preferring an
    already-owned unconsumed one (free to use) before falling back to the
    first affordable consumed one - the same priority
    recipe-viewer.template.html's pickBestAlternative uses, so what the
    button shows as craftable matches what this actually accepts. `character`
    is only needed to resolve an unconsumed "final"-category option
    (e.g. dagger) - omit it for calls that can't have one satisfied anyway
    (finish_craft's re-check already gets this from its own character read).

    Raises ValueError for an unsupported ingredient category or a missing
    tier row.
    """
    character_decrements: Dict[str, int] = {}
    player_decrements: Dict[str, int] = {}
    character = character or {}
    for ingredient in recipe["ingredients"]:
        options = ingredient["alternatives"] if "alternatives" in ingredient else [ingredient]

        plan = None
        for option in options:
            if option.get("consumed", True):
                continue
            plan = _resolve_ingredient_option(
                option, tier, character, character_resources, player_resources, count
            )
            if plan is not None:
                break
        if plan is None:
            for option in options:
                if not option.get("consumed", True):
                    continue
                plan = _resolve_ingredient_option(
                    option, tier, character, character_resources, player_resources, count
                )
                if plan is not None:
                    break
        if plan is None:
            return None

        if not plan["held"]:
            concrete_id = plan["concrete_id"]
            if plan["from_character"]:
                character_decrements[concrete_id] = character_decrements.get(concrete_id, 0) + plan["from_character"]
            if plan["from_player"]:
                player_decrements[concrete_id] = player_decrements.get(concrete_id, 0) + plan["from_player"]
    return character_decrements, player_decrements


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
    """
    concrete_id = _PROCESSED_ID_BY_FAMILY_TIER.get((family_id, tier))
    if concrete_id is not None:
        return {"id": concrete_id, "name": PROCESSED_RESOURCE_ITEMS_BY_ID[concrete_id].name}, True
    output_row = items_catalog.resolve_output_row(family_id, tier)
    if output_row is not None:
        return output_row, False
    return None


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
    list right away) and starts a single `CRAFT_DURATION_SECONDS` timer
    (Character.activeCraft) - the timer doesn't scale with `count`, only
    the ingredients do. The output isn't produced yet - call finish_craft
    once the timer elapses, which produces all `count` units at once.

    Instance-tracked tool alternatives (e.g. axe_stone) are never
    auto-transferred here, and only ever need to be owned once regardless
    of `count` - see `_resolve_tool_for_craft`. Raises ValueError for an
    unknown recipe/output row, an unsupported recipe shape, or `count < 1`.
    Returns None if the character is already mid-craft, can't afford the
    (count-scaled) ingredients even combined, has no access to a listed
    tool, hasn't learned the required blueprint, or the address/character
    pair doesn't match any player document.
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

    active = character.get("activeCraft")
    if active and datetime.fromisoformat(active["readyAt"]) > datetime.now(timezone.utc):
        return None

    # Crafting only ever checks the player's shared vault, never the
    # character's own - the character vault is purely a temporary staging
    # area for an active craft (populated here, drained by finish_craft),
    # not a persistent balance a player manages directly. Passing {} for
    # the character side means the full amount always comes from the
    # player vault (character_decrements stays empty).
    resolved = _resolve_recipe_ingredients(
        recipe, tier, {}, doc.get("inventory", {}).get("resources", {}), character, count
    )
    if resolved is None:
        return None
    _, player_decrements = resolved

    tool_candidates = recipe.get("tool")
    tool_transfer_id: Optional[str] = None
    if tool_candidates is not None:
        if isinstance(tool_candidates, str):
            tool_candidates = [tool_candidates]
        found = _resolve_tool_for_craft(
            character,
            doc.get("inventory", {}).get("tools", {}),
            tool_candidates,
            check_character_flat_balance=False,
        )
        if found is None:
            return None
        _, tool_transfer_id = found

    blueprint_family_id = recipe.get("blueprintFamilyId")
    if blueprint_family_id is not None:
        blueprint_id = _BLUEPRINT_ID_BY_FAMILY_TIER.get((blueprint_family_id, tier))
        if blueprint_id is None or blueprint_id not in character.get("blueprints", []):
            return None

    # Only the shortfall drawn from the player's shared vault actually
    # moves - whatever was already on the character (character_decrements)
    # stays put until finish_craft consumes it.
    match_filter: Dict = {"address": address}
    elem_match: Dict = {"id": character_id}
    inc_ops: Dict[str, int] = {}
    for concrete_id, qty in player_decrements.items():
        match_filter[f"inventory.resources.{concrete_id}"] = {"$gte": qty}
        inc_ops[f"inventory.resources.{concrete_id}"] = -qty
        inc_ops[f"characters.$.resources.{concrete_id}"] = inc_ops.get(
            f"characters.$.resources.{concrete_id}", 0
        ) + qty
    if tool_transfer_id is not None:
        match_filter[f"inventory.tools.{tool_transfer_id}"] = {"$gte": 1}
        inc_ops[f"inventory.tools.{tool_transfer_id}"] = -1
        inc_ops[f"characters.$.tools.{tool_transfer_id}"] = 1

    ready_at = datetime.now(timezone.utc) + timedelta(seconds=CRAFT_DURATION_SECONDS)
    update: Dict = {
        "$set": {
            "characters.$.activeCraft": {
                "familyId": family_id,
                "tier": tier,
                "count": count,
                "readyAt": ready_at.isoformat(),
                # Only set when this call actually moved a tool from the
                # player's shared pool - a tool the character already had
                # (found on hand, nothing transferred) is never returned by
                # finish_craft, only what was specifically borrowed here.
                "toolTransferId": tool_transfer_id,
            }
        }
    }
    if inc_ops:
        update["$inc"] = inc_ops

    match_filter["characters"] = {"$elemMatch": elem_match}
    doc = await db.players.find_one_and_update(match_filter, update, return_document=ReturnDocument.AFTER)
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
    inventory.items for a needsItemDefinition:true family (each unit its
    own instance, per the instance-per-physical-item invariant - never a
    single instance with a quantity), inventory.itemBalances or
    inventory.resources incremented by `count` for a flat-count output,
    always into the player's shared vault, never straight onto the
    character.

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

    active = character.get("activeCraft")
    if active is None or datetime.fromisoformat(active["readyAt"]) > datetime.now(timezone.utc):
        return None

    family_id = active["familyId"]
    tier = active["tier"]
    count = active.get("count", 1)
    recipe, output_row, output_is_processed = _validate_recipe(family_id, tier)

    # Everything needed should already be sitting on the character (see
    # start_craft) - resolved purely against the character's own vault now,
    # with an empty player vault so nothing can be drawn from there.
    resolved = _resolve_recipe_ingredients(recipe, tier, character.get("resources", {}), {}, character, count)
    if resolved is None:
        return None
    character_decrements, _ = resolved

    tool_candidates = recipe.get("tool")
    if tool_candidates is not None:
        if isinstance(tool_candidates, str):
            tool_candidates = [tool_candidates]
        if _resolve_tool_for_craft(character, {}, tool_candidates) is None:
            return None

    elem_match: Dict = {"id": character_id}
    inc_ops: Dict[str, int] = {}
    for concrete_id, qty in character_decrements.items():
        elem_match[f"resources.{concrete_id}"] = {"$gte": qty}
        inc_ops[f"characters.$.resources.{concrete_id}"] = -qty

    # A flat-balance tool start_craft borrowed from the player's shared
    # pool (not one the character already had) goes back once the craft
    # is done - "locked" only for the crafting duration, not indefinitely.
    # An instance-tracked tool alternative (e.g. axe_stone/dagger) is never
    # touched here - toolTransferId is only ever set for the transferred
    # flat-balance case, see start_craft.
    tool_transfer_id = active.get("toolTransferId")
    if tool_transfer_id is not None:
        elem_match[f"tools.{tool_transfer_id}"] = {"$gte": 1}
        inc_ops[f"characters.$.tools.{tool_transfer_id}"] = inc_ops.get(
            f"characters.$.tools.{tool_transfer_id}", 0
        ) - 1
        inc_ops[f"inventory.tools.{tool_transfer_id}"] = 1

    update: Dict = {"$unset": {"characters.$.activeCraft": ""}}
    family = items_catalog.ITEM_FAMILIES_BY_ID.get(family_id)
    if output_is_processed:
        # A crafted processed material (plank, metal_bar, leather, ...) is
        # the exact same kind of thing already stacked in
        # inventory.resources - it belongs in the shared resources pool,
        # not itemBalances, so other recipes' ingredient checks (which only
        # ever look at resources) can actually see it.
        inc_ops[f"inventory.resources.{output_row['id']}"] = count
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
        update["$push"] = {"inventory.items": {"$each": instances}}
    else:
        inc_ops[f"inventory.itemBalances.{output_row['id']}"] = count

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


async def equip_item(address: str, character_id: str, instance_id: str, slots: List[str]) -> Optional[Player]:
    """
    Equip one of a character's own item instances into `slots` - exactly
    the slot names its family requires: one slot for an ordinary item, or
    both of a twoHanded family's two named slots at once (order doesn't
    matter). Once equipped, slotRef holds every slot name the instance
    occupies - for a twoHanded item, both at once - which is what makes the
    occupancy check below correctly block a later attempt to equip
    something else into just one of those slots.

    Raises ValueError if `slots` doesn't match what the instance's family
    actually requires. Returns None if the instance isn't found on this
    character, or if any of `slots` is already occupied by another equipped
    instance.
    """
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None
    instance = next((i for i in character.get("items", []) if i["instanceId"] == instance_id), None)
    if instance is None:
        return None

    family = items_catalog.ITEM_FAMILIES_BY_ID.get(instance["familyId"])
    if family is None:
        raise ValueError(f"Unknown item family: {instance['familyId']}")

    if family.two_handed:
        if sorted(slots) != sorted(family.equip_slots):
            raise ValueError(
                f"{family.family_id} is two-handed - must equip both {list(family.equip_slots)} at once"
            )
    else:
        if len(slots) != 1 or slots[0] not in family.equip_slots:
            raise ValueError(f"{family.family_id} can only be equipped into one of {list(family.equip_slots)}")

    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {
                "$elemMatch": {
                    "id": character_id,
                    "items.instanceId": instance_id,
                    "items": {
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
            "$set": {
                "characters.$[char].items.$[item].location": "body",
                "characters.$[char].items.$[item].slotRef": slots,
            }
        },
        array_filters=[{"char.id": character_id}, {"item.instanceId": instance_id}],
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def unequip_item(address: str, character_id: str, instance_id: str) -> Optional[Player]:
    """
    Unequip one of a character's item instances - clears location back to
    "backpack" and slotRef to [] (freeing both slots at once for a
    two-handed item). Never capacity-gated (see the item-instance plan's
    "Backpack capacity" section). Returns None if the instance isn't found
    equipped on this character.
    """
    db = get_database()
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {"$elemMatch": {"id": character_id, "items.instanceId": instance_id}},
        },
        {
            "$set": {
                "characters.$[char].items.$[item].location": "backpack",
                "characters.$[char].items.$[item].slotRef": [],
            }
        },
        array_filters=[{"char.id": character_id}, {"item.instanceId": instance_id}],
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def check_out_item_instance(address: str, character_id: str, instance_id: str) -> Optional[Player]:
    """
    Move one item instance from `address`'s shared pool (inventory.items,
    location:"pool") onto one of their characters' own backpack
    (location:"backpack"). Capacity-gated: rejected if the character's backpack has no free slot
    for this family's size class (see items_catalog.backpack_slots_used/
    backpack_capacity). Returns None if the instance isn't in the pool, the
    address/character pair doesn't match, or there's no room.
    """
    db = get_database()
    doc = await db.players.find_one({"address": address, "characters.id": character_id})
    if doc is None:
        return None
    character = next((c for c in doc["characters"] if c["id"] == character_id), None)
    if character is None:
        return None
    instance = next(
        (i for i in doc.get("inventory", {}).get("items", []) if i["instanceId"] == instance_id),
        None,
    )
    if instance is None:
        return None

    cost = items_catalog.slot_cost_for_family(instance["familyId"])
    used = items_catalog.backpack_slots_used(character)
    capacity = items_catalog.backpack_capacity(character)
    if used + cost > capacity:
        return None

    backpacked_instance = {**instance, "location": "backpack"}
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters.id": character_id,
            "inventory.items": {"$elemMatch": {"instanceId": instance_id, "location": "pool"}},
        },
        {
            "$pull": {"inventory.items": {"instanceId": instance_id}},
            "$push": {"characters.$.items": backpacked_instance},
        },
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def check_in_item_instance(address: str, character_id: str, instance_id: str) -> Optional[Player]:
    """
    The reverse of check_out_item_instance: move one item instance from a
    character's backpack back into the shared pool. Never capacity-gated
    (freeing space always succeeds). Returns None if the instance isn't
    found backpacked on this character.
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
            i for i in character.get("items", [])
            if i["instanceId"] == instance_id and i.get("location") == "backpack"
        ),
        None,
    )
    if instance is None:
        return None

    pooled_instance = {**instance, "location": "pool", "slotRef": []}
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {"$elemMatch": {"id": character_id, "items.instanceId": instance_id}},
        },
        {
            "$pull": {"characters.$[char].items": {"instanceId": instance_id}},
            "$push": {"inventory.items": pooled_instance},
        },
        array_filters=[{"char.id": character_id}],
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)


async def check_out_item_balance(address: str, character_id: str, item_id: str, amount: int = 1) -> Optional[Player]:
    """
    Move `amount` of `item_id` (a concrete crafted-item id) from
    `address`'s shared inventory.itemBalances onto one of their characters'
    own itemBalances. Never capacity-gated - unlike resources/tools,
    itemBalances was never part of the crafting-vault redesign (nothing a
    recipe consumes ever lives there), so a character carrying crafted
    goods directly is still a normal, ungated transfer.
    """
    if amount <= 0:
        raise ValueError("amount must be positive")
    db = get_database()
    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters.id": character_id,
            f"inventory.itemBalances.{item_id}": {"$gte": amount},
        },
        {"$inc": {
            f"inventory.itemBalances.{item_id}": -amount,
            f"characters.$.itemBalances.{item_id}": amount,
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
            "characters": {"$elemMatch": {"id": character_id, f"itemBalances.{item_id}": {"$gte": amount}}},
        },
        {"$inc": {
            f"inventory.itemBalances.{item_id}": amount,
            f"characters.$.itemBalances.{item_id}": -amount,
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
    if character.get("resources", {}).get(resource_id, 0) < amount:
        return None

    if resource_id in RESOURCE_ITEMS_BY_ID:
        stack_size = items_catalog.RAW_STACK_SIZE
    else:
        stack_size = items_catalog.PROCESSED_STACK_SIZE
    existing = character.get("backpackResources", {}).get(resource_id, 0)
    marginal_slots = math.ceil((existing + amount) / stack_size) - math.ceil(existing / stack_size)

    used = items_catalog.backpack_slots_used(character)
    capacity = items_catalog.backpack_capacity(character)
    if used + marginal_slots > capacity:
        return None

    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {"$elemMatch": {"id": character_id, f"resources.{resource_id}": {"$gte": amount}}},
        },
        {"$inc": {
            f"characters.$.resources.{resource_id}": -amount,
            f"characters.$.backpackResources.{resource_id}": amount,
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
                "$elemMatch": {"id": character_id, f"backpackResources.{resource_id}": {"$gte": amount}}
            },
        },
        {"$inc": {
            f"characters.$.backpackResources.{resource_id}": -amount,
            f"characters.$.resources.{resource_id}": amount,
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
    if character.get("itemBalances", {}).get(item_id, 0) < amount:
        return None

    family_id = items_catalog.FAMILY_ID_BY_FINAL_ITEM_ID.get(item_id)
    family = items_catalog.ITEM_FAMILIES_BY_ID.get(family_id) if family_id else None
    stack_size = family.stack_size if family else 1
    slot_cost = items_catalog.slot_cost_for_family(family_id) if family_id else 1

    existing = character.get("backpackItemBalances", {}).get(item_id, 0)
    marginal_slots = (
        math.ceil((existing + amount) / stack_size) - math.ceil(existing / stack_size)
    ) * slot_cost

    used = items_catalog.backpack_slots_used(character)
    capacity = items_catalog.backpack_capacity(character)
    if used + marginal_slots > capacity:
        return None

    doc = await db.players.find_one_and_update(
        {
            "address": address,
            "characters": {"$elemMatch": {"id": character_id, f"itemBalances.{item_id}": {"$gte": amount}}},
        },
        {"$inc": {
            f"characters.$.itemBalances.{item_id}": -amount,
            f"characters.$.backpackItemBalances.{item_id}": amount,
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
                "$elemMatch": {"id": character_id, f"backpackItemBalances.{item_id}": {"$gte": amount}}
            },
        },
        {"$inc": {
            f"characters.$.backpackItemBalances.{item_id}": -amount,
            f"characters.$.itemBalances.{item_id}": amount,
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
        {"address": address, "characters": {"$elemMatch": {"id": character_id, "items.instanceId": instance_id}}},
        {"$inc": {"characters.$[char].items.$[item].quality": -amount}},
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

    held = character.get("resources", {})
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
            "characters": {"$elemMatch": {"id": character_id, f"resources.{concrete_id}": {"$gte": amount}}},
        },
        {"$inc": {f"characters.$.resources.{concrete_id}": -amount}},
        return_document=ReturnDocument.AFTER,
    )
    if doc is None:
        return None
    return _doc_to_player(doc)
