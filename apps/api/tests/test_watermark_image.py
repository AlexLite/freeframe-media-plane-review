from apps.api.schemas.branding import WatermarkResponse, WatermarkUpdate


def test_watermark_update_accepts_png_image_content():
    update = WatermarkUpdate(content="image", image_s3_key="branding/project/watermark/test.png")

    assert update.content == "image"
    assert update.image_s3_key.endswith(".png")


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
