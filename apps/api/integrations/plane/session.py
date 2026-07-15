"""Plane-to-FreeFrame session exchange and shadow-user mapping."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from ...models.user import User, UserStatus
from ...services.auth_service import create_access_token, create_refresh_token, get_user_by_email
from .claims import PlaneReviewClaims, PlaneTokenError, decode_plane_review_token

PLANE_USER_PREFERENCE_KEY = "integration_plane_user_id"


class PlaneIdentityConflict(ValueError):
    """Raised when an email is already bound to another Plane identity."""


@dataclass(frozen=True)
class PlaneSession:
    user: User
    claims: PlaneReviewClaims
    access_token: str
    refresh_token: str


def _stored_plane_user_id(user: User) -> str | None:
    preferences = user.preferences or {}
    value = preferences.get(PLANE_USER_PREFERENCE_KEY)
    return str(value) if value else None


def get_or_create_plane_user(db: Session, claims: PlaneReviewClaims) -> User:
    """Resolve a shadow FreeFrame user after the Plane token has been verified.

    Email is used only to locate a candidate account. Once linked, the immutable
    Plane UUID is authoritative and prevents account takeover through email reuse.
    """

    plane_user_id = str(claims.sub)
    user = get_user_by_email(db, claims.email)

    if user:
        stored_plane_user_id = _stored_plane_user_id(user)
        if stored_plane_user_id and stored_plane_user_id != plane_user_id:
            raise PlaneIdentityConflict("Email is linked to another Plane user")
        if user.status == UserStatus.deactivated:
            raise PlaneIdentityConflict("FreeFrame shadow account is deactivated")

        changed = False
        preferences = dict(user.preferences or {})
        if not stored_plane_user_id:
            preferences[PLANE_USER_PREFERENCE_KEY] = plane_user_id
            user.preferences = preferences
            flag_modified(user, "preferences")
            changed = True
        if user.name != claims.name:
            user.name = claims.name
            changed = True
        if not user.email_verified:
            user.email_verified = True
            changed = True
        if user.status != UserStatus.active:
            user.status = UserStatus.active
            changed = True
        if changed:
            db.commit()
            db.refresh(user)
        return user

    user = User(
        email=claims.email,
        name=claims.name,
        password_hash=None,
        status=UserStatus.active,
        email_verified=True,
        is_superadmin=False,
        preferences={PLANE_USER_PREFERENCE_KEY: plane_user_id},
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def exchange_plane_token(db: Session, token: str) -> PlaneSession:
    """Validate a Plane token, map its identity, and issue FreeFrame session tokens."""

    claims = decode_plane_review_token(token)
    if "review:read" not in claims.scopes:
        raise PlaneTokenError("Plane review token is missing review:read scope")

    user = get_or_create_plane_user(db, claims)
    return PlaneSession(
        user=user,
        claims=claims,
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )
