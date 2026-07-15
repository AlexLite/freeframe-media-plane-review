from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID

from fastapi import Depends, HTTPException, Path, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from ...config import settings
from ...database import get_db
from ...middleware.auth import bearer_scheme
from ...models.asset import Asset
from ...models.plane_review import PlaneReviewAssetLink
from ...models.user import User, UserStatus
from ...services.auth_service import get_user_by_id
from .claims import PlaneTokenError
from .session import decode_plane_review_session_token


@dataclass(frozen=True)
class PlaneReviewPrincipal:
    user: User
    workspace_id: UUID
    project_id: UUID
    issue_id: UUID
    scopes: frozenset[str]


def get_plane_review_principal(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> PlaneReviewPrincipal:
    try:
        payload = decode_plane_review_session_token(
            credentials.credentials, config=settings
        )
        user_id = UUID(payload["sub"])
        workspace_id = UUID(payload["workspace_id"])
        project_id = UUID(payload["project_id"])
        issue_id = UUID(payload["issue_id"])
        scopes = frozenset(payload.get("scopes", []))
    except (KeyError, TypeError, ValueError, PlaneTokenError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Plane review session",
        ) from exc

    user = get_user_by_id(db, user_id)
    if not user or user.status == UserStatus.deactivated:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Plane review user not found or deactivated",
        )

    return PlaneReviewPrincipal(
        user=user,
        workspace_id=workspace_id,
        project_id=project_id,
        issue_id=issue_id,
        scopes=scopes,
    )


def require_plane_scope(scope: str):
    def dependency(
        principal: PlaneReviewPrincipal = Depends(get_plane_review_principal),
    ) -> PlaneReviewPrincipal:
        if scope not in principal.scopes:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Plane review session is missing {scope} scope",
            )
        return principal

    return dependency


def require_linked_plane_asset(scope: str):
    def dependency(
        asset_id: UUID = Path(...),
        db: Session = Depends(get_db),
        principal: PlaneReviewPrincipal = Depends(require_plane_scope(scope)),
    ) -> Asset:
        asset = (
            db.query(Asset)
            .filter(Asset.id == asset_id, Asset.deleted_at.is_(None))
            .first()
        )
        if not asset:
            raise HTTPException(status_code=404, detail="Asset not found")

        link = (
            db.query(PlaneReviewAssetLink)
            .filter(PlaneReviewAssetLink.asset_id == asset_id)
            .first()
        )
        if not link:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Asset is not linked to a Plane review context",
            )

        if (
            link.workspace_id != principal.workspace_id
            or link.project_id != principal.project_id
            or link.issue_id != principal.issue_id
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Plane review session does not match the asset context",
            )

        return asset

    return dependency
