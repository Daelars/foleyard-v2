# Bundled extensions

> Feature status: shipped
> Contract: internal
> Owner: `src/lib/extensions/registry.ts` + `packages/yard-tools/*/src/manifest.ts`
> Applies to: docs manifest ID (`extensions`); development checkout when unbuilt

## What it does

No v1 tools remain: all six bundled tools retired from v1 to their v2
ports (see `docs/extensions-v2-migration.md`). The v1 registration table
(`src/lib/extensions/registry.ts`) is empty, the execute route fails
closed on every id (404), and the catalog projections return no entries.
This document records the retired v1 shape; the live system is v2
(`docs/extensions-v2.md`).

Retirement order: Smart Collections and Make Pack first, then Drop Rules
and Library Gatherer, then Sound Shelf and Folder Janitor. Each pair's
enablement, approvals and listed settings were adopted once from the v1
settings rows (see `src/lib/extensions-v2/enablement.ts`); the Sound Shelf
contents moved from `extension:sound-shelf:items` to `v2shelf:sound-shelf-v2`.
There is no marketplace, no install flow, no remote loading, and no
third-party code loader — "bundled" is the only source.

## Responsibilities and boundaries

- `packages/yard-tools/<tool>/src/` owns `manifest.ts`,
  `command-definitions.ts`, `commands.ts`, `permissions.ts`, `settings.ts`,
  `service.ts`, `types.ts`. Tools depend on `yard-core` contracts only.
- `src/lib/extensions/registry.ts` owns the static six-entry registration
  table (`registerAllExtensions`, idempotent) and the settings-grid
  projection (`toGridItem`).
- `src/lib/extensions/catalog.ts` owns the JSON-safe catalog projection
  (`projectCatalogEntry`, `?view=catalog`).
- `src/lib/extensions/host.ts` owns host construction with guarded services.
- `packages/yard-core` owns the vocabulary, registries, context, and host.
  API version is `YARD_EXTENSION_API_VERSION = 1`, standing `internal`.

## Runtime behavior

The v1 catalog is empty (was 6 tools, 18 commands; details in
`docs/commands.md`). Retired shape for reference:

| Tool (id) | Commands | Permissions | Settings | Surfaces |
| --- | --- | --- | --- | --- |
| `sound-shelf` — Sound Shelf | 4 (`add-selected`, `remove-selected`, `clear`, `list`) | `library:read` | none | `context-menu`, `sidebar` |
| `folder-janitor` — Folder Janitor | 4 (`scan-library`, `scan-folder`, `remove-files`, `delete-folders`) | `library:read`, `files:read`, `files:write`, `files:delete` | `tiny-file-threshold-bytes`, `allowed-formats` | `settings` |
| `make-pack` — Make Pack | 3 (`from-selection`, `from-shelf`, `from-recent`) | `library:read`, `files:read`, `files:copy`, `files:write` | `default-format`, `include-manifest` | `context-menu`, `sidebar`, `selection-actions` |
| `drop-rules` — Drop Rules | 4 (`open-settings`, `preview`, `apply`, `prepare-drag`) | `library:read`, `files:read`, `files:copy`, `files:write`, `drop:read`, `drop:modify` | `copy-on-drop`, `rename-on-drop`, `rename-pattern`, `drag-out-folder`, `mark-used` | `settings` |
| `library-gatherer` — Library Gatherer | 2 (`preview-gather`, `gather`) | `library:read`, `library:write`, `files:read`, `files:copy`, `files:write` | `preserve-folder-names`, `skip-duplicates` | `settings` |
| `smart-collections` — Smart Collections | 1 (`save-search`) | `collections:read`, `collections:write`, `library:read` | none | `sidebar`, `settings` |

Manifest and handler registration share one source: each tool's
`COMMAND_DEFINITIONS` (built with `defineYardCommand`) is spread into the
manifest's `commands` and consumed by `registerCommands` via a
`def(id)` lookup, so metadata and handlers cannot drift.

Permission model is host-enforced over trusted code: `YardExtensionHost`
wraps provided services (`guardHostServices`) so mutations require the
manifest permission even if a handler skips `require()`. Limitation: bundled
tools are trusted Node code — the guard covers provided services, not direct
`node:fs` imports. No sandboxing is claimed.

Settings UI: `GET /api/extensions` returns grid items with live values;
`PATCH /api/extensions` toggles `enabled` or coerces + validates a setting
(select options, numeric bounds) before persisting. `GET /api/extensions?
view=catalog` returns serializable entries (`describeYardCommand`, no
functions/validators).

UI intents: command results that are `YardUiIntent` values
(`createYardUiIntent`/`isYardUiIntent`) return as `{ ok: true, type:
"ui-intent", intent }`; the renderer dispatches them to dialogs or settings.
Intents are request/result protocol, not subscription events.

## The v2 system beside it

A second extension system (API version 2, internal, bundled-only)
replaces these six tools. Its seven ports (`sound-shelf-v2`,
`folder-janitor-v2`, `smart-collections-v2`, `make-pack-v2`,
`drop-rules-v2`, `library-gatherer-v2`, `auto-tag-v2`) each ship in
their own namespace, disabled by default with explicit enable and
permission approval. v1 commands never route through v2. Nothing
here changes meaning: the table above stays the complete (retired)
v1 catalog.

- `docs/extensions-v2.md` — authoring on the v2 API
- `docs/extensions-v2-migration.md` — coexistence and cutover rules
- `docs/extensions-v2-make-pack.md` — reference walkthrough
- `docs/extensions-v2-troubleshooting.md` — v2 failure diagnosis

## Contracts

- Internal, API version 1: `YardExtensionManifest`, `YardCommand`,
  `YardPermission`, `YardSetting`, `YardSurface`, `YardExtensionDefinition`
  (`packages/yard-core/src/extensions/vocabulary.ts`).
- Catalog entries are JSON-safe by construction; `assertSerializableCatalog`
  throws on function leakage.
- `permissionModel: "host-enforced"` is reported on catalog/runtime entries.
  No external compatibility promise exists for API version 1.

## Failure behavior and limitations

- Unknown extension on enable/setting PATCH: 404. Invalid setting value: 400.
- Disabled extensions fail execution with `extension-disabled` (403); the
  catalog still lists them with `enabled: false`.
- No external discovery or loading exists: unknown ids are 404, never
  fetched. No waveform/metadata/search provider contracts are implemented
  (`EXTENSION_POINTS` marks them `unavailable`).
- `sidebar.panel` surfaces do not mount panels generically; sidebar/shelf UI
  is explicit app wiring.

## Source map (real file paths)

- `packages/yard-tools/*-v2/src/{definition,handlers}.ts` — the live v2 ports
- `packages/yard-core/src/extensions/{vocabulary,extension-registry,extension-command-registry,extension-context,extension-host}.ts`
- `src/lib/extensions/{registry,runtime,host,catalog,settings-store,kv-store}.ts`
- `src/lib/extensions/ui-contributions.ts` — extension points + context-menu adapter
- `src/app/api/extensions/route.ts` — grid, catalog, enable/setting PATCH
- `src/app/api/extensions/execute/{route,transport}.ts` — execution + envelope validation

## Examples

List the catalog projection (empty since full retirement):

```bash
curl '/api/extensions?view=catalog' | jq '.extensions[].id'
```

Toggle a v2 tool on:

```bash
curl -X PATCH /api/extensions-v2/extensions/sound-shelf-v2 \
  -H 'Content-Type: application/json' \
  -d '{"enabled":true}'
```

There is no `examples/` gap: the runnable-in-repository examples are
`extensions/selected-ids`, `core/query-library`, and
`extensions-v2/minimal` (see `docs/index.md`).

## Related documentation

- `docs/commands.md` — the retired-command table and execution model
- `docs/settings.md` — setting storage, validation, renderer prefs
- `docs/events.md` — what is (and is not) an event
- `docs/architecture/extensions.md` — registration → UI trace, v1 and v2
- `docs/runtime.md` — v1/v2 identity side by side in the snapshot
