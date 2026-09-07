# Commands

> Feature status: shipped
> Contract: internal
> Owner: `packages/yard-tools/*/src/command-definitions.ts` + `src/app/api/extensions/execute/transport.ts`
> Applies to: docs manifest ID (`commands`); development checkout when unbuilt

## What it does

Commands are the executable surface of the six bundled tools: 18 declared
commands, each with metadata (id, title, scope, destructive flag, selection
needs, owning runtime, required capabilities) shared between the manifest and
handler registration via `COMMAND_DEFINITIONS`. The app adds six built-in
palette actions (view/transport shortcuts) described in
`src/lib/commands.ts`. There is no public command SDK and no external command
source.

## Responsibilities and boundaries

- Each tool's `command-definitions.ts` is the single source of metadata
  (`defineYardCommand`); `commands.ts` registers handlers against it.
- `YardCommandRegistry` (per-execution, in `YardExtensionHost.execute`)
  owns register/get/list/execute plus input validation. No global active
  command registry is kept.
- `src/app/api/extensions/execute/transport.ts` owns HTTP transport adapters:
  envelope validation, filesystem grant checks, input hydration, and result
  shaping. `route.ts` owns the thin POST flow.
- The renderer palette (`src/components/CommandPalette/`, `use-palette.ts`)
  projects `tool:<extensionId>:<commandId>` entries; availability shown in
  the palette is revalidated at execution time.

## Runtime behavior

All 18 commands (`executionOwner` is `extension-host` for all):

| Command id | Title | Scope | Destructive | Selection | Capabilities |
| --- | --- | --- | --- | --- | --- |
| `sound-shelf.add-selected` | Add to Shelf | selection | no | required | `shelf.write` |
| `sound-shelf.remove-selected` | Remove from Shelf | selection | no | required | `shelf.write` |
| `sound-shelf.clear` | Clear Shelf | global | no | — | `shelf.write` |
| `sound-shelf.list` | List Shelf | global | no | — | `shelf.read` |
| `make-pack.from-selection` | Make Pack from Selection | selection | no | required | `pack.export` |
| `make-pack.from-shelf` | Make Pack from Shelf | global | no | — | `pack.export` |
| `make-pack.from-recent` | Make Pack from Recent Sounds | global | no | — | `pack.export` |
| `drop-rules.open-settings` | Configure Drop Rules | global | no | — | `drop.configure` |
| `drop-rules.preview` | Preview Drop Rules | drop | no | required | `drop.apply` |
| `drop-rules.apply` | Apply Drop Rules | drop | no | required | `drop.apply` |
| `drop-rules.prepare-drag` | Prepare Drag | drop | no | required | `drop.apply` |
| `folder-janitor.scan-library` | Scan Library Mess | global | no | — | `janitor.scan` |
| `folder-janitor.scan-folder` | Scan Folder Mess | folder | no | folder path | `janitor.scan` |
| `folder-janitor.remove-files` | Remove Files from Index | selection | no | required | `library.write` |
| `folder-janitor.delete-folders` | Delete Empty Folders | global | **yes** | — | `files.delete` |
| `library-gatherer.preview-gather` | Preview Library Gather | global | no | — | `gather.preview` |
| `library-gatherer.gather` | Gather Library | global | no | — | `gather.write` |
| `smart-collections.save-search` | Save Search as Smart Collection | global | no | — | `collections.write` |

Execution model: `POST /api/extensions/execute` validates the envelope
(`extensionId`/`commandId` non-empty strings, well-typed `selection`,
string `destinationGrant`), resolves a transport adapter (or passthrough for
commands needing no hydration), then `createAppExtensionHost
(destinationGrant).execute(...)` builds a fresh registry, checks
registration + enabled state, registers handlers, revalidates selection /
folder requirements, executes, and returns a value or UI intent. Folder scans
cap at `MAX_SCAN_FOLDER_FILES = 5000` per directory.

Palette: `tool:` ids plus six built-in shortcut actions from
`APP_COMMAND_DESCRIPTORS` — `view:toggle-playback` (Space),
`view:focus-search` (/), `view:toggle-favorite` (f), `view:next` (j),
`view:prev` (k), `view:open-settings` (,) — matching
`DEFAULT_SHORTCUTS` in `src/components/Shortcuts/shortcuts.ts`.

## The v2 commands beside them

Three v2 commands run through their own engine
(`POST /api/extensions-v2/execute`, API version 2, internal).
They belong to Make Pack v2 (`make-pack-v2`), disabled by default.
The 18-command table above stays the complete v1 catalog; v1
commands never route through v2.

| Command id | Title | Scope | Selection |
| --- | --- | --- | --- |
| `make-pack-v2.from-selection` | Make Pack v2 from Selection | selection | required |
| `make-pack-v2.from-shelf` | Make Pack v2 from Shelf | global | — |
| `make-pack-v2.from-recent` | Make Pack v2 from Recent Sounds | global | — |

v2 execution model: shared availability preflight (enabled, scope,
selection, input, unknown-capability denial, granted permissions),
ownership-keyed handlers, engine-owned `runMode`
(direct/apply/job), typed `{ ok, error }` envelopes. Limits: 256
KiB body, 64 KiB input, 500 selection IDs. Status: 200
immediate/review, 202 job, 400 invalid, 403 disabled/denied, 404
unknown/unresolvable, 413 over limits, 500 host faults. Background
work goes through `POST /api/extensions-v2/jobs` with `vjob_` IDs
and polling; reviewed work goes through the plans routes. Full
contracts and author examples live in `docs/extensions-v2.md`.

## Contracts

- Internal: `YardCommand` metadata; `YardCommandDescription` (JSON-safe, no
  functions); envelope `{ extensionId, commandId, selection?, input?,
  destinationGrant? }`.
- Capability ids (availability semantics, not permissions) are listed above;
  permissions (access policy) live on manifests — see `docs/extensions.md`.
- Outcomes: `{ ok: true, type: "value", value }`, `{ ok: true, type:
  "ui-intent", intent }`, or `{ ok: false, reason, message }`.

## Failure behavior and limitations

Host failure reasons → HTTP (`hostFailureStatus`):

| Reason | HTTP | Meaning |
| --- | --- | --- |
| `extension-not-found` / `command-not-found` | 404 | unknown id, never fetched externally |
| `extension-disabled` / `permission-denied` | 403 | tool off, or guarded service denied |
| `validation-failed` | 400 | missing selection/folder, bad input, envelope |
| `execution-failed` | 500 | handler threw |

Transport failures (400/403/404 with plain messages): missing
`destinationDirectory`, ungranted destination (`destinationGrant` required),
source outside Library roots, empty pack sources, `folderPath` required,
`paths`/`name`+`query`/`fileId` validation. Palette availability is
best-effort display; execution always revalidates, so a visible-but-failing
command returns the reason above instead of running.

## Source map (real file paths)

- `packages/yard-tools/*/src/command-definitions.ts` — 18 definitions
- `packages/yard-tools/*/src/commands.ts` — handlers + input validators
- `packages/yard-core/src/extensions/{extension-command-registry,extension-host}.ts`
- `src/app/api/extensions/execute/{route,transport}.ts` — POST + adapters
- `src/app/api/extensions/host-outcome.ts` — reason → status mapping
- `src/lib/commands.ts` — `APP_COMMAND_DESCRIPTORS`, `toolPaletteId`
- `src/components/CommandPalette/command-palette.ts` — entry builder
- `src/app/library/use-palette.ts` — palette data wiring

## Examples

Execute a command:

```bash
curl -X POST /api/extensions/execute \
  -H 'Content-Type: application/json' \
  -d '{"extensionId":"sound-shelf","commandId":"sound-shelf.clear"}'
```

Palette tool id for the same family:

```ts
import { toolPaletteId } from "@/lib/commands";
toolPaletteId("sound-shelf", "sound-shelf.list"); // "tool:sound-shelf:sound-shelf.list"
```

## Related documentation

- `docs/extensions.md` — tools, permissions, settings UI
- `docs/events.md` — execution outcomes vs subscription events
- `docs/runtime.md` — command projection in the runtime snapshot
- `docs/architecture/extensions.md` — end-to-end registration trace
