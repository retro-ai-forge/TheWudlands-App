"""
Role lookups for privileged actions, backed by the `roles` collection.

One document per wallet address:
    {"address": "<wallet>", "roles": ["reviewer", "admin"]}

Capabilities:
- reviewer - may access (read) stories handed in for review.
- admin    - may delete/modify any story's content, e.g. images on a
             submitted story. Admin implies reviewer.

Grant a role by inserting/updating a doc in the collection, e.g.
    db.roles.update_one({"address": addr},
                        {"$addToSet": {"roles": "admin"}}, upsert=True)
"""

from __future__ import annotations

from typing import Set

from backend.db import get_database

ROLE_REVIEWER = "reviewer"
ROLE_ADMIN = "admin"


async def get_roles(address: str) -> Set[str]:
    db = get_database()
    doc = await db.roles.find_one({"address": address}, {"_id": 0, "roles": 1})
    if not doc:
        return set()
    return set(doc.get("roles", []))


async def is_admin(address: str) -> bool:
    return ROLE_ADMIN in await get_roles(address)


async def is_reviewer(address: str) -> bool:
    roles = await get_roles(address)
    return ROLE_ADMIN in roles or ROLE_REVIEWER in roles
