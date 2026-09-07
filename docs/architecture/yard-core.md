# yard-core architecture

> Feature status: shipped
> Contract: internal
> Owner: `packages/yard-core/src/index.ts`
> Applies to: docs manifest ID (`architecture/yard-core`); development checkout when unbuilt

## What it does

`yard-core` is the framework-agnostic business layer: domain models,
repository/service contracts, scan types, filename helpers, async utilities,
and two extension systems (v1 vocabulary/registries/context/host, and
the v2 contracts/host/operations/jobs under `extensions-v2/`). It defines
contracts; the app provides adapters (SQLite repositories, `ScanRunner`,
filesystem boundary). It depends on nothing React/Next/Electron — no UI
framework, no route handlers, no window objects. There is no public SDK and
no external loading; both extension APIs (`YARD_EXTENSION_API_VERSION = 1`,
`V2_EXTENSION_API_VERSION = 2`) are internal.

## Responsibilities and boundaries

Contracts live here; adapters live in the app:

| Contract (yard-core) | Adapter (app) |
| --- | --- |
| `repositories/*` interfaces | `src/lib/database/*` SQLite repositories, wired in `src/lib/db.ts` |
| `services/library/scanner-service` | `ScanRunner` in `src/lib/scanner/` |
| `services/organization/*`, `services/search/*` | repository-backed services via `createExtensionServices` |
| `extensions/*` vocabulary + host | `src/lib/extensions/{registry,host,catalog}` composition |
| `extensions-v2/*` v2 contracts + host + operations + jobs | `src/lib/extensions-v2/*` adapters (host, ports, sources, policy, jobs, UI resolvers) |
| `domain/*` models | constructed by scanner/repositories, read by routes/UI |

`yard-core` never imports the app, and tools import `yard-core` only.

## Runtime behavior

Barrel (`src/index.ts`) re-exports: `domain/*`, extension vocabulary +
registries + context + host, `errors/yard-core-error`, `repositories/*`,
`services/library/*`, `services/organization/*`,
`services/search/filter-service`, filename helpers (`sanitizeFilename`,
`makeUniqueFilename`), and `mapConcurrent`.

- `domain/` — `audio-file`, `collection`, `library`, `playback`, `search`,
  `tag`, plus `filename` helpers used by drop/make-pack naming.
- `repositories/` — `audio-file`, `collection`, `favorite`, `settings`, `tag`
  interfaces the SQLite layer implements.
- `services/library/` — `library-service`, `scanner-service`,
  `scan-types` (phases, validation results, supported-audio detection).
- `services/search/filter-service.ts` — `normalizeDirectoryPath`, shared by
  browse and file queries.
- `services/organization/` — collection/tag/favorite boundaries.
- `extensions/` — `vocabulary` (manifest, commands, permissions, settings,
  surfaces, UI intents, `YARD_EXTENSION_API_VERSION`), `extension-registry`,
  `extension-command-registry` (`YardCommandRegistry`), `extension-context`,
  `extension-host` (`YardExtensionHost` with `guardHostServices`).
- `extensions-v2/` — framework-free v2 contracts: `version`
  (`V2_EXTENSION_API_VERSION = 2`, standing internal), `definition`,
  `registry`, `catalog` (serializable projection), `invocation`,
  `selection`, `availability` (shared evaluator), `host`
  (`ExtensionV2Host`, single path for HTTP and direct calls),
  `transport` (routes, status map, envelopes), `permissions`
  (declared∩approved), `grants`, `filesystem` (ADR guards),
  `operations` (narrow services), `jobs` (lifecycle + polling),
  `plans` (prepare/review/apply), `extension-data` (settings/state),
  `events` (typed bus), `contributions` (point resolution).
- `async/map-concurrent.ts` — bounded concurrency for scan/metadata work.

There is no EventBus in `yard-core`: subscription-event references are stale;
the real notification paths are IPC pushes, renderer-local events, and scan
callbacks (see `docs/events.md`). There is no `services/commands/` module —
the old `CommandRegistry`/`CommandDefinition` (predating
`YardCommandRegistry`, never instantiated) and the caller-less
`matchesDirectory` export were deleted in #130; `normalizeDirectoryPath` is
the kept sibling.

## Contracts

- Internal contracts only: repository interfaces, service interfaces,
  extension vocabulary, host outcome/reason types. Standing
  `YARD_EXTENSION_API_STANDING = "internal"`.
- `defineYardCommand` / `describeYardCommand` / `describeYardManifest` keep
  metadata JSON-safe (functions never serialized).

## Failure behavior and limitations

- `YardPermissionError` (missing manifest permission) and
  `YardCommandValidationError` (bad input) map to `permission-denied` /
  `validation-failed` host outcomes; anything else is `execution-failed`.
- Guarded services deny without the granted permission even when a handler
  omits `require()` — but only for provided services, not direct Node
  imports by trusted bundled code.
- `yard-core` performs no I/O itself; misconfigured adapters (no roots, no
  DB) fail at the adapter layer, not in contracts.

## Source map (real file paths)

- `packages/yard-core/src/index.ts` — public barrel
- `packages/yard-core/src/domain/{audio-file,collection,library,playback,search,tag,filename}.ts`
- `packages/yard-core/src/repositories/{audio-file,collection,favorite,settings,tag}-repository.ts`
- `packages/yard-core/src/services/library/{library-service,scanner-service,scan-types}.ts`
- `packages/yard-core/src/services/organization/{collection,favorite,tag}-service.ts`
- `packages/yard-core/src/services/search/filter-service.ts`
- `packages/yard-core/src/extensions/{vocabulary,extension-registry,extension-command-registry,extension-context,extension-host,index}.ts`
- `packages/yard-core/src/errors/yard-core-error.ts`
- `packages/yard-core/src/async/map-concurrent.ts`
- `packages/yard-core/CONTEXT.md` — context language (Library, Collection, …)

## Examples

```ts
import { defineYardCommand, YardExtensionHost, sanitizeFilename } from "yard-core";

const def = defineYardCommand({ id: "x.y", title: "Y", description: "…", scope: "global" });
sanitizeFilename("a/b:c?.wav"); // safe file name
```

## Related documentation

- `docs/architecture/extensions.md` — how the app executes on these contracts
- `docs/commands.md` — command metadata and outcomes
- `docs/extensions.md` — bundled tools built on the vocabulary
- `CONTEXT-MAP.md` — context relationships
