from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

from apps.api.integrations.plane.authorization import PlaneReviewPrincipal
from apps.api.main import app
from apps.api.models.user import UserStatus
from apps.api.routers.plane_review_bootstrap import get_plane_review_bootstrap, router


def _principal(*scopes: str) -> PlaneReviewPrincipal:
    return PlaneReviewPrincipal(
        user=SimpleNamespace(id=uuid4(), name="Plane Reviewer", status=UserStatus.active),
        workspace_id=uuid4(),
        project_id=uuid4(),
        issue_id=uuid4(),
        scopes=frozenset(scopes),
    )


def _version_query(versions):
    query = MagicMock()
    query.filter.return_value.order_by.return_value.all.return_value = versions
    return query


def _media_query(media_file):
    query = MagicMock()
    query.filter.return_value.first.return_value = media_file
    return query


def test_plane_review_bootstrap_builds_context_versions_and_permissions():
    principal = _principal("review:read", "review:comment", "review:upload")
    asset = SimpleNamespace(id=uuid4())
    created_at = datetime(2026, 7, 15, 10, 30, tzinfo=timezone.utc)
    version = SimpleNamespace(
        id=uuid4(),
        version_number=3,
        processing_status=SimpleNamespace(value="ready"),
        created_by=principal.user.id,
        created_at=created_at,
    )
    media_file = SimpleNamespace(
        original_filename="review-v3.mp4",
        mime_type="video/mp4",
        file_size_bytes=123456,
    )
    db = MagicMock()
    db.query.side_effect = [_version_query([version]), _media_query(media_file)]
    response = SimpleNamespace()

    def build_response(**kwargs):
        for key, value in kwargs.items():
            setattr(response, key, value)
        return response

    with (
        patch(
            "apps.api.routers.plane_review_bootstrap._build_asset_response",
            return_value=SimpleNamespace(id=asset.id),
        ),
        patch(
            "apps.api.routers.plane_review_bootstrap.PlaneReviewBootstrapResponse",
            side_effect=build_response,
        ),
    ):
        result = get_plane_review_bootstrap(
            db=db,
            asset=asset,
            principal=principal,
        )

    assert result.context.workspace_id == principal.workspace_id
    assert result.context.project_id == principal.project_id
    assert result.context.issue_id == principal.issue_id
    assert result.asset.id == asset.id
    assert len(result.versions) == 1
    assert result.versions[0].id == version.id
    assert result.versions[0].processing_status == "ready"
    assert result.versions[0].created_at == created_at.isoformat()
    assert result.versions[0].original_filename == "review-v3.mp4"
    assert result.permissions.read is True
    assert result.permissions.comment is True
    assert result.permissions.upload is True
    assert result.permissions.manage is False


def test_plane_review_bootstrap_allows_version_without_media_metadata():
    principal = _principal("review:read")
    asset = SimpleNamespace(id=uuid4())
    version = SimpleNamespace(
        id=uuid4(),
        version_number=1,
        processing_status=SimpleNamespace(value="uploading"),
        created_by=principal.user.id,
        created_at=None,
    )
    db = MagicMock()
    db.query.side_effect = [_version_query([version]), _media_query(None)]
    response = SimpleNamespace()

    def build_response(**kwargs):
        for key, value in kwargs.items():
            setattr(response, key, value)
        return response

    with (
        patch(
            "apps.api.routers.plane_review_bootstrap._build_asset_response",
            return_value=SimpleNamespace(id=asset.id),
        ),
        patch(
            "apps.api.routers.plane_review_bootstrap.PlaneReviewBootstrapResponse",
            side_effect=build_response,
        ),
    ):
        result = get_plane_review_bootstrap(db=db, asset=asset, principal=principal)

    summary = result.versions[0]
    assert summary.original_filename is None
    assert summary.mime_type is None
    assert summary.file_size_bytes is None
    assert result.permissions.read is True
    assert result.permissions.comment is False
    assert result.permissions.upload is False
    assert result.permissions.manage is False


def test_plane_review_bootstrap_route_contract_is_registered():
    assert app is not None
    routes = {
        (route.path, method)
        for route in router.routes
        for method in getattr(route, "methods", set())
    }
    assert (
        "/integrations/plane/assets/{asset_id}/review",
        "GET",
    ) in routes
