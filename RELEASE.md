# Build and Release

## Development

Run the web app only:

```bash
bun run dev
```

Run the desktop app in development:

```bash
bun run dev:desktop
```

`dev:desktop` starts Next on port `3001`, starts Electron against that dev server, and sets desktop mode environment variables.

## Local Desktop Build

Build a local Windows desktop installer:

```bash
bun run build:desktop
```

This is for local testing. It:

1. Rebuilds `better-sqlite3`.
2. Runs `next build`.
3. Materializes and rebuilds Next's traced `better-sqlite3` copy for Electron.
4. Runs `electron-builder`.
5. Writes output to `dist-electron/`.

Local desktop builds do not include dev metadata by default.

For a disposable local build with dev metadata, use:

```bash
bun run build:desktop:disposable
```

`build:desktop:disposable` adds
`--config.extraMetadata.foleyardOpenDevTools=true` and
`--config.extraMetadata.foleyardResetDatabaseOnBuild=true`, which:

- Open DevTools by default.
- Reset the desktop database once per packaged build ID.

Do not use `build:desktop:disposable` for real user releases.

## Release Flow

Everyday work happens on `development`. Cutting a release bumps the
version, commits, tags, syncs `main`, and publishes in one command:

```bash
bun run release:cut            # patch
bun run release:cut -- minor
bun run release:cut -- major
bun run release:cut -- 0.2.3
```

`release:cut` runs `prepare-release.cjs --cut`, which:

1. Refuses to run if the working tree is dirty.
2. Bumps the version in `package.json` — the single version source. The
   About/settings UI, runtime snapshot, documentation manifest, and
   installer all derive from it during the release build.
3. Commits `Release x.y.z`.
4. Creates annotated tag `vx.y.z`.
5. Pushes the current branch (`development`).
6. Fast-forwards `main` to the released commit and pushes it; aborts
   loudly if `main` has diverged.
7. Pushes the tag last, triggering `.github/workflows/release.yml`.

Afterwards `development` and `main` point at the same code. Keep
committing to `development` and cut again when ready; the cycle repeats.

Lower-level variants if you only want to prepare, not publish:

```bash
bun run release:prepare                 # bump + commit + tag, no push
bun run release:prepare -- patch --push # no main sync
```

The prepare script supports `--dry-run` and resumes a prepared version
bump when only `package.json` is modified. It updates root version
fields in `package-lock.json` only when that file exists (this repo uses
`bun.lock` and has no such file).

## GitHub Release Build

The release workflow (`.github/workflows/release.yml`) runs:

```bash
bun install --frozen-lockfile
bun run release:build
```

then verifies `dist-electron/latest.yml` plus its installer and blockmap,
and uploads `dist-electron/Foleyard-Setup-*.exe`,
`dist-electron/Foleyard-Setup-*.exe.blockmap`, and `dist-electron/latest.yml`
as GitHub release assets.

`bun run release:build` (publish `never`, for CI upload):

1. Rebuilds `better-sqlite3`.
2. Runs `next build`.
3. Rebuilds the traced `better-sqlite3` package for Electron.
4. Runs `electron-builder --publish never`.
5. Leaves publishable assets in `dist-electron/` for the workflow upload step.

(`bun run release` is the local variant with `electron-builder --publish
always`.)

The workflow needs `GH_TOKEN`. GitHub Actions provides this through:

```yaml
GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Auto-Update Requirements

Auto-update works when a GitHub release contains:

- `Foleyard-Setup-x.y.z.exe`
- `Foleyard-Setup-x.y.z.exe.blockmap`
- `latest.yml`

The installed app only updates when the published version is higher than the installed version.

Example:

- Installed app: `0.1.0`
- Published release: `0.1.1`
- Result: update is available

Rebuilding and publishing the same version again will not update existing installs.

## Manual Release Commands

If you do not use `--push`, run:

```bash
git push origin HEAD
git push origin vx.y.z
```

Replace `vx.y.z` with the tag created by `release:prepare`, for example `v0.1.1`.

## Extension status (v2 only)

Version 1 extensions were removed. Seven v2 tools ship disabled by
default — Make Pack, Sound Shelf, Smart Collections, Folder Janitor,
Library Gatherer, Drop Rules, and Auto Tag. Enabling one exposes real
entry points; disabling it rejects new work, cancels live jobs, and
removes its UI.

A future per-tool cutover needs its own compatibility and rollback
plan, with parity, data, and recovery checks passing first (see
`docs/extensions-v2-migration.md` and the parity table in each
`packages/yard-tools/<id>/README.md`). Rollback to v1 is
possible only while stored data stays compatible and never replays
completed file operations.

### Enabling and disabling v2 ports

Every v2 port is disabled by default and changes nothing until both
steps are done (shown for Make Pack v2; the other six follow the same
routes with their own IDs):

1. Settings, Extensions, enable Make Pack v2 (or
   `PATCH /api/extensions-v2/extensions/make-pack-v2` with
   `{"enabled":true}`).
2. Approve its declared permissions via the Approve button (or
   `POST /api/extensions-v2/extensions/make-pack-v2/approvals`).

Disabling rejects new work, requests cancellation of live jobs, and
removes its UI and listeners after owned work settles. Full steps,
the permission list, and the per-tool cutover/rollback conditions
live in `docs/extensions-v2-migration.md`; the Make Pack walkthrough
is `docs/extensions-v2-make-pack.md`.

Release verification for v2 is non-publishing only: `bun run
release:build` (publish never) plus `node scripts/check-docs.cjs`
over the staged manifest. Never run publishing commands for
verification.

## Notes

- `release` preserves user data.
- `build:desktop` is a plain local build; only `build:desktop:disposable`
  resets the local desktop database for testing.
- Windows app and installer icons come from `icon.ico`.
- The runtime Electron window icon comes from `icon.png`.
- Contributor loop (install, run, check, test, coverage): see
  `docs/development.md`.
