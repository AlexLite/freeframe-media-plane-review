from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import HTTPException

from apps.api.integrations.plane.authorization import PlaneReviewPrincipal
from apps.api.models.asset import AssetType, ProcessingStatus
from apps.api.models.user import UserStatus
from apps.api.routers.plane_integration import (
    get_plane_review_stream_url,
    initiate_plane_review_version,
)


def _principal(*scopes: str) -> PlaneReviewPrincipal:
    return PlaneReviewPrincipal(
        user=SimpleNamespace(id=uuid4(), name="Plane Reviewer", status=UserStatus.active),
        workspace_id=uuid4(),
        project_id=uuid4(),
        issue_id=uuid4(),
        scopes=frozenset(scopes),
    )


def _latest_query(result):
    query = MagicMock()
    query.filter.return_value.order_by.return_value.first.return_value = result
    return query


def _filtered_query(result):
    query = MagicMock()
    query.filter.return_value.first.return_value = result
    return query


def test_plane_video_stream_uses_private_hls_proxy():
    asset = SimpleNamespace(
        id=uuid4(),
        name="Review cut",
        asset_type=AssetType.video,
    )
    version = SimpleNamespace(
        id=uuid4(),
        processing_status=ProcessingStatus.ready,
    )
    media_file = SimpleNamespace(
        s3_key_processed="processed/project/asset/version/master.m3u8",
        s3_key_raw="raw/project/asset/version/original.mp4",
        original_filename="review-cut.mp4",
    )
    db = MagicMock()
    db.query.side_effect = [_latest_query(version), _filtered_query(media_file)]

    with patch(
        "apps.api.routers.plane_integration.create_hls_token",
        return_value="scoped-hls-token",
    ) as create_token:
        response = get_plane_review_stream_url(
            version_id=None,
            download=False,
            db=db,
            asset=asset,
        )

    assert response.url == "/stream/hls/master.m3u8?token=scoped-hls-token"
    assert response.asset_type == AssetType.video
    create_token.assert_called_once_with(media_file.s3_key_processed)


def test_plane_stream_rejects_version_that_is_not_ready():
    asset = SimpleNamespace(id=uuid4(), name="Cut", asset_type=AssetType.video)
    version = SimpleNamespace(
        id=uuid4(),
        processing_status=ProcessingStatus.processing,
    )
    db = MagicMock()
    db.query.return_value = _latest_query(version)

    with pytest.raises(HTTPException) as exc:
        get_plane_review_stream_url(
            version_id=None,
            download=False,
            db=db,
            asset=asset,
        )

    assert exc.value.status_code == 409
    assert "not ready" in exc.value.detail


def test_plane_upload_creates_version_as_shadow_user():
    principal = _principal("review:upload")
    asset = SimpleNamespace(
        id=uuid4(),
        project_id=uuid4(),
        asset_type=AssetType.video,
    )
    body = SimpleNamespace(
        original_filename="next-cut.MP4",
        mime_type="video/mp4",
        file_size_bytes=1024,
    )
    db = MagicMock()
    db.query.return_value = _latest_query(None)
    version_id = uuid4()

    def assign_version_id():
        version = db.add.call_args_list[0].args[0]
        version.id = version_id

    db.flush.side_effect = assign_version_id

    with (
        patch(
            "apps.api.routers.plane_integration.upload_guard_error",
            return_value=None,
        ),
        patch(
            "apps.api.routers.plane_integration.create_multipart_upload",
            return_value="multipart-id",
        ) as create_upload,
    ):
        response = initiate_plane_review_version(
            body=body,
            db=db,
            asset=asset,
            principal=principal,
        )

    version = db.add.call_args_list[0].args[0]
    media_file = db.add.call_args_list[1].args[0]

    assert version.asset_id == asset.id
    assert version.version_number == 1
    assert version.created_by == principal.user.id
    assert version.processing_status == ProcessingStatus.uploading
    assert media_file.version_id == version_id
    assert media_file.s3_key_raw.endswith("/original.mp4")
    assert response.upload_id == "multipart-id"
    assert response.asset_id == asset.id
    assert response.version_id == version_id
    create_upload.assert_called_once_with(media_file.s3_key_raw, "video/mp4")
    db.commit.assert_called_once()


def test_plane_upload_guard_failure_creates_no_database_rows():
    principal = _principal("review:upload")
    asset = SimpleNamespace(
        id=uuid4(),
        project_id=uuid4(),
        asset_type=AssetType.video,
    )
    body = SimpleNamespace(
        original_filename="too-large.mp4",
        mime_type="video/mp4",
        file_size_bytes=10_000,
    )
    db = MagicMock()

    with patch(
        "apps.api.routers.plane_integration.upload_guard_error",
        return_value="Upload exceeds storage limit",
    ):
        with pytest.raises(HTTPException) as exc:
            initiate_plane_review_version(
                body=body,
                db=db,
                asset=asset,
                principal=principal,
            )

    assert exc.value.status_code == 400
    assert exc.value.detail == "Upload exceeds storage limit"
    db.add.assert_not_called()
    db.commit.assert_not_called()
