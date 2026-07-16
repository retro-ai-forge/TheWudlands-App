"""
In-memory registry of currently active (logged-in) players.

A player is added when they log in (see auth_routes.verify_auth_signature)
and evicted once idle for INACTIVITY_TIMEOUT — i.e. no login refresh and no
in-game state change (touch_player) for 2 hours. Any activity resets the
idle timer, so an active player is never evicted mid-session.

Mirrors the lazy-eviction style already used for the nonce/challenge caches
in auth.py / auth_routes.py: expired entries are swept out on access rather
than via a background task.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

INACTIVITY_TIMEOUT = timedelta(hours=2)

# In-memory storage, keyed by the player's public blockchain (wallet) address.
_active_players: Dict[str, "ActivePlayer"] = {}


@dataclass
class ActivePlayer:
    """An active player session, keyed by wallet address."""

    address: str
    logged_in_at: datetime
    last_active_at: datetime
    characters: List[Any] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "address": self.address,
            "loggedInAt": self.logged_in_at.isoformat(),
            "lastActiveAt": self.last_active_at.isoformat(),
            "characters": self.characters,
        }


def _evict_expired(now: Optional[datetime] = None) -> None:
    now = now or datetime.now(timezone.utc)
    expired = [
        address
        for address, player in _active_players.items()
        if now - player.last_active_at > INACTIVITY_TIMEOUT
    ]
    for address in expired:
        del _active_players[address]


def add_active_player(address: str) -> ActivePlayer:
    """
    Register a login for `address`, or refresh its idle timer if already
    active. Called from the /api/auth/verify flow once a signature checks out.
    """
    now = datetime.now(timezone.utc)
    _evict_expired(now)

    player = _active_players.get(address)
    if player is None:
        player = ActivePlayer(address=address, logged_in_at=now, last_active_at=now)
        _active_players[address] = player
    else:
        player.last_active_at = now

    return player


def touch_player(address: str) -> Optional[ActivePlayer]:
    """
    Reset the idle timer for an already-active player, e.g. after a value
    change. Returns None if the player isn't currently active.
    """
    now = datetime.now(timezone.utc)
    _evict_expired(now)

    player = _active_players.get(address)
    if player is None:
        return None

    player.last_active_at = now
    return player


def get_active_player(address: str) -> Optional[ActivePlayer]:
    _evict_expired()
    return _active_players.get(address)


def remove_active_player(address: str) -> None:
    _active_players.pop(address, None)


def list_active_players() -> List[ActivePlayer]:
    _evict_expired()
    return list(_active_players.values())


def add_character(address: str, character: Any) -> Optional[ActivePlayer]:
    """Append a newly created character for `address` and refresh its idle timer."""
    player = touch_player(address)
    if player is None:
        return None

    player.characters.append(character)
    return player
