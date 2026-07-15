"""Plane-to-FreeFrame session exchange and shadow-user mapping."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from jose import JWTError, jwt
from sqlalchemy.orm import Session

from ...config import Settings, settings
from ...models.user import User, UserStatus
from .claims import PlaneReviewClaims, PlaneTokenError, decode_plane_review_token

PLANE_REVIEW_SESSION_TYPE = "plane_review_session"
PLANE_REVIEW_SESSION_EXPIRES_SECONDS = 900
SUPPORTED_REVIEW_SCOPES = frozenset(
    {"review:read", "review:comment", "review:upload", "review:manage"}
)


class PlaneIdentityConflict(ValueError):
    """Raised when Plane identity cannot be mapped without ambiguity."""


@dataclass(frozen=True)
class PlaneSession:
    user: User
    claims: PlaneReviewClaims
    access_token: str
    scopes: list[str]
    expires_in: int = PLANE_REVIEW_SESSION_EXPIRES_SECONDS


def _query_user_by_id(db: Session, user_id: UUID) -> User | None:
    return db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()


def _query_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email, User.deleted_at.is_(None)).first()


def get_or_create_plane_user(db: Session, claims: PlaneReviewClaims) -> User:
    """Resolve a shadow user by immutable Plane UUID, never by email alone.

    The FreeFrame shadow-user UUID intentionally equals the Plane user UUID. This
    avoids a second identity mapping table and makes the Plane UUID authoritative.
    Existing standalone users are never silently adopted by matching email.
    """

    user = _query_user_by_id(db, claims.sub)
    if user:
        if user.status == UserStatus.deactivated:
            raise PlaneIdentityConflict("FreeFrame shadow account is deactivated")
        if user.email != claims.email:
            raise PlaneIdentityConflict("Plane user UUID conflicts with another FreeFrame identity")

        changed = False
        if user.name != claims.name:
            user.name = claims.name
            changed = True
        if not user.email_verified:
            user.email_verified = True
            changed = True
        if changed:
            db.commit()
            db.refresh(user)
        return user

    email_owner = _query_user_by_email(db, claims.email)
    if email_owner:
        raise PlaneIdentityConflict("Email belongs to another FreeFrame identity")

    user = User(
        id=claims.sub,
        email=claims.email,
        name=claims.name,
        password_hash=None,
        status=UserStatus.active,
        email_verified=True,
        is_superadmin=False,
        preferences={},
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def normalize_review_scopes(scopes: list[str]) -> list[str]:
    """Validate and de-duplicate Plane-granted review scopes."""

    unknown = set(scopes) - SUPPORTED_REVIEW_SCOPES
    if unknown:
        raise PlaneTokenError("Plane review token contains unsupported scopes")
    if "review:read" not in scopes:
        raise PlaneTokenError("Plane review token is missing review:read scope")
    return list(dict.fromkeys(scopes))


def create_plane_review_session_token(
    user: User,
    claims: PlaneReviewClaims,
    scopes: list[str],
    *,
    config: Settings = settings,
) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "type": PLANE_REVIEW_SESSION_TYPE,
        "sub": str(user.id),
        "plane_user_id": str(claims.sub),
        "workspace_id": str(claims.workspace_id),
        "project_id": str(claims.project_id),
        "issue_id": str(claims.issue_id),
        "scopes": scopes,
        "iat": now,
        "exp": now + timedelta(seconds=PLANE_REVIEW_SESSION_EXPIRES_SECONDS),
    }
    return jwt.encode(payload, config.jwt_secret, algorithm=config.jwt_algorithm)


def decode_plane_review_session_token(
    token: str,
    *,
    config: Settings = settings,
) -> dict:
    """Decode only Plane review sessions; standalone tokens are rejected."""

    try:
        payload = jwt.decode(token, config.jwt_secret, algorithms=[config.jwt_algorithm])
    except JWTError as exc:
        raise PlaneTokenError("Invalid Plane review session") from exc
    if payload.get("type") != PLANE_REVIEW_SESSION_TYPE:
        raise PlaneTokenError("Invalid Plane review session type")
    return payload


def exchange_plane_token(
    db: Session,
    token: str,
    *,
    config: Settings = settings,
) -> PlaneSession:
    """Validate a Plane token, map identity, and issue one scoped session token."""

    claims = decode_plane_review_token(token, config=config)
    scopes = normalize_review_scopes(claims.scopes)
    user = get_or_create_plane_user(db, claims)
    return PlaneSession(
        user=user,
        claims=claims,
        scopes=scopes,
        access_token=create_plane_review_session_token(user, claims, scopes, config=config),
    )
