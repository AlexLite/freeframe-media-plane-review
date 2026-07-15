from uuid import UUID

from pydantic import BaseModel


class PlaneSessionExchangeRequest(BaseModel):
    token: str


class PlaneReviewContext(BaseModel):
    workspace_id: UUID
    project_id: UUID
    issue_id: UUID
    scopes: list[str]


class PlaneSessionExchangeResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user_id: UUID
    context: PlaneReviewContext
