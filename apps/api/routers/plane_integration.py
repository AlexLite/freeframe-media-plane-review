from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..integrations.plane.claims import PlaneTokenError
from ..integrations.plane.session import PlaneIdentityConflict, exchange_plane_token
from ..schemas.plane_integration import (
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
