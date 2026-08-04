import uuid
from unittest.mock import MagicMock, patch


def _watermarked_stream_mocks():
    from apps.api.models.asset import AssetType

    asset_id = uuid.uuid4()
    version_id = uuid.uuid4()
    link = MagicMock()
    link.id = uuid.uuid4()
    link.asset_id = asset_id
    link.allow_download = True
    link.show_watermark = True

    asset = MagicMock()
    asset.id = asset_id
    asset.name = "review.mp4"
    asset.asset_type = AssetType.video
    asset.project_id = uuid.uuid4()

    media = MagicMock()
    media.version_id = version_id
    media.original_filename = "review.mp4"
    media.duration_seconds = 12.0
    media.s3_key_thumbnail = None

    watermark = MagicMock()
    watermark.id = uuid.uuid4()
    watermark.enabled = True
    watermark.content = "custom_text"
    watermark.custom_text = "CONFIDENTIAL"
    watermark.image_s3_key = None
    watermark.position = "corner"
    watermark.opacity = 0.3
    return asset_id, link, asset, media, watermark


@patch("apps.api.routers.share._queue_public_watermark")
@patch("apps.api.routers.share.object_exists", return_value=False)
@patch("apps.api.routers.share._validate_asset_in_share")
@patch("apps.api.routers.share._get_latest_media_file")
@patch("apps.api.routers.share._get_asset")
@patch("apps.api.routers.share.validate_share_link_with_session")
def test_public_watermark_is_queued_instead_of_leaking_original(
    validate_link, get_asset, get_media, validate_asset, exists, queue, client, mock_db,
):
    asset_id, link, asset, media, watermark = _watermarked_stream_mocks()
    validate_link.return_value = link
    get_asset.return_value = asset
    get_media.return_value = media
    mock_db.query.return_value.filter.return_value.first.return_value = watermark

    response = client.get(f"/share/token/stream/{asset_id}")

    assert response.status_code == 202
    assert response.json()["status"] == "watermark_processing"
    queue.assert_called_once()


@patch("apps.api.routers.share._log_share_activity")
@patch("apps.api.routers.share.generate_presigned_get_url")
@patch("apps.api.routers.share.object_exists", return_value=True)
@patch("apps.api.routers.share._validate_asset_in_share")
@patch("apps.api.routers.share._get_latest_media_file")
@patch("apps.api.routers.share._get_asset")
@patch("apps.api.routers.share.validate_share_link_with_session")
def test_public_watermark_derivative_is_used_for_stream_and_download(
    validate_link, get_asset, get_media, validate_asset, exists, presign, log, client, mock_db,
):
    asset_id, link, asset, media, watermark = _watermarked_stream_mocks()
    validate_link.return_value = link
    get_asset.return_value = asset
    get_media.return_value = media
    mock_db.query.return_value.filter.return_value.first.return_value = watermark
    presign.return_value = "https://s3.example/watermarked.mp4"

    response = client.get(f"/share/token/stream/{asset_id}?download=true")

    assert response.status_code == 200
    assert response.json()["url"] == "https://s3.example/watermarked.mp4"
    key = presign.call_args.args[0]
    assert key.startswith(f"watermarked/{asset_id}/{media.version_id}/")
    assert key.endswith(".mp4")
    assert presign.call_args.kwargs["download_filename"]
