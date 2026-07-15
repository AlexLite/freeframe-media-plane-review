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
from ..models.activity import ActivityAction, ActivityLog, Notification, NotificationType
from ..models.asset import Asset
from ..models.comment import Annotation, Comment
from ..models.plane_review import PlaneReviewAssetLink
from ..routers.assets import _build_asset_response
from ..routers.comments import _build_comment_response, _create_mentions
from ..schemas.asset import AssetResponse
from ..schemas.comment import CommentCreate, CommentResponse
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


@router.get("/assets/{asset_id}", response_model=AssetResponse)
def get_plane_review_asset(
    db: Session = Depends(get_db),
    asset: Asset = Depends(require_linked_plane_asset("review:read")),
):
    """Read a linked asset through a context-bound Plane review session."""

    return _build_asset_response(asset, db)


@router.get(
    "/assets/{asset_id}/comments",
    response_model=list[CommentResponse],
)
def list_plane_review_comments(
    version_id: UUID | None = None,
    db: Session = Depends(get_db),
    asset: Asset = Depends(require_linked_plane_asset("review:read")),
    principal: PlaneReviewPrincipal = Depends(require_plane_scope("review:read")),
):
    """List public review comments for one linked asset."""

    query = db.query(Comment).filter(
        Comment.asset_id == asset.id,
        Comment.parent_id.is_(None),
        Comment.deleted_at.is_(None),
        Comment.visibility == "public",
    )
    if version_id:
        query = query.filter(Comment.version_id == version_id)

    comments = query.order_by(Comment.created_at).all()
    return [
        _build_comment_response(comment, db, current_user_id=principal.user.id)
        for comment in comments
    ]


@router.post(
    "/assets/{asset_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_plane_review_comment(
    body: CommentCreate,
    db: Session = Depends(get_db),
    asset: Asset = Depends(require_linked_plane_asset("review:comment")),
    principal: PlaneReviewPrincipal = Depends(require_plane_scope("review:comment")),
):
    """Create a public timecoded comment through a linked Plane review session."""

    if body.visibility not in (None, "public"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Plane review sessions cannot create internal comments",
        )

    comment = Comment(
        asset_id=asset.id,
        version_id=body.version_id,
        parent_id=body.parent_id,
        author_id=principal.user.id,
        timecode_start=body.timecode_start,
        timecode_end=body.timecode_end,
        body=body.body,
        visibility="public",
    )
    db.add(comment)
    db.flush()

    if body.annotation:
        db.add(
            Annotation(
                comment_id=comment.id,
                drawing_data=body.annotation.drawing_data,
                frame_number=body.annotation.frame_number,
                carousel_position=body.annotation.carousel_position,
            )
        )

    _create_mentions(
        db,
        comment,
        asset,
        body.body,
        principal.user.name,
        body.mention_user_ids,
    )

    if asset.created_by and asset.created_by != principal.user.id:
        db.add(
            Notification(
                user_id=asset.created_by,
                type=NotificationType.comment,
                asset_id=asset.id,
                comment_id=comment.id,
            )
        )

    db.add(
        ActivityLog(
            user_id=principal.user.id,
            asset_id=asset.id,
            action=ActivityAction.commented,
        )
    )
    db.commit()
    db.refresh(comment)
    return _build_comment_response(comment, db, current_user_id=principal.user.id)
