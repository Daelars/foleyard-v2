# Commands

> Feature status: shipped
> Contract: internal
> Owner: `packages/yard-tools/*/src/command-definitions.ts` + `src/app/api/extensions/execute/transport.ts`
> Applies to: docs manifest ID (`commands`); development checkout when unbuilt

## What it does

Commands are the executable surface of the bundled tools: each v2 command
carries metadata (id, title, scope, destructive flag, selection needs,
owning runtime, required capabilities) declared in its package
`definition.ts` and registered against the v2 host. The v1 command catalog
is empty — all six v1 tools retired to their v2 ports (see
`docs/extensions-v2-migration.md`). The app adds six built-in
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

The v1 catalog is empty (`executionOwner` was `extension-host` for all of
them). All six v1 tools retired to their v2 ports:

| Retired v1 command | v2 port |
| --- | --- |
| `sound-shelf.{add-selected,remove-selected,clear,list}` | `sound-shelf-v2.*` through `POST /api/extensions-v2/execute` |
| `folder-janitor.{scan-library,scan-folder,remove-files,delete-folders}` | `folder-janitor-v2.*` through `POST /api/extensions-v2/execute` |
| `smart-collections.save-search` | `smart-collections-v2.save-search` |
| `make-pack.from-{selection,shelf,recent}` | `make-pack-v2.from-*` |
| `drop-rules.{open-settings,preview,apply,prepare-drag}` | `drop-rules-v2.*` |
| `library-gatherer.{preview-gather,gather}` | `library-gatherer-v2.*` |

Retired v1 command ids are unknown to `POST /api/extensions/execute`
(404) — a v2 failure never falls back to v1.

Execution model: `POST /api/extensions/execute` validates the envelope
(`extensionId`/`commandId` non-empty strings, well-typed `selection`,
string `destinationGrant`), passes the body through (no command adapters
remain), then `createAppExtensionHost
(destinationGrant).execute(...)` builds a fresh registry, checks
registration + enabled state, registers handlers, revalidates selection /
folder requirements, executes, and returns a value or UI intent. With an
empty registry every id fails closed as `extension-not-found` (404).

Palette: `tool:` ids plus six built-in shortcut actions from
`APP_COMMAND_DESCRIPTORS` — `view:toggle-playback` (Space),
`view:focus-search` (/), `view:toggle-favorite` (f), `view:next` (j),
`view:prev` (k), `view:open-settings` (,) — matching
`DEFAULT_SHORTCUTS` in `src/components/Shortcuts/shortcuts.ts`.

## The v2 commands beside them

Seven v2 ports run through their own engine
(`POST /api/extensions-v2/execute`, API version 2, internal),
each disabled by default with its own settings namespace (see
`docs/extensions-v2-migration.md`). The retired-v1 table above is the
complete v1 catalog; v1 commands never route through v2.

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

Transport failures (400 with plain messages): malformed envelope
(non-object body, empty `extensionId`/`commandId`, mistyped `selection` or
`destinationGrant`). Palette availability is
best-effort display; execution always revalidates, so a visible-but-failing
command returns the reason above instead of running.

## Source map (real file paths)

- `packages/yard-tools/*-v2/src/definition.ts` — v2 command declarations
- `packages/yard-core/src/extensions/{extension-command-registry,extension-host}.ts`
- `src/app/api/extensions/execute/{route,transport}.ts` — POST + envelope validation
- `src/app/api/extensions/host-outcome.ts` — reason → status mapping
- `src/lib/commands.ts` — `APP_COMMAND_DESCRIPTORS`, `toolPaletteId`
- `src/components/CommandPalette/command-palette.ts` — entry builder
- `src/app/library/use-palette.ts` — palette data wiring

## Examples

Execute a command:

```bash
curl -X POST /api/extensions-v2/execute \
  -H 'Content-Type: application/json' \
  -d '{"extensionId":"sound-shelf-v2","commandId":"sound-shelf-v2.clear","selection":{"fileIds":[]}}'
```

Palette tool id for the same family:

```ts
import { toolPaletteId } from "@/lib/commands";
toolPaletteId("sound-shelf-v2", "sound-shelf-v2.list"); // "tool:sound-shelf-v2:sound-shelf-v2.list"
```

## Related documentation

- `docs/extensions.md` — tools, permissions, settings UI
- `docs/events.md` — execution outcomes vs subscription events
- `docs/runtime.md` — command projection in the runtime snapshot
- `docs/architecture/extensions.md` — end-to-end registration trace