"""Validation for short-lived Plane-issued review tokens.

This module deliberately does not create FreeFrame sessions or users. It only
establishes the strict trust boundary used by later integration endpoints.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from jose import JWTError, jwt
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from ...config import Settings, settings


class PlaneReviewClaims(BaseModel):
    """Required claims carried by a Plane review-session token."""

    model_config = ConfigDict(extra="forbid")

    iss: str
    aud: str | list[str]
    exp: int
    iat: int | None = None
    nbf: int | None = None
    jti: str | None = None
    sub: UUID
    email: str
    name: str
    workspace_id: UUID
    project_id: UUID
    issue_id: UUID
    scopes: list[str] = Field(default_factory=list)


class PlaneTokenError(ValueError):
    """Raised when a Plane review token is disabled, invalid, or incomplete."""


def decode_plane_review_token(
    token: str,
    *,
    config: Settings = settings,
) -> PlaneReviewClaims:
    """Verify a Plane token and return its strictly validated review claims.

    The signature, issuer, audience, expiry and required work-item claims are
    validated before any downstream code may create a shadow user or access a
    review asset.
    """

    if not config.media_plane_mode:
        raise PlaneTokenError("Media Plane integration is disabled")

    if not config.plane_jwt_secret:
        raise PlaneTokenError("PLANE_JWT_SECRET is not configured")

    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            config.plane_jwt_secret,
            algorithms=[config.plane_jwt_algorithm],
            audience=config.plane_token_audience,
            issuer=config.plane_token_issuer,
            options={"leeway": config.plane_token_leeway_seconds},
        )
        return PlaneReviewClaims.model_validate(payload)
    except (JWTError, ValidationError, TypeError, ValueError) as exc:
        raise PlaneTokenError("Invalid Plane review token") from exc
