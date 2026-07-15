from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from apps.api.integrations.plane.authorization import (
    PlaneReviewPrincipal,
    require_linked_plane_asset,
    require_plane_scope,
)
from apps.api.models.user import UserStatus


def _principal(*scopes: str):
    return PlaneReviewPrincipal(
        user=SimpleNamespace(id=uuid4(), status=UserStatus.active),
        workspace_id=uuid4(),
        project_id=uuid4(),
        issue_id=uuid4(),
        scopes=frozenset(scopes),
    )


def _db_results(*results):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.side_effect = results
    return db


def test_scope_dependency_accepts_only_explicit_scope():
    principal = _principal("review:read", "review:comment")

    assert require_plane_scope("review:read")(principal) is principal

    with pytest.raises(HTTPException) as exc:
        require_plane_scope("review:manage")(principal)
    assert exc.value.status_code == 403


def test_linked_asset_requires_matching_workspace_project_and_issue():
    principal = _principal("review:read")
    asset = SimpleNamespace(id=uuid4(), deleted_at=None)
    matching_link = SimpleNamespace(
        asset_id=asset.id,
        workspace_id=principal.workspace_id,
        project_id=principal.project_id,
        issue_id=principal.issue_id,
    )
    db = _db_results(asset, matching_link)

    dependency = require_linked_plane_asset("review:read")
    assert dependency(asset_id=asset.id, db=db, principal=principal) is asset


@pytest.mark.parametrize("field", ["workspace_id", "project_id", "issue_id"])
def test_linked_asset_rejects_cross_context_session(field):
    principal = _principal("review:read")
    asset = SimpleNamespace(id=uuid4(), deleted_at=None)
    link_values = {
        "asset_id": asset.id,
        "workspace_id": principal.workspace_id,
        "project_id": principal.project_id,
        "issue_id": principal.issue_id,
    }
    link_values[field] = uuid4()
    db = _db_results(asset, SimpleNamespace(**link_values))

    with pytest.raises(HTTPException) as exc:
        require_linked_plane_asset("review:read")(
            asset_id=asset.id,
            db=db,
            principal=principal,
        )
    assert exc.value.status_code == 403
    assert "does not match" in exc.value.detail


def test_linked_asset_rejects_unlinked_asset():
    principal = _principal("review:read")
    asset = SimpleNamespace(id=uuid4(), deleted_at=None)
    db = _db_results(asset, None)

    with pytest.raises(HTTPException) as exc:
        require_linked_plane_asset("review:read")(
            asset_id=asset.id,
            db=db,
            principal=principal,
        )
    assert exc.value.status_code == 403
    assert "not linked" in exc.value.detail


def test_link_endpoint_is_idempotent_for_same_context(client, mock_db):
    principal = _principal("review:manage")
    asset = SimpleNamespace(id=uuid4(), deleted_at=None)
    link = SimpleNamespace(
        asset_id=asset.id,
        workspace_id=principal.workspace_id,
        project_id=principal.project_id,
        issue_id=principal.issue_id,
        linked_by=principal.user.id,
        created_at="2026-07-15T00:00:00Z",
        updated_at="2026-07-15T00:00:00Z",
    )
    mock_db.query.return_value.filter.return_value.first.side_effect = [asset, link]

    with patch(
        "apps.api.integrations.plane.authorization.get_plane_review_principal",
        return_value=principal,
    ):
        # Dependency overrides are exercised separately; call the route through
        # its dependency target to keep this regression independent of JWT setup.
        from apps.api.routers.plane_integration import link_plane_review_asset

        result = link_plane_review_asset(
            asset_id=asset.id,
            db=mock_db,
            principal=principal,
        )

    assert result is link
    mock_db.add.assert_not_called()
    mock_db.commit.assert_not_called()


def test_link_endpoint_rejects_rebinding_to_another_issue(mock_db):
    principal = _principal("review:manage")
    asset = SimpleNamespace(id=uuid4(), deleted_at=None)
    existing_link = SimpleNamespace(
        asset_id=asset.id,
        workspace_id=principal.workspace_id,
        project_id=principal.project_id,
        issue_id=uuid4(),
    )
    mock_db.query.return_value.filter.return_value.first.side_effect = [
        asset,
        existing_link,
    ]

    from apps.api.routers.plane_integration import link_plane_review_asset

    with pytest.raises(HTTPException) as exc:
        link_plane_review_asset(
            asset_id=asset.id,
            db=mock_db,
            principal=principal,
        )
    assert exc.value.status_code == 409
