"""
FastAPI authentication routes for Polkadot wallet signing.

Provides:
- POST /api/auth/challenge - Generate challenge message to sign
- POST /api/auth/verify - Verify signed message and create session
- GET /api/auth/me - Get current authenticated user
- POST /api/auth/logout - Clear session
"""

from fastapi import APIRouter, HTTPException, Request, Response, Depends
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime, timedelta, timezone
from typing import List, Optional
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
from backend.players import get_or_create_player, get_player

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
    """Profession stats: profession type and level."""

    prof1: str = Field(..., description="Profession 1 type")
    lvl1: int = Field(..., description="Profession 1 level")
    prof2: str = Field(..., description="Profession 2 type")
    lvl2: int = Field(..., description="Profession 2 level")
    prof3: str = Field(..., description="Profession 3 type")
    lvl3: int = Field(..., description="Profession 3 level")


class CharacterBodyResponse(BaseModel):
    """Physical stats: strength, constitution, dexterity, speed."""

    str: int = Field(..., description="Strength")
    sta: int = Field(..., description="Constitution")
    dex: int = Field(..., description="Dexterity")
    speed: int = Field(..., description="Speed")


class CharacterSoulResponse(BaseModel):
    """Mental stats: intelligence, power, wisdom."""

    power: int = Field(..., description="Power")
    wis: int = Field(..., description="Wisdom")
    intelli: int = Field(..., description="Intelligence")
    perc: int = Field(..., description="Perception")


class CharacterResponse(BaseModel):
    """A single character belonging to a player."""

    firstName: str = Field(..., description="Character's first name")
    lastName: str = Field(..., description="Character's last name")
    vitalStatus: str = Field(..., description="Character's vital status")
    age: int = Field(..., description="Character's age in months (canonical, human-equivalent)")
    gender: str = Field(..., description="Character's gender")
    raceGroup: str = Field(..., description="Character's race group")
    race: str = Field(..., description="Character's subrace")
    availability: CharacterAvailabilityResponse
    classes: CharacterClassResponse
    profession: CharacterProfessionResponse 
    body: CharacterBodyResponse
    soul: CharacterSoulResponse


class PlayerDataResponse(BaseModel):
    """The authenticated player's permanent record and character roster.

    Unlike the active-players registry (which only tracks who's online and
    is evicted after 2 hours idle), this data is permanent - it survives
    logout and any amount of time between sessions.
    """

    address: str = Field(..., description="Wallet address")
    firstLoginAt: str = Field(..., description="First-ever login timestamp (ISO 8601)")
    characters: List[CharacterResponse] = Field(
        default_factory=list, description="Characters belonging to this player"
    )


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
async def verify_auth_signature(payload: SignedAuthMessageRequest, response: Response):
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
    the player has been logged out or idle past the 2-hour active-session
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


@statistics_router.get("/active-players/count", response_model=ActivePlayerCountResponse)
async def get_active_player_count():
    """
    Number of players currently logged in and active (i.e. not idle for
    more than the 2-hour inactivity timeout).
    """
    return ActivePlayerCountResponse(count=len(await list_active_players()))
