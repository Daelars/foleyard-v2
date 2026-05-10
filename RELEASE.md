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

Local desktop builds include dev metadata:

- Open DevTools by default.
- Reset the desktop database once per packaged build ID.

Do not use `build:desktop` for real user releases.

## Release Flow

Prepare a release commit and tag:

```bash
bun run release:prepare
```

This defaults to a patch bump, for example `0.1.0` to `0.1.1`.

Other bump options:

```bash
bun run release:prepare -- minor
bun run release:prepare -- major
bun run release:prepare -- 0.2.3
```

Prepare and push in one command:

```bash
bun run release:prepare -- patch --push
```

The prepare script:

1. Refuses to run if the working tree is dirty.
2. Bumps `package.json`.
3. Updates root version fields in `package-lock.json`.
4. Commits `Release x.y.z`.
5. Creates annotated tag `vx.y.z`.
6. Pushes the commit and tag when `--push` is passed.

Pushing the tag triggers `.github/workflows/release.yml`.

## GitHub Release Build

The release workflow runs:

```bash
bun install --frozen-lockfile
bun run release
```

`bun run release`:

1. Rebuilds `better-sqlite3`.
2. Runs `next build`.
3. Rebuilds the traced `better-sqlite3` package for Electron.
4. Runs `electron-builder --publish always`.
5. Publishes GitHub release assets.

The workflow needs `GH_TOKEN`. GitHub Actions provides this through:

```yaml
GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Auto-Update Requirements

Auto-update works when a GitHub release contains:

- `Foleyard Setup x.y.z.exe`
- `Foleyard Setup x.y.z.exe.blockmap`
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

## Notes

- `release` preserves user data.
- `build:desktop` resets the local desktop database for testing.
- Windows app and installer icons come from `icon.ico`.
- The runtime Electron window icon comes from `icon.png`.
