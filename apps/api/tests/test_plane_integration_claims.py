"""Tests for the Media Plane identity trust boundary."""

import time
from uuid import uuid4

import pytest
from jose import jwt
from pydantic import ValidationError

from apps.api.config import Settings
from apps.api.integrations.plane.claims import PlaneTokenError, decode_plane_review_token


FREEFRAME_SECRET = "freeframe-secret"
PLANE_SECRET = "plane-review-secret"


def _settings(**overrides) -> Settings:
    values = {
        "database_url": "postgresql://u:p@localhost:5432/db",
        "redis_url": "redis://localhost:6379/0",
        "jwt_secret": FREEFRAME_SECRET,
        # Keep these tests deterministic when they run inside a configured
        # production/staging container whose process environment enables Plane.
        "media_plane_mode": False,
        "plane_base_url": None,
        "plane_jwt_secret": None,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def _plane_settings(**overrides) -> Settings:
    values = {
        "media_plane_mode": True,
        "plane_base_url": "https://plane.example.test",
        "plane_jwt_secret": PLANE_SECRET,
        "plane_token_issuer": "media-plane",
        "plane_token_audience": "freeframe-review",
    }
    values.update(overrides)
    return _settings(**values)


def _claims(**overrides) -> dict:
    now = int(time.time())
    values = {
        "iss": "media-plane",
        "aud": "freeframe-review",
        "iat": now,
        "exp": now + 60,
        "sub": str(uuid4()),
        "email": "reviewer@example.test",
        "name": "Review User",
        "workspace_id": str(uuid4()),
        "project_id": str(uuid4()),
        "issue_id": str(uuid4()),
        "scopes": ["review:read", "review:comment"],
    }
    values.update(overrides)
    return values


def _token(**overrides) -> str:
    return jwt.encode(_claims(**overrides), PLANE_SECRET, algorithm="HS256")


def test_media_plane_mode_is_disabled_by_default():
    config = _settings()
    assert config.media_plane_mode is False

    with pytest.raises(PlaneTokenError, match="disabled"):
        decode_plane_review_token(_token(), config=config)


def test_media_plane_mode_requires_plane_url_and_separate_secret():
    with pytest.raises(ValidationError, match="PLANE_BASE_URL"):
        _settings(media_plane_mode=True, plane_jwt_secret=PLANE_SECRET)

    with pytest.raises(ValidationError, match="PLANE_JWT_SECRET"):
        _settings(media_plane_mode=True, plane_base_url="https://plane.example.test")

    with pytest.raises(ValidationError, match="must be different"):
        _settings(
            media_plane_mode=True,
            plane_base_url="https://plane.example.test",
            plane_jwt_secret=FREEFRAME_SECRET,
        )


def test_media_plane_mode_rejects_invalid_plane_url_and_negative_leeway():
    with pytest.raises(ValidationError, match="absolute http"):
        _plane_settings(plane_base_url="plane.internal")

    with pytest.raises(ValidationError, match="cannot be negative"):
        _plane_settings(plane_token_leeway_seconds=-1)


def test_valid_plane_review_token_returns_scoped_claims():
    config = _plane_settings()
    claims = decode_plane_review_token(_token(), config=config)

    assert claims.email == "reviewer@example.test"
    assert claims.aud == "freeframe-review"
    assert claims.scopes == ["review:read", "review:comment"]
    assert claims.workspace_id
    assert claims.project_id
    assert claims.issue_id


def test_plane_review_token_rejects_wrong_audience():
    config = _plane_settings()

    with pytest.raises(PlaneTokenError, match="Invalid"):
        decode_plane_review_token(_token(aud="another-service"), config=config)


def test_plane_review_token_rejects_missing_work_item_scope():
    config = _plane_settings()
    payload = _claims()
    payload.pop("issue_id")
    token = jwt.encode(payload, PLANE_SECRET, algorithm="HS256")

    with pytest.raises(PlaneTokenError, match="Invalid"):
        decode_plane_review_token(token, config=config)
