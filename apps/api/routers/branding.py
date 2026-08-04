import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..middleware.auth import get_current_user
from ..models.user import User
from ..models.asset import Asset, AssetType
from ..models.project import ProjectRole
from ..models.branding import ProjectBranding, WatermarkSettings
from ..schemas.branding import (
    BrandingUpdate,
    BrandingResponse,
    BrandingLogoUploadResponse,
    WatermarkUpdate,
    WatermarkResponse,
    WatermarkImageUploadResponse,
)
from ..services.permissions import require_project_role, require_asset_access
from ..services import s3_service
from ..config import settings

router = APIRouter(tags=["branding"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_or_create_branding(db: Session, project_id: uuid.UUID) -> ProjectBranding:
    branding = db.query(ProjectBranding).filter(
        ProjectBranding.project_id == project_id
    ).first()
    if not branding:
        branding = ProjectBranding(project_id=project_id)
        db.add(branding)
        db.commit()
        db.refresh(branding)
    return branding


def _get_or_create_watermark(db: Session, project_id: uuid.UUID) -> WatermarkSettings:
    wm = db.query(WatermarkSettings).filter(
        WatermarkSettings.project_id == project_id,
        WatermarkSettings.share_link_id.is_(None),
    ).first()
    if not wm:
        wm = WatermarkSettings(project_id=project_id)
        db.add(wm)
        db.commit()
        db.refresh(wm)
    return wm


def _branding_to_response(branding: ProjectBranding) -> BrandingResponse:
    resp = BrandingResponse.model_validate(branding)
    if branding.logo_s3_key:
        try:
            resp.logo_url = s3_service.generate_presigned_get_url(branding.logo_s3_key)
        except Exception:
            resp.logo_url = None
    return resp


def _watermark_to_response(watermark: WatermarkSettings) -> WatermarkResponse:
    response = WatermarkResponse.model_validate(watermark)
    if watermark.image_s3_key:
        try:
            response.image_url = s3_service.generate_presigned_get_url(watermark.image_s3_key)
        except Exception:
            response.image_url = None
    return response


# ── Project Branding ──────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/branding", response_model=BrandingResponse)
def get_branding(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_role(db, project_id, current_user, ProjectRole.viewer)
    branding = _get_or_create_branding(db, project_id)
    return _branding_to_response(branding)


@router.put("/projects/{project_id}/branding", response_model=BrandingResponse)
def upsert_branding(
    project_id: uuid.UUID,
    body: BrandingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_role(db, project_id, current_user, ProjectRole.editor)
    branding = _get_or_create_branding(db, project_id)
    update_data = body.model_dump(exclude_none=True)
    for field, value in update_data.items():
        setattr(branding, field, value)
    db.commit()
    db.refresh(branding)
    return _branding_to_response(branding)


@router.post(
    "/projects/{project_id}/branding/logo-upload",
    response_model=BrandingLogoUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
def get_logo_upload_url(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_role(db, project_id, current_user, ProjectRole.editor)
    key = f"branding/{project_id}/logo/{uuid.uuid4()}.webp"
    upload_url = s3_service.get_s3_client().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.s3_bucket,
            "Key": key,
            "ContentType": "image/webp",
        },
        ExpiresIn=3600,
    )
    return BrandingLogoUploadResponse(upload_url=upload_url, key=key)


# ── Watermark Settings ────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/watermark", response_model=WatermarkResponse)
def get_watermark(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_role(db, project_id, current_user, ProjectRole.viewer)
    wm = _get_or_create_watermark(db, project_id)
    return _watermark_to_response(wm)


@router.put("/projects/{project_id}/watermark", response_model=WatermarkResponse)
def upsert_watermark(
    project_id: uuid.UUID,
    body: WatermarkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_role(db, project_id, current_user, ProjectRole.editor)
    wm = _get_or_create_watermark(db, project_id)
    # ``exclude_unset`` keeps PATCH-like semantics while still allowing an
    # explicit JSON null to remove a previously uploaded watermark image.
    update_data = body.model_dump(exclude_unset=True)
    new_image_key = update_data.get("image_s3_key")
    if new_image_key and not new_image_key.startswith(f"branding/{project_id}/watermark/"):
        raise HTTPException(status_code=400, detail="Invalid watermark image key")
    previous_image_key = wm.image_s3_key
    for field, value in update_data.items():
        setattr(wm, field, value)
    db.commit()
    db.refresh(wm)
    if "image_s3_key" in update_data and previous_image_key and previous_image_key != new_image_key:
        try:
            s3_service.delete_object(previous_image_key)
        except Exception:
            pass
    return _watermark_to_response(wm)


@router.post(
    "/projects/{project_id}/watermark/image-upload",
    response_model=WatermarkImageUploadResponse,
    status_code=status.HTTP_201_CREATED,
)
def get_watermark_image_upload_url(
    project_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_project_role(db, project_id, current_user, ProjectRole.editor)
    key = f"branding/{project_id}/watermark/{uuid.uuid4()}.png"
    upload_url = s3_service.get_s3_client().generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.s3_bucket,
            "Key": key,
            "ContentType": "image/png",
        },
        ExpiresIn=3600,
    )
    return WatermarkImageUploadResponse(upload_url=upload_url, key=key)


# ── Apply Watermark ───────────────────────────────────────────────────────────

@router.post("/assets/{asset_id}/apply-watermark", status_code=status.HTTP_202_ACCEPTED)
def apply_watermark_to_asset(
    asset_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    asset = db.query(Asset).filter(Asset.id == asset_id, Asset.deleted_at.is_(None)).first()
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if asset.asset_type != AssetType.video:
        raise HTTPException(status_code=400, detail="Watermark rendering currently supports video assets only")

    require_project_role(db, asset.project_id, current_user, ProjectRole.editor)

    wm = db.query(WatermarkSettings).filter(
        WatermarkSettings.project_id == asset.project_id,
        WatermarkSettings.share_link_id.is_(None),
    ).first()
    if not wm or not wm.enabled:
        raise HTTPException(status_code=400, detail="Watermark not enabled")

    # Resolve watermark text based on content type
    if wm.content == "email":
        watermark_text = current_user.email
    elif wm.content == "name":
        watermark_text = current_user.name or current_user.email
    elif wm.content == "custom_text":
        watermark_text = wm.custom_text or ""
    else:  # image
        watermark_text = ""
        if not wm.image_s3_key:
            raise HTTPException(status_code=400, detail="Watermark image not uploaded")

    from ..tasks.watermark_tasks import apply_watermark
    from ..tasks.celery_app import send_task_safe
    send_task_safe(
        apply_watermark,
        str(asset_id),
        watermark_text,
        wm.position,
        wm.opacity,
        wm.image_s3_key if wm.content == "image" else None,
    )
    return {"status": "watermark_queued"}
