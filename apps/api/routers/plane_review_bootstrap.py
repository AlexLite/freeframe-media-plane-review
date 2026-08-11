from fractions import Fraction
from math import isfinite

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..integrations.plane.authorization import (
    PlaneReviewPrincipal,
    require_linked_plane_asset,
    require_plane_scope,
)
from ..models.asset import Asset, AssetVersion, MediaFile
from ..routers.assets import _build_asset_response
from ..schemas.plane_review_bootstrap import (
    PlaneReviewBootstrapContext,
    PlaneReviewBootstrapResponse,
    PlaneReviewPermissions,
    PlaneReviewVersionSummary,
)

router = APIRouter(prefix="/integrations/plane", tags=["plane-integration"])


def _finite_non_negative(value):
    return (
        float(value)
        if isinstance(value, (int, float))
        and not isinstance(value, bool)
        and isfinite(float(value))
        and float(value) >= 0
        else None
    )


def _version_timing(media_file: MediaFile | None):
    if not media_file:
        return None, None, None

    duration_seconds = _finite_non_negative(
        getattr(media_file, "duration_seconds", None)
    )
    fps = _finite_non_negative(getattr(media_file, "fps", None))
    if not fps or fps <= 0:
        return duration_seconds, None, None

    rational = Fraction(str(fps)).limit_denominator(1_000_000)
    return duration_seconds, rational.numerator, rational.denominator


@router.get(
    "/assets/{asset_id}/review",
    response_model=PlaneReviewBootstrapResponse,
)
def get_plane_review_bootstrap(
    db: Session = Depends(get_db),
    asset: Asset = Depends(require_linked_plane_asset("review:read")),
    principal: PlaneReviewPrincipal = Depends(require_plane_scope("review:read")),
):
    """Return one context-bound payload for initializing the Plane review panel."""

    versions = (
        db.query(AssetVersion)
        .filter(
            AssetVersion.asset_id == asset.id,
            AssetVersion.deleted_at.is_(None),
        )
        .order_by(AssetVersion.version_number.desc())
        .all()
    )

    version_summaries: list[PlaneReviewVersionSummary] = []
    for version in versions:
        media_file = db.query(MediaFile).filter(MediaFile.version_id == version.id).first()
        duration_seconds, fps_numerator, fps_denominator = _version_timing(media_file)
        version_summaries.append(
            PlaneReviewVersionSummary(
                id=version.id,
                version_number=version.version_number,
                processing_status=version.processing_status.value,
                created_by=version.created_by,
                created_at=version.created_at.isoformat() if version.created_at else None,
                original_filename=media_file.original_filename if media_file else None,
                mime_type=media_file.mime_type if media_file else None,
                file_size_bytes=media_file.file_size_bytes if media_file else None,
                duration_seconds=duration_seconds,
                fps_numerator=fps_numerator,
                fps_denominator=fps_denominator,
            )
        )

    scopes = principal.scopes
    return PlaneReviewBootstrapResponse(
        context=PlaneReviewBootstrapContext(
            workspace_id=principal.workspace_id,
            project_id=principal.project_id,
            issue_id=principal.issue_id,
        ),
        asset=_build_asset_response(asset, db),
        versions=version_summaries,
        permissions=PlaneReviewPermissions(
            read="review:read" in scopes,
            comment="review:comment" in scopes,
            upload="review:upload" in scopes,
            manage="review:manage" in scopes,
        ),
    )
