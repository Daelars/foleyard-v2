# Events

> Feature status: shipped
> Contract: internal
> Owner: `src/lib/events.ts`
> Applies to: docs manifest ID (`events`); development checkout when unbuilt

## What it does

Catalogs the notifications the product actually emits: seven desktop IPC
push events and one renderer-local shelf event. Internal callbacks that
are not subscriptions are listed separately. UI intents are request/result
protocol, not events, and there is no generic application event bus.

## Responsibilities and boundaries

- `src/lib/events.ts` (`EVENT_CATALOG`, `listEvents`) is the catalog of
  record. Anything not in the catalog is not a supported event.
- `electron/main/ipc-channels.cjs` (`CHANNEL_SPECS`) owns IPC channel kinds
  and payload field names — a registry, not a subscription API.
- `electron/main/auto-updater.cjs`, `window.cjs` and `errors.cjs` are the
  emitters behind the desktop events.
- `src/lib/shelf-events.ts` owns the shelf constant; the shelf hooks
  dispatch it.
- `src/lib/desktop.ts` owns bridge-ready detection through a setter trap
  on `window.desktopBridge` (`useSyncExternalStore`), not through an event.
- Scan progress has no subscription contract: `ScanRunner` accepts optional
  progress and completion callbacks, and the UI polls `GET /api/scan`.

## Runtime behavior

Promotion rules (proposed for any future domain event, not available today):
emit only after the mutation completes (post-persistence/reconciliation, never
optimistic UI), include an explicit failed/partial outcome, and keep
high-frequency updates (e.g. playback time) renderer-local unless a consumer
justifies a separate contract.

### Emitted notifications

| Event id | Owner | Transport | Subscription | Payload / how to observe |
| --- | --- | --- | --- | --- |
| `desktop:update-available` | desktop | ipc | yes (preload listener) | `UpdateInfo { version }` → `UpdateNotifier`, About tab |
| `desktop:update-ready` | desktop | ipc | yes | `UpdateInfo { version }` |
| `desktop:update-not-available` | desktop | ipc | yes | none |
| `desktop:update-error` | desktop | ipc | yes | `UpdateError { message }` |
| `desktop:update-download-progress` | desktop | ipc | yes | `UpdateProgress { percent, bytesPerSecond, transferred, total }` |
| `desktop:action-error` | desktop | ipc | yes | `message: string` → toast |
| `desktop:window-state` | desktop | ipc | yes | `DesktopWindowState { isMaximized }` → title bar |
| `sound-shelf:changed` | renderer | renderer-local | yes (`addEventListener`) | `CustomEvent`, no payload schema/persistence/cross-process |

### Internal callbacks (not subscribable)

These are seams inside the server process, listed so the catalog and the
runtime snapshot agree on what exists. They are not events and nothing
outside the owner subscribes to them.

| Callback | Owner | Emitter | Payload |
| --- | --- | --- | --- |
| `scan.progress` | server | optional `ScanRunner onProgress` | `ScanStatus`; the app does not pass one and polls `GET /api/scan` |
| `scan.complete` | server | `ScanRunner onComplete` | `{ startedAt, fileIds }`; run-scan.ts hands arrivals to the auto-tag trigger |
| `job.transition` | server | `V2JobManager onTransition` | job record state change; persists the snapshot and emits `job-transition` on the v2 bus |

## The five v2 contracts

The v2 extension bus (`V2EventBus` in
`packages/yard-core/src/extensions-v2/events.ts`, app singleton in
`src/lib/extensions-v2/events.ts`) carries exactly five typed
contracts: `settings-changed`, `state-changed`, `approvals-changed`,
`job-transition`, `contributions-changed`. Only the host and its
application adapters emit; handlers never receive the bus. Every
payload names its owning extension (or `"*"` for the
contributions refresh hint) and carries a sequence number for gap
detection. Persist precedes notify on every write, so a subscriber
that rereads on receipt sees the triggering change. Per-chunk job
progress is high-frequency renderer state and never an event. These
five are reported separately in the runtime snapshot (`eventsV2`).

Subscribe with disposal; recovery is always a reread:

```ts
import { getV2Events } from "@/lib/extensions-v2/events";
const unsubscribe = getV2Events().subscribe("settings-changed", reread);
```

## Contracts

- Internal: `EventDescription { id, owner, transport, contract,
  subscriptionAvailable, payloadRef?, docsId, description }`.
- IPC payload fields are declared in `CHANNEL_SPECS`; there is no generic
  subscribe/publish surface and no public-experimental or public-stable event
  contract.

## Failure behavior and limitations

- Shelf events do not cross processes and do not persist; a reload loses
  anything not already in the shelf store.
- `desktop:simulate-update` is declared but only registered when
  `!app.isPackaged`, so it is unreachable in packaged builds.
- Scan callbacks are optional and synchronous to the run; missed polls just
  delay the UI, they do not lose scan results.
- The server deduplicates `job-transition` with an entry-bounded per-job memo
  (#316): past 512 distinct job IDs the oldest state is forgotten, so a job
  whose entry aged out can emit `job-transition` once more for a state already
  reported. Duplicates are possible; losses are not.

## Source map (real file paths)

- `src/lib/events.ts` — `EVENT_CATALOG`, `listEvents`
- `electron/main/ipc-channels.cjs` — `CHANNEL_SPECS`, payload fields
- `electron/main/auto-updater.cjs`, `electron/main/window.cjs`,
  `electron/main/errors.cjs` — desktop emitters
- `electron/preload.cjs` — IPC listener exposure
- `src/lib/desktop.ts` — bridge types, late-injection setter trap
- `src/lib/shelf-events.ts` — `SOUND_SHELF_CHANGED_EVENT`
- `src/lib/scanner/scan-runner.ts` — progress and completion callbacks
- `src/lib/extensions-v2/jobs.ts` — job transition callback

## Examples

Subscribe to shelf changes (renderer-local only):

```ts
import { SOUND_SHELF_CHANGED_EVENT } from "@/lib/shelf-events";
window.addEventListener(SOUND_SHELF_CHANGED_EVENT, refreshShelf);
```

Observe scan progress the supported way (poll, not subscribe):

```bash
curl /api/scan   # { running, phase, completed, total, ... } until running=false
```

## Related documentation

- `docs/commands.md` — outcomes and UI intents are not events
- `docs/runtime.md` — events section of the snapshot
- `docs/architecture/desktop.md` — IPC channels and handlers
- `docs/scanning.md` — scan lifecycle behind the progress callback
