# Agent Development Guide

## Fork purpose

- Treat this repository as the deployable source of truth for the Media Plane Review fork of FreeFrame.
- Plane is the only user-facing workspace and the canonical source of users, workspaces, projects, work items, and permissions.
- FreeFrame is a headless media-review engine responsible for uploads, versions, previews, frame-accurate review comments, annotations, and review status.
- Ordinary work-item comments remain in Plane. Timecoded review comments remain structured FreeFrame data and must not be copied into Plane comment HTML.
- The MVP is not an archive, DAM, release server, or long-term media store.

Read [`docs/fork-workflow.md`](./docs/fork-workflow.md), [`docs/architecture/media-plane-review.md`](./docs/architecture/media-plane-review.md), [`CHANGELOG.md`](./CHANGELOG.md), and any applicable nested `AGENTS.md` before making changes.

## Repository safety

- Start with a read-only audit.
- Prefer repository changes over host-only fixes so deployments remain reproducible.
- Never add secrets, runtime `.env` files, database contents, uploaded media, generated bundles, or temporary backups to Git.
- Do not modify a live deployment, run migrations, rewrite MinIO data, or change production configuration without explicit approval.
- Never push to the `upstream` remote (`Techiebutler/freeframe`). The writable repository is `AlexLite/freeframe-media-plane-review`.

## Git workflow

### Permanent branches

- `develop` is the integration branch and should be configured as the default branch.
- `main` contains production-ready released code.
- `stable` is a read-only mirror/reference for the validated upstream FreeFrame release channel.
- Never commit or push directly to `develop`, `main`, or `stable`.

### Task branches and pull requests

- Start task branches from an up-to-date `origin/develop`.
- Use lowercase kebab-case names with `feat/`, `fix/`, `chore/`, `docs/`, `refactor/`, `test/`, `release/`, or `hotfix/` prefixes.
- Normal task branches target `develop` through a pull request.
- Release branches start from `develop` and target `main` after acceptance validation.
- Hotfixes start from and target `main`, then must be merged or cherry-picked back into `develop`.
- Never force-push shared branches.
- Before editing tracked source in a local worktree, create a local `backup/*` branch at the exact starting SHA. Keep routine backup branches local; use annotated tags for shared immutable rollback points.

### Required checks

Before editing:

1. Run `git status --short` and `git branch --show-current`.
2. Run `git fetch origin --prune` and verify the task branch is based on current `origin/develop`.
3. Check for unrelated changes. Never overwrite or discard user work without explicit approval.
4. Do not use `git add -A` in a mixed worktree.

Before committing:

1. Review the complete diff and stage only task files.
2. Run relevant backend tests, frontend tests/build, formatting, linting, type checks, migration checks, and security checks.
3. Update `CHANGELOG.md` for user-visible or operationally relevant changes.
4. Confirm the change preserves the architecture invariants in `docs/architecture/media-plane-review.md`.

After pushing:

1. Verify the remote branch SHA and open a pull request to the intended base.
2. Report the commit SHA and CI state.
3. Do not deploy unless deployment was explicitly requested.

## Architecture rules

- Keep Plane authentication integration isolated under `apps/api/integrations/plane/`.
- The browser and Premiere extension must authenticate through Plane; they must not receive long-lived FreeFrame service credentials.
- Plane-issued review tokens must be short-lived, audience-bound, issuer-bound, and scoped to a specific workspace/project/work item.
- Store frame positions as structured fields (`frame_number`, rational FPS, optional range end, version ID), not as parsed text timecodes.
- Preserve FreeFrame as the source of truth for review versions and timecoded review comments.
- Avoid broad rewrites of upstream modules. Prefer new integration modules and narrow adapters to reduce upstream merge conflicts.
- Database schema changes require an explicit migration, tests, rollback notes, and separate approval before deployment.

## Upstream synchronization

- Use `Techiebutler/freeframe` as the `upstream` remote.
- Sync only from the validated upstream `stable` channel unless an explicit task selects another immutable upstream tag.
- Perform synchronization in a dedicated `chore/sync-upstream-*` branch and merge through a pull request to `develop`.
- Record the exact base in [`UPSTREAM_VERSION`](./UPSTREAM_VERSION).
- Never merge or deploy upstream `main` merely because it is newer.

## Release and deployment

- Use `v{upstream_version}-mpr.{patch}` for fork release tags.
- Track the current fork release in [`RELEASE_VERSION`](./RELEASE_VERSION).
- Deploy only an exact validated commit SHA or annotated release tag.
- Validate compose configuration before restart and preserve PostgreSQL, Redis, and S3/MinIO state.
- Do not include temporary review media in routine LXC backups unless explicitly requested; do back up the database and configuration.
- Do not run destructive cleanup, retention, orphan deletion, or volume removal as part of a generic update.

## Upstream checks retained by this fork

- Backend: `python -m pytest apps/api/tests/ -v`
- Frontend build: `pnpm --filter web build`
- Frontend tests: `pnpm --filter web test`
- Frontend types: `pnpm --filter web exec tsc --noEmit`
- Frontend lint: `pnpm --filter web lint`
- Model change requires an Alembic migration and explicit review of the generated migration.
- Add regression tests for new behavior and bug fixes; do not weaken upstream CI floor guards.
