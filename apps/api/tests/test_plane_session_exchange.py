from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from apps.api.integrations.plane.claims import PlaneReviewClaims, PlaneTokenError
from apps.api.integrations.plane.session import (
    PLANE_USER_PREFERENCE_KEY,
    PlaneIdentityConflict,
    exchange_plane_token,
    get_or_create_plane_user,
)
from apps.api.models.user import UserStatus


def _claims(**overrides) -> PlaneReviewClaims:
    values = {
        "iss": "media-plane",
        "aud": "freeframe-review",
        "exp": 2_000_000_000,
        "sub": uuid4(),
        "email": "editor@example.test",
        "name": "Editor Name",
        "workspace_id": uuid4(),
        "project_id": uuid4(),
        "issue_id": uuid4(),
        "scopes": ["review:read", "review:comment"],
    }
    values.update(overrides)
    return PlaneReviewClaims.model_validate(values)


def _existing_user(claims: PlaneReviewClaims, **overrides):
    values = {
        "id": uuid4(),
        "email": claims.email,
        "name": claims.name,
        "preferences": {PLANE_USER_PREFERENCE_KEY: str(claims.sub)},
        "status": UserStatus.active,
        "email_verified": True,
        "password_hash": None,
        "is_superadmin": False,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_existing_plane_user_is_reused_without_commit():
    claims = _claims()
    user = _existing_user(claims)
    db = MagicMock()

    with patch(
        "apps.api.integrations.plane.session.get_user_by_email",
        return_value=user,
    ):
        result = get_or_create_plane_user(db, claims)

    assert result is user
    db.add.assert_not_called()
    db.commit.assert_not_called()


def test_existing_unlinked_email_is_safely_bound_to_plane_identity():
    claims = _claims()
    user = _existing_user(
        claims,
        preferences={},
        name="Old Name",
        email_verified=False,
        status=UserStatus.pending_verification,
    )
    db = MagicMock()

    with (
        patch(
            "apps.api.integrations.plane.session.get_user_by_email",
            return_value=user,
        ),
        patch("apps.api.integrations.plane.session.flag_modified") as mark_dirty,
    ):
        result = get_or_create_plane_user(db, claims)

    assert result.preferences[PLANE_USER_PREFERENCE_KEY] == str(claims.sub)
    assert result.name == claims.name
    assert result.email_verified is True
    assert result.status == UserStatus.active
    mark_dirty.assert_called_once_with(user, "preferences")
    db.commit.assert_called_once()
    db.refresh.assert_called_once_with(user)


def test_email_bound_to_different_plane_user_is_rejected():
    claims = _claims()
    user = _existing_user(
        claims,
        preferences={PLANE_USER_PREFERENCE_KEY: str(uuid4())},
    )
    db = MagicMock()

    with patch(
        "apps.api.integrations.plane.session.get_user_by_email",
        return_value=user,
    ):
        with pytest.raises(PlaneIdentityConflict, match="another Plane user"):
            get_or_create_plane_user(db, claims)

    db.commit.assert_not_called()


def test_new_plane_shadow_user_is_not_superadmin():
    claims = _claims()
    db = MagicMock()

    with patch(
        "apps.api.integrations.plane.session.get_user_by_email",
        return_value=None,
    ):
        user = get_or_create_plane_user(db, claims)

    assert user.email == claims.email
    assert user.preferences[PLANE_USER_PREFERENCE_KEY] == str(claims.sub)
    assert user.is_superadmin is False
    assert user.email_verified is True
    assert user.password_hash is None
    db.add.assert_called_once_with(user)
    db.commit.assert_called_once()


def test_exchange_requires_review_read_scope():
    claims = _claims(scopes=["review:comment"])
    db = MagicMock()

    with patch(
        "apps.api.integrations.plane.session.decode_plane_review_token",
        return_value=claims,
    ):
        with pytest.raises(PlaneTokenError, match="review:read"):
            exchange_plane_token(db, "token")


def test_exchange_returns_freeframe_tokens_and_context():
    claims = _claims()
    user = _existing_user(claims)
    db = MagicMock()

    with (
        patch(
            "apps.api.integrations.plane.session.decode_plane_review_token",
            return_value=claims,
        ),
        patch(
            "apps.api.integrations.plane.session.get_or_create_plane_user",
            return_value=user,
        ),
        patch(
            "apps.api.integrations.plane.session.create_access_token",
            return_value="access",
        ),
        patch(
            "apps.api.integrations.plane.session.create_refresh_token",
            return_value="refresh",
        ),
    ):
        session = exchange_plane_token(db, "token")

    assert session.user is user
    assert session.claims.issue_id == claims.issue_id
    assert session.access_token == "access"
    assert session.refresh_token == "refresh"
