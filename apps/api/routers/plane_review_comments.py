from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..integrations.plane.authorization import (
    PlaneReviewPrincipal,
    require_linked_plane_asset,
    require_plane_scope,
)
from ..models.asset import Asset, AssetVersion
from ..models.comment import Comment
from ..routers.comments import _build_comment_response
from ..schemas.comment import CommentResponse
from ..schemas.plane_review_comment import PlaneReviewCommentCreate

router = APIRouter(prefix="/integrations/plane", tags=["plane-integration"])


def _private_no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store, private"


def _require_version(db: Session, asset_id: UUID, version_id: UUID) -> AssetVersion:
    version = (
        db.query(AssetVersion)
        .filter(
            AssetVersion.id == version_id,
            AssetVersion.asset_id == asset_id,
            AssetVersion.deleted_at.is_(None),
        )
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Asset version not found")
    return version


def _get_public_comment(db: Session, asset_id: UUID, comment_id: UUID) -> Comment:
    comment = (
        db.query(Comment)
        .filter(
            Comment.id == comment_id,
            Comment.asset_id == asset_id,
            Comment.visibility == "public",
            Comment.deleted_at.is_(None),
        )
        .first()
    )
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    return comment


@router.get(
    "/assets/{asset_id}/versions/{version_id}/comments",
    response_model=list[CommentResponse],
)
def list_plane_review_comments(
    version_id: UUID,
    response: Response,
    db: Session = Depends(get_db),
    asset: Asset = Depends(require_linked_plane_asset("review:read")),
    principal: PlaneReviewPrincipal = Depends(require_plane_scope("review:read")),
):
    _require_version(db, asset.id, version_id)
    comments = (
        db.query(Comment)
        .filter(
            Comment.asset_id == asset.id,
            Comment.version_id == version_id,
            Comment.parent_id.is_(None),
            Comment.visibility == "public",
            Comment.deleted_at.is_(None),
        )
        .order_by(Comment.created_at)
        .all()
    )
    _private_no_store(response)
    return [
        _build_comment_response(comment, db, current_user_id=principal.user.id)
        for comment in comments
    ]


@router.post(
    "/assets/{asset_id}/versions/{version_id}/comments",
    response_model=CommentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_plane_review_comment(
    version_id: UUID,
    body: PlaneReviewCommentCreate,
    response: Response,
    db: Session = Depends(get_db),
    asset: Asset = Depends(require_linked_plane_asset("review:comment")),
    principal: PlaneReviewPrincipal = Depends(require_plane_scope("review:comment")),
):
    _require_version(db, asset.id, version_id)
    comment = Comment(
        asset_id=asset.id,
        version_id=version_id,
        author_id=principal.user.id,
        timecode_start=body.timecode_start,
        timecode_end=body.timecode_end,
        body=body.body,
        visibility="public",
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    _private_no_store(response)
    return _build_comment_response(comment, db, current_user_id=principal.user.id)


@router.post(
    "/assets/{asset_id}/comments/{comment_id}/resolve",
    response_model=CommentResponse,
)
def resolve_plane_review_comment(
    comment_id: UUID,
    response: Response,
    db: Session = Depends(get_db),
    asset: Asset = Depends(require_linked_plane_asset("review:comment")),
    principal: PlaneReviewPrincipal = Depends(require_plane_scope("review:comment")),
):
    comment = _get_public_comment(db, asset.id, comment_id)
    comment.resolved = not comment.resolved
    comment.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(comment)
    _private_no_store(response)
    return _build_comment_response(comment, db, current_user_id=principal.user.id)


@router.delete(
    "/assets/{asset_id}/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_plane_review_comment(
    comment_id: UUID,
    response: Response,
    db: Session = Depends(get_db),
    asset: Asset = Depends(require_linked_plane_asset("review:comment")),
    principal: PlaneReviewPrincipal = Depends(require_plane_scope("review:comment")),
):
    comment = _get_public_comment(db, asset.id, comment_id)
    if comment.author_id != principal.user.id and "review:manage" not in principal.scopes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Can only delete your own Plane review comments",
        )
    comment.deleted_at = datetime.now(timezone.utc)
    db.commit()
    _private_no_store(response)
