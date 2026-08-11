from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..integrations.plane.authorization import (
    PlaneReviewPrincipal,
    require_linked_plane_asset,
    require_plane_scope,
)
from ..models.asset import Asset, AssetVersion, MediaFile, ProcessingStatus
from ..routers.upload import _trigger_processing
from ..schemas.upload import (
    AbortUploadRequest,
    CompleteUploadRequest,
    CompleteUploadResponse,
    PresignPartRequest,
    PresignPartResponse,
)
from ..services.s3_service import (
    abort_multipart_upload,
    complete_multipart_upload,
    presign_upload_part,
)

router = APIRouter(prefix="/integrations/plane", tags=["plane-integration"])


def _get_owned_upload(
    db: Session,
    *,
    asset: Asset,
    version_id: UUID,
    s3_key: str,
    principal: PlaneReviewPrincipal,
) -> tuple[AssetVersion, MediaFile]:
    version = (
        db.query(AssetVersion)
        .filter(
            AssetVersion.id == version_id,
            AssetVersion.asset_id == asset.id,
            AssetVersion.deleted_at.is_(None),
        )
        .first()
    )
    if not version:
        raise HTTPException(status_code=404, detail="Upload version not found")
    if version.created_by != principal.user.id:
        raise HTTPException(status_code=403, detail="Not authorized for this upload")

    media_file = (
        db.query(MediaFile)
        .filter(
            MediaFile.version_id == version.id,
            MediaFile.s3_key_raw == s3_key,
        )
        .first()
    )
    if not media_file:
        raise HTTPException(status_code=404, detail="Upload media file not found")

    return version, media_file


def _validated_parts(body: CompleteUploadRequest) -> list[dict]:
    if not body.parts:
        raise HTTPException(status_code=400, detail="At least one upload part is required")

    part_numbers = [part.PartNumber for part in body.parts]
    if any(number < 1 or number > 10000 for number in part_numbers):
        raise HTTPException(status_code=400, detail="Part number must be between 1 and 10000")
    if len(set(part_numbers)) != len(part_numbers):
        raise HTTPException(status_code=400, detail="Upload parts must have unique part numbers")
    if part_numbers != sorted(part_numbers):
        raise HTTPException(status_code=400, detail="Upload parts must be ordered by part number")
    if any(not part.ETag.strip() for part in body.parts):
        raise HTTPException(status_code=400, detail="Every upload part must include an ETag")

    return [part.model_dump() for part in body.parts]


@router.post(
    "/assets/{asset_id}/versions/{version_id}/upload/presign-part",
    response_model=PresignPartResponse,
)
def presign_plane_review_upload_part(
    version_id: UUID,
    body: PresignPartRequest,
    db: Session = Depends(get_db),
    asset: Asset = Depends(require_linked_plane_asset("review:upload")),
    principal: PlaneReviewPrincipal = Depends(require_plane_scope("review:upload")),
):
    """Sign one multipart part only for the linked asset and initiating shadow user."""

    if body.part_number < 1 or body.part_number > 10000:
        raise HTTPException(status_code=400, detail="Part number must be between 1 and 10000")

    version, _media_file = _get_owned_upload(
        db,
        asset=asset,
        version_id=version_id,
        s3_key=body.s3_key,
        principal=principal,
    )
    if version.processing_status != ProcessingStatus.uploading:
        raise HTTPException(status_code=409, detail="Upload is no longer accepting parts")

    url = presign_upload_part(body.s3_key, body.upload_id, body.part_number)
    return PresignPartResponse(presigned_url=url, part_number=body.part_number)


@router.post(
    "/assets/{asset_id}/versions/{version_id}/upload/complete",
    response_model=CompleteUploadResponse,
)
def complete_plane_review_upload(
    version_id: UUID,
    body: CompleteUploadRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    asset: Asset = Depends(require_linked_plane_asset("review:upload")),
    principal: PlaneReviewPrincipal = Depends(require_plane_scope("review:upload")),
):
    """Complete a linked multipart upload and dispatch normal FreeFrame processing."""

    if body.asset_id != asset.id or body.version_id != version_id:
        raise HTTPException(status_code=400, detail="Upload context does not match the route")

    version, _media_file = _get_owned_upload(
        db,
        asset=asset,
        version_id=version_id,
        s3_key=body.s3_key,
        principal=principal,
    )

    if version.processing_status in (ProcessingStatus.processing, ProcessingStatus.ready):
        return CompleteUploadResponse(
            status=version.processing_status.value,
            asset_id=asset.id,
            version_id=version.id,
        )
    if version.processing_status == ProcessingStatus.failed:
        raise HTTPException(status_code=409, detail="Upload has already been aborted or failed")

    parts = _validated_parts(body)
    complete_multipart_upload(body.s3_key, body.upload_id, parts)
    version.processing_status = ProcessingStatus.processing
    db.commit()
    background_tasks.add_task(_trigger_processing, asset.id, version.id)

    return CompleteUploadResponse(
        status="processing",
        asset_id=asset.id,
        version_id=version.id,
    )


@router.post(
    "/assets/{asset_id}/versions/{version_id}/upload/abort",
    status_code=status.HTTP_204_NO_CONTENT,
)
def abort_plane_review_upload(
    version_id: UUID,
    body: AbortUploadRequest,
    db: Session = Depends(get_db),
    asset: Asset = Depends(require_linked_plane_asset("review:upload")),
    principal: PlaneReviewPrincipal = Depends(require_plane_scope("review:upload")),
):
    """Abort an uploading version without permitting cross-asset or cross-user access."""

    if body.version_id != version_id:
        raise HTTPException(status_code=400, detail="Upload context does not match the route")

    version, _media_file = _get_owned_upload(
        db,
        asset=asset,
        version_id=version_id,
        s3_key=body.s3_key,
        principal=principal,
    )

    if version.processing_status == ProcessingStatus.failed:
        return None
    if version.processing_status != ProcessingStatus.uploading:
        raise HTTPException(status_code=409, detail="Only an active upload can be aborted")

    abort_multipart_upload(body.s3_key, body.upload_id)
    version.processing_status = ProcessingStatus.failed
    db.commit()
    return None
