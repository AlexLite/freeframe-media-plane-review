from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..integrations.plane.authorization import (
    PlaneReviewPrincipal,
    require_linked_plane_asset,
    require_plane_scope,
)
from ..integrations.plane.claims import PlaneTokenError
from ..integrations.plane.session import PlaneIdentityConflict, exchange_plane_token
from ..models.asset import Asset
from ..models.plane_review import PlaneReviewAssetLink
from ..schemas.plane_integration import (
    PlaneReviewAssetLinkResponse,
    PlaneReviewContext,
    PlaneSessionExchangeRequest,
    PlaneSessionExchangeResponse,
    PlaneShadowUserResponse,
)

router = APIRouter(prefix="/integrations/plane", tags=["plane-integration"])


@router.post(
    "/session",
    response_model=PlaneSessionExchangeResponse,
    status_code=status.HTTP_200_OK,
)
def create_plane_session(
    body: PlaneSessionExchangeRequest,
    db: Session = Depends(get_db),
):
    """Exchange a short-lived Plane token for a scoped FreeFrame review session."""

    try:
        session = exchange_plane_token(db, body.token, config=settings)
    except PlaneTokenError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except PlaneIdentityConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return PlaneSessionExchangeResponse(
        access_token=session.access_token,
        expires_in=session.expires_in,
        user=PlaneShadowUserResponse(
            id=session.user.id,
            plane_user_id=session.claims.sub,
            email=session.user.email,
            name=session.user.name,
        ),
        context=PlaneReviewContext(
            workspace_id=session.claims.workspace_id,
            project_id=session.claims.project_id,
            issue_id=session.claims.issue_id,
        ),
        scopes=session.scopes,
    )


@router.post(
    "/assets/{asset_id}/link",
    response_model=PlaneReviewAssetLinkResponse,
    status_code=status.HTTP_200_OK,
)
def link_plane_review_asset(
    asset_id: UUID,
    db: Session = Depends(get_db),
    principal: PlaneReviewPrincipal = Depends(require_plane_scope("review:manage")),
):
    """Bind one FreeFrame asset to the session's immutable Plane issue context."""

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
    if link:
        if (
            link.workspace_id != principal.workspace_id
            or link.project_id != principal.project_id
            or link.issue_id != principal.issue_id
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Asset is already linked to another Plane review context",
            )
        return link

    link = PlaneReviewAssetLink(
        asset_id=asset.id,
        workspace_id=principal.workspace_id,
        project_id=principal.project_id,
        issue_id=principal.issue_id,
        linked_by=principal.user.id,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return link


@router.get(
    "/assets/{asset_id}/link",
    response_model=PlaneReviewAssetLinkResponse,
)
def get_plane_review_asset_link(
    asset_id: UUID,
    db: Session = Depends(get_db),
    _asset: Asset = Depends(require_linked_plane_asset("review:read")),
):
    """Return linkage only when the session matches the asset's Plane context."""

    link = (
        db.query(PlaneReviewAssetLink)
        .filter(PlaneReviewAssetLink.asset_id == asset_id)
        .first()
    )
    if not link:
        raise HTTPException(status_code=404, detail="Plane review asset link not found")
    return link
