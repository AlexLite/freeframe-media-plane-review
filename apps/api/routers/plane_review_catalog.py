from uuid import UUID, uuid5

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..integrations.plane.authorization import PlaneReviewPrincipal, require_plane_scope
from ..models.asset import Asset
from ..models.plane_review import PlaneReviewAssetLink
from ..models.project import Project, ProjectMember, ProjectRole, ProjectType
from ..routers.assets import _build_asset_response, _build_asset_responses_bulk
from ..schemas.asset import AssetResponse
from ..schemas.plane_review_catalog import PlaneReviewCatalogAssetCreate

router = APIRouter(prefix="/integrations/plane/catalog", tags=["plane-integration"])

PLANE_REVIEW_PROJECT_NAMESPACE = UUID("2d80eef1-858d-45f0-8f27-d2fb66b48b57")
PLANE_REVIEW_PROJECT_MARKER = "managed-by=freeframe-plane-review"


def plane_review_catalog_project_id(workspace_id: UUID, project_id: UUID) -> UUID:
    """Return one stable FreeFrame project UUID for a Plane workspace/project pair."""

    return uuid5(PLANE_REVIEW_PROJECT_NAMESPACE, f"{workspace_id}:{project_id}")


def _managed_project_description(principal: PlaneReviewPrincipal) -> str:
    return (
        f"{PLANE_REVIEW_PROJECT_MARKER}\n"
        f"plane_workspace_id={principal.workspace_id}\n"
        f"plane_project_id={principal.project_id}"
    )


def _validate_managed_project(project: Project, principal: PlaneReviewPrincipal) -> None:
    if project.description != _managed_project_description(principal):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Plane review catalog project identity conflicts with an existing FreeFrame project",
        )


def _get_catalog_project(
    db: Session,
    principal: PlaneReviewPrincipal,
) -> Project | None:
    project = (
        db.query(Project)
        .filter(
            Project.id
            == plane_review_catalog_project_id(
                principal.workspace_id,
                principal.project_id,
            ),
            Project.deleted_at.is_(None),
        )
        .first()
    )
    if project:
        _validate_managed_project(project, principal)
    return project


def _ensure_catalog_project(
    db: Session,
    principal: PlaneReviewPrincipal,
) -> Project:
    project_id = plane_review_catalog_project_id(
        principal.workspace_id,
        principal.project_id,
    )
    project = db.query(Project).filter(Project.id == project_id).first()

    if project:
        _validate_managed_project(project, principal)
        project.deleted_at = None
    else:
        project = Project(
            id=project_id,
            name=f"Plane review {principal.project_id}",
            description=_managed_project_description(principal),
            project_type=ProjectType.team,
            created_by=principal.user.id,
            is_public=False,
        )
        db.add(project)
        db.flush()

    membership = (
        db.query(ProjectMember)
        .filter(
            ProjectMember.project_id == project.id,
            ProjectMember.user_id == principal.user.id,
        )
        .first()
    )
    if not membership:
        db.add(
            ProjectMember(
                project_id=project.id,
                user_id=principal.user.id,
                role=(
                    ProjectRole.owner
                    if project.created_by == principal.user.id
                    else ProjectRole.editor
                ),
            )
        )
    else:
        membership.deleted_at = None
        if membership.role in (ProjectRole.viewer, ProjectRole.reviewer):
            membership.role = ProjectRole.editor

    return project


def _escaped_contains(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/assets", response_model=list[AssetResponse])
def list_plane_review_catalog_assets(
    q: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=100),
    db: Session = Depends(get_db),
    principal: PlaneReviewPrincipal = Depends(require_plane_scope("review:manage")),
):
    """List unlinked assets from the Plane project's isolated FreeFrame catalog."""

    project = _get_catalog_project(db, principal)
    if not project:
        return []

    query = (
        db.query(Asset)
        .outerjoin(
            PlaneReviewAssetLink,
            PlaneReviewAssetLink.asset_id == Asset.id,
        )
        .filter(
            Asset.project_id == project.id,
            Asset.deleted_at.is_(None),
            PlaneReviewAssetLink.id.is_(None),
        )
    )

    normalized_query = (q or "").strip()
    if normalized_query:
        query = query.filter(
            Asset.name.ilike(
                f"%{_escaped_contains(normalized_query)}%",
                escape="\\",
            )
        )

    assets = (
        query.order_by(Asset.updated_at.desc(), Asset.created_at.desc())
        .limit(limit)
        .all()
    )
    return _build_asset_responses_bulk(assets, db)


@router.post(
    "/assets",
    response_model=AssetResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_plane_review_catalog_asset(
    body: PlaneReviewCatalogAssetCreate,
    db: Session = Depends(get_db),
    principal: PlaneReviewPrincipal = Depends(require_plane_scope("review:manage")),
):
    """Create an empty asset in the isolated catalog so Plane can link and upload it."""

    project = _ensure_catalog_project(db, principal)
    asset = Asset(
        project_id=project.id,
        name=body.name,
        description=body.description,
        asset_type=body.asset_type,
        created_by=principal.user.id,
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return _build_asset_response(asset, db)
