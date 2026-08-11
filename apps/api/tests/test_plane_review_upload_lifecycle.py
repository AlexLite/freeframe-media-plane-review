from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from fastapi import BackgroundTasks, HTTPException

from apps.api.integrations.plane.authorization import PlaneReviewPrincipal
from apps.api.models.asset import ProcessingStatus
from apps.api.models.user import UserStatus
from apps.api.routers.plane_upload_lifecycle import (
    _get_owned_upload,
    _validated_parts,
    abort_plane_review_upload,
    complete_plane_review_upload,
    presign_plane_review_upload_part,
)
from apps.api.schemas.upload import (
    AbortUploadRequest,
    CompleteUploadRequest,
    PresignPartRequest,
    UploadPart,
)


def _principal() -> PlaneReviewPrincipal:
    return PlaneReviewPrincipal(
        user=SimpleNamespace(id=uuid4(), name="Plane Uploader", status=UserStatus.active),
        workspace_id=uuid4(),
        project_id=uuid4(),
        issue_id=uuid4(),
        scopes=frozenset({"review:upload"}),
    )


def _filtered_query(result):
    query = MagicMock()
    query.filter.return_value.first.return_value = result
    return query


def _upload_state(status=ProcessingStatus.uploading):
    principal = _principal()
    asset = SimpleNamespace(id=uuid4())
    version = SimpleNamespace(
        id=uuid4(),
        asset_id=asset.id,
        created_by=principal.user.id,
        processing_status=status,
    )
    media_file = SimpleNamespace(
        version_id=version.id,
        s3_key_raw=f"raw/project/{asset.id}/{version.id}/original.mp4",
    )
    db = MagicMock()
    db.query.side_effect = [_filtered_query(version), _filtered_query(media_file)]
    return principal, asset, version, media_file, db


def test_get_owned_upload_rejects_cross_asset_version():
    principal = _principal()
    asset = SimpleNamespace(id=uuid4())
    db = MagicMock()
    db.query.return_value = _filtered_query(None)

    with pytest.raises(HTTPException) as exc:
        _get_owned_upload(
            db,
            asset=asset,
            version_id=uuid4(),
            s3_key="raw/other/file.mp4",
            principal=principal,
        )

    assert exc.value.status_code == 404
    assert "version" in exc.value.detail.lower()


def test_get_owned_upload_rejects_other_shadow_user():
    principal, asset, version, media_file, db = _upload_state()
    version.created_by = uuid4()

    with pytest.raises(HTTPException) as exc:
        _get_owned_upload(
            db,
            asset=asset,
            version_id=version.id,
            s3_key=media_file.s3_key_raw,
            principal=principal,
        )

    assert exc.value.status_code == 403


def test_get_owned_upload_rejects_wrong_s3_key():
    principal, asset, version, _media_file, db = _upload_state()
    db.query.side_effect = [_filtered_query(version), _filtered_query(None)]

    with pytest.raises(HTTPException) as exc:
        _get_owned_upload(
            db,
            asset=asset,
            version_id=version.id,
            s3_key="raw/wrong/key.mp4",
            principal=principal,
        )

    assert exc.value.status_code == 404
    assert "media file" in exc.value.detail.lower()


def test_validated_parts_requires_ordered_unique_parts_and_etags():
    base = dict(
        s3_key="raw/file.mp4",
        upload_id="upload-id",
        asset_id=uuid4(),
        version_id=uuid4(),
    )

    with pytest.raises(HTTPException):
        _validated_parts(CompleteUploadRequest(parts=[], **base))

    with pytest.raises(HTTPException):
        _validated_parts(
            CompleteUploadRequest(
                parts=[UploadPart(PartNumber=2, ETag="b"), UploadPart(PartNumber=1, ETag="a")],
                **base,
            )
        )

    with pytest.raises(HTTPException):
        _validated_parts(
            CompleteUploadRequest(
                parts=[UploadPart(PartNumber=1, ETag="a"), UploadPart(PartNumber=1, ETag="b")],
                **base,
            )
        )

    assert _validated_parts(
        CompleteUploadRequest(
            parts=[UploadPart(PartNumber=1, ETag="etag-1")],
            **base,
        )
    ) == [{"PartNumber": 1, "ETag": "etag-1"}]


def test_presign_part_requires_active_upload():
    principal, asset, version, media_file, db = _upload_state(ProcessingStatus.processing)
    body = PresignPartRequest(
        s3_key=media_file.s3_key_raw,
        upload_id="upload-id",
        part_number=1,
    )

    with pytest.raises(HTTPException) as exc:
        presign_plane_review_upload_part(
            version_id=version.id,
            body=body,
            db=db,
            asset=asset,
            principal=principal,
        )

    assert exc.value.status_code == 409


def test_complete_upload_dispatches_processing_once():
    principal, asset, version, media_file, db = _upload_state()
    body = CompleteUploadRequest(
        s3_key=media_file.s3_key_raw,
        upload_id="upload-id",
        asset_id=asset.id,
        version_id=version.id,
        parts=[UploadPart(PartNumber=1, ETag="etag-1")],
    )
    background_tasks = MagicMock(spec=BackgroundTasks)

    with patch(
        "apps.api.routers.plane_upload_lifecycle.complete_multipart_upload"
    ) as complete:
        response = complete_plane_review_upload(
            version_id=version.id,
            body=body,
            background_tasks=background_tasks,
            db=db,
            asset=asset,
            principal=principal,
        )

    complete.assert_called_once_with(
        media_file.s3_key_raw,
        "upload-id",
        [{"PartNumber": 1, "ETag": "etag-1"}],
    )
    assert version.processing_status == ProcessingStatus.processing
    db.commit.assert_called_once()
    background_tasks.add_task.assert_called_once()
    assert response.status == "processing"


def test_complete_upload_is_idempotent_after_processing_started():
    principal, asset, version, media_file, db = _upload_state(ProcessingStatus.processing)
    body = CompleteUploadRequest(
        s3_key=media_file.s3_key_raw,
        upload_id="upload-id",
        asset_id=asset.id,
        version_id=version.id,
        parts=[UploadPart(PartNumber=1, ETag="etag-1")],
    )
    background_tasks = MagicMock(spec=BackgroundTasks)

    with patch(
        "apps.api.routers.plane_upload_lifecycle.complete_multipart_upload"
    ) as complete:
        response = complete_plane_review_upload(
            version_id=version.id,
            body=body,
            background_tasks=background_tasks,
            db=db,
            asset=asset,
            principal=principal,
        )

    complete.assert_not_called()
    db.commit.assert_not_called()
    background_tasks.add_task.assert_not_called()
    assert response.status == "processing"


def test_abort_upload_is_idempotent_and_rejects_processed_version():
    principal, asset, version, media_file, db = _upload_state(ProcessingStatus.failed)
    body = AbortUploadRequest(
        s3_key=media_file.s3_key_raw,
        upload_id="upload-id",
        version_id=version.id,
    )

    with patch(
        "apps.api.routers.plane_upload_lifecycle.abort_multipart_upload"
    ) as abort:
        assert abort_plane_review_upload(
            version_id=version.id,
            body=body,
            db=db,
            asset=asset,
            principal=principal,
        ) is None

    abort.assert_not_called()
    db.commit.assert_not_called()

    principal, asset, version, media_file, db = _upload_state(ProcessingStatus.ready)
    body = AbortUploadRequest(
        s3_key=media_file.s3_key_raw,
        upload_id="upload-id",
        version_id=version.id,
    )
    with pytest.raises(HTTPException) as exc:
        abort_plane_review_upload(
            version_id=version.id,
            body=body,
            db=db,
            asset=asset,
            principal=principal,
        )
    assert exc.value.status_code == 409
