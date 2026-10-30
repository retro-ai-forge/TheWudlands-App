"""
Twine story image storage, backed by a Firebase Storage / GCS bucket.

Images move through three lifecycle stages, each a separate path segment keyed
by the story OWNER's wallet and the story id:

    twine-images/{wallet}/create/{storyId}/{filename}   author's working copy
    twine-images/{wallet}/review/{storyId}/{filename}   frozen copy made on submit
    twine-images/{wallet}/served/{storyId}/{filename}   production copy on deploy

Thumbnails live under a `thumbs/` subfolder of the same stage.

- The Image Manager (authoring) only ever touches `create`.
- On submit, `create` is copied to `review` (the author no longer edits those).
- On deploy, `review` is copied to `served` and the review copy is removed.

Images are served publicly by exact URL (a custom get-only role grants allUsers
`storage.objects.get`, so URLs load but the bucket cannot be listed). Uploads,
copies and deletes go through the backend using Application Default Credentials
(`gcloud auth application-default login` locally, or the Cloud Run service
account). No key file is required. Thumbnails are generated client-side, so this
module never decodes or resizes images itself.
"""

from __future__ import annotations

import os
from typing import List, Optional

from google.cloud import storage

_PREFIX = "twine-images"
_THUMB_DIR = "thumbs"

STAGE_CREATE = "create"
STAGE_REVIEW = "review"
STAGE_SERVED = "served"

# Image content types we accept, mapped to their canonical extension. Uploads
# are converted to WebP client-side; JPEG/PNG remain allowed as a fallback for
# browsers that can't encode WebP via canvas.
_ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}

_client: Optional[storage.Client] = None


def _get_bucket() -> storage.Bucket:
    """Return the configured bucket, creating the client on first use."""
    global _client

    bucket_name = os.getenv("GCS_BUCKET_NAME")
    if not bucket_name:
        raise RuntimeError("GCS_BUCKET_NAME environment variable is not set")

    if _client is None:
        _client = storage.Client()

    return _client.bucket(bucket_name)


def sanitize_filename(name: str) -> str:
    """Reduce an uploaded name to a safe basename stories can reference.

    Strips any directory components and characters outside a conservative set,
    so the result is safe both as a bucket object suffix and as the token inside
    a `[img[...]]` macro.
    """
    import re

    base = os.path.basename(name or "").strip()
    stem, ext = os.path.splitext(base)
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._-")
    ext = re.sub(r"[^A-Za-z0-9]+", "", ext).lower()
    if not stem:
        stem = "image"
    return f"{stem}.{ext}" if ext else stem


def extension_for_content_type(content_type: str) -> Optional[str]:
    return _ALLOWED_CONTENT_TYPES.get((content_type or "").lower())


def is_allowed_content_type(content_type: str) -> bool:
    return (content_type or "").lower() in _ALLOWED_CONTENT_TYPES


def _story_prefix(wallet: str, stage: str, story_id: str) -> str:
    # Served (production) images are public to everyone and keyed by story id
    # only - no wallet in the path. Create/review stay scoped to the owner.
    if stage == STAGE_SERVED:
        return f"{_PREFIX}/{STAGE_SERVED}/{story_id}/"
    return f"{_PREFIX}/{wallet}/{stage}/{story_id}/"


def _full_path(wallet: str, stage: str, story_id: str, filename: str) -> str:
    return f"{_story_prefix(wallet, stage, story_id)}{filename}"


def _thumb_path(wallet: str, stage: str, story_id: str, filename: str) -> str:
    return f"{_story_prefix(wallet, stage, story_id)}{_THUMB_DIR}/{filename}"


def public_url(
    wallet: str, stage: str, story_id: str, filename: str, *, thumb: bool = False
) -> str:
    """Public, unauthenticated URL for an image (requires get-only allUsers role)."""
    bucket_name = os.getenv("GCS_BUCKET_NAME", "")
    path = (
        _thumb_path(wallet, stage, story_id, filename)
        if thumb
        else _full_path(wallet, stage, story_id, filename)
    )
    return f"https://storage.googleapis.com/{bucket_name}/{path}"


def upload_image(
    wallet: str,
    stage: str,
    story_id: str,
    filename: str,
    data: bytes,
    content_type: str,
    *,
    thumb: bool = False,
) -> None:
    """Upload one image blob (full or thumbnail) to the bucket."""
    bucket = _get_bucket()
    path = (
        _thumb_path(wallet, stage, story_id, filename)
        if thumb
        else _full_path(wallet, stage, story_id, filename)
    )
    bucket.blob(path).upload_from_string(data, content_type=content_type)


def list_images(wallet: str, stage: str, story_id: str) -> List[dict]:
    """List full images for a story stage (thumbnails excluded) with public URLs.

    Returns dicts: {filename, url, thumbUrl, size, updated}. Sorted by name.
    """
    bucket = _get_bucket()
    story_prefix = _story_prefix(wallet, stage, story_id)
    thumb_prefix = f"{story_prefix}{_THUMB_DIR}/"

    results: List[dict] = []
    for blob in bucket.list_blobs(prefix=story_prefix):
        if blob.name.startswith(thumb_prefix):
            continue
        filename = blob.name[len(story_prefix):]
        if not filename or "/" in filename:
            continue
        results.append(
            {
                "filename": filename,
                "url": public_url(wallet, stage, story_id, filename),
                "thumbUrl": public_url(wallet, stage, story_id, filename, thumb=True),
                "size": blob.size,
                "updated": blob.updated.isoformat() if blob.updated else None,
            }
        )

    results.sort(key=lambda r: r["filename"].lower())
    return results


def delete_image(wallet: str, stage: str, story_id: str, filename: str) -> bool:
    """Delete an image's full and thumbnail blobs. True if the full blob existed."""
    bucket = _get_bucket()
    existed = False

    full = bucket.blob(_full_path(wallet, stage, story_id, filename))
    if full.exists():
        full.delete()
        existed = True

    thumb = bucket.blob(_thumb_path(wallet, stage, story_id, filename))
    if thumb.exists():
        thumb.delete()

    return existed


def delete_stage(wallet: str, stage: str, story_id: str) -> int:
    """Delete every blob (images + thumbnails) for a story stage. Returns count."""
    bucket = _get_bucket()
    count = 0
    for blob in bucket.list_blobs(prefix=_story_prefix(wallet, stage, story_id)):
        blob.delete()
        count += 1
    return count


def copy_stage(wallet: str, story_id: str, src_stage: str, dst_stage: str) -> int:
    """Copy all of a story's blobs from one stage to another (replacing dst).

    Clears the destination first so stale files from a previous copy don't linger.
    Returns the number of blobs copied.
    """
    bucket = _get_bucket()
    delete_stage(wallet, dst_stage, story_id)

    src_prefix = _story_prefix(wallet, src_stage, story_id)
    dst_prefix = _story_prefix(wallet, dst_stage, story_id)

    count = 0
    for blob in bucket.list_blobs(prefix=src_prefix):
        rel = blob.name[len(src_prefix):]
        bucket.copy_blob(blob, bucket, f"{dst_prefix}{rel}")
        count += 1
    return count
