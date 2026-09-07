# Events

> Feature status: shipped
> Contract: internal
> Owner: `src/lib/events.ts`
> Applies to: docs manifest ID (`events`); development checkout when unbuilt

## What it does

Catalogs the only actually emitted/consumed notifications: seven desktop IPC
push events, one renderer-local shelf event, one renderer bridge-ready
notification, and two server-side progress callbacks. UI intents
(`YardUiIntent`) are request/result protocol, not events, and there is no
`EventBus` on the v1 path — stale references to a generic event bus describe something that
does not exist.

## Responsibilities and boundaries

- `src/lib/events.ts` (`EVENT_CATALOG`, `listEvents`) is the catalog of
  record. Anything not in the catalog is not a supported event.
- `electron/main/ipc-channels.cjs` (`CHANNEL_SPECS`) owns IPC channel kinds
  and payload field names — a registry, not a subscription API.
- `src/lib/extensions/sound-shelf-events.ts` owns the shelf constant.
- `src/lib/desktop.ts` owns bridge-ready detection (`useSyncExternalStore`
  + setter trap + `desktop-bridge-ready` window event).
- Scan progress has no subscription contract: the runner accepts an optional
  `onProgress` callback and the UI polls `GET /api/scan`.

## Runtime behavior

Promotion rules (proposed for any future domain event, not available today):
emit only after the mutation completes (post-persistence/reconciliation, never
optimistic UI), include an explicit failed/partial outcome, and keep
high-frequency updates (e.g. playback time) renderer-local unless a consumer
justifies a separate contract. A future scan-completed event would fire from
the scan owner after metadata persistence; organization subscriptions would
fire after successful repository mutation.

| Event id | Owner | Transport | Subscription | Payload / how to observe |
| --- | --- | --- | --- | --- |
| `desktop:update-available` | desktop | ipc | yes (preload listener) | `UpdateInfo { version }` → `UpdateNotifier`, About tab |
| `desktop:update-ready` | desktop | ipc | yes | `UpdateInfo { version }` |
| `desktop:update-not-available` | desktop | ipc | yes | none |
| `desktop:update-error` | desktop | ipc | yes | `UpdateError { message }` |
| `desktop:update-download-progress` | desktop | ipc | yes | `UpdateProgress` |
| `desktop:action-error` | desktop | ipc | yes | message → toast |
| `desktop:window-state` | desktop | ipc | yes | `DesktopWindowState { isMaximized }` → title bar |
| `sound-shelf:changed` | renderer | renderer-local | yes (`addEventListener`) | `CustomEvent`, no schema/persistence/cross-process |
| `desktop-bridge-ready` | renderer | renderer-local | yes | window event for late preload injection |
| `scan.progress` | server | callback | no | `ScanRunner onProgress` + `GET /api/scan` polling |
| `extension.scan-progress` | server | callback | no | `services.scanProgress.report`; execute route supplies none |

## The five v2 contracts beside them

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
progress is high-frequency renderer state and never an event. The
table above stays the complete v1-adjacent catalog; these five are
reported separately in the runtime snapshot (`eventsV2`).

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
- Bridge-ready only matters when preload injects late; readers must re-read
  on notification rather than caching the first `false`.
- `desktop:simulate-update` is declared but only registered when
  `!app.isPackaged`, so it is unreachable in packaged builds.
- Scan callbacks are optional and synchronous to the run; missed polls just
  delay the UI, they do not lose scan results.

## Source map (real file paths)

- `src/lib/events.ts` — `EVENT_CATALOG`, `listEvents`
- `electron/main/ipc-channels.cjs` — `CHANNEL_SPECS`, payload fields
- `electron/preload.cjs` — IPC listener exposure
- `src/lib/desktop.ts` — bridge types, late-injection trap
- `src/lib/extensions/sound-shelf-events.ts` — `SOUND_SHELF_CHANGED_EVENT`
- `src/lib/scanner/run-scan.ts` — scan progress callback origin
- `src/lib/extensions/host.ts` — `scanProgress.report` wiring

## Examples

Subscribe to shelf changes (renderer-local only):

```ts
import { SOUND_SHELF_CHANGED_EVENT } from "@/lib/extensions/sound-shelf-events";
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
