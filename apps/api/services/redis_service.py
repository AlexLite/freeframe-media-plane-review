import redis
import secrets
import hashlib
import json
import time
from typing import Optional
from ..config import settings

# Redis client
_redis_client: Optional[redis.Redis] = None


def get_redis() -> redis.Redis:
    """Get Redis client singleton."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(settings.redis_url, decode_responses=True)
    return _redis_client


# Magic code keys
MAGIC_CODE_PREFIX = "magic_code:"
MAGIC_CODE_ATTEMPTS_PREFIX = "magic_code_attempts:"
MAGIC_CODE_EXPIRY_SECONDS = 600  # 10 minutes
MAX_MAGIC_CODE_ATTEMPTS = 5


def generate_magic_code() -> str:
    """Generate a 6-digit magic code."""
    return str(secrets.randbelow(900000) + 100000)


def store_magic_code(email: str, code: str) -> None:
    """Store magic code in Redis with expiry."""
    r = get_redis()
    key = f"{MAGIC_CODE_PREFIX}{email.lower()}"
    r.setex(key, MAGIC_CODE_EXPIRY_SECONDS, code)
    # Reset attempts counter
    attempts_key = f"{MAGIC_CODE_ATTEMPTS_PREFIX}{email.lower()}"
    r.delete(attempts_key)


def verify_magic_code(email: str, code: str) -> tuple[bool, str]:
    """
    Verify magic code from Redis.
    Returns (success, error_message).
    """
    r = get_redis()
    key = f"{MAGIC_CODE_PREFIX}{email.lower()}"
    attempts_key = f"{MAGIC_CODE_ATTEMPTS_PREFIX}{email.lower()}"
    
    # Check attempts
    attempts = r.get(attempts_key)
    if attempts and int(attempts) >= MAX_MAGIC_CODE_ATTEMPTS:
        return False, "Too many attempts. Request a new code."
    
    # Get stored code
    stored_code = r.get(key)
    if not stored_code:
        return False, "Code expired or not found"
    
    if stored_code != code:
        # Increment attempts
        r.incr(attempts_key)
        r.expire(attempts_key, MAGIC_CODE_EXPIRY_SECONDS)
        return False, "Invalid code"
    
    # Success - delete the code
    r.delete(key)
    r.delete(attempts_key)
    return True, ""


def delete_magic_code(email: str) -> None:
    """Delete magic code from Redis."""
    r = get_redis()
    key = f"{MAGIC_CODE_PREFIX}{email.lower()}"
    attempts_key = f"{MAGIC_CODE_ATTEMPTS_PREFIX}{email.lower()}"
    r.delete(key)
    r.delete(attempts_key)


# Invite token keys (also in Redis for faster lookup)
INVITE_TOKEN_PREFIX = "invite_token:"
INVITE_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60  # 7 days


def store_invite_token(token: str, user_id: str) -> None:
    """Store invite token -> user_id mapping in Redis."""
    r = get_redis()
    key = f"{INVITE_TOKEN_PREFIX}{token}"
    r.setex(key, INVITE_TOKEN_EXPIRY_SECONDS, user_id)


def get_user_id_from_invite_token(token: str) -> Optional[str]:
    """Get user_id from invite token."""
    r = get_redis()
    key = f"{INVITE_TOKEN_PREFIX}{token}"
    return r.get(key)


def delete_invite_token(token: str) -> None:
    """Delete invite token from Redis."""
    r = get_redis()
    key = f"{INVITE_TOKEN_PREFIX}{token}"
    r.delete(key)


# ── IP-based rate limiting ────────────────────────────────────────────────────

RATE_LIMIT_PREFIX = "rl:"


def check_rate_limit(
    ip: str,
    action: str,
    max_requests: int,
    window_seconds: int,
) -> tuple[bool, int]:
    """
    Check if an IP has exceeded the rate limit for a given action.
    Returns (allowed, remaining_seconds_until_reset).
    Uses a simple counter with TTL in Redis. Fails open if Redis is unavailable.
    """
    try:
        r = get_redis()
        key = f"{RATE_LIMIT_PREFIX}{action}:{ip}"
        current = r.get(key)

        if current is not None and int(current) >= max_requests:
            ttl = r.ttl(key)
            return False, max(ttl, 1)

        pipe = r.pipeline()
        pipe.incr(key)
        pipe.expire(key, window_seconds, nx=True)
        pipe.execute()
        return True, 0
    except Exception:
        # Fail open — allow the request if Redis is unavailable
        return True, 0


# ── Share link password sessions ──────────────────────────────────────────────

SHARE_SESSION_PREFIX = "share_session:"
SHARE_SESSION_EXPIRY_SECONDS = 3600  # 1 hour


def create_share_session(token: str, session_id: str) -> None:
    """Store a session after successful password verification."""
    r = get_redis()
    key = f"{SHARE_SESSION_PREFIX}{token}:{session_id}"
    r.setex(key, SHARE_SESSION_EXPIRY_SECONDS, "1")


def verify_share_session(token: str, session_id: str) -> bool:
    """Check if a valid password session exists for this share link."""
    r = get_redis()
    key = f"{SHARE_SESSION_PREFIX}{token}:{session_id}"
    return r.exists(key) > 0


# -- Direct FreeFrame device authorization ------------------------------------
# Device requests are deliberately Redis-only: they are short lived and must
# not become a durable identity/session store. The opaque device_code is never
# persisted; only its SHA-256 digest is used in keys and values.
DEVICE_FLOW_PREFIX = "device_flow:"
DEVICE_USER_CODE_PREFIX = "device_user_code:"
DEVICE_FLOW_EXPIRY_SECONDS = 600
DEVICE_POLL_INTERVAL_SECONDS = 5
DEVICE_CLIENT_ID = "premiere-uxp"
_USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _device_code_hash(device_code: str) -> str:
    return hashlib.sha256(device_code.encode("utf-8")).hexdigest()


def _device_flow_key(device_code_hash: str) -> str:
    return f"{DEVICE_FLOW_PREFIX}{device_code_hash}"


def _normalize_user_code(user_code: str) -> str:
    return user_code.strip().upper().replace("-", "")


def _format_user_code(raw: str) -> str:
    return f"{raw[:4]}-{raw[4:]}"


def create_device_authorization(client_id: str) -> tuple[str, str]:
    """Create a direct-mode device request and return its transient secrets."""
    if client_id != DEVICE_CLIENT_ID:
        raise ValueError("Unsupported client_id")

    r = get_redis()
    for _ in range(10):
        device_code = secrets.token_urlsafe(48)
        device_code_hash = _device_code_hash(device_code)
        user_code_raw = "".join(secrets.choice(_USER_CODE_ALPHABET) for _ in range(8))
        user_code = _format_user_code(user_code_raw)
        user_code_key = f"{DEVICE_USER_CODE_PREFIX}{user_code_raw}"

        # Reserve the human code first so a concurrent request cannot claim it.
        if not r.set(user_code_key, device_code_hash, nx=True, ex=DEVICE_FLOW_EXPIRY_SECONDS):
            continue
        record = {
            "client_id": client_id,
            "user_code": user_code_raw,
            "approved_user_id": None,
            "used": False,
            "next_poll_at": 0,
        }
        r.setex(_device_flow_key(device_code_hash), DEVICE_FLOW_EXPIRY_SECONDS, json.dumps(record))
        return device_code, user_code

    raise RuntimeError("Unable to allocate device authorization")


def approve_device_authorization(user_code: str, user_id: str) -> bool:
    """Bind a non-expired device request to the authenticated active user."""
    normalized = _normalize_user_code(user_code)
    if len(normalized) != 8:
        return False
    r = get_redis()
    device_code_hash = r.get(f"{DEVICE_USER_CODE_PREFIX}{normalized}")
    if not device_code_hash:
        return False
    key = _device_flow_key(device_code_hash)
    raw = r.get(key)
    if not raw:
        return False
    try:
        record = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return False
    if record.get("used") or record.get("approved_user_id"):
        return False
    record["approved_user_id"] = str(user_id)
    ttl = r.ttl(key)
    if ttl <= 0:
        return False
    r.setex(key, ttl, json.dumps(record))
    return True


def poll_device_authorization(client_id: str, device_code: str) -> tuple[str, str | None]:
    """Return pending/slow_down/invalid/approved and consume approved requests atomically."""
    if client_id != DEVICE_CLIENT_ID:
        return "invalid", None
    device_code_hash = _device_code_hash(device_code)
    key = _device_flow_key(device_code_hash)
    r = get_redis()
    raw = r.get(key)
    if not raw:
        return "invalid", None
    try:
        record = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return "invalid", None
    now = int(time.time())
    if record.get("client_id") != client_id or record.get("used"):
        return "invalid", None
    if now < int(record.get("next_poll_at", 0)):
        return "slow_down", None
    if not record.get("approved_user_id"):
        record["next_poll_at"] = now + DEVICE_POLL_INTERVAL_SECONDS
        ttl = r.ttl(key)
        if ttl <= 0:
            return "invalid", None
        r.setex(key, ttl, json.dumps(record))
        return "pending", None

    # Only one poller may turn an approved request into a consumed request.
    consume_script = """
local raw = redis.call('GET', KEYS[1])
if not raw then return false end
local record = cjson.decode(raw)
if record['used'] or not record['approved_user_id'] then return false end
record['used'] = true
local ttl = redis.call('TTL', KEYS[1])
if ttl <= 0 then return false end
redis.call('SETEX', KEYS[1], ttl, cjson.encode(record))
return record['approved_user_id']
"""
    user_id = r.eval(consume_script, 1, key)
    return ("approved", str(user_id)) if user_id else ("invalid", None)
