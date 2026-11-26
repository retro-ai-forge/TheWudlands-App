"""
Cleanup: story image folders in the bucket that no story uses any more.

Each story's images sit in a folder per stage (backend/twine_images.py):
    twine-images/{wallet}/create/{storyId}/   the editor's working images
    twine-images/{wallet}/review/{storyId}/   a submission's frozen copy
    twine-images/served/{storyId}/            a live story's copy

A folder is deleted only when BOTH hold:
  - its story id is in none of twine_stories, twine_review and twine_live
    (whatever the stage - a folder is kept as long as its story is known
    anywhere), and
  - its newest file is older than --days (30 by default). A story can have
    images but no database entry for a while: an editor save that failed, or
    a story deleted on one device that another browser of the same wallet
    uploads again the next time it opens the editor. Thirty days give its
    author time to open the editor once.
Anything that doesn't look like one of the three folders is never touched.

Deleting a story in the editor already removes its working images; this
catches what that missed (older deletes, a failed delete, folders left by
earlier code).

Usage:
    source .venv/bin/activate
    python scripts/cleanup_story_images.py            # dry run: lists what would go
    python scripts/cleanup_story_images.py --apply    # deletes it
    python scripts/cleanup_story_images.py --days 60  # a longer grace time
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable, Optional

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

PREFIX = "twine-images/"
STAGES = ("create", "review")  # wallet-scoped; served is keyed by story id only
SERVED = "served"
DEFAULT_DAYS = 30


@dataclass
class Folder:
    prefix: str  # the folder's path, ending in "/"
    stage: str
    wallet: Optional[str]  # None for served
    story_id: str
    files: int = 0
    size: int = 0
    newest: Optional[datetime] = None

    def add(self, size: int, created: Optional[datetime]) -> None:
        self.files += 1
        self.size += size or 0
        if created and (self.newest is None or created > self.newest):
            self.newest = created


def folder_of(name: str) -> Optional[tuple]:
    """(prefix, stage, wallet, story id) for a blob name, or None when it
    isn't inside one of the three story folders."""
    if not name.startswith(PREFIX):
        return None
    parts = name[len(PREFIX):].split("/")
    if len(parts) >= 3 and parts[0] == SERVED and parts[1] and parts[2]:
        return (f"{PREFIX}{SERVED}/{parts[1]}/", SERVED, None, parts[1])
    if len(parts) >= 4 and parts[0] and parts[1] in STAGES and parts[2] and parts[3]:
        return (f"{PREFIX}{parts[0]}/{parts[1]}/{parts[2]}/", parts[1], parts[0], parts[2])
    return None


def folders_from_blobs(blobs: Iterable) -> tuple:
    """({prefix: Folder}, [names outside any story folder]) from blobs with
    .name, .size and .time_created."""
    folders: dict = {}
    unknown: list = []
    for blob in blobs:
        found = folder_of(blob.name)
        if found is None:
            unknown.append(blob.name)
            continue
        prefix, stage, wallet, story_id = found
        folder = folders.setdefault(prefix, Folder(prefix, stage, wallet, story_id))
        folder.add(blob.size, blob.time_created)
    return folders, unknown


def plan(folders: dict, known_ids: set, now: datetime, days: int) -> tuple:
    """([folders to delete], [(folder, why it stays)])."""
    cutoff = now - timedelta(days=days)
    delete, keep = [], []
    for folder in sorted(folders.values(), key=lambda f: f.prefix):
        if folder.story_id in known_ids:
            keep.append((folder, "its story is in the database"))
        elif folder.newest is None or folder.newest > cutoff:
            keep.append((folder, f"a file is newer than {days} days"))
        else:
            delete.append(folder)
    return delete, keep


def apply_refusal(known_ids: set, folders: dict) -> Optional[str]:
    """Why --apply must not run: a database without a single story next to a
    bucket full of folders means the wrong database, not that nothing is used."""
    if folders and not known_ids:
        return (
            "the database lists no story at all - check MONGODB_URI and MONGODB_DB_NAME; "
            "nothing was deleted"
        )
    return None


async def known_story_ids(db) -> set:
    """Every story id in twine_stories, twine_review (any status) and twine_live."""
    ids: set = set()
    async for doc in db.twine_stories.find({}, {"storyId": 1}):
        ids.add(doc.get("storyId"))
    async for doc in db.twine_review.find({}, {"storyId": 1}):
        ids.add(doc.get("storyId"))
    async for doc in db.twine_live.find({}, {"storyId": 1}):
        ids.add(doc.get("_id"))
        ids.add(doc.get("storyId"))
    ids.discard(None)
    return ids


def _show(folder: Folder) -> str:
    owner = f"{folder.wallet[:8]}…" if folder.wallet else "-"
    newest = f"{folder.newest:%Y-%m-%d}" if folder.newest else "?"
    return (
        f"{folder.stage:7} {owner:10} {folder.story_id}  "
        f"{folder.files:3} files {folder.size / 1e6:6.2f} MB  newest {newest}"
    )


async def main(apply: bool, days: int) -> int:
    from dotenv import load_dotenv
    from google.cloud import storage

    from backend.db import get_database

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    bucket = storage.Client().bucket(os.environ["GCS_BUCKET_NAME"])
    db = get_database()

    folders, unknown = folders_from_blobs(bucket.list_blobs(prefix=PREFIX))
    known = await known_story_ids(db)
    now = datetime.now(timezone.utc)
    delete, keep = plan(folders, known, now, days)

    print(f"{len(folders)} story image folders, {len(known)} story ids in the database\n")
    print(f"Kept ({len(keep)}):")
    for folder, why in keep:
        print(f"  {_show(folder)}  - {why}")
    if unknown:
        print(f"\nNot in a story folder, never touched ({len(unknown)}):")
        for name in unknown[:20]:
            print(f"  {name}")
    print(f"\nNo story uses these, newest file older than {days} days ({len(delete)}):")
    for folder in delete:
        print(f"  {_show(folder)}")
    total = sum(f.files for f in delete)
    print(f"  = {total} files, {sum(f.size for f in delete) / 1e6:.2f} MB")

    if not apply:
        print("\nDry run - nothing deleted. Run with --apply to delete the folders above.")
        return 0
    refusal = apply_refusal(known, folders)
    if refusal:
        print(f"\nRefused: {refusal}")
        return 1

    # Read the stories again right before deleting: a story saved meanwhile keeps its folder.
    known_now = await known_story_ids(db)
    deleted = 0
    for folder in delete:
        if folder.story_id in known_now:
            print(f"  kept, its story appeared meanwhile: {folder.prefix}")
            continue
        for blob in bucket.list_blobs(prefix=folder.prefix):
            blob.delete()
            deleted += 1
    print(f"\nDeleted {deleted} files.")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="delete; without it nothing is deleted")
    parser.add_argument("--days", type=int, default=DEFAULT_DAYS, help="grace time in days (default 30)")
    args = parser.parse_args()
    if args.days < 1:
        parser.error("--days is at least 1")
    sys.exit(asyncio.run(main(args.apply, args.days)))
