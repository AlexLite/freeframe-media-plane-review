from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..integrations.plane.claims import PlaneTokenError
from ..integrations.plane.session import PlaneIdentityConflict, exchange_plane_token
from ..schemas.plane_integration import (
    PlaneReviewContext,
    PlaneSessionExchangeRequest,
    PlaneSessionExchangeResponse,
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
    """Exchange a short-lived Plane review token for a FreeFrame session."""

    try:
        session = exchange_plane_token(db, body.token)
    except PlaneTokenError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except PlaneIdentityConflict as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc

    return PlaneSessionExchangeResponse(
        access_token=session.access_token,
        refresh_token=session.refresh_token,
        user_id=session.user.id,
        context=PlaneReviewContext(
            workspace_id=session.claims.workspace_id,
            project_id=session.claims.project_id,
            issue_id=session.claims.issue_id,
            scopes=session.claims.scopes,
        ),
    )
