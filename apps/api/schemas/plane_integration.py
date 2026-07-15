from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


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
