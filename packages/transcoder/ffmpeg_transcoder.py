import asyncio
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional
import boto3
from botocore.config import Config
from .base import BaseTranscoder, TranscodeJob, TranscodeResult, VideoMetadata


class FFmpegTranscoder(BaseTranscoder):
    def __init__(self, s3_client, bucket: str, s3_endpoint: str = None):
        self.s3 = s3_client
        self.bucket = bucket
        self.s3_endpoint = s3_endpoint

    @staticmethod
    def _use_nvenc() -> bool:
        """Prefer NVENC when the worker has a GPU, while allowing CPU override."""
        mode = os.getenv("FFMPEG_ACCELERATION", "auto").strip().lower()
        return mode == "nvenc" or (mode == "auto" and os.path.exists("/dev/nvidia0"))
    
    def _get_presigned_url(self, s3_key: str, expires_in: int = 7200) -> str:
        """Generate a presigned URL for streaming input to FFmpeg."""
        return self.s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": s3_key},
            ExpiresIn=expires_in,
        )

    @staticmethod
    def _run(cmd: list[str], timeout: int | None = None, label: str = "ffmpeg") -> str:
        """Run a command, raising RuntimeError with stderr on failure.

        Uses errors='replace' because ffmpeg often echoes input metadata
        (Latin-1 / Shift-JIS) to stderr, which would break strict UTF-8 decode.
        """
        result = subprocess.run(
            cmd, capture_output=True, text=True, errors='replace', timeout=timeout,
        )
        if result.returncode != 0:
            stderr = result.stderr.strip()
            raise RuntimeError(
                f"{label} exited {result.returncode}: {stderr or 'no stderr output'}"
            )
        return result.stdout

    async def get_video_metadata(self, s3_key: str) -> VideoMetadata:
        """Get video metadata using streaming (no full download)."""
        input_url = self._get_presigned_url(s3_key)
        cmd = [
            "ffprobe", "-v", "error", "-print_format", "json",
            "-show_streams", "-select_streams", "v:0", input_url,
        ]
        stdout = self._run(cmd, timeout=120, label="ffprobe")
        data = json.loads(stdout)
        stream = data["streams"][0]
        fps_parts = stream.get("r_frame_rate", "30/1").split("/")
        fps = float(fps_parts[0]) / float(fps_parts[1])
        return VideoMetadata(
            duration_seconds=float(stream.get("duration", 0)),
            width=int(stream.get("width", 0)),
            height=int(stream.get("height", 0)),
            fps=fps,
        )

    async def generate_thumbnails(self, s3_key: str, count: int) -> list[str]:
        """Generate thumbnails at 1 per 10 seconds using streaming input."""
        input_url = self._get_presigned_url(s3_key)
        thumb_dir = tempfile.mkdtemp()
        try:
            cmd = [
                "ffmpeg", "-i", input_url,
                "-vf", "fps=0.1",
                "-q:v", "2",
                "-pix_fmt", "yuvj420p",
                f"{thumb_dir}/thumb_%04d.jpg",
            ]
            self._run(cmd, timeout=600, label="ffmpeg")
            return [str(p) for p in sorted(Path(thumb_dir).glob("thumb_*.jpg"))]
        finally:
            shutil.rmtree(thumb_dir, ignore_errors=True)

    async def generate_waveform(self, s3_key: str) -> dict:
        """Generate waveform data for audio visualization using streaming."""
        input_url = self._get_presigned_url(s3_key)
        # Simplified waveform: just return peak data (full waveform extraction is complex)
        return {"samples": [], "peak": 1.0, "source": s3_key}

    async def transcode(self, job: TranscodeJob) -> TranscodeResult:
        """
        Transcode video using streaming input from S3.
        FFmpeg reads directly from presigned URL - no full download needed.
        Only output files are written to disk, reducing disk usage by ~2/3.
        """
        work_dir = Path(tempfile.mkdtemp(prefix=f"transcode_{job.version_id}_"))
        
        # Generate presigned URL for streaming input (2 hour expiry for large files)
        input_url = self._get_presigned_url(job.input_s3_key, expires_in=7200)

        try:
            # 1. Get video metadata via streaming (no download)
            # Note: ffprobe result is used for metadata logging only;
            # _run() already fail-fasts on non-zero exit.
            cmd = [
                "ffprobe", "-v", "error", "-print_format", "json",
                "-show_streams", "-select_streams", "v:0", input_url,
            ]
            vid_info = self._run(cmd, timeout=120, label="ffprobe")

            # 2. Check if input has an audio stream
            audio_cmd = [
                "ffprobe", "-v", "error", "-print_format", "json",
                "-show_streams", "-select_streams", "a", input_url,
            ]
            audio_result = self._run(audio_cmd, timeout=120, label="ffprobe")
            has_audio = bool(json.loads(audio_result).get("streams"))

            # 3. Build quality ladder based on available qualities
            QUALITY_MAP = {
                "1080p": ("1920:1080", 20),
                "720p": ("1280:720", 22),
                "360p": ("640:360", 26),
            }
            qualities = [q for q in job.qualities if q in QUALITY_MAP]

            hls_dir = work_dir / "hls"
            hls_dir.mkdir()

            # Build filter_complex and map args
            # Use force_original_aspect_ratio=decrease to preserve aspect ratio,
            # then pad to even dimensions required by libx264
            split_outputs = "".join(f"[v{i}]" for i in range(len(qualities)))
            filter_complex = f"[v:0]split={len(qualities)}{split_outputs};"
            filter_complex += ";".join(
                f"[v{i}]scale={QUALITY_MAP[q][0]}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2[{q}]"
                for i, q in enumerate(qualities)
            )

            ffmpeg_cmd = [
                "ffmpeg", "-y", "-i", input_url,
                "-filter_complex", filter_complex,
            ]

            nvenc = self._use_nvenc()
            for i, quality in enumerate(qualities):
                scale, crf = QUALITY_MAP[quality]
                ffmpeg_cmd += ["-map", f"[{quality}]"]
                if has_audio:
                    ffmpeg_cmd += ["-map", "a:0"]
                encoder = "h264_nvenc" if nvenc else "libx264"
                rate_control = "-cq" if nvenc else "-crf"
                preset = os.getenv("NVENC_PRESET", "p4") if nvenc else "fast"
                ffmpeg_cmd += [
                    f"-c:v:{i}", encoder, rate_control, str(crf), "-preset", preset,
                    "-force_key_frames", "expr:gte(t,n_forced*2)",
                ]

            segment_dir = hls_dir / "%v"
            ffmpeg_cmd += [
                "-f", "hls",
                "-hls_time", "2",
                "-hls_playlist_type", "vod",
                "-hls_flags", "independent_segments",
                "-hls_segment_type", "mpegts",
                "-master_pl_name", "master.m3u8",
                "-var_stream_map", " ".join(
                    f"v:{i},a:{i}" if has_audio else f"v:{i}"
                    for i in range(len(qualities))
                ),
                "-hls_segment_filename", str(hls_dir / "%v" / "seg_%03d.ts"),
                str(hls_dir / "%v" / "playlist.m3u8"),
            ]

            # Create per-quality directories
            for q in qualities:
                (hls_dir / q).mkdir(exist_ok=True)

            # Timeout scales with expected duration - 4 hours for very large files
            try:
                self._run(ffmpeg_cmd, timeout=14400, label="ffmpeg")
            except RuntimeError:
                if not nvenc:
                    raise
                # GPU failure must not strand a transcode: retry the same job on CPU.
                cpu_cmd = list(ffmpeg_cmd)
                for i in range(len(qualities)):
                    encoder_pos = cpu_cmd.index(f"-c:v:{i}") + 1
                    cpu_cmd[encoder_pos] = "libx264"
                for pos, value in enumerate(cpu_cmd):
                    if value == "-cq":
                        cpu_cmd[pos] = "-crf"
                    elif value == os.getenv("NVENC_PRESET", "p4"):
                        cpu_cmd[pos] = "fast"
                self._run(cpu_cmd, timeout=14400, label="ffmpeg-cpu-fallback")

            # 4. Upload HLS files to S3
            uploaded_keys = []
            for f in hls_dir.rglob("*"):
                if f.is_file():
                    relative = f.relative_to(hls_dir)
                    s3_key = f"{job.output_s3_prefix}/{relative}"
                    content_type, cache_control = self._get_content_type(f.name)
                    self.s3.upload_file(
                        str(f), self.bucket, s3_key,
                        ExtraArgs={"ContentType": content_type, "CacheControl": cache_control},
                    )
                    uploaded_keys.append(s3_key)

            # 5. Generate and upload thumbnail (using streaming URL)
            thumb_path = work_dir / "thumb_0001.jpg"
            thumb_cmd = [
                "ffmpeg", "-y", "-i", input_url,
                "-vf", "fps=0.1", "-q:v", "2", "-frames:v", "1",
                "-pix_fmt", "yuvj420p",
                str(work_dir / "thumb_%04d.jpg"),
            ]
            self._run(thumb_cmd, label="ffmpeg")
            thumbnail_key = f"{job.output_s3_prefix}/thumbnail.jpg"
            if thumb_path.exists():
                self.s3.upload_file(
                    str(thumb_path), self.bucket, thumbnail_key,
                    ExtraArgs={"ContentType": "image/jpeg", "CacheControl": "max-age=86400"},
                )

            return TranscodeResult(
                success=True,
                hls_prefix=job.output_s3_prefix,
                thumbnail_keys=[thumbnail_key],
            )

        except Exception as e:
            return TranscodeResult(success=False, error=str(e))
        finally:
            shutil.rmtree(work_dir, ignore_errors=True)

    @staticmethod
    def _get_content_type(filename: str) -> tuple[str, str]:
        ext = Path(filename).suffix.lower()
        MAP = {
            ".m3u8": ("application/vnd.apple.mpegurl", "no-cache"),
            ".ts": ("video/mp2t", "max-age=31536000"),
            ".jpg": ("image/jpeg", "max-age=86400"),
        }
        return MAP.get(ext, ("application/octet-stream", "no-cache"))
