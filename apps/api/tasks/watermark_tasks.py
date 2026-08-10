import uuid
import tempfile
import os
import subprocess
import json
import sys

# Ensure the workspace root is on the path (same pattern as transcode_tasks)
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from .celery_app import celery_app
from ..database import SessionLocal
from ..models.asset import Asset, MediaFile
from ..config import settings


def _run_video_ffmpeg(cmd: list[str], *, timeout: int = 600) -> None:
    """Prefer NVENC on GPU workers and retry with libx264 if it fails."""
    use_nvenc = (
        os.getenv("FFMPEG_ACCELERATION", "auto").strip().lower() != "cpu"
        and os.path.exists("/dev/nvidia0")
    )
    codec = (
        ["-c:v", "h264_nvenc", "-preset", os.getenv("NVENC_PRESET", "p4"), "-cq", "23"]
        if use_nvenc
        else ["-c:v", "libx264", "-preset", "fast", "-crf", "23"]
    )
    gpu_cmd = list(cmd[:-1]) + codec + [cmd[-1]]
    try:
        subprocess.run(gpu_cmd, check=True, timeout=timeout)
    except (subprocess.CalledProcessError, OSError):
        if not use_nvenc:
            raise
        cpu_cmd = list(cmd[:-1]) + [
            "-c:v", "libx264", "-preset", "fast", "-crf", "23", cmd[-1]
        ]
        subprocess.run(cpu_cmd, check=True, timeout=timeout)


def build_image_watermark_filter(position: str, opacity: float, image_scale: str = "fit") -> str:
    """Build an FFmpeg graph for one centered/corner image or a real 3x3 tile."""
    if position != "tiled":
        x, y = (
            ("(main_w-overlay_w)/2", "(main_h-overlay_h)/2")
            if position == "center"
            else ("main_w-overlay_w-20", "main_h-overlay_h-20")
        )
        scale_filter = "" if image_scale == "original" else "scale=w='min(300,iw)':h=-1,"
        return (
            f"[1:v]{scale_filter}format=rgba,"
            f"colorchannelmixer=aa={opacity}[wm];"
            f"[0:v][wm]overlay=x={x}:y={y}[outv]"
        )

    labels = "".join(f"[wm{i}]" for i in range(9))
    graph = (
        f"[1:v]scale=w='min(180,iw)':h=-1,format=rgba,"
        f"colorchannelmixer=aa={opacity},split=9{labels};"
    )
    previous = "0:v"
    index = 0
    for row in (0.1, 0.5, 0.9):
        for column in (0.1, 0.5, 0.9):
            output = "outv" if index == 8 else f"tile{index}"
            graph += (
                f"[{previous}][wm{index}]overlay="
                f"x='(main_w-overlay_w)*{column}':"
                f"y='(main_h-overlay_h)*{row}'[{output}]"
            )
            if index != 8:
                graph += ";"
            previous = output
            index += 1
    return graph


def _publish_event(project_id: str, event_type: str, payload: dict):
    """Publish SSE event via Redis from Celery worker context (best-effort)."""
    try:
        import redis as sync_redis
        r = sync_redis.from_url(settings.redis_url, decode_responses=True)
        message = json.dumps({"type": event_type, "payload": payload})
        r.publish(f"project:{project_id}", message)
        r.close()
    except Exception:
        pass


@celery_app.task(name="apply_watermark", bind=True, max_retries=3, default_retry_delay=60)
def apply_watermark(
    self,
    asset_id: str,
    watermark_text: str,
    position: str,
    opacity: float,
    image_key: str | None,
    version_id: str | None = None,
    target_key: str | None = None,
    image_scale: str = "fit",
):
    """Burn a watermark into a video asset and upload the MP4 derivative to S3."""
    from ..services.s3_service import get_s3_client, put_object

    db = SessionLocal()
    try:
        asset = db.query(Asset).filter(
            Asset.id == uuid.UUID(asset_id),
            Asset.deleted_at.is_(None),
        ).first()
        if not asset:
            return
        from ..models.asset import AssetType
        if asset.asset_type != AssetType.video:
            return

        # Find the first media file for this asset (via latest version)
        from ..models.asset import AssetVersion
        latest_version_query = (
            db.query(AssetVersion)
            .filter(
                AssetVersion.asset_id == asset.id,
                AssetVersion.deleted_at.is_(None),
            )
        )
        if version_id:
            latest_version_query = latest_version_query.filter(AssetVersion.id == uuid.UUID(version_id))
        latest_version = latest_version_query.order_by(AssetVersion.version_number.desc()).first()
        if not latest_version:
            return

        source = db.query(MediaFile).filter(
            MediaFile.version_id == latest_version.id
        ).first()
        if not source:
            return

        s3 = get_s3_client()

        with tempfile.TemporaryDirectory() as tmp:
            # Determine file extension from original filename
            _, ext = os.path.splitext(source.original_filename)
            ext = ext.lower() or ".mp4"
            local_path = os.path.join(tmp, f"source{ext}")

            # Download source from S3
            s3.download_file(settings.s3_bucket, source.s3_key_raw, local_path)

            output_ext = ".mp4"
            output_path = os.path.join(tmp, f"watermarked_{asset_id}{output_ext}")

            # Build either an image overlay or a text watermark.
            vf_filters = []
            if image_key:
                image_path = os.path.join(tmp, "watermark.png")
                s3.download_file(settings.s3_bucket, image_key, image_path)
                filter_complex = build_image_watermark_filter(position, opacity, image_scale)
                cmd = [
                    "ffmpeg", "-y",
                    "-i", local_path,
                    "-i", image_path,
                    "-filter_complex", filter_complex,
                    "-map", "[outv]",
                    "-map", "0:a?",
                    "-c:a", "copy",
                    output_path,
                ]
                _run_video_ffmpeg(cmd)
            elif watermark_text:
                escaped = watermark_text.replace("'", r"'\''").replace(":", r"\:")
                fontsize = 24
                if position == "center":
                    x, y = "(w-text_w)/2", "(h-text_h)/2"
                elif position == "tiled":
                    x, y = "w/4", "h/4"
                else:  # corner / bottom_right
                    x, y = "w-text_w-10", "h-text_h-10"
                vf_filters.append(
                    f"drawtext=text='{escaped}':fontsize={fontsize}"
                    f":fontcolor=white@{opacity}:x={x}:y={y}"
                )
                if position == "tiled":
                    for x_factor in ("w/2", "3*w/4"):
                        for y_factor in ("h/4", "h/2", "3*h/4"):
                            vf_filters.append(
                                f"drawtext=text='{escaped}':fontsize={fontsize}"
                                f":fontcolor=white@{opacity}:x={x_factor}:y={y_factor}"
                            )
                    for y_factor in ("h/2", "3*h/4"):
                        vf_filters.append(
                            f"drawtext=text='{escaped}':fontsize={fontsize}"
                            f":fontcolor=white@{opacity}:x=w/4:y={y_factor}"
                        )

            if image_key:
                pass
            elif vf_filters:
                cmd = [
                    "ffmpeg", "-y",
                    "-i", local_path,
                    "-vf", ",".join(vf_filters),
                    "-c:a", "copy",
                    output_path,
                ]
                _run_video_ffmpeg(cmd)
            else:
                # No watermark text — copy as-is
                output_path = local_path

            # Upload watermarked file back to S3
            wm_key = target_key or f"watermarked/{asset_id}/{latest_version.id}/output{output_ext}"
            with open(output_path, "rb") as f:
                put_object(wm_key, f.read(), "video/mp4")

        # Publish SSE event (best-effort)
        _publish_event(
            str(asset.project_id),
            "watermark_complete",
            {"asset_id": asset_id, "key": wm_key},
        )

    except Exception as exc:
        raise self.retry(exc=exc)
    finally:
        db.close()
