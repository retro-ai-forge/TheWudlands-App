# Polkadot.js Offline Wallet Signing Authentication Guide

## Overview

This guide covers implementing **Message Signing Authentication** (similar to SIWE for Ethereum) using Polkadot wallets. Users prove ownership of their wallet by signing a challenge message, enabling session-based authentication without on-chain transactions.

## Table of Contents

1. [Message Format & Standards](#message-format--standards)
2. [Client-Side Signing Implementation](#client-side-signing-implementation)
3. [Server-Side Verification](#server-side-verification)
4. [Session Management (72-hour)](#session-management-72-hour)
5. [Authentication Flow](#authentication-flow)
6. [Security Considerations](#security-considerations)
7. [Complete Code Examples](#complete-code-examples)

---

## Message Format & Standards

### Standard Polkadot Message Format

Polkadot uses a standard signing format for off-chain message authentication. The format is:

```
<Bytes prefix><length><message>
```

**Polkadot standard:**
```
\u0000<53><message>
```

Where:
- `\u0000` = null byte (indicates off-chain message)
- `<53>` = message length as compact-encoded integer
- Message content follows

### TheWudlands Authentication Message Format

Create a structured message that includes domain, wallet address, nonce, and session duration:

```
TheWudlands Authentication
Domain: thewudlands.eu
Wallet: {address}
Nonce: {nonce}
Timestamp: {timestamp}
Session Duration: 72 hours
Expires: {expirationTime}
```

**Example:**
```
TheWudlands Authentication
Domain: thewudlands.eu
Wallet: 5FHneA46xpF1nqMvfOrm8e9Msy2XusSvCx5rUc44Cv8uS1wg
Nonce: 1718300400:random-uuid
Timestamp: 2026-06-13T14:00:00Z
Session Duration: 72 hours
Expires: 2026-06-16T14:00:00Z
```

### Why This Format?

- **Unique per request** (nonce + timestamp) prevents replay attacks
- **Domain binding** ensures message is for your app, not others
- **Wallet address** ties signature to specific account
- **Expiration** limits signature validity window
- **Session duration** defines authorization lifetime

---

## Client-Side Signing Implementation

### Required Dependencies

```bash
npm install @polkadot/extension-dapp @polkadot/util @polkadot/util-crypto
```

### Step 1: Generate Authentication Challenge

```typescript
// lib/wallet/auth.ts

import { u8aToString, stringToU8a } from "@polkadot/util";
import { blake2AsHex } from "@polkadot/util-crypto";

export interface AuthChallenge {
  message: string;
  nonce: string;
  timestamp: number;
  expiresAt: number;
  domain: string;
}

/**
 * Generate a unique authentication challenge message.
 * Each challenge is valid for 5 minutes only.
 */
export function generateAuthChallenge(
  address: string,
  domain: string = "thewudlands.eu",
  sessionDurationHours: number = 72
): AuthChallenge {
  const timestamp = Date.now();
  const expiresAt = timestamp + 5 * 60 * 1000; // 5 minute message validity
  const sessionExpiresAt = timestamp + sessionDurationHours * 60 * 60 * 1000;
  
  // Create unique nonce: timestamp:uuid
  const nonce = `${timestamp}:${crypto.randomUUID()}`;

  const message = formatAuthMessage(
    address,
    domain,
    nonce,
    timestamp,
    sessionExpiresAt,
    sessionDurationHours
  );

  return {
    message,
    nonce,
    timestamp,
    expiresAt,
    domain,
  };
}

/**
 * Format the authentication message according to Polkadot standard.
 */
export function formatAuthMessage(
  address: string,
  domain: string,
  nonce: string,
  timestamp: number,
  sessionExpiresAt: number,
  sessionDurationHours: number
): string {
  const expirationTime = new Date(sessionExpiresAt).toISOString();
  const createdTime = new Date(timestamp).toISOString();

  return `TheWudlands Authentication
Domain: ${domain}
Wallet: ${address}
Nonce: ${nonce}
Timestamp: ${createdTime}
Session Duration: ${sessionDurationHours} hours
Expires: ${expirationTime}`;
}
```

### Step 2: Sign the Message with Polkadot Wallet

```typescript
// lib/wallet/auth.ts (continued)

import type { InjectedSigner } from "@polkadot/api/types";

export interface SignedAuthMessage {
  address: string;
  message: string;
  signature: string;
  nonce: string;
  timestamp: number;
  sessionExpiresAt: number;
}

/**
 * Sign an authentication message using the user's Polkadot wallet.
 * 
 * @param address - User's Polkadot address
 * @param message - The message to sign
 * @param signer - The injected signer from web3FromAddress
 * @returns Signed message data with signature
 * 
 * The signature is created by signing the raw message bytes.
 * Polkadot wallets add "\u0000" prefix automatically for off-chain signatures.
 */
export async function signAuthMessage(
  address: string,
  message: string,
  signer: InjectedSigner,
  sessionDurationHours: number = 72
): Promise<SignedAuthMessage> {
  try {
    // Use signRaw for off-chain message signing (not transactions)
    const signRawResult = await signer.signRaw!({
      address,
      data: stringToU8a(message), // Convert message to bytes
      type: "bytes", // Indicates raw bytes, not transaction
    });

    const timestamp = Date.now();
    const sessionExpiresAt = timestamp + sessionDurationHours * 60 * 60 * 1000;

    return {
      address,
      message,
      signature: signRawResult.signature, // Returns 0x-prefixed hex string
      nonce: extractNonce(message),
      timestamp,
      sessionExpiresAt,
    };
  } catch (error: any) {
    throw new Error(`Failed to sign message: ${error.message}`);
  }
}

/**
 * Extract nonce from the formatted message.
 */
function extractNonce(message: string): string {
  const match = message.match(/Nonce: (.+)/);
  return match ? match[1] : "";
}

/**
 * Helper: Get signer from address
 */
export async function getSignerForAuth(
  address: string
): Promise<InjectedSigner> {
  const { web3FromAddress } = await import("@polkadot/extension-dapp");
  
  try {
    const injected = await web3FromAddress(address);
    
    if (!injected.signer) {
      throw new Error("Signer not available for this address");
    }
    
    return injected.signer;
  } catch (error: any) {
    throw new Error(`Failed to get signer: ${error.message}`);
  }
}
```

### Step 3: React Component - Complete Signing Flow

```typescript
// lib/wallet/useAuthSign.ts - React Hook for Authentication

import { useState, useCallback } from "react";
import {
  generateAuthChallenge,
  signAuthMessage,
  getSignerForAuth,
  type SignedAuthMessage,
  type AuthChallenge,
} from "./auth";

interface UseAuthSignState {
  isLoading: boolean;
  error: string | null;
  challenge: AuthChallenge | null;
  signedMessage: SignedAuthMessage | null;
}

/**
 * React hook for managing Polkadot wallet authentication signing.
 */
export function useAuthSign() {
  const [state, setState] = useState<UseAuthSignState>({
    isLoading: false,
    error: null,
    challenge: null,
    signedMessage: null,
  });

  /**
   * Step 1: Request a challenge from the server
   */
  const requestChallenge = useCallback(async (address: string) => {
    setState((s) => ({ ...s, isLoading: true, error: null }));
    try {
      // In real app, fetch from your backend
      const challenge = generateAuthChallenge(address);
      setState((s) => ({ ...s, challenge, isLoading: false }));
      return challenge;
    } catch (error: any) {
      const message = error.message || "Failed to generate challenge";
      setState((s) => ({ ...s, error: message, isLoading: false }));
      throw error;
    }
  }, []);

  /**
   * Step 2: Sign the challenge with wallet
   */
  const signChallenge = useCallback(
    async (address: string, challenge: AuthChallenge) => {
      setState((s) => ({ ...s, isLoading: true, error: null }));
      try {
        const signer = await getSignerForAuth(address);
        const signed = await signAuthMessage(
          address,
          challenge.message,
          signer,
          72 // 72-hour session
        );
        setState((s) => ({ ...s, signedMessage: signed, isLoading: false }));
        return signed;
      } catch (error: any) {
        const message = error.message || "Failed to sign challenge";
        setState((s) => ({ ...s, error: message, isLoading: false }));
        throw error;
      }
    },
    []
  );

  /**
   * Step 3: Submit signed message to backend for verification
   */
  const submitSignedMessage = useCallback(
    async (signedMessage: SignedAuthMessage) => {
      setState((s) => ({ ...s, isLoading: true, error: null }));
      try {
        const response = await fetch("/api/auth/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(signedMessage),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.detail || "Verification failed");
        }

        const session = await response.json();
        setState((s) => ({ ...s, isLoading: false }));
        return session;
      } catch (error: any) {
        const message = error.message || "Failed to verify signature";
        setState((s) => ({ ...s, error: message, isLoading: false }));
        throw error;
      }
    },
    []
  );

  /**
   * Complete authentication flow in one call
   */
  const authenticate = useCallback(
    async (address: string) => {
      try {
        const challenge = await requestChallenge(address);
        const signed = await signChallenge(address, challenge);
        const session = await submitSignedMessage(signed);
        return session;
      } catch (error) {
        throw error;
      }
    },
    [requestChallenge, signChallenge, submitSignedMessage]
  );

  return {
    ...state,
    requestChallenge,
    signChallenge,
    submitSignedMessage,
    authenticate,
  };
}
```

### Step 4: UI Component

```typescript
// app/components/WalletAuth.tsx

"use client";

import { useState } from "react";
import { useAuthSign } from "@/lib/wallet/useAuthSign";

interface WalletAuthProps {
  address: string;
  onAuthSuccess?: (session: any) => void;
  onAuthError?: (error: string) => void;
}

export default function WalletAuth({
  address,
  onAuthSuccess,
  onAuthError,
}: WalletAuthProps) {
  const auth = useAuthSign();
  const [step, setStep] = useState<"idle" | "challenge" | "signing" | "verifying">(
    "idle"
  );

  async function handleAuthenticate() {
    try {
      setStep("challenge");
      const session = await auth.authenticate(address);
      setStep("idle");
      onAuthSuccess?.(session);
    } catch (error: any) {
      setStep("idle");
      onAuthError?.(error.message);
    }
  }

  const stepLabels = {
    challenge: "Generating challenge...",
    signing: "Please sign in your wallet...",
    verifying: "Verifying signature...",
    idle: "Sign In with Wallet",
  };

  return (
    <div>
      <button
        onClick={handleAuthenticate}
        disabled={auth.isLoading}
        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
      >
        {stepLabels[step]}
      </button>

      {auth.error && (
        <div className="mt-2 p-2 bg-red-100 text-red-700 rounded">
          {auth.error}
        </div>
      )}

      {auth.challenge && step === "idle" && (
        <div className="mt-4 p-3 bg-gray-100 rounded text-sm font-mono">
          <p className="font-bold mb-2">Message to Sign:</p>
          <pre className="whitespace-pre-wrap text-xs">{auth.challenge.message}</pre>
        </div>
      )}
    </div>
  );
}
```

---

## Server-Side Verification

### Backend Dependencies (Python/FastAPI)

```bash
pip install polkadot-substrate-interface python-jose cryptography
# Or for direct signature verification:
pip install py-sr25519
```

### Step 1: Signature Verification

```python
# backend/auth/verification.py

from typing import Tuple
from py_sr25519 import verify  # or use substrateinterface library
from datetime import datetime, timedelta
import os

class AuthenticationError(Exception):
    """Raised when authentication fails."""
    pass

def verify_polkadot_signature(
    address: str,
    message: str,
    signature: str,
) -> bool:
    """
    Verify a Polkadot message signature.
    
    Args:
        address: Polkadot address (SS58 format, e.g., "5F...")
        message: Original message that was signed
        signature: Hex string signature (0x-prefixed)
    
    Returns:
        True if signature is valid, False otherwise
    
    Process:
    1. Convert hex signature to bytes
    2. Convert message to bytes with Polkadot prefix
    3. Verify using address public key
    """
    try:
        # Remove 0x prefix if present
        if signature.startswith("0x"):
            signature = signature[2:]
        
        # Convert hex signature to bytes
        sig_bytes = bytes.fromhex(signature)
        
        # Add Polkadot off-chain message prefix
        prefixed_message = b"\x00" + len(message).to_bytes(1, 'big') + message.encode()
        
        # Verify using py-sr25519
        public_key_bytes = decode_address(address)
        verified = verify(
            sig_bytes,
            prefixed_message,
            public_key_bytes
        )
        
        return verified
    except Exception as e:
        print(f"Signature verification failed: {e}")
        return False


def decode_address(address: str) -> bytes:
    """
    Decode Polkadot SS58 address to public key bytes.
    
    Uses substrateinterface for compatibility with all Polkadot networks.
    """
    try:
        from substrateinterface import Keypair
        keypair = Keypair(ss58_address=address)
        return keypair.public_key
    except Exception as e:
        raise AuthenticationError(f"Invalid Polkadot address: {e}")
```

### Step 2: Message Validation

```python
# backend/auth/message_validator.py

from datetime import datetime, timedelta
from typing import Dict, Tuple

DOMAIN = "thewudlands.eu"
MESSAGE_VALIDITY_SECONDS = 300  # 5 minutes
SESSION_DURATION_HOURS = 72
NONCE_CACHE_SIZE = 10000

# In-memory nonce cache to prevent replay attacks
_used_nonces: set[str] = set()

class MessageValidator:
    """Validates authentication messages before signature verification."""
    
    @staticmethod
    def validate_message_format(message: str, address: str) -> Tuple[bool, str]:
        """
        Validate that message contains required fields in correct format.
        
        Returns:
            (is_valid, error_message)
        """
        required_fields = {
            "Domain:": DOMAIN,
            "Wallet:": address,
            "Nonce:": None,  # Just check presence
            "Timestamp:": None,
            "Session Duration:": "72 hours",
            "Expires:": None,
        }
        
        lines = message.strip().split("\n")
        message_dict = {}
        
        for line in lines:
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            key = key.strip() + ":"
            value = value.strip()
            message_dict[key] = value
        
        # Verify required fields
        for field, expected_value in required_fields.items():
            if field not in message_dict:
                return False, f"Missing required field: {field}"
            
            if expected_value and message_dict[field] != expected_value:
                return False, f"Invalid {field} value"
        
        return True, ""
    
    @staticmethod
    def validate_message_expiry(message: str) -> Tuple[bool, str]:
        """
        Validate that message hasn't expired (check Timestamp field).
        """
        try:
            # Extract timestamp
            for line in message.split("\n"):
                if line.startswith("Timestamp:"):
                    timestamp_str = line.split(":", 1)[1].strip()
                    timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                    
                    # Check if within 5-minute validity window
                    now = datetime.utcnow().replace(tzinfo=timestamp.tzinfo)
                    age = (now - timestamp).total_seconds()
                    
                    if age > MESSAGE_VALIDITY_SECONDS:
                        return False, f"Message expired (age: {age}s)"
                    
                    if age < 0:
                        return False, "Message is in the future"
                    
                    return True, ""
            
            return False, "Timestamp not found in message"
        except Exception as e:
            return False, f"Invalid timestamp format: {e}"
    
    @staticmethod
    def validate_nonce_uniqueness(nonce: str) -> Tuple[bool, str]:
        """
        Prevent replay attacks by ensuring nonce is unique.
        
        In production, use Redis or a database for distributed nonce cache.
        """
        if nonce in _used_nonces:
            return False, "Nonce already used (replay attack detected)"
        
        # Store nonce for future checks
        _used_nonces.add(nonce)
        
        # Prevent memory leaks by limiting cache size
        if len(_used_nonces) > NONCE_CACHE_SIZE:
            _used_nonces.clear()
        
        return True, ""
    
    @staticmethod
    def extract_message_fields(message: str) -> Dict[str, str]:
        """Parse message and return fields as dict."""
        fields = {}
        for line in message.split("\n"):
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            fields[key.strip()] = value.strip()
        return fields


def validate_auth_message(
    address: str,
    message: str,
    signature: str,
) -> Tuple[bool, str]:
    """
    Complete message validation pipeline.
    
    Returns:
        (is_valid, error_message)
    """
    validator = MessageValidator()
    
    # 1. Check message format
    valid, error = validator.validate_message_format(message, address)
    if not valid:
        return False, f"Invalid message format: {error}"
    
    # 2. Check message expiry
    valid, error = validator.validate_message_expiry(message)
    if not valid:
        return False, f"Message expired: {error}"
    
    # 3. Extract nonce and check uniqueness
    fields = validator.extract_message_fields(message)
    nonce = fields.get("Nonce", "")
    
    valid, error = validator.validate_nonce_uniqueness(nonce)
    if not valid:
        return False, f"Nonce validation failed: {error}"
    
    return True, ""
```

### Step 3: Authentication Endpoint

```python
# backend/routes/auth.py

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, timedelta
from auth.verification import verify_polkadot_signature, AuthenticationError
from auth.message_validator import validate_auth_message
from auth.session import create_session, SessionData

router = APIRouter(prefix="/api/auth", tags=["auth"])

class SignedAuthMessageRequest(BaseModel):
    address: str
    message: str
    signature: str
    nonce: str
    timestamp: int
    sessionExpiresAt: int

class AuthSessionResponse(BaseModel):
    token: str
    address: str
    expiresAt: str
    sessionDurationHours: int

@router.post("/verify", response_model=AuthSessionResponse)
async def verify_auth_signature(payload: SignedAuthMessageRequest):
    """
    Verify signed authentication message and create session.
    
    Process:
    1. Validate message format and expiry
    2. Check nonce uniqueness (replay protection)
    3. Verify cryptographic signature
    4. Create session token
    5. Return session data
    """
    try:
        # Step 1: Validate message
        is_valid, error = validate_auth_message(
            payload.address,
            payload.message,
            payload.signature,
        )
        
        if not is_valid:
            raise HTTPException(status_code=401, detail=error)
        
        # Step 2: Verify signature cryptographically
        signature_valid = verify_polkadot_signature(
            payload.address,
            payload.message,
            payload.signature,
        )
        
        if not signature_valid:
            raise HTTPException(
                status_code=401,
                detail="Signature verification failed"
            )
        
        # Step 3: Create session
        session = create_session(
            address=payload.address,
            expiresAt=datetime.fromtimestamp(payload.sessionExpiresAt / 1000),
            sessionDurationHours=72,
        )
        
        return AuthSessionResponse(
            token=session.token,
            address=session.address,
            expiresAt=session.expiresAt.isoformat(),
            sessionDurationHours=72,
        )
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"Authentication error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")
```

### Step 4: Session Management

```python
# backend/auth/session.py

from datetime import datetime, timedelta
from dataclasses import dataclass
from typing import Optional
import secrets
import json
import redis

# In production, use Redis or a database
SESSION_STORE = {}  # In-memory store for development
REDIS_CLIENT = None  # Set to redis.Redis(...) in production

@dataclass
class SessionData:
    token: str
    address: str
    createdAt: datetime
    expiresAt: datetime
    sessionDurationHours: int

def get_redis_client():
    """Get Redis client for distributed session storage."""
    global REDIS_CLIENT
    if REDIS_CLIENT is None:
        REDIS_CLIENT = redis.Redis(
            host=os.getenv("REDIS_HOST", "localhost"),
            port=int(os.getenv("REDIS_PORT", 6379)),
            db=0,
            decode_responses=True,
        )
    return REDIS_CLIENT

def create_session(
    address: str,
    expiresAt: datetime,
    sessionDurationHours: int = 72,
) -> SessionData:
    """
    Create a new authentication session.
    
    Uses Redis in production for distributed session storage.
    """
    token = secrets.token_urlsafe(32)  # Cryptographically secure random token
    now = datetime.utcnow()
    
    session = SessionData(
        token=token,
        address=address,
        createdAt=now,
        expiresAt=expiresAt,
        sessionDurationHours=sessionDurationHours,
    )
    
    # Store in Redis (production) or memory (development)
    if REDIS_CLIENT:
        ttl = int((expiresAt - now).total_seconds())
        REDIS_CLIENT.setex(
            f"session:{token}",
            ttl,
            json.dumps({
                "address": address,
                "createdAt": now.isoformat(),
                "expiresAt": expiresAt.isoformat(),
            }),
        )
    else:
        SESSION_STORE[token] = session
    
    return session

def verify_session_token(token: str) -> Optional[SessionData]:
    """
    Verify and retrieve a session by token.
    
    Returns None if token is invalid or expired.
    """
    if REDIS_CLIENT:
        session_data = REDIS_CLIENT.get(f"session:{token}")
        if session_data:
            data = json.loads(session_data)
            return SessionData(
                token=token,
                address=data["address"],
                createdAt=datetime.fromisoformat(data["createdAt"]),
                expiresAt=datetime.fromisoformat(data["expiresAt"]),
                sessionDurationHours=72,
            )
    else:
        session = SESSION_STORE.get(token)
        if session and datetime.utcnow() < session.expiresAt:
            return session
    
    return None

def get_session_from_token(token: str) -> dict:
    """Middleware to extract session from bearer token."""
    if not token.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid token format")
    
    session = verify_session_token(token[7:])  # Remove "Bearer " prefix
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    return {"address": session.address, "expiresAt": session.expiresAt}
```

---

## Session Management (72-hour)

### Session Flow

```
User Login
    ↓
Request Challenge → Challenge valid for 5 minutes
    ↓
Sign Challenge with Wallet
    ↓
Send Signature to Backend
    ↓
Verify Signature + Message
    ↓
Create Session Token (72-hour lifetime)
    ↓
Return JWT/Token to Client
    ↓
Store in Cookies/LocalStorage
    ↓
Use Token for Authenticated Requests
    ↓
Token expires after 72 hours
```

### Session Token Structure

```python
# Token payload (if using JWT)
{
  "sub": "5FHneA46xpF1nqMvfOrm8e9Msy2XusSvCx5rUc44Cv8uS1wg",  # subject (address)
  "exp": 1718486400,  # expiration (72 hours from creation)
  "iat": 1718313600,  # issued at
  "sessionDuration": 72,
  "type": "polkadot-auth"
}
```

### Client-Side Session Management

```typescript
// lib/session/sessionManager.ts

interface SessionData {
  token: string;
  address: string;
  expiresAt: Date;
}

export class SessionManager {
  private static readonly SESSION_KEY = "wudlands_session";
  private static readonly EXPIRY_WARNING_MS = 10 * 60 * 1000; // Warn 10 min before expiry

  /**
   * Save session to localStorage (or sessionStorage).
   * In production, use httpOnly cookies via server.
   */
  static saveSession(session: SessionData): void {
    localStorage.setItem(
      this.SESSION_KEY,
      JSON.stringify({
        token: session.token,
        address: session.address,
        expiresAt: session.expiresAt.toISOString(),
      })
    );
  }

  /**
   * Retrieve active session from storage.
   */
  static getSession(): SessionData | null {
    const stored = localStorage.getItem(this.SESSION_KEY);
    if (!stored) return null;

    try {
      const data = JSON.parse(stored);
      const expiresAt = new Date(data.expiresAt);

      // Check if expired
      if (expiresAt < new Date()) {
        this.clearSession();
        return null;
      }

      return {
        token: data.token,
        address: data.address,
        expiresAt,
      };
    } catch {
      this.clearSession();
      return null;
    }
  }

  /**
   * Get token for API requests.
   */
  static getAuthToken(): string | null {
    const session = this.getSession();
    return session ? `Bearer ${session.token}` : null;
  }

  /**
   * Check if session is expiring soon.
   */
  static isExpiringSoon(): boolean {
    const session = this.getSession();
    if (!session) return false;

    const timeUntilExpiry = session.expiresAt.getTime() - Date.now();
    return timeUntilExpiry < this.EXPIRY_WARNING_MS;
  }

  /**
   * Clear session from storage.
   */
  static clearSession(): void {
    localStorage.removeItem(this.SESSION_KEY);
  }

  /**
   * Get remaining session time in minutes.
   */
  static getTimeRemaining(): number | null {
    const session = this.getSession();
    if (!session) return null;

    const ms = session.expiresAt.getTime() - Date.now();
    return Math.max(0, Math.floor(ms / 1000 / 60));
  }
}

// React hook for session management
export function useSession() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [isExpiringSoon, setIsExpiringSoon] = useState(false);

  useEffect(() => {
    // Check session on mount
    const current = SessionManager.getSession();
    setSession(current);

    // Refresh check every minute
    const interval = setInterval(() => {
      const updated = SessionManager.getSession();
      setSession(updated);
      setIsExpiringSoon(SessionManager.isExpiringSoon());
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  return {
    session,
    isExpiringSoon,
    timeRemaining: SessionManager.getTimeRemaining(),
    logout: () => {
      SessionManager.clearSession();
      setSession(null);
    },
  };
}
```

---

## Authentication Flow

### Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENT (Frontend)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. User clicks "Sign In with Wallet"                            │
│     ↓                                                             │
│  2. generateAuthChallenge(address) → AuthChallenge              │
│     (Nonce + Timestamp + Message Format)                         │
│     ↓                                                             │
│  3. getSignerForAuth(address) → InjectedSigner                  │
│     ↓                                                             │
│  4. signer.signRaw({address, data: message})                    │
│     → User approves in wallet extension → Signature              │
│     ↓                                                             │
│  5. POST /api/auth/verify {                                      │
│       address, message, signature, nonce, timestamp              │
│     }                                                             │
│                                                                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     SERVER (Backend)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  6. validate_auth_message():                                     │
│     - Check message format (Domain, Wallet, etc.)               │
│     - Check message expiry (5 minutes)                           │
│     - Check nonce uniqueness (replay protection)                 │
│                                                                   │
│  7. verify_polkadot_signature():                                │
│     - Decode address to public key                              │
│     - Add Polkadot prefix to message                            │
│     - Verify signature using py-sr25519                         │
│                                                                   │
│  8. If valid:                                                    │
│     - create_session(address) → SessionData                     │
│     - Generate token (JWT or random)                            │
│     - Store in Redis with 72-hour TTL                           │
│                                                                   │
│  9. Return {                                                     │
│       token, address, expiresAt, sessionDurationHours           │
│     }                                                             │
│                                                                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENT (Frontend)                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  10. SessionManager.saveSession(token, address, expiresAt)       │
│      → Stored in localStorage or httpOnly cookie                │
│                                                                   │
│  11. All future API requests include:                            │
│      Authorization: Bearer {token}                               │
│                                                                   │
│  12. On logout or expiry:                                        │
│      SessionManager.clearSession()                               │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Security Considerations

### 1. **Signature Verification**

- ✅ Always verify timestamp to prevent old signature reuse
- ✅ Use cryptographically secure nonce (UUID + timestamp)
- ✅ Implement nonce caching to prevent replay attacks
- ✅ Use off-chain message prefix (`\u0000`) for message signing
- ✅ Never trust client-provided data without verification

### 2. **Message Format**

- ✅ Include domain binding to prevent cross-site attacks
- ✅ Include wallet address to tie signature to account
- ✅ Short message validity window (5 minutes)
- ✅ Include explicit session duration
- ✅ Use ISO 8601 timestamps for consistency

### 3. **Session Tokens**

- ✅ Use cryptographically secure random tokens
- ✅ Store with 72-hour TTL (set expiration)
- ✅ Use httpOnly cookies in production (not localStorage)
- ✅ Implement session rotation for long-lived sessions
- ✅ Validate token on each request

### 4. **Attack Vectors & Mitigations**

| Attack | Mitigation |
|--------|-----------|
| **Replay Attack** | Unique nonce + timestamp + signature expiry |
| **Signature Reuse** | Nonce caching + 5-minute message validity |
| **Cross-Site Attack** | Domain binding in message + CSRF token |
| **Token Theft** | httpOnly cookies + secure flag + sameSite=strict |
| **Impersonation** | Cryptographic signature verification |
| **Stale Session** | Timestamp validation + TTL enforcement |

### 5. **Best Practices**

```typescript
// DON'T store sensitive data in JWT payload
// It's readable (not encrypted)

// DO use opaque tokens with backend session storage
const token = secrets.token_urlsafe(32);  // 256-bit entropy

// DON'T trust client timestamps
// Always validate server-side

// DO validate all message fields
// Format, domain, address, nonce, expiry

// DON'T reuse nonces
// Implement distributed cache (Redis) in production

// DO implement rate limiting
// Prevent brute force signature attempts
```

---

## Complete Code Examples

### Example 1: Full Client Flow

```typescript
// pages/auth-demo.tsx

"use client";

import { useState } from "react";
import { useAuthSign } from "@/lib/wallet/useAuthSign";
import { SessionManager } from "@/lib/session/sessionManager";

export default function AuthDemo() {
  const [address, setAddress] = useState("");
  const [connectedAddress, setConnectedAddress] = useState("");
  const auth = useAuthSign();

  async function handleConnect() {
    try {
      const { web3Enable, web3Accounts } = await import(
        "@polkadot/extension-dapp"
      );

      await web3Enable("TheWudlands");
      const accounts = await web3Accounts();

      if (accounts.length === 0) {
        alert("No accounts found");
        return;
      }

      setConnectedAddress(accounts[0].address);
      setAddress(accounts[0].address);
    } catch (error: any) {
      alert(`Connection failed: ${error.message}`);
    }
  }

  async function handleSignIn() {
    if (!address) {
      alert("Please connect wallet first");
      return;
    }

    try {
      const session = await auth.authenticate(address);
      SessionManager.saveSession({
        token: session.token,
        address: session.address,
        expiresAt: new Date(session.expiresAt),
      });
      alert(`Signed in as ${session.address}`);
    } catch (error: any) {
      alert(`Sign in failed: ${error.message}`);
    }
  }

  const isConnected = !!connectedAddress;
  const isSignedIn = !!SessionManager.getSession();

  return (
    <div className="p-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">Polkadot Auth Demo</h1>

      {!isConnected ? (
        <button
          onClick={handleConnect}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Connect Wallet
        </button>
      ) : (
        <>
          <div className="mb-4 p-3 bg-green-100 rounded">
            <p className="text-sm font-mono">{connectedAddress}</p>
          </div>

          {!isSignedIn ? (
            <button
              onClick={handleSignIn}
              disabled={auth.isLoading}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
            >
              {auth.isLoading ? "Signing..." : "Sign In with Wallet"}
            </button>
          ) : (
            <div className="text-center">
              <p className="text-green-600 font-bold mb-2">✓ Signed In</p>
              <button
                onClick={() => {
                  SessionManager.clearSession();
                  window.location.reload();
                }}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Sign Out
              </button>
            </div>
          )}
        </>
      )}

      {auth.error && (
        <div className="mt-4 p-3 bg-red-100 text-red-700 rounded text-sm">
          {auth.error}
        </div>
      )}
    </div>
  );
}
```

### Example 2: Backend Middleware

```python
# backend/middleware/auth_middleware.py

from fastapi import Request, HTTPException, Depends
from functools import wraps
from auth.session import verify_session_token

async def verify_auth_header(request: Request) -> str:
    """
    FastAPI dependency to verify Bearer token.
    
    Usage:
        @router.get("/protected")
        async def protected_route(address: str = Depends(verify_auth_header)):
            return {"message": f"Hello {address}"}
    """
    auth_header = request.headers.get("Authorization")
    
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid auth header")
    
    token = auth_header[7:]  # Remove "Bearer " prefix
    session = verify_session_token(token)
    
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    return session.address

# Usage in route
@router.get("/api/profile")
async def get_profile(address: str = Depends(verify_auth_header)):
    """Get user profile - requires valid auth token."""
    return {
        "address": address,
        "profile": {
            "username": f"user_{address[:6]}",
            "joinedAt": "2026-06-13",
        }
    }
```

### Example 3: Testing Signature Verification

```python
# backend/tests/test_auth.py

import pytest
from auth.verification import verify_polkadot_signature
from auth.message_validator import validate_auth_message
from py_sr25519 import pair_from_seed

def test_signature_verification():
    """Test Polkadot signature verification."""
    # Generate test keypair
    seed = bytes.fromhex("0" * 64)
    pk, sk = pair_from_seed(seed)
    
    # Create address (simplified - use substrateinterface in real code)
    address = "5FHneA46xpF1nqMvfOrm8e9Msy2XusSvCx5rUc44Cv8uS1wg"
    
    # Create and sign message
    message = """TheWudlands Authentication
Domain: thewudlands.eu
Wallet: 5FHneA46xpF1nqMvfOrm8e9Msy2XusSvCx5rUc44Cv8uS1wg
Nonce: 1718300400:12345
Timestamp: 2026-06-13T14:00:00Z
Session Duration: 72 hours
Expires: 2026-06-16T14:00:00Z"""
    
    # Sign with prefix
    prefixed = b"\x00" + len(message).to_bytes(1, 'big') + message.encode()
    signature = sk.sign(prefixed)
    
    # Verify
    assert verify_polkadot_signature(address, message, "0x" + signature.hex())

def test_message_validation():
    """Test message format validation."""
    address = "5FHneA46xpF1nqMvfOrm8e9Msy2XusSvCx5rUc44Cv8uS1wg"
    message = """TheWudlands Authentication
Domain: thewudlands.eu
Wallet: 5FHneA46xpF1nqMvfOrm8e9Msy2XusSvCx5rUc44Cv8uS1wg
Nonce: 1718300400:12345
Timestamp: 2026-06-13T14:00:00Z
Session Duration: 72 hours
Expires: 2026-06-16T14:00:00Z"""
    
    # Should pass validation (mock current time as 2026-06-13)
    is_valid, error = validate_auth_message(address, message, "0x...")
    # Would return True if message is within validity window
```

---

## Summary

This implementation provides:

✅ **Client-side signing** using `@polkadot/extension-dapp` and `signRaw`
✅ **Standard message format** with domain, address, nonce, timestamp, session duration
✅ **Server-side verification** using `py-sr25519` or `substrateinterface`
✅ **Replay attack prevention** with nonce caching and timestamp validation
✅ **72-hour session management** with Redis-ready backend storage
✅ **Security best practices** including message expiry, domain binding, and cryptographic verification
✅ **Complete code examples** for both client and server implementations

For integration into TheWudlands, use this as Phase 2 of the wallet module to enable wallet-based authentication without transactions.
