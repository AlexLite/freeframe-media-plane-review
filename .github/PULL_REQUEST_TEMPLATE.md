## Summary

<!-- What changes and why? Keep the PR focused. -->

## Scope

- [ ] Plane identity / authorization
- [ ] Review API / data contract
- [ ] Upload / transcode / storage
- [ ] Standalone FreeFrame compatibility
- [ ] Plane-native UI contract
- [ ] Deployment / operations
- [ ] Documentation only

## Architecture invariants

- [ ] Plane remains the canonical source of users, workspaces, projects, work items, and ordinary comments.
- [ ] FreeFrame remains the source of truth for review assets, versions, frame positions, annotations, and timecoded review comments.
- [ ] No long-lived FreeFrame service credential is exposed to the browser or Premiere.
- [ ] Frame positions are structured version/frame/FPS data, not parsed text timecodes.
- [ ] The change does not add archive, DAM, or release-server scope to the MVP.

## Changes

-

## Testing

- [ ] Backend tests pass (`python -m pytest apps/api/tests/ -v`)
- [ ] Frontend tests pass when applicable (`pnpm --filter web test`)
- [ ] Frontend types pass when applicable (`pnpm --filter web exec tsc --noEmit`)
- [ ] Frontend lint/build pass when applicable
- [ ] Compose configuration validates when applicable
- [ ] Manual review flow tested when applicable

## Database / deployment

- [ ] No migration
- [ ] Migration included and reviewed
- [ ] No deployment required
- [ ] Deployment/rollback notes included

## Upstream impact

<!-- Name broad upstream files touched and explain why a new integration module was insufficient. -->

## Screenshots

<!-- Required for user-visible UI changes. -->
