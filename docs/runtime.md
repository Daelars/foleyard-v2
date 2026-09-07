# Runtime introspection

> Feature status: shipped
> Contract: internal
> Owner: `src/lib/runtime-info.ts`
> Applies to: docs manifest ID (`runtime`); development checkout when unbuilt

## What it does

`GET /api/runtime` returns a read-only server snapshot (DTO `schemaVersion:
1`) aggregating identity, capabilities, commands, extensions, events,
extension points, settings refs, docs location, and limitations, for
both extension systems. The v1 section covers the six tools; the v2
section covers the v2 registry (Make Pack v2 plus any active
fixtures in development). The desktop
side answers `desktop:get-runtime-info` with main-owned identity and the
installed handler list. Help/About's "Export runtime info" merges both for a
user-invoked diagnostic file. Everything is internal: no secrets, grant
tokens, env, raw DB objects, settings values, private paths, or stack traces
are ever included.

## Responsibilities and boundaries

- `src/lib/runtime-info.ts` (`getServerRuntimeSnapshot`) owns the server
  snapshot. It registers extensions for identity only and overlays enabled
  flags best-effort.
- `electron/main/runtime-info.cjs` (`getDesktopIdentity`) owns desktop
  identity: platform, packaged state, app version, Next BUILD_ID,
  resources/docs paths, installed channels.
- `src/components/settings/about-tab.tsx` (`handleExportRuntimeInfo`) owns
  the user-invoked export: fetches `/api/runtime`, appends desktop info, and
  downloads `foleyard-runtime-info.json`.
- The renderer is never observed server-side: renderer capabilities report
  `unknown`, and the server `providers` list marks renderer `absent`.

## Runtime behavior

`GET /api/runtime` snapshot shape:

| Section | Content |
| --- | --- |
| `schemaVersion` / `observedAt` | `1` + ISO timestamp |
| `identity` | product, `version` (root `package.json`), `coreVersion` (yard-core), `buildId` (`.next/BUILD_ID`), `sourceRevision`/`sourceDirty` (env), `environment`, `mode` (web/desktop), `platform` |
| `providers` | server `present`; renderer `absent`; desktop `present` iff `FOLEYARD_DESKTOP=1` |
| `database` | `getDatabaseVersionInfo()` probe — no handle, so `not-initialized` when unopened |
| `capabilities` | `describeCapabilities` with real service/desktop composition |
| `commands` | flattened catalog command descriptions (no functions) |
| `extensions` | per-tool id/name/provider/version/`bundled`/registered/enabled/`per-command`/`internal`/apiVersion/permissions/commandIds/surfaces/docsId |
| `events` / `extensionPoints` | `listEvents()` / `listExtensionPoints()` |
| `settingsSchemaRefs` | `["settings.md", "extensions.md#settings", "commands.md", "extensions-v2.md"]` |
| `extensionSystems` | v1 (API 1) + v2 (API 2) identity with registered IDs |
| `extensionsV2` | per-v2-extension id/name/version, `registered`, in-memory `enabled`, apiVersion, standing, declared vs effective permissions, `approvalsKnown`, command/contribution IDs, settings schema (defaults only), docs refs |
| `eventsV2` | the five typed v2 contracts with host ownership |
| `documentation` | manifest id, product version, index + document ids, runnable examples |
| `limitations` | trusted-code note, no external loading, renderer unknown, v2 bundled-only and cooperative-cancellation notes |

v2 reading rules: definitions come from the production registry only.
Reading a definition never runs its handler. Enabled flags are the
in-memory set (v2 extensions stay disabled until explicit enable).
Effective permissions are declared intersected with approvals
restored through a read-only handle. Per-command availability needs
a live selection, so the snapshot reports declared
`requiredCapabilities`, never live verdicts.

DB handling: the snapshot path opens the existing database file with
a short-lived read-only handle only to read `extension:*:enabled`
flags and the `v2:approvals` row, and closes it before returning. A
missing or unreadable file degrades explicitly instead: v1 flags
stay at their default, v2 `approvalsKnown` reads false, and the
`database` section reports `{ state: "not-initialized", migration:
"unversioned" }` from the handle-free probe. Nothing the snapshot
does creates, migrates, or writes the database. (An earlier revision
read v1 flags through the read-write repository, which opened and
migrated the file on first touch; `readRuntimeDatabaseFlags` in
`src/lib/runtime-info.ts` now owns the read-only path.)

Agent workflow (supported, read-only): fetch the exported snapshot →
verify `identity` against the docs manifest (`foleyard-docs`, matched
product version) → read `docs/index.md` → follow `docsId` links to the
relevant subsystem guide → use its contracts/examples → report missing
providers or version mismatch explicitly. Never infer installed capabilities
from the checkout version: the checkout is not proof of the installed build;
only the exported snapshot (plus desktop identity) describes the running app.

## Contracts

- Internal DTO, schema version 1. No stability promise beyond the fields
  above; consumers must tolerate missing optional identity fields.
- `desktop:get-runtime-info` (invoke, no payload) returns the desktop
  identity object including `installedChannels` (simulator excluded when
  packaged).

## Failure behavior and limitations

- Renderer session state (shortcuts, selection, media) is unknown
  server-side by design — reported, not blocked on.
- Unversioned databases report `unversioned`; this is pre-ledger, not
  version 0.
- Desktop info may be unavailable in web mode; the export records an error
  marker instead of failing.
- Export never executes commands or reads settings values.

## Source map (real file paths)

- `src/lib/runtime-info.ts` — snapshot builder + read-only flag reader
- `src/lib/extensions-v2/host.ts` — v2 registry and enablement source
- `src/app/api/runtime/route.ts` — `GET /api/runtime`
- `electron/main/runtime-info.cjs` — desktop identity
- `electron/main/ipc.cjs` — `desktop:get-runtime-info` handler
- `electron/preload.cjs` — `getRuntimeInfo` bridge method
- `src/lib/desktop.ts` — bridge types
- `src/components/settings/about-tab.tsx` — export action
- `src/lib/documentation.ts` — docs location section

## Examples

```bash
curl /api/runtime | jq '{version: .identity.version, db: .database, limitations}'
curl /api/runtime | jq '{systems: .extensionSystems, v2: [.extensionsV2[].id]}'
```

Expected (development web checkout, DB unopened):

```json
{ "version": "0.1.8", "db": { "state": "not-initialized" }, "limitations": ["…"] }
```

## Related documentation

- `docs/index.md` — the manifest the snapshot points at
- `docs/commands.md` — command projection semantics
- `docs/events.md` — event catalog semantics
- `docs/architecture/desktop.md` — desktop identity and channels
