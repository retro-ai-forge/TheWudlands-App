"""
Polkadot message signature verification for off-chain authentication.

Handles:
- Message format validation
- Signature cryptographic verification
- Replay attack prevention (nonce caching)
- Session token creation
"""

from __future__ import annotations

from typing import Tuple, Optional, Dict
from datetime import datetime, timedelta, timezone
import secrets
import json
import os
from dataclasses import dataclass, asdict

# Optional: Redis for distributed session storage (production)
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

# For signature verification.
# Default to False so the name is always defined, even when substrateinterface
# imports successfully (in which case the py_sr25519 fallback branch is skipped).
SR25519_AVAILABLE = False
try:
    from substrateinterface import Keypair as SubstrateKeypair
    SUBSTRATE_AVAILABLE = True
except ImportError:
    SUBSTRATE_AVAILABLE = False
    try:
        from py_sr25519 import verify as sr25519_verify
        SR25519_AVAILABLE = True
    except ImportError:
        SR25519_AVAILABLE = False


class AuthenticationError(Exception):
    """Raised when authentication fails."""
    pass


# In-memory session and nonce storage (for development)
_sessions: Dict[str, 'SessionData'] = {}
_used_nonces: set[str] = set()

# Redis client (for production distributed sessions)
# Quoted annotation so the module still imports when redis isn't installed.
_redis_client: "Optional[redis.Redis]" = None


@dataclass
class SessionData:
    """Authenticated session data."""
    token: str
    address: str
    created_at: datetime
    expires_at: datetime
    session_duration_hours: int

    def to_dict(self) -> dict:
        return {
            "token": self.token,
            "address": self.address,
            "created_at": self.created_at.isoformat(),
            "expires_at": self.expires_at.isoformat(),
            "session_duration_hours": self.session_duration_hours,
        }


def get_redis_client() -> Optional[redis.Redis]:
    """Get or create Redis client for distributed session storage."""
    global _redis_client

    if not REDIS_AVAILABLE:
        return None

    if _redis_client is None:
        try:
            _redis_client = redis.Redis(
                host=os.getenv("REDIS_HOST", "localhost"),
                port=int(os.getenv("REDIS_PORT", 6379)),
                db=0,
                decode_responses=True,
            )
            # Test connection
            _redis_client.ping()
        except Exception as e:
            print(f"Failed to connect to Redis: {e}")
            _redis_client = None

    return _redis_client


class MessageValidator:
    """Validates authentication messages before signature verification."""

    REQUIRED_FIELDS = [
        "Domain:",
        "Wallet:",
        "Nonce:",
        "Timestamp:",
        "Session Duration:",
        "Expires:",
    ]

    MESSAGE_VALIDITY_SECONDS = 5 * 60  # 5 minutes
    EXPECTED_DOMAIN = "thewudlands.eu"
    EXPECTED_SESSION_DURATION = "72 hours"

    @classmethod
    def validate_message_format(
        cls, message: str, address: str
    ) -> Tuple[bool, str]:
        """
        Validate message contains required fields and correct format.

        Returns:
            (is_valid, error_message)
        """
        # Check all required fields present
        for field in cls.REQUIRED_FIELDS:
            if field not in message:
                return False, f"Missing required field: {field}"

        # Check address is in message
        if address not in message:
            return False, "Address not found in message"

        # Parse fields
        fields = cls._parse_message_fields(message)

        # Validate domain
        if fields.get("Domain:") != cls.EXPECTED_DOMAIN:
            return False, "Invalid domain in message"

        # Validate session duration
        if fields.get("Session Duration:") != cls.EXPECTED_SESSION_DURATION:
            return False, "Invalid session duration in message"

        return True, ""

    @classmethod
    def validate_message_expiry(cls, message: str) -> Tuple[bool, str]:
        """
        Validate message timestamp is recent (within 5 minutes).

        Returns:
            (is_valid, error_message)
        """
        try:
            fields = cls._parse_message_fields(message)
            timestamp_str = fields.get("Timestamp:")

            if not timestamp_str:
                return False, "Timestamp not found in message"

            # Parse ISO 8601 timestamp
            # Handle both with and without 'Z' suffix
            timestamp_str = timestamp_str.replace("Z", "+00:00")
            try:
                timestamp = datetime.fromisoformat(timestamp_str)
            except ValueError:
                return False, f"Invalid timestamp format: {timestamp_str}"

            # Get current time in UTC
            now = datetime.now(timezone.utc)

            # Handle timezone-naive comparison
            if timestamp.tzinfo is None:
                now = now.replace(tzinfo=None)

            age_seconds = (now - timestamp).total_seconds()

            # Check if message is too old
            if age_seconds > cls.MESSAGE_VALIDITY_SECONDS:
                return False, f"Message expired (age: {age_seconds}s)"

            # Check if message is in future (clock skew)
            if age_seconds < -30:  # Allow 30 second clock skew
                return False, "Message is in the future (clock skew)"

            return True, ""

        except Exception as e:
            return False, f"Timestamp validation error: {str(e)}"

    @classmethod
    def validate_nonce_uniqueness(cls, nonce: str) -> Tuple[bool, str]:
        """
        Prevent replay attacks by ensuring nonce is unique.

        Uses Redis in production for distributed cache.

        Returns:
            (is_valid, error_message)
        """
        if nonce in _used_nonces:
            return False, "Nonce already used (replay attack detected)"

        # Check Redis if available
        redis_client = get_redis_client()
        if redis_client:
            nonce_key = f"auth_nonce:{nonce}"
            if redis_client.exists(nonce_key):
                return False, "Nonce already used (replay attack detected)"

            # Store nonce with 5 minute expiry
            redis_client.setex(nonce_key, 5 * 60, "1")
        else:
            # In-memory storage
            _used_nonces.add(nonce)

            # Prevent memory leaks
            if len(_used_nonces) > 10000:
                _used_nonces.clear()

        return True, ""

    @classmethod
    def _parse_message_fields(cls, message: str) -> Dict[str, str]:
        """Parse message and extract field values."""
        fields = {}

        for line in message.split("\n"):
            if ":" not in line:
                continue

            # Split on first colon only
            key, value = line.split(":", 1)
            fields[key.strip() + ":"] = value.strip()

        return fields


class SignatureVerifier:
    """Verify Polkadot message signatures."""

    @staticmethod
    def verify_signature(
        address: str, message: str, signature: str
    ) -> Tuple[bool, str]:
        """
        Verify a Polkadot message signature.

        Args:
            address: SS58 address (e.g., "5F...")
            message: Original message that was signed
            signature: Hex string signature (0x-prefixed)

        Returns:
            (is_valid, error_message or "")

        Process:
        1. Decode SS58 address to public key
        2. Prepare message with Polkadot off-chain prefix
        3. Verify signature using public key
        """
        try:
            # Decode address to public key bytes
            public_key_bytes = SignatureVerifier._decode_address(address)

            # Polkadot wallet extensions wrap raw messages in <Bytes>...</Bytes>
            # before signing (the @polkadot/util wrapBytes behaviour). Verify
            # against the wrapped form first, then fall back to the raw message
            # for any wallet that signs the bytes unwrapped.
            candidates = [
                b"<Bytes>" + message.encode("utf-8") + b"</Bytes>",
                message.encode("utf-8"),
            ]

            for candidate in candidates:
                if SignatureVerifier._verify_raw_signature(
                    public_key_bytes, candidate, signature
                ):
                    return True, ""

            return False, "Signature verification failed"

        except Exception as e:
            return False, f"Signature verification error: {str(e)}"

    @staticmethod
    def _decode_address(address: str) -> bytes:
        """
        Decode SS58 address to public key bytes.

        Uses substrateinterface if available, falls back to manual decoding.
        """
        if not SUBSTRATE_AVAILABLE:
            raise AuthenticationError(
                "substrateinterface library required for address decoding"
            )

        try:
            keypair = SubstrateKeypair(ss58_address=address)
            return keypair.public_key
        except Exception as e:
            raise AuthenticationError(f"Invalid Polkadot address: {str(e)}")

    @staticmethod
    def _prepare_message(message: str) -> bytes:
        """
        Prepare message with Polkadot off-chain signing prefix.

        Polkadot uses: \u0000 + length + message
        where length is compact-encoded (for small messages, just 1 byte)
        """
        message_bytes = message.encode("utf-8")
        length = len(message_bytes)

        # Compact encoding: for lengths < 64, it's just the length byte
        if length < 64:
            length_byte = bytes([length])
        else:
            # For larger lengths, use compact encoding
            # (more complex, but messages shouldn't be that long)
            length_byte = length.to_bytes(1, byteorder="little")

        # Polkadot prefix: \u0000
        prefix = b"\x00"

        return prefix + length_byte + message_bytes

    @staticmethod
    def _verify_raw_signature(
        public_key_bytes: bytes, message: bytes, signature_hex: str
    ) -> bool:
        """
        Verify SR25519 signature.

        Args:
            public_key_bytes: Public key as bytes
            message: Message bytes (with Polkadot prefix)
            signature_hex: Hex string signature (0x-prefixed)

        Returns:
            True if signature is valid
        """
        try:
            # Remove 0x prefix if present
            if signature_hex.startswith("0x"):
                signature_hex = signature_hex[2:]

            # Convert hex signature to bytes
            signature_bytes = bytes.fromhex(signature_hex)

            # Verify using available library
            if SR25519_AVAILABLE:
                # Use py_sr25519
                return sr25519_verify(signature_bytes, message, public_key_bytes)
            elif SUBSTRATE_AVAILABLE:
                # Use substrateinterface. Most Polkadot accounts are sr25519;
                # fall back to ed25519 for accounts created with that scheme.
                from substrateinterface import Keypair, KeypairType

                for crypto_type in (KeypairType.SR25519, KeypairType.ED25519):
                    try:
                        keypair = Keypair(
                            public_key=public_key_bytes,
                            crypto_type=crypto_type,
                            ss58_format=0,
                        )
                        if keypair.verify(message, signature_bytes):
                            return True
                    except Exception:
                        # Wrong crypto type for this signature; try the next one.
                        continue
                return False
            else:
                raise AuthenticationError("No signature verification library available")

        except Exception as e:
            print(f"Signature verification error: {e}")
            return False


def validate_auth_message(address: str, message: str, signature: str) -> Tuple[bool, str]:
    """
    Complete validation pipeline for authentication message.

    Steps:
    1. Check message format
    2. Check message expiry
    3. Check nonce uniqueness
    4. Verify cryptographic signature

    Returns:
        (is_valid, error_message or "")
    """
    validator = MessageValidator()
    verifier = SignatureVerifier()

    # Step 1: Validate message format
    is_valid, error = validator.validate_message_format(message, address)
    if not is_valid:
        return False, f"Invalid message format: {error}"

    # Step 2: Validate message expiry
    is_valid, error = validator.validate_message_expiry(message)
    if not is_valid:
        return False, f"Message expired: {error}"

    # Step 3: Extract nonce and check uniqueness
    fields = validator._parse_message_fields(message)
    nonce = fields.get("Nonce:", "")

    is_valid, error = validator.validate_nonce_uniqueness(nonce)
    if not is_valid:
        return False, f"Nonce validation failed: {error}"

    # Step 4: Verify signature
    is_valid, error = verifier.verify_signature(address, message, signature)
    if not is_valid:
        return False, f"Signature verification failed: {error}"

    return True, ""


def create_session(
    address: str,
    session_duration_hours: int = 72,
) -> SessionData:
    """
    Create a new authenticated session.

    Args:
        address: Polkadot wallet address
        session_duration_hours: Session lifetime (default: 72 hours)

    Returns:
        SessionData with token and expiry
    """
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=session_duration_hours)

    # Generate cryptographically secure token
    token = secrets.token_urlsafe(32)  # 256-bit entropy

    session = SessionData(
        token=token,
        address=address,
        created_at=now,
        expires_at=expires_at,
        session_duration_hours=session_duration_hours,
    )

    # Store session
    redis_client = get_redis_client()
    if redis_client:
        # Redis storage with TTL
        ttl = int((expires_at - now).total_seconds())
        redis_client.setex(
            f"session:{token}",
            ttl,
            json.dumps(session.to_dict()),
        )
    else:
        # In-memory storage
        _sessions[token] = session

    return session


def verify_session_token(token: str) -> Optional[SessionData]:
    """
    Verify and retrieve a session by token.

    Returns:
        SessionData if valid, None if invalid or expired
    """
    # Check Redis first
    redis_client = get_redis_client()
    if redis_client:
        session_data = redis_client.get(f"session:{token}")
        if session_data:
            data = json.loads(session_data)
            return SessionData(
                token=token,
                address=data["address"],
                created_at=datetime.fromisoformat(data["created_at"]),
                expires_at=datetime.fromisoformat(data["expires_at"]),
                session_duration_hours=data["session_duration_hours"],
            )
        return None

    # Check in-memory storage
    session = _sessions.get(token)
    if session and datetime.now(timezone.utc) < session.expires_at:
        return session

    # Expired or not found
    if token in _sessions:
        del _sessions[token]

    return None


def clear_session(token: str) -> None:
    """Clear a session (logout)."""
    redis_client = get_redis_client()
    if redis_client:
        redis_client.delete(f"session:{token}")
    else:
        _sessions.pop(token, None)
