from types import SimpleNamespace

from apps.api.routers.plane_review_bootstrap import _version_timing
from apps.api.schemas.plane_review_bootstrap import PlaneReviewVersionSummary
from apps.api.tasks.transcode_tasks import _apply_video_metadata


def test_version_timing_recovers_ntsc_rational_rate():
    media_file = SimpleNamespace(
        duration_seconds=61.5,
        fps=30000 / 1001,
    )

    assert _version_timing(media_file) == (61.5, 30000, 1001)


def test_version_timing_fails_closed_for_missing_or_invalid_metadata():
    assert _version_timing(None) == (None, None, None)
    assert _version_timing(
        SimpleNamespace(duration_seconds=-1, fps=0)
    ) == (None, None, None)


def test_processed_video_metadata_is_persisted_on_media_file():
    media_file = SimpleNamespace(
        duration_seconds=None,
        width=None,
        height=None,
        fps=None,
    )
    metadata = SimpleNamespace(
        duration_seconds=42.25,
        width=1920,
        height=1080,
        fps=25.0,
    )

    _apply_video_metadata(media_file, metadata)

    assert media_file.duration_seconds == 42.25
    assert media_file.width == 1920
    assert media_file.height == 1080
    assert media_file.fps == 25.0


def test_version_summary_exposes_optional_rational_timing_fields():
    summary = PlaneReviewVersionSummary(
        id="11111111-1111-4111-8111-111111111111",
        version_number=1,
        processing_status="ready",
        created_by="22222222-2222-4222-8222-222222222222",
        duration_seconds=10.0,
        fps_numerator=24000,
        fps_denominator=1001,
    )

    assert summary.duration_seconds == 10.0
    assert summary.fps_numerator == 24000
    assert summary.fps_denominator == 1001
