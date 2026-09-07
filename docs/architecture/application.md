# Application architecture

> Feature status: shipped
> Contract: internal
> Owner: `src/app/page.tsx` + `src/app/library/`
> Applies to: docs manifest ID (`architecture/application`); development checkout when unbuilt

## What it does

The renderer is a Next.js app whose route shell (`src/app/page.tsx`) composes
dedicated hooks in `src/app/library/` for files, view, selection,
organization, bulk actions, extension catalog/UI, transport, palette, shelf,
and settings/scan, plus explicit dialog mounts for the three tool dialogs.
HTTP routes under `src/app/api/**` are the only server surface; server
adapters (transport, filesystem boundary, extension services) sit between
routes and repositories. There is no public SDK and no external loading.

## Responsibilities and boundaries

- `src/app/page.tsx` owns composition only: hook wiring, view memos,
  dialog mounts. Fetching, polling, and mutation logic live in
  `src/app/library/*` hooks.
- `src/app/library/` hooks each own one slice: `use-library-files`,
  `use-library-view`, `use-library-organization`, `use-selection`,
  `use-bulk-actions`, `use-collections`, `use-tags`, `use-favorites`,
  `use-shelf`, `use-transport`, `use-palette`, `use-extension-catalog`,
  `use-extension-ui`, `use-settings-scan`.
- Routes own HTTP semantics (method, envelope, status); adapters own
  hydration/authorization; repositories own SQL.
- Components own presentation; `SettingsDialog` tabs and tool dialogs are
  explicit mounts, not generic extension render targets.

## Runtime behavior

Hook composition (`page.tsx` → `src/app/library/`): selection refs break
hook-order cycles; cross-hook side effects travel through explicit callbacks;
scan polling (`use-scan-polling`, 2 s) drives refetch slices
(`refetch-map.ts`); shelf changes propagate via the renderer-local
`sound-shelf:changed` event.

HTTP routes — all internal, read/write over the local index (13 rows,
desktop helpers grouped):

| Route | Purpose |
| --- | --- |
| `GET /api/files` | paged search/browse with `LIKE` escaping |
| `GET /api/directories` | directory browsing |
| `GET/POST /api/collections` | regular/smart Collections |
| `GET/POST /api/tags` | tags |
| `GET /api/audio` | Range-streamed audio preview |
| `GET /api/waveform` | waveform peaks (FFmpeg for compressed) |
| `GET/POST /api/scan` | scan start + status polling |
| `GET/POST /api/settings` | library roots, onboarding |
| `GET/PATCH /api/extensions` | grid, catalog (`?view=catalog`), enable/settings |
| `POST /api/extensions/execute` | command execution |
| `GET /api/extensions-v2` | v2 serializable catalog |
| `GET /api/extensions-v2/availability` | v2 availability with reasons |
| `POST /api/extensions-v2/execute` | v2 immediate/reviewed execution |
| `GET /POST /api/extensions-v2/plans/*` | v2 plan review/apply |
| `GET/POST /api/extensions-v2/jobs*` | v2 job submit/poll/cancel |
| `GET/PATCH /api/extensions-v2/extensions*` | v2 enablement + approvals |
| `POST /api/extensions-v2/grants` | v2 destination-grant bridge |
| `GET/PUT/POST /api/extensions-v2/settings/*` | v2 settings read/write/reset |
| `GET /api/runtime` | read-only runtime snapshot |
| `GET /api/docs`, `GET /api/docs/[...id]` | version-matched docs |
| `desktop/*` (`file`, `grants`, `path`) | main-process helpers (resolve, grants, path checks) |

Server adapters: `execute/transport.ts` per-command adapters hydrate inputs
and enforce readable/writable grants; `filesystem-boundary.ts` resolves paths
against Library roots and opaque destination grants; `createExtensionServices`
(`src/lib/db.ts`) composes guarded repository services for the host.
The v2 side composes its own adapters under `src/lib/extensions-v2/`
(host, Library/file/archive/settings ports, shelf/recent sources,
job wiring, UI resolvers) over the same repositories and boundaries;
v1 adapters are untouched and never routed through v2.

State ownership: one hook per slice (files, view, selection, organization,
shelf, palette, transport, settings/scan). The page derives memos; dialogs
(`dialogs.tsx`, tool dialogs, `SettingsDialog`) own their open/close state.
No global store; no EventBus.

## Contracts

- Internal HTTP contracts per route (query/body shapes documented in the
  feature guides). No versioned public API.
- Internal hook contracts: each `use-*` hook returns its slice state +
  actions; `refetch-map.ts` maps scan settle events to refetch slices.

## Failure behavior and limitations

- Route failures return JSON errors with status (400 validation, 403 grants,
  404 unknown ids, 500 handler); the UI surfaces them via toasts, not traps.
- Unconfigured library roots: scan/gather/janitor adapters fail fast with
  `No library roots configured` instead of scanning the world.
- Removed files (`removed_at`) are filtered by default; rescan can restore
  rows whose files reappear (known finding B10, expected-to-fail).
- Collection-branch counts can disagree with the main file list (finding
  B03, expected-to-fail).

## Source map (real file paths)

- `src/app/page.tsx` — composition shell
- `src/app/library/{use-library-files,use-library-view,use-library-organization,use-selection,use-bulk-actions,use-collections,use-tags,use-favorites,use-shelf,use-transport,use-palette,use-extension-catalog,use-extension-ui,use-settings-scan,dialogs,file-query,refetch-map,types}.ts(x)`
- `src/app/api/**/route.ts` — HTTP surface
- `src/app/api/extensions/execute/transport.ts` — transport adapters
- `src/lib/filesystem-boundary.ts` — path authorization
- `src/lib/db.ts` — service composition + repository wiring

## Examples

Poll a scan to settle, then refetch the affected slice:

```bash
curl -X POST /api/scan
while curl -s /api/scan | grep -q '"running":true'; do sleep 2; done
curl '/api/files?limit=25&offset=0'
```

## Related documentation

- `docs/library.md` — roots, identity, browsing
- `docs/scanning.md` — scan lifecycle and polling
- `docs/architecture/extensions.md` — execution path through the host
- `docs/architecture/yard-core.md` — contracts the adapters implement
