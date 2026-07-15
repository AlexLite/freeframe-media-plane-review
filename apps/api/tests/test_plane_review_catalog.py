from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from apps.api.integrations.plane.authorization import PlaneReviewPrincipal
from apps.api.main import app
from apps.api.models.asset import Asset, AssetType
from apps.api.models.project import Project, ProjectMember, ProjectRole, ProjectType
from apps.api.models.user import UserStatus
from apps.api.routers.plane_review_catalog import (
    _ensure_catalog_project,
    _escaped_contains,
    _managed_project_description,
    _validate_managed_project,
    create_plane_review_catalog_asset,
    list_plane_review_catalog_assets,
    plane_review_catalog_project_id,
    router,
)
from apps.api.schemas.plane_review_catalog import PlaneReviewCatalogAssetCreate


def _principal() -> PlaneReviewPrincipal:
    return PlaneReviewPrincipal(
        user=SimpleNamespace(id=uuid4(), status=UserStatus.active),
        workspace_id=uuid4(),
        project_id=uuid4(),
        issue_id=uuid4(),
        scopes=frozenset({"review:read", "review:manage"}),
    )


def test_catalog_project_id_is_stable_and_context_scoped():
    principal = _principal()

    first = plane_review_catalog_project_id(
        principal.workspace_id,
        principal.project_id,
    )
    second = plane_review_catalog_project_id(
        principal.workspace_id,
        principal.project_id,
    )

    assert first == second
    assert first != plane_review_catalog_project_id(uuid4(), principal.project_id)
    assert first != plane_review_catalog_project_id(principal.workspace_id, uuid4())


def test_catalog_search_escapes_sql_wildcards_and_escape_character():
    assert _escaped_contains(r"cut_100%\\final") == r"cut\_100\%\\\\final"


def test_ensure_catalog_project_provisions_private_team_project_and_owner():
    principal = _principal()
    db = MagicMock()
    project_query = MagicMock()
    project_query.filter.return_value.first.return_value = None
    member_query = MagicMock()
    member_query.filter.return_value.first.return_value = None
    db.query.side_effect = lambda model: (
        project_query if model is Project else member_query
    )

    project = _ensure_catalog_project(db, principal)

    assert project.id == plane_review_catalog_project_id(
        principal.workspace_id,
        principal.project_id,
    )
    assert project.project_type == ProjectType.team
    assert project.is_public is False
    assert project.created_by == principal.user.id
    assert project.description == _managed_project_description(principal)

    added = [call.args[0] for call in db.add.call_args_list]
    assert project in added
    membership = next(value for value in added if isinstance(value, ProjectMember))
    assert membership.project_id == project.id
    assert membership.user_id == principal.user.id
    assert membership.role == ProjectRole.owner
    db.flush.assert_called_once()


def test_existing_non_managed_project_identity_is_rejected():
    principal = _principal()
    project = SimpleNamespace(description="standalone FreeFrame project")

    with pytest.raises(HTTPException) as exc:
        _validate_managed_project(project, principal)

    assert exc.value.status_code == 409
    assert "identity conflicts" in exc.value.detail


def test_catalog_is_empty_before_project_is_provisioned():
    principal = _principal()
    db = MagicMock()

    with patch(
        "apps.api.routers.plane_review_catalog._get_catalog_project",
        return_value=None,
    ):
        result = list_plane_review_catalog_assets(
            q=None,
            limit=50,
            db=db,
            principal=principal,
        )

    assert result == []
    db.query.assert_not_called()


def test_catalog_queries_only_available_assets_and_returns_bulk_projection():
    principal = _principal()
    project = SimpleNamespace(id=uuid4())
    asset = SimpleNamespace(id=uuid4())
    db = MagicMock()
    query = MagicMock()
    db.query.return_value = query
    query.outerjoin.return_value = query
    query.filter.return_value = query
    query.order_by.return_value = query
    query.limit.return_value = query
    query.all.return_value = [asset]

    with (
        patch(
            "apps.api.routers.plane_review_catalog._get_catalog_project",
            return_value=project,
        ),
        patch(
            "apps.api.routers.plane_review_catalog._build_asset_responses_bulk",
            return_value=["projection"],
        ) as build_bulk,
    ):
        result = list_plane_review_catalog_assets(
            q=" campaign_100% ",
            limit=12,
            db=db,
            principal=principal,
        )

    assert result == ["projection"]
    query.outerjoin.assert_called_once()
    query.limit.assert_called_once_with(12)
    build_bulk.assert_called_once_with([asset], db)


def test_create_catalog_asset_uses_managed_project_and_shadow_user():
    principal = _principal()
    project = SimpleNamespace(id=uuid4())
    db = MagicMock()
    body = PlaneReviewCatalogAssetCreate(
        name="  Campaign cut  ",
        description="  First review  ",
        asset_type=AssetType.video,
    )

    with (
        patch(
            "apps.api.routers.plane_review_catalog._ensure_catalog_project",
            return_value=project,
        ),
        patch(
            "apps.api.routers.plane_review_catalog._build_asset_response",
            return_value="projection",
        ) as build_response,
    ):
        result = create_plane_review_catalog_asset(
            body=body,
            db=db,
            principal=principal,
        )

    assert result == "projection"
    created = db.add.call_args.args[0]
    assert isinstance(created, Asset)
    assert created.project_id == project.id
    assert created.created_by == principal.user.id
    assert created.name == "Campaign cut"
    assert created.description == "First review"
    assert created.asset_type == AssetType.video
    db.commit.assert_called_once()
    db.refresh.assert_called_once_with(created)
    build_response.assert_called_once_with(created, db)


def test_catalog_routes_are_registered():
    assert app is not None
    routes = {
        (route.path, method)
        for route in router.routes
        for method in getattr(route, "methods", set())
    }

    assert ("/integrations/plane/catalog/assets", "GET") in routes
    assert ("/integrations/plane/catalog/assets", "POST") in routes
