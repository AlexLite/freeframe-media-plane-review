# Changelog

All notable changes to FreeFrame are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Plane review bindings can be unlinked safely** — scoped Plane administrators can remove an asset binding through an idempotent, exact-context `DELETE /integrations/plane/assets/{asset_id}/link` operation, allowing Plane to compensate or reconnect review assets without exposing a broader FreeFrame credential.

## [1.4.1] - 2026-07-09

### Fixed
- **Celery workers no longer report `unhealthy`** — the prod image no longer bakes an API-only `HEALTHCHECK` (`curl :8000/health`); it now lives on the `api` service in `docker-compose.prod.yml`, so `worker`/`beat`/`email_worker` (which don't serve HTTP) report their real state instead of perpetually unhealthy.
- **A slow or unreachable object store no longer blocks app startup** — the startup S3 bucket check now runs off the request path (background thread) with bounded timeouts and never crashes/hangs the app (previously a slow S3 could block startup ~60s+). It retries a transient failure with backoff, so a store that comes up shortly after start self-heals without a manual restart; a persistent failure logs a clear warning.
- **Email is documented as required for login, with a startup warning** — FreeFrame signs users in via emailed magic codes, so without a working mailer nobody can log in. The app now logs a clear warning at startup when email isn't configured, and `docs/deployment.md` + `.env.example` call it out.

## [1.4.0] - 2026-07-09

### Upgrade notes
- **S3 misconfiguration now fails fast.** If you set `S3_STORAGE=s3` (native AWS) together with a non-AWS `S3_ENDPOINT`, the app refuses to start with a clear error — use `S3_STORAGE=minio` (or any non-`s3` value) for R2/B2/Spaces/MinIO. Valid setups are unaffected.
- **boto3 1.35 → 1.43 + older S3-compatible backends.** boto3 now sends CRC32 checksums on batch deletes; MinIO/Ceph older than ~2025 reject them. `delete_prefix` falls back to per-key deletes automatically and the bundled dev MinIO is bumped — but for the fast path, upgrade an external older store.
- **Browser uploads need bucket CORS `ExposeHeaders: ["ETag"]`** (especially Hetzner, where CORS is API/CLI-only). See `docs/deployment.md`.
- **Release channels:** production self-hosters should now `git clone -b stable` instead of `main`.

### Added
- **`stable` / `latest` release channels** ([#140](https://github.com/Techiebutler/freeframe/pull/140)) — moving branch pointers on top of the immutable `vX.Y.Z` tags. `stable` = last validated release (production default), `latest` = newest release; a bad release is never promoted. See the README "Release channels" table and `docs/RELEASING.md`.

### Changed
- **Faster review playback for long videos** ([#132](https://github.com/Techiebutler/freeframe/issues/132)) — the HLS proxy no longer rebuilds a boto3 client per segment when rewriting a VOD manifest (previously ~7s of blocking overhead for a ~55-minute video); clients are now cached.
- **Dependency updates** — FastAPI 0.115 → 0.139, boto3 1.35 → 1.43, python-multipart 0.0.12 → 0.0.32, kombu 5.4 → 5.6, hls.js 1.6.15 → 1.6.16, wavesurfer.js 7.12.5 → 7.12.10 (plus dev/CI: vitest, pytest-asyncio, actions/checkout v7). The frontend now uses pnpm as the single lockfile.

### Fixed
- **S3 prefix cleanup stays compatible with older S3-compatible storage** ([#97](https://github.com/Techiebutler/freeframe/pull/97)) — boto3/botocore ≥ 1.36 send a CRC32 data-integrity checksum on batch `DeleteObjects` instead of the legacy `Content-MD5` header; S3-compatible backends predating AWS flexible checksums (MinIO older than ~2025, older Ceph/RGW, etc.) reject it with `MissingContentMD5`, which would break HLS/prefix cleanup (`delete_prefix`). `delete_prefix` now falls back to per-key deletes when a backend rejects the batch delete, and the bundled dev MinIO image is bumped to a release that supports the new checksums. `put_object`/multipart uploads are unaffected.
- **Misconfigured S3 storage fails fast instead of silently routing to AWS** ([#137](https://github.com/Techiebutler/freeframe/pull/137)) — with `S3_STORAGE=s3` (native AWS), `S3_ENDPOINT` is ignored, so pairing it with a non-AWS endpoint (Cloudflare R2, Backblaze B2, self-hosted MinIO, …) used to silently send traffic to AWS. Startup now raises a clear error naming the offending endpoint and pointing to `S3_STORAGE=minio`.
- **Browser multipart uploads: required bucket CORS `ETag` documented + surfaced** ([#131](https://github.com/Techiebutler/freeframe/issues/131)) — uploads read each part's `ETag` response header, which browsers expose only when the bucket CORS `ExposeHeaders` includes it; documented in `docs/deployment.md` (with Hetzner/AWS notes), and the previously-silent `put_bucket_cors` failure now logs a warning.

## [1.3.1] - 2026-07-08

### Added
- **Version-aware public share player** ([#120](https://github.com/Techiebutler/freeframe/issues/120)) — on folder/project/multi-share links with **Show all versions** enabled, the shared asset viewer now shows a version switcher; selecting a version swaps the streamed media and scopes comments to that version. Previously only the latest version played and comments from every version were shown regardless of the selection. The folder/grid preview (which has no version picker) now scopes its comment list — and each asset card's comment count — to the latest ready version instead of counting/showing every version's comments. New guest endpoint `GET /share/{token}/assets/{asset_id}/versions` (exposes all ready versions only when the link enables version history, otherwise just the latest); `GET /share/{token}/stream/{asset_id}` and `GET /share/{token}/comments` now accept an optional `version_id` (comments also accept `latest_only`). The separate single-asset custom-player path is tracked in [#123](https://github.com/Techiebutler/freeframe/issues/123).
- **Share preview cards show a version-count badge and duration chip** — each asset card in the folder/grid share preview now shows a "⧉ N" badge when the asset has multiple ready versions, and the multi-share preview path now passes through media duration and file size (the duration chip renders once media duration is populated — currently blocked by [#124](https://github.com/Techiebutler/freeframe/issues/124)).

### Fixed
- **Passphrase-protected share previews no longer show "No content yet"** ([#119](https://github.com/Techiebutler/freeframe/issues/119)) — the public `/share/{token}/assets` and `/share/{token}/thumbnail/{asset_id}` endpoints now honor the authenticated link creator's passphrase bypass (matching `/share/{token}/stream/{asset_id}`), so the dashboard settings preview loads a password-protected link's assets instead of rendering an empty state.
- **Video version switcher now plays the selected version's stream** ([#66](https://github.com/Techiebutler/freeframe/issues/66)) — the review player fetched `/assets/{id}/stream` without a `version_id`, so switching versions updated the dropdown but the `<video>` kept playing the latest version's stream. The player now pins the stream to the selected version and re-fetches (resetting playback) when the version changes.
- **New asset versions appear without a hard refresh, with an in-progress indicator** ([#118](https://github.com/Techiebutler/freeframe/issues/118)) — the review screen now revalidates the version list from transcode SSE events instead of a single best-effort timer, so a freshly uploaded version shows up and advances through uploading → processing → ready on its own. The version switcher trigger now surfaces a spinner/label while a new version is still uploading or processing (previously that status was only visible inside the dropdown).

## [1.3.0] - 2026-07-07

### Upgrade notes

New garbage-collection features for [#65](https://github.com/Techiebutler/freeframe/issues/65), all with safe defaults — nothing runs unless you run `celery beat`, and the destructive parts are opt-in:

- **Retention GC activates if you run `celery beat`.** A daily `cleanup_soft_deleted` job hard-deletes rows soft-deleted longer than `SOFT_DELETE_RETENTION_DAYS` (default `30`) and deletes their S3 objects, cascading the full project→folder→asset→version→media/comment/share tree. Set `SOFT_DELETE_RETENTION_DAYS=0` to disable.
- **The S3 orphan sweeper is off and report-only by default.** It runs only when `ORPHAN_SWEEP_GRACE_HOURS > 0`, and even then only *reports* bucket objects with no DB row — it deletes only if you also set `ORPHAN_SWEEP_DELETE=true`. Review its report-only logs before enabling deletion.
- **No migration required** — the GC reuses the existing `deleted_at` columns.
- **New optional env vars, all safe-by-default:** `SOFT_DELETE_RETENTION_DAYS=30`, `ORPHAN_SWEEP_GRACE_HOURS=0` (disabled), `ORPHAN_SWEEP_DELETE=false` (report-only).

### Added
- **Retention-window garbage collection** ([#65](https://github.com/Techiebutler/freeframe/issues/65)) — a daily `cleanup_soft_deleted` job hard-deletes rows soft-deleted longer than `SOFT_DELETE_RETENTION_DAYS` (default 30, `0` disables) and reclaims their S3 objects, cascading through projects, folders, assets, versions, media, comments, approvals, and share links. Long-expired share links are swept into soft-delete first. No effect unless you run `celery beat`.
- **S3 orphan sweeper** ([#65](https://github.com/Techiebutler/freeframe/issues/65)) — an opt-in weekly `sweep_orphan_s3` job reclaims bucket objects under `raw/`/`processed/` that no `MediaFile` row references. **Off and report-only by default**: set `ORPHAN_SWEEP_GRACE_HOURS` > 0 to enable (only keys older than that window are considered, so active uploads are never touched) and `ORPHAN_SWEEP_DELETE=true` to actually delete (otherwise it just logs what it would reclaim). No effect unless you run `celery beat`.
- **Manual `POST /admin/purge` endpoint** — superadmin-only; triggers the retention collector to run in the background (returns `202`); reclaimed counts are logged by the worker.

### Changed
- **`POST /assets/{id}/restore` and `/folders/{id}/restore` now return `409`** when the item's project has been deleted — a deleted project has no restore path, so there is nothing to restore into.

## [1.2.0] - 2026-07-07

### Upgrade notes

Upgrading from v1.1.6 is non-breaking by default (the new storage cap and per-file limit both default to unlimited), but note:

- **Run `alembic upgrade head`.** This adds the `instance_settings` table and widens `MediaFile.file_size_bytes` / `CommentAttachment.file_size_bytes` to `BigInteger`. ⚠️ The bigint change **rewrites the `media_files` and `comment_attachments` tables under an `ACCESS EXCLUSIVE` lock** (int4→int8 is not an in-place change in PostgreSQL), blocking reads and writes for the duration of the rewrite. Negligible on small installs; on a large `media_files` table, **run it during a low-traffic maintenance window.**
- **The upload reaper activates if you run `celery beat`.** An hourly job aborts stale, still-open S3 multipart uploads and soft-deletes `uploading`/`failed` versions older than `STALE_UPLOAD_TIMEOUT_HOURS` (default `24`), deleting their S3 objects. Raise the value to be more conservative, or set it to `0` to disable. No effect if you don't run `celery beat`.
- **New optional env vars, both with safe defaults:** `MAX_UPLOAD_BYTES=0` (unlimited per-file size) and `STALE_UPLOAD_TIMEOUT_HOURS=24`.
- **No behavior change until you opt in** — set an instance storage cap via the admin **Instance settings** tab (or `PUT /instance/settings`) when you want to enforce one.

### Added
- **Storage cap admin UI + sidebar indicator** ([#102](https://github.com/Techiebutler/freeframe/pull/102)) — the global sidebar shows instance storage `used / limit` with a meter (amber ≥80%, red ≥90%); admins set the cap in GB (`0` = unlimited) in a new **Instance settings** sub-tab on the admin settings page. Frontend for the #98 storage cap.
- **Automatic reclamation of stuck/failed upload storage** ([#101](https://github.com/Techiebutler/freeframe/pull/101)) — a scoped slice of #65: an hourly job aborts stale, still-open S3 multipart uploads and soft-deletes `uploading`/`failed` versions older than `STALE_UPLOAD_TIMEOUT_HOURS` (default 24), reclaiming their S3 objects. Prevents unbounded storage leak from interrupted/failed uploads that the committed-only cap doesn't count.
