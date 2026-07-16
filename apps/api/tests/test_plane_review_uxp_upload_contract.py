from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from apps.api.integrations.plane.authorization import PlaneReviewPrincipal
from apps.api.models.asset import AssetType, AssetVersion
from apps.api.models.user import UserStatus
from apps.api.routers.plane_integration import initiate_plane_review_version
from apps.api.schemas.plane_integration import PlaneReviewVersionCreateRequest


def _principal() -> PlaneReviewPrincipal:
    return PlaneReviewPrincipal(
        user=SimpleNamespace(id=uuid4(), name="Premiere Editor", status=UserStatus.active),
        workspace_id=uuid4(),
        project_id=uuid4(),
        issue_id=uuid4(),
        scopes=frozenset({"review:upload"}),
    )


def test_scoped_version_request_does_not_require_freeframe_project_fields():
    asset_id = uuid4()

    body = PlaneReviewVersionCreateRequest(
        asset_id=asset_id,
        original_filename="campaign-cut.mp4",
        mime_type="video/mp4",
        file_size_bytes=1024,
    )

    assert body.asset_id == asset_id
    assert not hasattr(body, "project_id")
    assert not hasattr(body, "asset_name")


def test_scoped_version_request_rejects_mismatched_route_asset():
    body = PlaneReviewVersionCreateRequest(
        asset_id=uuid4(),
        original_filename="campaign-cut.mp4",
        mime_type="video/mp4",
        file_size_bytes=1024,
    )

    with pytest.raises(HTTPException) as exc:
        initiate_plane_review_version(
            body=body,
            db=MagicMock(),
            asset=SimpleNamespace(id=uuid4()),
            principal=_principal(),
        )

    assert exc.value.status_code == 400
    assert "context" in exc.value.detail.lower()


def test_scoped_version_request_creates_version_for_linked_asset_only():
    asset_id = uuid4()
    project_id = uuid4()
    version_id = uuid4()
    principal = _principal()
    asset = SimpleNamespace(id=asset_id, project_id=project_id, asset_type=AssetType.video)
    body = PlaneReviewVersionCreateRequest(
        asset_id=asset_id,
        original_filename="campaign-cut.mp4",
        mime_type="video/mp4",
        file_size_bytes=1024,
    )
    db = MagicMock()
    db.query.return_value.filter.return_value.order_by.return_value.first.return_value = None

    def assign_version_id():
        version = next(
            item.args[0]
            for item in db.add.call_args_list
            if isinstance(item.args[0], AssetVersion)
        )
        version.id = version_id

    db.flush.side_effect = assign_version_id

    with (
        patch(
            "apps.api.routers.plane_integration.create_multipart_upload",
            return_value="upload-id",
        ),
        patch(
            "apps.api.routers.plane_integration.upload_guard_error",
            return_value=None,
        ),
    ):
        result = initiate_plane_review_version(
            body=body,
            db=db,
            asset=asset,
            principal=principal,
        )

    assert result.asset_id == asset_id
    assert result.version_id == version_id
    assert result.upload_id == "upload-id"
    assert result.s3_key == f"raw/{project_id}/{asset_id}/{version_id}/original.mp4"
    db.commit.assert_called_once()
