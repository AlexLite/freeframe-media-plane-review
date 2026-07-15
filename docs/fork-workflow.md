# Fork Workflow

This repository is the deployable source of truth for the Media Plane Review fork of FreeFrame.

Plane is the only user-facing workspace. FreeFrame is an internal media-review engine used for upload, transcode, versioning, frame-accurate comments, annotations, and review status. The fork must stay easy to update from validated upstream FreeFrame releases.

## Branches and pull requests

- `develop` is the default integration branch.
- `main` contains production-ready released code.
- Upstream release channels such as `upstream/stable` are remote references, not permanent branches in this fork.
- Create every normal task branch from current `origin/develop` and open its pull request back to `develop`.
- Use `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `release/`, and `hotfix/` prefixes with lowercase kebab-case names.
- Release branches are stabilized from `develop` and merged into `main` only after acceptance validation.
- Hotfix branches start from `main`, target `main`, and are then merged or cherry-picked into `develop`.
- Do not push directly to `develop` or `main`, and do not force-push shared branches.
- Create a local backup branch at the starting SHA before tracked source edits. Keep routine backup branches local; shared immutable rollback points are annotated tags.
- Never push to the `upstream` remote.

## Development loop

1. Fetch the fork and create a clean task branch from `origin/develop`.
2. Make one focused change set. Do not mix authentication, review data, UI, deployment, and maintenance changes without a clear reason.
3. Run the relevant backend and frontend checks and inspect the complete diff.
4. Commit only task files, push the task branch, and open a pull request to `develop`.
5. Merge only after required checks pass.
6. Deploy only an exact validated commit SHA or annotated release tag, and only with explicit approval.

## Architecture contract

The fork follows these boundaries:

- Plane owns users, workspaces, projects, work items, groups, and ordinary work-item comments.
- FreeFrame owns media assets, review versions, generated previews, frame-accurate comments, annotations, and review state.
- Plane stores only the link/projection required to show review state in a work item.
- Timecoded comments are not mirrored into Plane comment HTML.
- Review position is represented by structured version/frame data, not parsed display strings.
- Browser and Premiere clients authenticate through Plane and receive only short-lived, scoped access.
- FreeFrame remains isolated behind a narrow integration API; broad upstream rewrites are avoided.
- The MVP does not implement archive, DAM, release-server, or long-term retention behavior.

See [`docs/architecture/media-plane-review.md`](./architecture/media-plane-review.md) for the detailed contract.

## Upstream synchronization

- Add `https://github.com/Techiebutler/freeframe.git` as the local `upstream` remote.
- Use validated `upstream/stable` or an explicitly selected immutable upstream tag as the sync source.
- Create a dedicated `chore/sync-upstream-<version>` branch from `develop`.
- Merge the selected upstream release into that branch, resolve conflicts there, run the full checks, and open a pull request to `develop`.
- Update [`UPSTREAM_VERSION`](../UPSTREAM_VERSION) in the same pull request.
- Never merge upstream `main` merely because it is newer.
- Do not recreate `stable` or `latest` branches in this fork.

## Release and deployment

- Fork release tags use `v{upstream_version}-mpr.{patch}`.
- [`UPSTREAM_VERSION`](../UPSTREAM_VERSION) records the exact upstream base.
- [`RELEASE_VERSION`](../RELEASE_VERSION) records the current fork release identifier.
- User-visible and operationally relevant changes are recorded in [`CHANGELOG.md`](../CHANGELOG.md).
- Build and deploy from clean committed source only.
- Validate compose configuration before any restart.
- Preserve PostgreSQL, Redis, and S3/MinIO data across updates.
- Database migrations require an explicit task, reviewed migration file, backup/rollback notes, and separate deployment approval.
- Destructive retention, orphan deletion, volume removal, and storage cleanup are never implicit update steps.

## LXC deployment contract

The initial deployment target is an unprivileged Proxmox LXC with Docker Compose.

- Source checkout: `/opt/freeframe-media-plane-review`
- Runtime configuration: `/opt/freeframe-media-plane-review/.env.prod` (never committed or printed)
- Temporary media currently may live in a Docker volume on the LXC root disk.
- A later dedicated disk should be mounted at `/srv/freeframe-media` and attached to MinIO without changing application data contracts.
- Routine backups should include PostgreSQL/configuration, but temporary review media may be excluded unless explicitly requested.
- Deploy with fast-forward-only Git updates from the fork and pin the exact commit or release tag used.

## Required verification

Backend changes:

```bash
python -m pytest apps/api/tests/ -v
```

Frontend changes:

```bash
pnpm --filter web test
pnpm --filter web exec tsc --noEmit
pnpm --filter web lint
pnpm --filter web build
```

Compose changes:

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml config --quiet
```
