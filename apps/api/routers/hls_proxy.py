"""HLS proxy for secure video streaming.

Rewrites m3u8 manifests so that both variant playlists and media segments go
through this proxy (with token auth).

This eliminates the need for a public bucket policy on processed/*.
"""

import logging
import posixpath
from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse

from ..config import settings
from ..services.s3_service import get_s3_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/stream", tags=["streaming"])


def create_hls_token(s3_prefix: str, expires_hours: int = 24) -> str:
    """Create a short-lived JWT for HLS proxy access."""
    payload = {
        "sub": "hls",
        "pfx": s3_prefix,
        "exp": datetime.now(timezone.utc) + timedelta(hours=expires_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def _verify_hls_token(token: str) -> str:
    """Verify HLS token and return s3_prefix."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        if payload.get("sub") != "hls":
            raise HTTPException(status_code=403, detail="Invalid token type")
        return payload["pfx"]
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


def _rewrite_manifest(content: str, s3_prefix: str, manifest_path: str, token: str) -> str:
    """Rewrite URLs in an m3u8 manifest.

    - .m3u8 references -> proxy URLs with token (appended as query param)
    - .ts references -> same-origin proxy URLs with token auth
    """
    manifest_dir = posixpath.dirname(manifest_path)
    lines = content.split("\n")
    result = []

    for line in lines:
        stripped = line.strip()

        # Pass through comments/tags and empty lines
        if not stripped or stripped.startswith("#"):
            result.append(line)
            continue

        # Resolve segment/playlist path relative to current manifest directory
        if manifest_dir:
            relative_key = f"{manifest_dir}/{stripped}"
        else:
            relative_key = stripped

        if stripped.endswith(".m3u8"):
            # Variant playlist -> proxy URL with token
            result.append(f"{relative_key}?token={token}")
        elif stripped.endswith(".ts"):
            # Keep segment downloads on the same origin as the player.  Safari
            # is stricter than desktop browsers about a playlist that switches
            # to a separate object-storage origin, especially on cellular.
            result.append(f"{relative_key}?token={token}")
        else:
            result.append(line)

    return "\n".join(result)


@router.get("/hls/{path:path}")
def hls_proxy(path: str, request: Request, token: str = Query(...)):
    """Serve a token-scoped HLS manifest or MPEG-TS segment from private S3."""
    s3_prefix = _verify_hls_token(token)

    if not (path.endswith(".m3u8") or path.endswith(".ts")):
        raise HTTPException(status_code=400, detail="Only HLS manifests and segments are proxied")

    # Prevent directory traversal
    normalised = posixpath.normpath(path)
    if normalised.startswith("..") or normalised.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid path")

    # Defense-in-depth: verify resolved key stays within the token's prefix
    s3_key = f"{s3_prefix}/{normalised}"
    if not s3_key.startswith(s3_prefix + "/"):
        raise HTTPException(status_code=400, detail="Invalid path")

    s3 = get_s3_client()
    try:
        get_args = {"Bucket": settings.s3_bucket, "Key": s3_key}
        requested_range = request.headers.get("range")
        if path.endswith(".ts") and requested_range:
            get_args["Range"] = requested_range
        obj = s3.get_object(**get_args)
    except s3.exceptions.NoSuchKey:
        raise HTTPException(status_code=404, detail="HLS media not found")
    except Exception as e:
        logger.error("Failed to fetch HLS media %s: %s", s3_key, e)
        raise HTTPException(status_code=404, detail="HLS media not found")

    if path.endswith(".ts"):
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(obj["ContentLength"]),
            "Cache-Control": "private, max-age=3600",
        }
        if "ContentRange" in obj:
            headers["Content-Range"] = obj["ContentRange"]
        return StreamingResponse(
            obj["Body"].iter_chunks(chunk_size=64 * 1024),
            status_code=206 if "ContentRange" in obj else 200,
            media_type=obj.get("ContentType") or "video/mp2t",
            headers=headers,
        )

    content = obj["Body"].read().decode("utf-8")
    rewritten = _rewrite_manifest(content, s3_prefix, normalised, token)

    return Response(
        content=rewritten,
        media_type="application/vnd.apple.mpegurl",
        headers={"Cache-Control": "no-cache"},
    )
