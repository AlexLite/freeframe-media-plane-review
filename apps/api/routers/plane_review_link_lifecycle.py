from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..integrations.plane.authorization import PlaneReviewPrincipal, require_plane_scope
from ..models.plane_review import PlaneReviewAssetLink

router = APIRouter(prefix="/integrations/plane", tags=["plane-integration"])


@router.delete(
    "/assets/{asset_id}/link",
    status_code=status.HTTP_204_NO_CONTENT,
)
def unlink_plane_review_asset(
    asset_id: UUID,
    db: Session = Depends(get_db),
    principal: PlaneReviewPrincipal = Depends(require_plane_scope("review:manage")),
):
    """Remove a Plane review binding only from its exact immutable issue context."""

    link = (
        db.query(PlaneReviewAssetLink)
        .filter(PlaneReviewAssetLink.asset_id == asset_id)
        .first()
    )
    if not link:
        return None

    if (
        link.workspace_id != principal.workspace_id
        or link.project_id != principal.project_id
        or link.issue_id != principal.issue_id
    ):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Plane review session does not match the asset context",
        )

    db.delete(link)
    db.commit()
    return None
