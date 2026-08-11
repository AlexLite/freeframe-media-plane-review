from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest

from apps.api.config import Settings
from apps.api.integrations.plane.claims import PlaneReviewClaims, PlaneTokenError
from apps.api.integrations.plane.session import (
    PLANE_REVIEW_SESSION_EXPIRES_SECONDS,
    PLANE_REVIEW_SESSION_TYPE,
    PLANE_USER_PREFERENCE_KEY,
    PlaneIdentityConflict,
    create_plane_review_session_token,
    decode_plane_review_session_token,
    exchange_plane_token,
    get_or_create_plane_user,
    normalize_review_scopes,
)
from apps.api.models.user import UserStatus
from apps.api.services.auth_service import create_access_token


def _settings() -> Settings:
    return Settings(
        _env_file=None,
        database_url="postgresql://u:p@localhost:5432/db",
        redis_url="redis://localhost:6379/0",
        jwt_secret="freeframe-session-secret",
        media_plane_mode=True,
        plane_base_url="https://plane.example.test",
        plane_jwt_secret="plane-review-secret",
    )


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
        "id": claims.sub,
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


def _mock_query_results(*results):
    db = MagicMock()
    query = db.query.return_value
    query.filter.return_value.first.side_effect = results
    return db


def test_existing_shadow_user_is_reused_by_plane_uuid_without_email_lookup():
    claims = _claims()
    user = _existing_user(claims)
    db = _mock_query_results(user)

    result = get_or_create_plane_user(db, claims)

    assert result is user
    assert db.query.return_value.filter.return_value.first.call_count == 1
    db.add.assert_not_called()
    db.commit.assert_not_called()


def test_existing_shadow_user_profile_is_refreshed():
    claims = _claims(name="Updated Name")
    user = _existing_user(claims, name="Old Name", email_verified=False)
    db = _mock_query_results(user)

    result = get_or_create_plane_user(db, claims)

    assert result.name == "Updated Name"
    assert result.email_verified is True
    db.commit.assert_called_once()
    db.refresh.assert_called_once_with(user)


def test_existing_shadow_user_email_can_follow_plane_identity():
    claims = _claims(email="new-address@example.test")
    user = _existing_user(claims, email="old-address@example.test")
    db = _mock_query_results(user, None)

    result = get_or_create_plane_user(db, claims)

    assert result.email == "new-address@example.test"
    db.commit.assert_called_once()
    db.refresh.assert_called_once_with(user)


def test_shadow_user_email_change_rejects_another_email_owner():
    claims = _claims(email="owned@example.test")
    user = _existing_user(claims, email="old-address@example.test")
    email_owner = _existing_user(claims, id=uuid4(), email=claims.email)
    db = _mock_query_results(user, email_owner)

    with pytest.raises(PlaneIdentityConflict, match="Email belongs"):
        get_or_create_plane_user(db, claims)

    db.commit.assert_not_called()


def test_matching_uuid_without_plane_marker_is_not_adopted():
    claims = _claims()
    standalone_user = _existing_user(claims, preferences={})
    db = _mock_query_results(standalone_user)

    with pytest.raises(PlaneIdentityConflict, match="standalone identity"):
        get_or_create_plane_user(db, claims)

    db.commit.assert_not_called()


def test_existing_email_is_not_silently_adopted_as_plane_identity():
    claims = _claims()
    email_owner = _existing_user(claims, id=uuid4())
    db = _mock_query_results(None, email_owner)

    with pytest.raises(PlaneIdentityConflict, match="Email belongs"):
        get_or_create_plane_user(db, claims)

    db.add.assert_not_called()


def test_new_shadow_user_uses_plane_uuid_and_provenance_marker():
    claims = _claims()
    db = _mock_query_results(None, None)

    user = get_or_create_plane_user(db, claims)

    assert user.id == claims.sub
    assert user.email == claims.email
    assert user.preferences[PLANE_USER_PREFERENCE_KEY] == str(claims.sub)
    assert user.is_superadmin is False
    assert user.email_verified is True
    assert user.password_hash is None
    db.add.assert_called_once_with(user)
    db.commit.assert_called_once()


def test_review_scopes_require_read_reject_unknown_and_preserve_extensions():
    with pytest.raises(PlaneTokenError, match="review:read"):
        normalize_review_scopes(["review:comment"])

    with pytest.raises(PlaneTokenError, match="unsupported"):
        normalize_review_scopes(["review:read", "admin:all"])

    assert normalize_review_scopes(
        ["review:read", "review:comment", "review:upload", "review:manage", "review:read"]
    ) == ["review:read", "review:comment", "review:upload", "review:manage"]


def test_plane_review_session_has_explicit_type_and_bound_context():
    config = _settings()
    claims = _claims()
    user = _existing_user(claims)

    token = create_plane_review_session_token(
        user, claims, ["review:read", "review:comment"], config=config
    )
    payload = decode_plane_review_session_token(token, config=config)

    assert payload["type"] == PLANE_REVIEW_SESSION_TYPE
    assert payload["sub"] == str(user.id)
    assert payload["plane_user_id"] == str(claims.sub)
    assert payload["workspace_id"] == str(claims.workspace_id)
    assert payload["project_id"] == str(claims.project_id)
    assert payload["issue_id"] == str(claims.issue_id)
    assert payload["scopes"] == ["review:read", "review:comment"]
    assert payload["exp"] - payload["iat"] == PLANE_REVIEW_SESSION_EXPIRES_SECONDS


def test_standalone_access_token_is_not_a_plane_review_session(monkeypatch):
    config = _settings()
    monkeypatch.setattr("apps.api.services.auth_service.settings", config)
    standalone_token = create_access_token(str(uuid4()))

    with pytest.raises(PlaneTokenError, match="session type"):
        decode_plane_review_session_token(standalone_token, config=config)


def test_exchange_returns_only_short_lived_scoped_session():
    config = _settings()
    claims = _claims()
    user = _existing_user(claims)
    db = MagicMock()

    with (
        patch(
            "apps.api.integrations.plane.session.decode_plane_review_token",
            return_value=claims,
        ) as decode,
        patch(
            "apps.api.integrations.plane.session.get_or_create_plane_user",
            return_value=user,
        ),
        patch(
            "apps.api.integrations.plane.session.create_plane_review_session_token",
            return_value="scoped-session",
        ),
    ):
        session = exchange_plane_token(db, "plane-token", config=config)

    decode.assert_called_once_with("plane-token", config=config)
    assert session.access_token == "scoped-session"
    assert session.expires_in == 900
    assert session.scopes == ["review:read", "review:comment"]
    assert not hasattr(session, "refresh_token")


def test_session_endpoint_response_contains_no_refresh_or_service_secret(client, mock_db):
    claims = _claims()
    user = _existing_user(claims)
    session = SimpleNamespace(
        access_token="scoped-session",
        expires_in=900,
        user=user,
        claims=claims,
        scopes=["review:read", "review:comment"],
    )

    with patch(
        "apps.api.routers.plane_integration.exchange_plane_token",
        return_value=session,
    ):
        response = client.post("/integrations/plane/session", json={"token": "plane-token"})

    assert response.status_code == 200
    body = response.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == 900
    assert body["user"]["plane_user_id"] == str(claims.sub)
    assert body["context"]["issue_id"] == str(claims.issue_id)
    assert body["scopes"] == ["review:read", "review:comment"]
    assert "refresh_token" not in body
    assert "service_secret" not in body