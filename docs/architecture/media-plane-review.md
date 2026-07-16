# Media Plane Review Architecture

## Goal

Adapt FreeFrame into a headless review engine for the Plane fork at `AlexLite/media-plane`.

The user works only in Plane. FreeFrame provides media upload, transcoding, playback data, versions, frame-accurate review comments, annotations, and review status behind a Plane-native Review component. Premiere integration is added later against the same Plane-facing review API.

## System boundary

```text
Plane web / Plane API
        |
        | short-lived scoped review session
        v
FreeFrame Media Plane Review API
        |
        +-- PostgreSQL: review metadata/comments/versions
        +-- Redis: jobs/events
        +-- S3/MinIO: originals/previews/thumbnails
        +-- FFmpeg workers: preview generation

Premiere UXP (later)
        |
        +-- authenticates through Plane
        +-- reads/writes review markers through Plane Review API
```

## Source-of-truth ownership

### Plane owns

- users and authentication;
- workspaces and projects;
- work items;
- groups and work-item permissions;
- ordinary work-item discussion;
- the compact review projection shown on a work item.

### FreeFrame owns

- review assets;
- media versions;
- upload/transcode lifecycle;
- HLS/previews/thumbnails;
- frame-accurate comments and replies;
- annotations;
- review/approval state;
- structured media timing metadata.

Plane must not duplicate the full FreeFrame review database. FreeFrame must not become a second user-facing workspace.

## Review-link projection in Plane

Plane should eventually store only a compact link/projection similar to:

```text
ReviewLink
- issue_id
- provider = freeframe
- external_asset_id
- current_version_id
- review_status
- open_comments_count
- last_activity_at
```

The projection is refreshed through API responses and/or webhooks. It is not the source of truth for review comments.

## Comment and timing contract

Ordinary Plane comments stay in Plane. Timecoded review comments stay in FreeFrame.

A review position is structured data:

```json
{
  "version_id": "uuid",
  "frame_number": 1842,
  "fps_numerator": 25,
  "fps_denominator": 1,
  "range_end_frame": null
}
```

Rules:

- `frame_number` is the canonical position for NLE exchange.
- FPS is rational to support rates such as 24000/1001 and 30000/1001.
- Display timecode is derived by clients and is never the primary stored position.
- A comment is always scoped to a concrete media version.
- Optional ranges use `range_end_frame`; a single-frame comment leaves it null.
- Drop-frame display behavior is metadata/presentation and must not change the canonical frame number.

## Identity and authorization

Plane is the canonical identity provider.

FreeFrame receives a short-lived Plane-issued token with:

```json
{
  "iss": "media-plane",
  "aud": "freeframe-review",
  "sub": "plane-user-uuid",
  "workspace_id": "uuid",
  "project_id": "uuid",
  "issue_id": "uuid",
  "email": "user@example.com",
  "name": "User Name",
  "scopes": ["review:read", "review:comment"],
  "exp": 1780000000
}
```

Security rules:

- verify signature, issuer, audience, expiry, and required work-item scope;
- use short expirations and minimal scopes;
- never expose FreeFrame service credentials to the browser or Premiere;
- never reuse the normal FreeFrame `JWT_SECRET` as the Plane integration secret;
- create/find shadow FreeFrame users by Plane user UUID only after token validation;
- authorize each request against token scopes and the referenced work item/review asset.

The initial code slice only establishes configuration and strict claim validation. Session exchange, shadow-user persistence, and resource authorization are separate reviewed changes.

## Plane-facing API direction

The stable public contract should be exposed by Plane, with Plane acting as a BFF/proxy. A possible Plane API surface is:

```text
GET    /api/v1/workspaces/{workspace}/projects/{project}/issues/{issue}/review/
POST   /api/v1/workspaces/{workspace}/projects/{project}/issues/{issue}/review/link/
POST   /api/v1/workspaces/{workspace}/projects/{project}/issues/{issue}/review/versions/
GET    /api/v1/workspaces/{workspace}/projects/{project}/issues/{issue}/review/comments/
POST   /api/v1/workspaces/{workspace}/projects/{project}/issues/{issue}/review/comments/
PATCH  /api/v1/workspaces/{workspace}/projects/{project}/issues/{issue}/review/comments/{comment}/
POST   /api/v1/review/webhooks/freeframe/
```

FreeFrame can expose an internal integration API, but it should not force the Plane browser component to use long-lived FreeFrame sessions.

## UI direction

The current staging UI is:

1. a compact Review widget on the work item with explicit linked, unlinked, and permission-limited states;
2. a centered, near-full-screen Plane modal that mounts the scoped cross-origin FreeFrame review application only while open;
3. a responsive player/comments split with version switching, uploads, timecoded comments, and Fabric.js annotations;
4. integration UI copy resolved from FreeFrame locale dictionaries using the active locale sent by Plane.

The longer-term preferred Plane UI remains:

1. a compact Review widget on the work item with thumbnail, current version, status, and open-comment count;
2. a Plane-native full-screen Review workspace/drawer with player, versions, comments, annotations, and timeline;
3. no iframe for the production integration;
4. FreeFrame's standalone web application retained only for engine diagnostics during the transition, then optionally excluded from production exposure.

## Storage and lifecycle

- FreeFrame uses S3-compatible storage; there is no local-filesystem media backend.
- The initial LXC may use MinIO on the root disk for development.
- A later dedicated disk mounted at `/srv/freeframe-media` can replace the MinIO data mount.
- The MVP media lifecycle is temporary review storage, not archive storage.
- Destructive retention and orphan cleanup remain disabled/report-only until explicitly designed and approved.
- PostgreSQL metadata must be backed up independently from temporary media.

## Implementation phases

### Phase 0 — fork foundation

- copy the `media-plane` branch/PR/release workflow;
- record upstream and fork release versions;
- add architecture invariants;
- add opt-in Plane integration configuration;
- add strict Plane token claim validation and tests.

### Phase 1 — headless identity and asset linkage

- implement Plane session exchange;
- map Plane users to shadow FreeFrame users;
- add work-item/review-asset linkage;
- expose upload/version creation and processing status;
- return thumbnail/current-version review summaries.

### Phase 2 — native Plane review workspace

- expose comments, replies, resolve state, annotations, and version switching;
- add webhook/event projection updates to Plane;
- render the player and timeline natively in Plane;
- stop relying on the standalone FreeFrame frontend for end-user review.

### Phase 3 — Premiere UXP

- authenticate through Plane;
- select a Plane work item and review version;
- upload/export a new review version;
- convert structured review comments to Premiere markers;
- synchronize marker/comment resolution state.

## Non-goals for the MVP

- media archive or DAM;
- release approval server;
- long-term original-media preservation;
- mirroring timecoded comments into ordinary Plane comments;
- parsing Plane text timecodes for frame positions;
- exposing FreeFrame admin/service credentials to clients;
- broad visual rebranding before the integration path works.
