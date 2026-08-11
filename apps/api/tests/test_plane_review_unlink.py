from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from apps.api.main import app
from apps.api.integrations.plane.authorization import PlaneReviewPrincipal
from apps.api.models.user import UserStatus
from apps.api.routers.plane_review_link_lifecycle import (
    router,
    unlink_plane_review_asset,
)


def _principal() -> PlaneReviewPrincipal:
    return PlaneReviewPrincipal(
        user=SimpleNamespace(id=uuid4(), status=UserStatus.active),
        workspace_id=uuid4(),
        project_id=uuid4(),
        issue_id=uuid4(),
        scopes=frozenset({"review:manage"}),
    )


def _db_with_link(link):
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = link
    return db


def test_unlink_deletes_only_matching_context():
    principal = _principal()
    link = SimpleNamespace(
        asset_id=uuid4(),
        workspace_id=principal.workspace_id,
        project_id=principal.project_id,
        issue_id=principal.issue_id,
    )
    db = _db_with_link(link)

    assert unlink_plane_review_asset(
        asset_id=link.asset_id,
        db=db,
        principal=principal,
    ) is None

    db.delete.assert_called_once_with(link)
    db.commit.assert_called_once()


def test_unlink_is_idempotent_when_link_is_missing():
    principal = _principal()
    db = _db_with_link(None)

    assert unlink_plane_review_asset(
        asset_id=uuid4(),
        db=db,
        principal=principal,
    ) is None

    db.delete.assert_not_called()
    db.commit.assert_not_called()


@pytest.mark.parametrize("field", ["workspace_id", "project_id", "issue_id"])
def test_unlink_rejects_cross_context(field):
    principal = _principal()
    link_values = {
        "asset_id": uuid4(),
        "workspace_id": principal.workspace_id,
        "project_id": principal.project_id,
        "issue_id": principal.issue_id,
    }
    link_values[field] = uuid4()
    link = SimpleNamespace(**link_values)
    db = _db_with_link(link)

    with pytest.raises(HTTPException) as exc:
        unlink_plane_review_asset(
            asset_id=link.asset_id,
            db=db,
            principal=principal,
        )

    assert exc.value.status_code == 403
    assert "does not match" in exc.value.detail
    db.delete.assert_not_called()
    db.commit.assert_not_called()


def test_unlink_route_is_registered():
    assert app is not None
    routes = {
        (route.path, method)
        for route in router.routes
        for method in getattr(route, "methods", set())
    }
    assert ("/integrations/plane/assets/{asset_id}/link", "DELETE") in routes
