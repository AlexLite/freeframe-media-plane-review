from pathlib import Path
from unittest.mock import MagicMock, patch
import uuid

from apps.api.schemas.branding import WatermarkResponse, WatermarkUpdate
from apps.api.tasks.watermark_tasks import apply_watermark, build_image_watermark_filter
from apps.api.services import s3_service
from apps.api.tasks.celery_app import celery_app


def test_watermark_update_accepts_png_image_content():
    update = WatermarkUpdate(content="image", image_s3_key="branding/project/watermark/test.png")

    assert update.content == "image"
    assert update.image_s3_key.endswith(".png")


def test_watermark_update_can_explicitly_clear_image():
    update = WatermarkUpdate(image_s3_key=None)

    assert update.model_dump(exclude_unset=True) == {"image_s3_key": None}


def test_tiled_image_filter_contains_nine_overlays():
    graph = build_image_watermark_filter("tiled", 0.3)

    assert "split=9" in graph
    assert graph.count("overlay=") == 9
    assert graph.endswith("[outv]")


def test_watermark_response_exposes_image_preview_url():
    response = WatermarkResponse(
        id="00000000-0000-0000-0000-000000000001",
        project_id="00000000-0000-0000-0000-000000000002",
        enabled=True,
        position="corner",
        content="image",
        image_s3_key="branding/project/watermark/test.png",
        image_url="https://storage.example/test.png",
        opacity=0.3,
    )

    assert response.content == "image"
    assert response.image_url == "https://storage.example/test.png"


@patch("apps.api.services.s3_service._get_presign_client")
def test_single_put_upload_uses_browser_accessible_presign_client(get_presign_client):
    client = get_presign_client.return_value
    client.generate_presigned_url.return_value = "https://storage.example/upload.png"

    result = s3_service.generate_presigned_put_url(
        "branding/project/watermark/test.png", "image/png"
    )
    assert result == "https://storage.example/upload.png"
    client.generate_presigned_url.assert_called_once_with(
        "put_object",
        Params={
            "Bucket": s3_service.settings.s3_bucket,
            "Key": "branding/project/watermark/test.png",
            "ContentType": "image/png",
        },
        ExpiresIn=3600,
    )


def test_watermark_task_is_routed_to_transcoding_worker():
    route = celery_app.conf.task_routes["apply_watermark"]

    assert route == {"queue": "transcoding"}


@patch("apps.api.tasks.watermark_tasks._publish_event")
@patch("apps.api.tasks.watermark_tasks.subprocess.run")
@patch("apps.api.services.s3_service.put_object")
@patch("apps.api.services.s3_service.get_s3_client")
@patch("apps.api.tasks.watermark_tasks.SessionLocal")
def test_watermark_task_uses_requested_version_and_target_key(
    session_local, get_s3, put_object, run_ffmpeg, publish,
):
    from apps.api.models.asset import AssetType

    asset_id = uuid.uuid4()
    version_id = uuid.uuid4()
    asset = MagicMock(id=asset_id, project_id=uuid.uuid4(), asset_type=AssetType.video)
    version = MagicMock(id=version_id)
    source = MagicMock(original_filename="source.mp4", s3_key_raw="raw/source.mp4")

    asset_query = MagicMock()
    asset_query.filter.return_value.first.return_value = asset
    version_query = MagicMock()
    version_query.filter.return_value.filter.return_value.order_by.return_value.first.return_value = version
    media_query = MagicMock()
    media_query.filter.return_value.first.return_value = source
    db = MagicMock()
    db.query.side_effect = [asset_query, version_query, media_query]
    session_local.return_value = db

    get_s3.return_value.download_file.side_effect = (
        lambda _bucket, _key, filename: Path(filename).write_bytes(b"source")
    )
    run_ffmpeg.side_effect = (
        lambda command, **_kwargs: Path(command[-1]).write_bytes(b"rendered")
    )
    target_key = f"watermarked/{asset_id}/{version_id}/fingerprint.mp4"

    apply_watermark.run(
        str(asset_id), "CONFIDENTIAL", "corner", 0.3, None,
        str(version_id), target_key,
    )

    put_object.assert_called_once()
    assert put_object.call_args.args[0] == target_key
    assert put_object.call_args.args[2] == "video/mp4"
    run_ffmpeg.assert_called_once()
