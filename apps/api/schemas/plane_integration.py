from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PlaneSessionExchangeRequest(BaseModel):
    token: str


class PlaneShadowUserResponse(BaseModel):
    id: UUID
    plane_user_id: UUID
    email: str
    name: str


class PlaneReviewContext(BaseModel):
    workspace_id: UUID
    project_id: UUID
    issue_id: UUID


class PlaneReviewVersionCreateRequest(BaseModel):
    """Create a version only for the linked asset in the scoped Plane session."""

    asset_id: UUID
    original_filename: str = Field(min_length=1, max_length=500)
    mime_type: str = Field(min_length=1, max_length=100)
    file_size_bytes: int = Field(gt=0)


class PlaneSessionExchangeResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: PlaneShadowUserResponse
    context: PlaneReviewContext
    scopes: list[str]


class PlaneReviewAssetLinkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    asset_id: UUID
    workspace_id: UUID
    project_id: UUID
    issue_id: UUID
    linked_by: UUID
    created_at: datetime
    updated_at: datetime
