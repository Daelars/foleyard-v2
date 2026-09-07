# Extension architecture

> Feature status: shipped
> Contract: internal
> Owner: `src/lib/extensions/host.ts` + `packages/yard-core/src/extensions/extension-host.ts`
> Applies to: docs manifest ID (`architecture/extensions`); development checkout when unbuilt

## What it does

Traces the full path from a tool's static declaration to pixels: manifest →
registration → transport → guarded host → service → UI. Six bundled tools
are the v1 extensions; Make Pack v2 is the v2 reference beside them.
There is no external discovery, loading,
marketplace, or public authoring SDK on either path.

## Responsibilities and boundaries

- Tools own static declarations (`COMMAND_DEFINITIONS` shared by manifest
  and `registerCommands`) plus pure service logic over the safe context.
- `src/lib/extensions/registry.ts` owns the six-entry registration table.
- `execute/transport.ts` owns HTTP hydration and grant checks.
- `YardExtensionHost` owns per-execution registry construction, enabled
  checks, guarded services, and selection validation.
- The renderer owns all UI: generic settings controls and palette entries,
  explicit context-menu adapter, bespoke dialogs/panels. Surfaces declare
  intent; only some have generic adapters.

## Runtime behavior

End-to-end trace for `POST /api/extensions/execute { extensionId,
commandId, selection, input, destinationGrant }`:

1. **Registration.** `registerAllExtensions()` (idempotent; skipped if the id
   is present) puts the six `{ manifest, registerCommands }` definitions
   into `extensionRegistry`. Sound Shelf injects `DbSoundShelfStore`; the
   rest register directly.
2. **Transport.** `validateTransportEnvelope` checks the envelope, then a
   per-command adapter (`transportAdapters["<ext> <cmd>"]`, passthrough when
   none) hydrates inputs: file hydration + readable-grant checks (make-pack,
   prepare-drag, drop preview/apply), `MAX_SCAN_FOLDER_FILES` capped folder
   listing (janitor scan-folder), writable-grant checks (make-pack, gather,
   drop apply), and result shapers (save-search returns `{ success, id }`,
   prepare-drag returns the staged file, shelf list hydrates + repairs ids).
3. **Host.** `createAppExtensionHost(destinationGrant)` composes guarded
   services (filesystem scoped to Library roots + the opaque grant,
   repositories via `createExtensionServices`, settings access, optional
   scan-progress callback). `YardExtensionHost.execute` builds a fresh
   `YardCommandRegistry`, runs the tool's `registerCommands(context)`,
   revalidates enabled state, selection (`requiresSelection`), and folder
   scope, then executes.
4. **Service.** Handlers run against the safe context (selection, permission
   checker, guarded services, settings, command registry) — never raw DB,
   routes, React, or Electron.
5. **UI.** Values return as `{ ok: true, type: "value", value }` (shaped by
   the adapter); `YardUiIntent` results return as `{ ok: true, type:
   "ui-intent", intent }` for renderer dispatch to dialogs/settings.
   Failures return `{ ok: false, reason, message }` with mapped HTTP status.

`COMMAND_DEFINITIONS` sharing: each tool defines metadata once with
`defineYardCommand`; `manifest.ts` spreads it into `commands` and
`commands.ts` looks handlers up with `def(id)` — one source of truth.
Catalog projection (`?view=catalog` → `projectCatalogEntry` →
`describeYardCommand`) strips functions/validators into JSON-safe
descriptions.

Guarded host enforcement: `guardHostServices` wraps filesystem (writes need
`files:write` or `drop:modify`), files (`markRemoved` needs
`library:write`), and library/collections/tags/favorites mutations (Proxy
allows read-pattern methods, denies the rest without the write permission).
Transport grant checks are separate: even a permitted tool cannot write
outside the presented `destinationGrant`. Limitation: trusted bundled Node
code is not sandboxed against direct imports.

UI intent map: intents flow command → execute response → renderer dispatch
(dialogs, settings tabs). Context menus are explicit JSX plus one minimal
adapter (`registerContextMenuCommand` /
`listContextMenuCommands` in `ui-contributions.ts`).

Settings controls: `toGridItem` projects each `YardSetting` with its live
value; renderer renders generic controls by `type` (boolean/select/number/
string/path); PATCH coerces + `validateSettingValue` before write.

Palette projection: enabled tools' descriptions become
`tool:<extensionId>:<commandId>` entries via `buildPaletteEntries`; six
built-in `view:`/`transport:`/`file:` actions come from
`APP_COMMAND_DESCRIPTORS` + shortcuts.

Surfaces vs adapters (v1):

| Declared surface | Generic adapter? | Reality |
| --- | --- | --- |
| `command-palette` | yes (`palette.command`) | tool entries projected |
| `settings` | yes (`settings.controls`) | generic controls |
| `context-menu` | minimal (`context-menu.file-command`) | explicit JSX + one command adapter |
| `selection-actions` / `toolbar` / `drop-menu` | no | explicit app wiring only |
| `sidebar` | no (`sidebar.panel` unavailable) | bespoke panels (Shelf), not mounted from surfaces |

## The v2 execution path beside it

End-to-end trace for `POST /api/extensions-v2/execute {
extensionId, commandId, selection, input }`:

1. **Registration.** `ensureMakePackV2Registered()` puts the
   `make-pack-v2` definition and handlers on the process-wide app
   host once. Registration never enables and never approves.
   Dev fixtures register only with `FOLEYARD_V2_DEV_FIXTURES=1`
   outside production.
2. **Transport.** The codec validates the envelope and limits (256
   KiB body, 64 KiB input, 500 IDs), resolves ownership before
   hydration, and returns `{ ok, error }` with the documented status
   map. No command-name dispatch tables: handlers register
   ownership-keyed.
3. **Host.** `getAppV2Host()` runs one shared preflight (enabled,
   ownership, selection boundary over `V2LibraryPorts`, input
   schema, availability, effective permissions, grant re-auth) for
   direct execution, job submit, and plan apply alike, then runs the
   handler with an engine-owned `runMode` and narrow operation
   services. Operation errors map to typed failure codes; a v2
   failure never falls back to v1.
4. **Services.** Handlers use paged Library reads, named selection
   sources (shelf, recent), authorized file/archive output, namespaced
   settings/state, and job reporting — never raw DB, routes, React,
   or Electron.
5. **UI.** Values, review plans, and job outcomes return typed;
   generic components render forms, previews, progress, and results.
   Per-item availability comes from the same evaluator as preflight.
   Disable removes contributions and listeners.

Module dependency direction (enforced by
`node scripts/check-v2-boundaries.cjs` in CI): definitions →
registry → catalog/availability → host → operations → jobs/plans;
application adapters sit above core and below routes/components;
`make-pack-v2` imports `yard-core` and relatives only. Diagrams live
in `public/extension-system-v2.html`.

## Contracts

- Internal, API version 1: manifest/command/permission/setting/surface
  vocabulary; host outcome/reason union; JSON-safe catalog descriptions.
- No provider contracts (waveform/metadata/search) exist; extension points
  mark them `unavailable`.

## Failure behavior and limitations

- Transport failures precede host execution (400/403/404 messages); host
  reasons map via `hostFailureStatus` (404/403/400/500).
- Null envelopes and unknown ids fail closed; nothing is fetched or loaded.
- `extension.scan-progress` has no observer in the execute route; shelf-list
  repair (pruning unindexed ids) is the only silent mutation in the path.

## Source map (real file paths)

- `packages/yard-tools/*/src/{manifest,command-definitions,commands}.ts`
- `packages/yard-core/src/extensions/{extension-host,extension-command-registry,extension-context,vocabulary}.ts`
- `src/lib/extensions/{registry,runtime,host,catalog,ui-contributions,sound-shelf-store,settings-store,kv-store}.ts`
- `src/app/api/extensions/{route,execute/route,execute/transport,host-outcome}.ts`
- `src/app/library/{use-extension-catalog,use-extension-ui,use-palette}.ts`
- `src/components/CommandPalette/` + `src/app/library/use-palette.ts`

## Examples

```bash
# Catalog (static metadata, JSON-safe)
curl '/api/extensions?view=catalog' | jq '.extensions[0].commands[].id'
# Execute (transport -> host -> service)
curl -X POST /api/extensions/execute \
  -H 'Content-Type: application/json' \
  -d '{"extensionId":"folder-janitor","commandId":"folder-janitor.scan-library","input":{}}'
# v2 catalog (effective permissions, serializable)
curl /api/extensions-v2 | jq '.catalog.entries[].id'
# v2 availability (reasons, never executes)
curl '/api/extensions-v2/availability?extensionId=make-pack-v2&commandId=make-pack-v2.from-shelf'
```

## Related documentation

- `docs/extensions.md` — tool catalog and permission model
- `docs/extensions-v2.md` — v2 authoring and runnable examples
- `docs/commands.md` — 18-command table and error reasons
- `docs/architecture/yard-core.md` — contracts underneath
- `docs/architecture/application.md` — routes and state ownership
- `public/extension-system-v2.html` — v1-vs-v2 and lifecycle diagrams
