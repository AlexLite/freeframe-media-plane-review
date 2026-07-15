from uuid import UUID

from pydantic import BaseModel

from .asset import AssetResponse


class PlaneReviewPermissions(BaseModel):
    read: bool
    comment: bool
    upload: bool
    manage: bool


class PlaneReviewBootstrapContext(BaseModel):
    workspace_id: UUID
    project_id: UUID
    issue_id: UUID


class PlaneReviewVersionSummary(BaseModel):
    id: UUID
    version_number: int
    processing_status: str
    created_by: UUID
    created_at: str | None = None
    original_filename: str | None = None
    mime_type: str | None = None
    file_size_bytes: int | None = None


class PlaneReviewBootstrapResponse(BaseModel):
    context: PlaneReviewBootstrapContext
    asset: AssetResponse
    versions: list[PlaneReviewVersionSummary]
    permissions: PlaneReviewPermissions
