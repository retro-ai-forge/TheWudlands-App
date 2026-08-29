"""
FastAPI authentication routes for Polkadot wallet signing.

Provides:
- POST /api/auth/challenge - Generate challenge message to sign
- POST /api/auth/verify - Verify signed message and create session
- GET /api/auth/me - Get current authenticated user
- POST /api/auth/logout - Clear session
"""

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, Response, Depends
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
import secrets
import time
from backend.auth import (
    validate_auth_message,
    create_session,
    verify_session_token,
    clear_session,
    AuthenticationError,
)
from backend.active_players import (
    add_active_player,
    remove_active_player,
    list_active_players,
)
from backend.character import AttributeStats, Character, PortraitArea, ProfStats
from backend.players import (
    add_character,
    check_in_resource,
    check_in_tool,
    check_out_resource,
    check_out_tool,
    delete_character,
    get_or_create_player,
    get_player,
    grant_resource,
    update_character_portrait,
)
from backend.balances import log_login_balances
from backend.resources_catalog import RESOURCE_ITEMS_BY_ID, resolve_trapping_options
from backend.processed_catalog import PROCESSED_RESOURCE_ITEMS_BY_ID
from backend.tools_catalog import TOOL_ITEMS_BY_ID
from backend.craft_catalog import category_blueprint_summary, resolve_blueprint_trapping_options
from backend.soul_slots import (
    SOUL_SLOTS,
    STAR_SLOT_NUMBERS,
    TOKEN_SLOT_NUMBERS,
    has_claimed_starter_kit,
    mark_starter_kit_claimed,
    resolve_fast_slots,
    resolve_star_slots,
)

router = APIRouter(prefix="/api/auth", tags=["authentication"])
player_router = APIRouter(prefix="/api/auth", tags=["player"])
statistics_router = APIRouter(prefix="/api/auth", tags=["statistics"])

# Challenge cache for replay protection
_challenge_cache: dict[str, float] = {}
CHALLENGE_EXPIRY = 5 * 60  # 5 minutes

# Must match MessageValidator.EXPECTED_DOMAIN in auth.py
DOMAIN = "thewudlands.eu"
SESSION_DURATION = "72 hours"  # Must match MessageValidator.EXPECTED_SESSION_DURATION


# Request/Response Models
class ChallengeRequest(BaseModel):
    """Request for authentication challenge."""
    address: str = Field(..., description="Polkadot SS58 address")


class ChallengeResponse(BaseModel):
    """Challenge response with message to sign."""
    message: str = Field(..., description="Message to sign with wallet")
    nonce: str = Field(..., description="Unique nonce for replay protection")


class SignedAuthMessageRequest(BaseModel):
    """Signed authentication message from client."""

    address: str = Field(..., description="Polkadot SS58 address")
    message: str = Field(..., description="Original message that was signed")
    signature: str = Field(..., description="Hex signature (0x-prefixed)")
    nonce: str = Field(..., description="Unique nonce from challenge")
    # Optional client metadata; not used during verification (the authoritative
    # timestamp lives inside the signed message itself).
    timestamp: Optional[int] = Field(None, description="Message timestamp (milliseconds)")
    sessionExpiresAt: Optional[int] = Field(None, description="Session expiry (milliseconds)")


class AuthSessionResponse(BaseModel):
    """Session response after successful authentication."""

    token: str = Field(..., description="Auth token for subsequent requests")
    address: str = Field(..., description="Authenticated wallet address")
    expiresAt: str = Field(..., description="Session expiry ISO 8601 timestamp")
    sessionDurationHours: int = Field(..., description="Session duration in hours")


class UserInfoResponse(BaseModel):
    """Current authenticated user info."""

    address: str = Field(..., description="Wallet address")
    expiresAt: str = Field(..., description="Session expiry time")


class LogoutResponse(BaseModel):
    """Logout response."""

    message: str = Field(..., description="Confirmation message")


class ActivePlayerCountResponse(BaseModel):
    """Count of currently active (logged-in, non-idle) players."""

    count: int = Field(..., description="Number of active players")


class CharacterAvailabilityResponse(BaseModel):
    """Availability stats: name, ready timer"""

    name: str = Field(..., description="Display availability info")
    timeRdy: str = Field(..., description="Timestamp (ISO 8601) when free or ready")


class CharacterClassResponse(BaseModel):
    """Class stats: class type and level."""

    class1: str = Field(..., description="Class 1 type")
    lvl1: int = Field(..., description="Class 1 level")
    class2: str = Field(..., description="Class 2 type")
    lvl2: int = Field(..., description="Class 2 level")


class CharacterProfessionResponse(BaseModel):
    """Profession stats: profession type, level, and experience points."""

    prof1: str = Field(..., description="Profession 1 type")
    lvl1: int = Field(..., description="Profession 1 level")
    exp1: int = Field(default=0, description="Profession 1 experience points")
    prof2: str = Field(..., description="Profession 2 type")
    lvl2: int = Field(..., description="Profession 2 level")
    exp2: int = Field(default=0, description="Profession 2 experience points")
    prof3: str = Field(..., description="Profession 3 type")
    lvl3: int = Field(..., description="Profession 3 level")
    exp3: int = Field(default=0, description="Profession 3 experience points")


class CharacterAttributeResponse(BaseModel):
    """Physical & Soul stats"""

    migh: int = Field(..., description="Might: raw strength, lifting, melee damage, forced doors, grapples")
    agil: int = Field(..., description="Agility: reflexes, dodging, stealth movement, initiative, finesse attacks")
    endu: int = Field(..., description="Endurance: HP scaling, poison/disease resistance, fatigue, long treks")
    prec: int = Field(..., description="Precision: aim and control: ranged accuracy, lockpicking, delicate tasks")
    will: int = Field(..., description="Will: mental toughness: resist fear/charm, concentration, oath/discipline")
    insi: int = Field(..., description="Insight: perception + intuition: spotting traps, reading intent, awareness")
    lore: int = Field(..., description="Lore: learned knowledge: arcana, history, alchemy, rituals, languages")
    pres: int = Field(..., description="Presence: charisma/aura: persuasion, intimidation, leadership, divine favor")


class PortraitPan(BaseModel):
    """Pan offset (pixels, at 1x zoom) applied to the source portrait image."""

    x: float = Field(..., description="Horizontal pan offset")
    y: float = Field(..., description="Vertical pan offset")


class PortraitAreaResponse(BaseModel):
    """
    A crop rectangle expressed as fractions (0-1) of the source portrait
    image's natural width/height, portable across any render size.
    """

    x: float = Field(..., description="Left edge, as a fraction of the image width")
    y: float = Field(..., description="Top edge, as a fraction of the image height")
    width: float = Field(..., description="Width, as a fraction of the image width")
    height: float = Field(..., description="Height, as a fraction of the image height")
    aspectRatio: Optional[float] = Field(
        None,
        description="The crop rectangle's true on-screen aspect ratio (width/height), captured "
        "directly from the editor's frame at save time - a display box should match this "
        "exactly rather than assuming a fixed shape or recomputing from x/y/width/height alone",
    )


class CharacterResponse(BaseModel):
    """A single character belonging to a player."""

    id: str = Field(..., description="Stable character id")
    slotNumber: int = Field(..., description="Soul slot this character lives in")
    firstName: str = Field(..., description="Character's first name")
    lastName: str = Field(..., description="Character's last name")
    vitalStatus: str = Field(..., description="Character's vital status")
    age_month: int = Field(..., description="Character's age in months (canonical, human-equivalent)")
    gender: str = Field(..., description="Character's gender")
    raceGroup: str = Field(..., description="Character's race group")
    race: str = Field(..., description="Character's subrace")
    portraitUrl: str = Field(..., description="Character's portrait image URL")
    birthsign: str = Field(..., description="Character's chosen birth sign")
    portraitZoom: float = Field(1.0, description="Zoom applied to the source portrait when framed")
    portraitPan: PortraitPan = Field(
        default_factory=lambda: PortraitPan(x=0, y=0), description="Pan applied to the source portrait when framed"
    )
    portraitFrameArea: Optional[PortraitAreaResponse] = Field(
        None, description="Full-body crop, for future equipment-slot rendering"
    )
    portraitFaceArea: Optional[PortraitAreaResponse] = Field(
        None, description="Face-only crop, used for the soul slot preview"
    )
    availability: CharacterAvailabilityResponse
    classes: CharacterClassResponse
    profession: CharacterProfessionResponse
    attr: CharacterAttributeResponse
    resources: Dict[str, int] = Field(
        default_factory=dict, description="Stackable resources this character carries, by resource id"
    )
    tools: Dict[str, int] = Field(
        default_factory=dict,
        description="Tools this character currently holds (id -> quantity), checked out of the player's shared pool",
    )
    blueprints: List[str] = Field(
        default_factory=list,
        description="Blueprint ids this character has learned, chosen on the Trappings step - soulbound, never moves",
    )

class PlayerDataResponse(BaseModel):
    """The authenticated player's permanent record and character roster.

    Unlike the active-players registry (which only tracks who's online and
    is evicted after 8 hours idle), this data is permanent - it survives
    logout and any amount of time between sessions.
    """

    address: str = Field(..., description="Wallet address")
    firstLoginAt: str = Field(..., description="First-ever login timestamp (ISO 8601)")
    characters: List[CharacterResponse] = Field(
        default_factory=list, description="Characters belonging to this player"
    )
    inventory: dict = Field(
        default_factory=lambda: {
            "tools": {},
            "resources": {},
            "items": {},
        },
        description="Shared inventory (tools, resources, items) pooled across all their characters",
    )


class CreateCharacterRequest(BaseModel):
    """Payload collected by the Soul Creation wizard's Trappings step."""

    slotNumber: int = Field(..., description="Soul slot clicked to start creation")
    firstName: str = Field(..., description="Character's first name")
    lastName: str = Field(..., description="Character's last name")
    age_month: int = Field(..., description="Character's age in months")
    gender: str = Field(..., description="Character's gender")
    raceGroup: str = Field(..., description="Character's race group")
    race: str = Field(..., description="Character's subrace")
    profession1: str = Field("none", description="Profession 1")
    profession2: str = Field("none", description="Profession 2")
    profession3: str = Field("none", description="Profession 3")
    portraitUrl: str = Field("", description="Character's portrait image URL")
    birthsign: str = Field("", description="Character's chosen birth sign")
    portraitZoom: float = Field(1.0, description="Zoom applied to the source portrait when framed")
    portraitPan: PortraitPan = Field(
        default_factory=lambda: PortraitPan(x=0, y=0), description="Pan applied to the source portrait when framed"
    )
    portraitFrameArea: Optional[PortraitAreaResponse] = Field(
        None, description="Full-body crop, for future equipment-slot rendering"
    )
    portraitFaceArea: Optional[PortraitAreaResponse] = Field(
        None, description="Face-only crop, used for the soul slot preview"
    )
    attr: CharacterAttributeResponse
    selectedResources: Dict[str, int] = Field(
        default_factory=dict,
        description="Resources chosen on the Trappings step, as resource id -> amount",
    )
    selectedBlueprints: List[str] = Field(
        default_factory=list,
        description="Blueprint ids chosen on the Trappings step",
    )


class UpdatePortraitRequest(BaseModel):
    """Payload from the standalone portrait editor (opened from the
    character preview page to re-frame an existing character's portrait)."""

    portraitUrl: str = Field("", description="Character's portrait image URL")
    portraitZoom: float = Field(1.0, description="Zoom applied to the source portrait when framed")
    portraitPan: PortraitPan = Field(
        default_factory=lambda: PortraitPan(x=0, y=0), description="Pan applied to the source portrait when framed"
    )
    portraitFrameArea: Optional[PortraitAreaResponse] = Field(
        None, description="Full-body crop, for future equipment-slot rendering"
    )
    portraitFaceArea: Optional[PortraitAreaResponse] = Field(
        None, description="Face-only crop, used for the soul slot preview"
    )


class TrappingsItemResponse(BaseModel):
    """One resource item selectable on the Trappings step."""

    id: str = Field(..., description="Resource id")
    name: str = Field(..., description="Resource display name")
    familyId: str = Field(..., description="Resource family id")
    tier: int = Field(..., description="Resource tier")


class TrappingsBlueprintPoolResponse(BaseModel):
    """One blueprintPoolsByProfessionCount rule, paired with the blueprint
    items it makes eligible for the character's chosen professions."""

    source: str = Field(..., description="'tool' | 'item'")
    tier: int = Field(..., description="Blueprint tier this rule draws from")
    count: int = Field(..., description="How many distinct blueprints the player may pick from this pool")
    items: List[TrappingsItemResponse]


class TrappingsOptionsResponse(BaseModel):
    """What a character may pick from on the Trappings step, derived from
    their chosen professions: a spendable unit pool per unlocked tier, the
    resource items available at those tiers, and the tool/item blueprint
    pools they may pick from."""

    tierPools: Dict[int, int] = Field(..., description="Total spendable units per tier")
    items: List[TrappingsItemResponse]
    blueprintPools: List[TrappingsBlueprintPoolResponse] = Field(default_factory=list)


class BlueprintCategoryItemResponse(BaseModel):
    """One blueprint item, as listed under its family in the category summary."""

    id: str
    name: str
    tier: int


class BlueprintCategoryFamilyResponse(BaseModel):
    """One blueprint family's tier 1-3 items, within a profession category."""

    familyId: str
    kind: str = Field(..., description="'tool' | 'weapon' | 'armor' | 'shield' | 'food'")
    items: List[BlueprintCategoryItemResponse]


class BlueprintCategoryResponse(BaseModel):
    """One profession category's blueprint families - may be empty (e.g. Rural)."""

    category: str
    families: List[BlueprintCategoryFamilyResponse]


class ResourceItemResponse(BaseModel):
    """A single resource item with its tier and family information."""

    id: str
    familyId: str
    tier: int
    resourceFamily: str = Field(..., description="The resource family (ore, wood, stone, etc.)")


class ToolItemResponse(BaseModel):
    """A single tool item with its tier and family information."""

    id: str
    familyId: str
    tier: int


# Dependency: Extract and verify token from secure cookie
async def get_current_address(request: Request) -> str:
    """
    Extract and verify session token from secure cookie.

    Usage in route:
        @router.get("/protected")
        async def protected_route(address: str = Depends(get_current_address)):
            return {"message": f"Hello {address}"}

    Raises:
        HTTPException 401 if token is invalid or missing
    """
    token = request.cookies.get("session_token")

    if not token:
        raise HTTPException(status_code=401, detail="Missing session token")

    session = await verify_session_token(token)

    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return session.address


# Routes
@router.post("/challenge", response_model=ChallengeResponse)
async def get_auth_challenge(payload: ChallengeRequest):
    """
    Generate an authentication challenge for the user to sign.
    
    This is the first step of the sign-in flow:
    1. Client requests a challenge for their wallet address
    2. Backend generates a unique message with nonce and timestamp
    3. Client signs this message with their wallet
    4. Client sends signature to /verify endpoint
    
    No blockchain transaction will be sent and no funds will be spent.
    This is an off-chain signature to prove wallet ownership.
    
    Args:
        payload: ChallengeRequest with wallet address
        
    Returns:
        ChallengeResponse with message to sign and nonce
    """
    # Accept any valid SS58 address regardless of network prefix. The frontend
    # encodes addresses in Polkadot format (prefix 0, starts with "1"), but
    # other prefixes (e.g. generic Substrate "5...") are equally valid.
    if not payload.address:
        raise HTTPException(status_code=400, detail="Invalid Polkadot address")
    try:
        from substrateinterface import Keypair as SubstrateKeypair

        SubstrateKeypair(ss58_address=payload.address)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid Polkadot address")
    
    # Clean up expired challenges
    now = time.time()
    expired = [n for n, ts in _challenge_cache.items() if now - ts > CHALLENGE_EXPIRY]
    for n in expired:
        del _challenge_cache[n]
    
    # Generate unique nonce
    nonce = secrets.token_hex(16)

    # Cache nonce for later verification
    _challenge_cache[nonce] = now

    # Build the message in the exact format the verifier expects
    # (see MessageValidator in auth.py). Timestamps are timezone-aware UTC
    # ISO-8601 so they compare cleanly against datetime.now(timezone.utc)
    # during verification.
    issued_at = datetime.now(timezone.utc)
    expires_at = issued_at + timedelta(minutes=5)

    message = (
        "The Wudlands — Sign in with your wallet.\n"
        "This is a free, off-chain signature to prove wallet ownership.\n"
        "No blockchain transaction will be sent and no funds will be spent.\n\n"
        f"Domain: {DOMAIN}\n"
        f"Wallet: {payload.address}\n"
        f"Nonce: {nonce}\n"
        f"Timestamp: {issued_at.isoformat()}\n"
        f"Session Duration: {SESSION_DURATION}\n"
        f"Expires: {expires_at.isoformat()}"
    )

    return ChallengeResponse(message=message, nonce=nonce)


@router.post("/verify")
async def verify_auth_signature(
    payload: SignedAuthMessageRequest,
    response: Response,
    background_tasks: BackgroundTasks,
):
    """
    Verify signed authentication message and create session.

    Process:
    1. Validate message format and expiry
    2. Check nonce uniqueness (replay protection)
    3. Verify cryptographic signature
    4. Create session token
    5. Set secure HTTP cookie
    6. Return session data

    Args:
        payload: SignedAuthMessageRequest with message, signature, and metadata
        response: FastAPI Response object to set cookie

    Returns:
        Session data without token (token is in secure cookie)

    Raises:
        HTTPException 401: Verification failed (bad signature, expired message, etc.)
        HTTPException 500: Server error
    """
    try:
        # Step 1: Validate message and signature
        is_valid, error = await validate_auth_message(
            payload.address,
            payload.message,
            payload.signature,
        )

        if not is_valid:
            raise HTTPException(status_code=401, detail=error)

        # Step 2: Create session
        session = await create_session(
            address=payload.address,
            session_duration_hours=72,
        )

        # Register (or refresh) this address in the active-players registry
        await add_active_player(session.address)

        # Create the permanent player record on first-ever login (no-op if
        # it already exists) - this is what survives logout and idle eviction.
        await get_or_create_player(session.address)

        # Log the wallet's DOT and WUD holdings, but only after the response
        # is sent - two Subscan round-trips shouldn't slow down the login.
        background_tasks.add_task(log_login_balances, session.address)

        # Step 3: Set secure HTTP cookie
        max_age = int((session.expires_at - datetime.now(timezone.utc)).total_seconds())
        response.set_cookie(
            key="session_token",
            value=session.token,
            max_age=max_age,
            httponly=True,  # Prevent JavaScript access (XSS protection)
            secure=True,  # Only send over HTTPS
            samesite="Lax",  # CSRF protection
            path="/",
        )

        # Step 4: Return response (token not included, it's in the secure cookie)
        return {
            "address": session.address,
            "expiresAt": session.expires_at.isoformat(),
            "sessionDurationHours": session.session_duration_hours,
        }

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except AuthenticationError as e:
        raise HTTPException(status_code=401, detail=str(e))
    except Exception as e:
        print(f"Authentication error: {e}")
        raise HTTPException(
            status_code=500,
            detail="Authentication service error. Please try again.",
        )


@router.get("/me", response_model=UserInfoResponse)
async def get_current_user(address: str = Depends(get_current_address)):
    """
    Get current authenticated user information.

    Requires valid Authorization header with Bearer token.

    Returns:
        UserInfoResponse with wallet address and session expiry

    Example:
        Authorization: Bearer eyJhbGc...
    """
    # Get session to get expiry time
    # Note: In production, you'd store full session info
    # For this example, we just return the address
    from datetime import datetime, timedelta, timezone

    # Placeholder - in production, retrieve from session storage
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=72)).isoformat()

    return UserInfoResponse(
        address=address,
        expiresAt=expires_at,
    )


@router.post("/logout", response_model=LogoutResponse)
async def logout(request: Request, response: Response):
    """
    Clear session and logout user.

    Deletes the secure session cookie.

    Returns:
        LogoutResponse with confirmation message
    """
    try:
        # Get token from cookie
        token = request.cookies.get("session_token")

        if token:
            session = await verify_session_token(token)
            if session:
                await remove_active_player(session.address)
            await clear_session(token)

        # Clear the session cookie
        response.delete_cookie(
            key="session_token",
            path="/",
            httponly=True,
            secure=True,
            samesite="Lax",
        )

        return LogoutResponse(message="Successfully logged out")

    except Exception as e:
        print(f"Logout error: {e}")
        raise HTTPException(status_code=500, detail="Logout get_active_playerfailed")


@player_router.get("/me/characters", response_model=PlayerDataResponse)
async def get_my_characters(address: str = Depends(get_current_address)):
    """
    Get the authenticated player's permanent record and character roster.

    Looks up the caller's entry in the permanent players collection - unlike
    the old active-players-backed version, this reflects characters even if
    the player has been logged out or idle past the 8-hour active-session
    window, since that data no longer lives there.

    Raises:
        HTTPException 404: No player record for this address (shouldn't
        normally happen for an authenticated caller, since get_or_create_player
        runs on every successful login).
    """
    player = await get_player(address)
    if player is None:
        raise HTTPException(status_code=404, detail="No player record found for this address")

    return player.to_dict()


@player_router.get("/me/trappings-options", response_model=TrappingsOptionsResponse)
async def get_trappings_options(
    profession1: str = "none",
    profession2: str = "none",
    profession3: str = "none",
    address: str = Depends(get_current_address),
):
    """
    What a character with these (1-3) professions may pick from on the Soul
    Creation wizard's Trappings step, before the player commits. Single
    source of truth also used server-side to validate POST /me/characters'
    selectedResources, so the picker a player sees can never drift from
    what's actually allowed.
    """
    try:
        options = resolve_trapping_options([profession1, profession2, profession3])
        blueprint_options = resolve_blueprint_trapping_options([profession1, profession2, profession3])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    return TrappingsOptionsResponse(
        tierPools=options.tier_pools,
        items=[
            TrappingsItemResponse(id=item.id, name=item.name, familyId=item.family_id, tier=item.tier)
            for item in options.items
        ],
        blueprintPools=[
            TrappingsBlueprintPoolResponse(
                source=pool.rule.source,
                tier=pool.rule.tier,
                count=pool.rule.count,
                items=[
                    TrappingsItemResponse(id=item.id, name=item.name, familyId=item.family_id, tier=item.tier)
                    for item in pool.items
                ],
            )
            for pool in blueprint_options.pools
        ],
    )


@player_router.get("/blueprint-categories", response_model=List[BlueprintCategoryResponse])
async def get_blueprint_categories():
    """
    Lore/reference data: every profession category's tool and item blueprint
    families (tiers 1-6), grouped by category. Powers the "Blueprints"
    accordion on the /characters lore page and blueprint tier info on character
    preview - unlike /me/trappings-options, this isn't scoped to any character's
    chosen professions, so it needs no auth.
    """
    return [
        BlueprintCategoryResponse(
            category=entry["category"],
            families=[
                BlueprintCategoryFamilyResponse(
                    familyId=family["familyId"],
                    kind=family["kind"],
                    items=[BlueprintCategoryItemResponse(**item) for item in family["items"]],
                )
                for family in entry["families"]
            ],
        )
        for entry in category_blueprint_summary(max_tier=6)
    ]


@player_router.get("/resource-catalog", response_model=List[ResourceItemResponse])
async def get_resource_catalog():
    """
    Reference data: all resource items (raw + processed) with their tier and family information.
    Powers tier indicators and grouping in the inventory resource list.
    """
    raw_resources = [
        ResourceItemResponse(id=item.id, familyId=item.family_id, tier=item.tier, resourceFamily=item.family_id)
        for item in RESOURCE_ITEMS_BY_ID.values()
    ]
    processed_resources = [
        ResourceItemResponse(id=item.id, familyId=item.family_id, tier=item.tier, resourceFamily=item.family_id)
        for item in PROCESSED_RESOURCE_ITEMS_BY_ID.values()
    ]
    return raw_resources + processed_resources


@player_router.get("/tool-catalog", response_model=List[ToolItemResponse])
async def get_tool_catalog():
    """
    Reference data: all tool items with their tier and family information.
    Powers tier indicators in the inventory tools list.
    """
    return [
        ToolItemResponse(id=item.id, familyId=item.family_id, tier=item.tier)
        for item in TOOL_ITEMS_BY_ID.values()
    ]


class TransferAmountRequest(BaseModel):
    """How much of a resource/tool to move between a character and the player's shared vault."""

    amount: int = Field(..., gt=0, description="Quantity to transfer - must be positive")


@player_router.post(
    "/me/characters/{character_id}/resources/{resource_id}/check-out", response_model=PlayerDataResponse
)
async def check_out_resource_route(
    character_id: str, resource_id: str, payload: TransferAmountRequest, address: str = Depends(get_current_address)
):
    """Move `amount` of `resource_id` from the player's shared vault onto one of their characters."""
    try:
        player = await check_out_resource(address, character_id, resource_id, payload.amount)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if player is None:
        raise HTTPException(status_code=404, detail="No matching character, or not enough in the shared vault")

    return player.to_dict()


@player_router.post(
    "/me/characters/{character_id}/resources/{resource_id}/check-in", response_model=PlayerDataResponse
)
async def check_in_resource_route(
    character_id: str, resource_id: str, payload: TransferAmountRequest, address: str = Depends(get_current_address)
):
    """Move `amount` of `resource_id` from one of the player's characters back into the shared vault."""
    try:
        player = await check_in_resource(address, character_id, resource_id, payload.amount)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if player is None:
        raise HTTPException(status_code=404, detail="No matching character, or not enough on that character")

    return player.to_dict()


@player_router.post("/me/characters/{character_id}/tools/{tool_id}/check-out", response_model=PlayerDataResponse)
async def check_out_tool_route(
    character_id: str, tool_id: str, payload: TransferAmountRequest, address: str = Depends(get_current_address)
):
    """Move `amount` of `tool_id` from the player's shared tool pool onto one of their characters."""
    try:
        player = await check_out_tool(address, character_id, tool_id, payload.amount, pool="inventory.tools")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if player is None:
        raise HTTPException(status_code=404, detail="No matching character, or not enough in the shared pool")

    return player.to_dict()


@player_router.post("/me/characters/{character_id}/tools/{tool_id}/check-in", response_model=PlayerDataResponse)
async def check_in_tool_route(
    character_id: str, tool_id: str, payload: TransferAmountRequest, address: str = Depends(get_current_address)
):
    """Move `amount` of `tool_id` from one of the player's characters back into the shared tool pool."""
    try:
        player = await check_in_tool(address, character_id, tool_id, payload.amount, pool="inventory.tools")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if player is None:
        raise HTTPException(status_code=404, detail="No matching character, or not enough on that character")

    return player.to_dict()


def _to_portrait_area(model: PortraitAreaResponse) -> PortraitArea:
    """PortraitAreaResponse (camelCase, request or response) -> the PortraitArea
    dataclass (snake_case) - not a blind **model_dump() spread since
    aspectRatio/aspect_ratio don't share a name."""
    return PortraitArea(x=model.x, y=model.y, width=model.width, height=model.height, aspect_ratio=model.aspectRatio)


@player_router.post("/me/characters", response_model=PlayerDataResponse)
async def create_character(
    payload: CreateCharacterRequest, address: str = Depends(get_current_address)
):
    """
    Save a character built by the Soul Creation wizard and grant its
    starting resource kit.

    Called from the wizard's last ("Trappings") page - this is the
    only place a character is ever persisted; the soul slot the player
    clicked to enter the wizard travels with it as slotNumber.
    """
    try:
        trappings = resolve_trapping_options([payload.profession1, payload.profession2, payload.profession3])
        blueprint_trappings = resolve_blueprint_trapping_options(
            [payload.profession1, payload.profession2, payload.profession3]
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    eligible_item_ids = {item.id for item in trappings.items}
    spent_by_tier: Dict[int, int] = {}
    for resource_id, amount in payload.selectedResources.items():
        if amount <= 0:
            raise HTTPException(status_code=400, detail=f"Invalid amount for {resource_id}")
        if resource_id not in eligible_item_ids:
            raise HTTPException(
                status_code=400, detail=f"{resource_id} is not available for the chosen professions"
            )
        tier = RESOURCE_ITEMS_BY_ID[resource_id].tier
        spent_by_tier[tier] = spent_by_tier.get(tier, 0) + amount
    for tier, spent in spent_by_tier.items():
        if spent > trappings.tier_pools[tier]:
            raise HTTPException(status_code=400, detail=f"Tier {tier} selection exceeds the allotted pool")

    # Greedily match each pick against the pool it's eligible for, consuming
    # that pool's count - a blueprint id is never eligible for more than one
    # pool (its own fixed tier and catalog type pin it to exactly one
    # tool/item x tier combination), so match order doesn't matter.
    remaining_by_pool = {i: pool.rule.count for i, pool in enumerate(blueprint_trappings.pools)}
    eligible_ids_by_pool = {i: {item.id for item in pool.items} for i, pool in enumerate(blueprint_trappings.pools)}
    for blueprint_id in payload.selectedBlueprints:
        matched_pool = next(
            (i for i in remaining_by_pool if blueprint_id in eligible_ids_by_pool[i] and remaining_by_pool[i] > 0),
            None,
        )
        if matched_pool is None:
            raise HTTPException(
                status_code=400, detail=f"{blueprint_id} is not available for the chosen professions"
            )
        remaining_by_pool[matched_pool] -= 1

    character = Character(
        slot_number=payload.slotNumber,
        first_name=payload.firstName,
        last_name=payload.lastName,
        age_month=payload.age_month,
        gender=payload.gender,
        race_group=payload.raceGroup,
        race=payload.race,
        portrait_url=payload.portraitUrl,
        birthsign=payload.birthsign,
        portrait_zoom=payload.portraitZoom,
        portrait_pan={"x": payload.portraitPan.x, "y": payload.portraitPan.y},
        portrait_frame_area=(
            _to_portrait_area(payload.portraitFrameArea) if payload.portraitFrameArea else None
        ),
        portrait_face_area=(
            _to_portrait_area(payload.portraitFaceArea) if payload.portraitFaceArea else None
        ),
        # A selected profession starts at level 1, not ProfStats' default of
        # 0 - "none" (an unfilled slot) stays at 0 since there's nothing to
        # level.
        profession=ProfStats(
            profession_1=payload.profession1,
            level_1=1 if payload.profession1 != "none" else 0,
            profession_2=payload.profession2,
            level_2=1 if payload.profession2 != "none" else 0,
            profession_3=payload.profession3,
            level_3=1 if payload.profession3 != "none" else 0,
        ),
        attr=AttributeStats(
            might=payload.attr.migh,
            agility=payload.attr.agil,
            endurance=payload.attr.endu,
            precision=payload.attr.prec,
            will=payload.attr.will,
            insight=payload.attr.insi,
            lore=payload.attr.lore,
            presence=payload.attr.pres,
        ),
        blueprints=list(payload.selectedBlueprints),
    )

    player = await add_character(address, character)
    if player is None:
        raise HTTPException(status_code=404, detail="No player record found for this address")

    # Each soul slot gets its starter kit exactly once, ever - tracked by
    # slot number (not character id), so deleting this character and
    # recreating one in the same slot can never re-claim it. Without this,
    # check-in/check-out (moving resources to the player's shared vault)
    # would let a delete-and-recreate loop mint resources for free.
    if not await has_claimed_starter_kit(address, payload.slotNumber):
        for resource_id, amount in payload.selectedResources.items():
            player = await grant_resource(address, character.id, resource_id, amount)
        await mark_starter_kit_claimed(address, payload.slotNumber)

    return player.to_dict()


@player_router.delete("/me/characters/{character_id}", response_model=PlayerDataResponse)
async def delete_my_character(character_id: str, address: str = Depends(get_current_address)):
    """
    Permanently delete one of the caller's characters. Called from the
    character preview page's Delete button - there's no undo.
    """
    player = await delete_character(address, character_id)
    if player is None:
        raise HTTPException(status_code=404, detail="No player record found for this address")

    return player.to_dict()


@player_router.patch("/me/characters/{character_id}/portrait", response_model=PlayerDataResponse)
async def update_my_character_portrait(
    character_id: str, payload: UpdatePortraitRequest, address: str = Depends(get_current_address)
):
    """
    Re-frame an existing character's portrait. Called from the standalone
    portrait editor opened by clicking a character's portrait on the
    character preview page (as opposed to the Soul Creation wizard, which
    sets these once at creation).
    """
    player = await update_character_portrait(
        address,
        character_id,
        portrait_url=payload.portraitUrl,
        portrait_zoom=payload.portraitZoom,
        portrait_pan={"x": payload.portraitPan.x, "y": payload.portraitPan.y},
        portrait_frame_area=payload.portraitFrameArea.model_dump() if payload.portraitFrameArea else None,
        portrait_face_area=payload.portraitFaceArea.model_dump() if payload.portraitFaceArea else None,
    )
    if player is None:
        raise HTTPException(status_code=404, detail="No player record found for this address")

    return player.to_dict()


@player_router.get("/me/soul-slots")
async def get_my_soul_slots(
    force: bool = False, address: str = Depends(get_current_address)
):
    """
    Which soul-creation slots the caller's wallet has unlocked.

    Covers the fast checks only - NFT ownership and token balances. The star
    slots need every Grid Miner's metadata read from IPFS, which is far too
    slow to block the welcome page on, so they stay pending here and the
    client fetches /me/soul-slots/stars separately.

    `checked` is false when the lookup could not run at all (no Subscan key
    configured, or the API was unreachable). On a passive load the fast
    slots are just left as already stored in that case; on an explicit
    Reload (`force=true`) they reset to unearned instead, since the player
    asked for a fresh answer and none could be produced - see
    resolve_fast_slots for the full reasoning.

    Pass `?force=true` (the welcome page's Reload button) to bypass the
    one-in-thirty-three cache roll and re-check the wallet immediately, rather than
    waiting for a random login to happen to pick it.
    """
    try:
        state = await resolve_fast_slots(address, roll=0.0 if force else None, force=force)
    except Exception as e:
        print(f"[soul-slots] Lookup failed for {address}: {type(e).__name__}: {e}")
        state = {
            "unlocked": [1], "stars": None,
            "token_progress": [0.0] * len(TOKEN_SLOT_NUMBERS),
            "checked": False, "cached": False,
            "stars_pending": True,
        }

    return {
        "slots": [slot.to_dict() for slot in SOUL_SLOTS],
        "unlocked": state["unlocked"],
        "stars": state.get("stars"),
        # Percent of its required amount held, one entry per token slot
        # (5-8) in ascending order - drives the golden progress line drawn
        # along the bottom edge of each token slot's artwork.
        "tokenProgress": state.get("token_progress", [0.0] * len(TOKEN_SLOT_NUMBERS)),
        "checked": state["checked"],
        # Whether the slow star pass should run this request - on its own
        # cadence (see should_recheck_stars), not just "no count stored yet".
        # A stale-but-present count must not stop it from ever re-running.
        "starsPending": state.get("stars_pending", True),
        "starSlots": list(STAR_SLOT_NUMBERS),
    }


@player_router.get("/me/soul-slots/{slot_number}/starter-kit-claimed")
async def get_starter_kit_claimed(slot_number: int, address: str = Depends(get_current_address)):
    """
    Whether `slot_number` has already received its one-time
    character-creation starter resource kit (see backend.soul_slots -
    tracked by slot number, permanently, so deleting and recreating a
    character in the same slot can't re-claim it). Powers the Trappings
    page's warning that a resource pick won't actually be granted this time.
    """
    claimed = await has_claimed_starter_kit(address, slot_number)
    return {"claimed": claimed}


@player_router.get("/me/soul-slots/stars")
async def get_my_star_slots(address: str = Depends(get_current_address)):
    """
    Resolve the Grid Miner star slots for the caller.

    Deliberately a separate request: it walks one RPC call plus one IPFS
    document per owned miner, so it can take seconds. The client calls this
    after painting the grid and swaps the star slots in when it returns.
    """
    try:
        state = await resolve_star_slots(address)
    except Exception as e:
        print(f"[soul-slots] Star lookup failed for {address}: {type(e).__name__}: {e}")
        raise HTTPException(status_code=503, detail="Star lookup unavailable")

    return {
        "unlocked": state["unlocked"],
        "stars": state["stars"],
        "checked": True,
        "starSlots": list(STAR_SLOT_NUMBERS),
    }


@statistics_router.get("/active-players/count", response_model=ActivePlayerCountResponse)
async def get_active_player_count():
    """
    Number of players currently logged in and active (i.e. not idle for
    more than the 8-hour inactivity timeout).
    """
    return ActivePlayerCountResponse(count=len(await list_active_players()))
