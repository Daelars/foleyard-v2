# Desktop architecture

> Feature status: shipped
> Contract: internal
> Owner: `electron/main.cjs` + `electron/preload.cjs`
> Applies to: docs manifest ID (`architecture/desktop`); development checkout when unbuilt

## What it does

The desktop runtime wraps the Next.js app in Electron: main owns windows,
native actions, auto-update, and runtime identity; preload exposes a
constrained `desktopBridge`; the renderer calls it through
`src/lib/desktop.ts`. IPC channels are declared once in
`electron/main/ipc-channels.cjs` (`CHANNEL_SPECS` + derived `CHANNELS`) and
shared by main, preload, and the renderer wrapper. There is no generic
invoke-anything channel and no public desktop SDK.

## Responsibilities and boundaries

- `electron/main.cjs` owns startup sequencing; `main/window.cjs` owns window
  creation; `main/desktop-service.cjs` owns native file actions;
  `main/auto-updater.cjs` owns update checks; `main/runtime-info.cjs` owns
  desktop identity; `main/ipc.cjs` owns handler registration; `main/errors.cjs`
  owns fatal reporting; `main/database.cjs` owns packaged DB ensure/reset.
- `electron/preload.cjs` owns the bridge surface (`contextBridge`,
  `contextIsolation`, `sandbox`, no `nodeIntegration`).
- The renderer never touches `ipcRenderer` directly — only `getDesktopBridge()`.

## Runtime behavior

Main/preload/bridge: preload exposes updater methods + listeners, file
actions (`startDragFiles`, `revealInExplorer`, `revealPath`,
`openFileExternally`, `copyFilePath`, `pickFolder`), window controls,
`setZoomFactor`, `getRuntimeInfo`, and error/window-state subscriptions.
`CHANNEL_SPECS` records invoke/send/event kind plus required payload fields
(`desktop:start-drag-file` needs `fileIds`; progress needs
`percent/bytesPerSecond/transferred/total`).

Installed handlers (per `main/ipc.cjs`): all invoke handlers above plus the
`desktop:start-drag-file` send handler and the `get-runtime-info` handler.
`desktop:simulate-update` is declared and exposed in preload but registered
only when `!app.isPackaged` — excluded from packaged availability.

Startup: development runs Next on `:3001` via `scripts/dev-desktop.cjs`
(`FOLEYARD_DESKTOP=1`, fresh grant secret, `ELECTRON_START_URL`) with Electron
against the dev server. Packaged startup serves the bundled Next build
through `main/next-server.cjs` + `next-server-adapter.cjs` (Next major
version pinned — currently 16 — with a loud error on mismatch), then loads
the window from the local server URL.

Updater (`electron-updater`): `autoDownload` + `autoInstallOnAppQuit`, 4-hour
interval, active only when packaged; pushes `update-available` / `ready` /
`not-available` / `error` / `download-progress` events to the window.
`check-for-updates` / `install-update` are invoke bridges; the About tab
drives manual checks.

Drag-out: `startDragFile` first asks Drop Rules (`drop-rules.prepare-drag`
via the local execute endpoint) for a safe renamed/staged copy, and falls
back to the raw indexed file (`resolveIndexedFile`) when preparation fails.
Missing ids or unresolvable files emit `desktop:action-error` instead of
starting a drag.

v2 reuse: the desktop folder picker mints destinations that
`POST /api/extensions-v2/grants` bridges into per-extension grant
IDs, and the reveal/open actions back Make Pack v2's
capability-aware result button (`desktop:reveal`, `desktop:open`).
No new IPC channels were added for v2; channel/handler/preload/client
parity is unchanged.

Docs bundle: packaged builds resolve docs from staged `foleyard-docs/`
resources (`process.resourcesPath`, or `FOLEYARD_DOCS_ROOT`). Staging
runs through `node scripts/prepare-docs.cjs` into
`staged-docs/foleyard-docs`, declared in `electron-builder.yml`
`extraResources` and verified by `node scripts/check-docs.cjs`
(both run in CI). ASAR note: app code ships inside the ASAR with only
`*.node` and `ffmpeg-static` unpacked (`asarUnpack`); staged docs live
under `resources/` outside the archive, readable without extracting app code.

## Contracts

- Internal IPC contracts: channel names, kinds, and payload fields in
  `CHANNEL_SPECS`; `validateIpcPayload` rejects unknown channels and missing
  fields.
- Desktop grants: `pick-folder` returns an opaque grant via
  `/api/desktop/grants` (`x-foleyard-grant-secret`); transport adapters scope
  writes to it.

## Failure behavior and limitations

- Window load failure: logged, fatal dialog, app terminates rather than
  lingering blank. Uncaught exceptions/rejections report fatal.
- Update checks outside the desktop app toast an error; simulator calls in
  packaged builds have no handler.
- Drag-out with no valid files sends `action-error`; reveal/open of
  unindexed files returns `{ ok: false }`.
- `build:desktop:disposable` opens DevTools and resets the desktop DB per
  build id; never use it for releases.

## Source map (real file paths)

- `electron/main.cjs`, `electron/main/{window,ipc,ipc-channels,desktop-service,auto-updater,runtime-info,errors,database,next-server,next-server-adapter,server-url,constants}.cjs`
- `electron/preload.cjs` — bridge surface
- `src/lib/desktop.ts` — renderer wrapper + late-injection trap
- `src/lib/desktop-channels.ts` — renderer-side channel constants
- `scripts/dev-desktop.cjs` — dev startup
- `electron-builder.yml` — packaging, `Foleyard-Setup-${version}` artifacts

## Examples

Check installed desktop handlers from the app:

```ts
const info = await getDesktopBridge()?.getRuntimeInfo();
// { platform, packaged, version, buildId, installedChannels, docsRoot, ... }
```

Simulate an update (development only):

```ts
await getDesktopBridge()?.simulateUpdate(); // no handler when packaged
```

## Related documentation

- `docs/events.md` — the seven desktop push events
- `docs/runtime.md` — desktop identity in exports
- `docs/filesystem.md` — grants and path authorization
- `RELEASE.md` — desktop build and release flow
