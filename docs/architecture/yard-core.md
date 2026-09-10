# yard-core architecture

> Feature status: shipped
> Contract: internal
> Owner: `packages/yard-core/src/index.ts`
> Applies to: docs manifest ID (`architecture/yard-core`); development checkout when unbuilt

## What it does

`yard-core` is the framework-agnostic business layer: domain models,
repository/service contracts, scan types, filename helpers, async utilities,
and the extension v2 contracts/host/operations/jobs under
`extensions-v2/`. It defines
contracts; the app provides adapters (SQLite repositories, `ScanRunner`,
filesystem boundary). It depends on nothing React/Next/Electron — no UI
framework, no route handlers, no window objects. There is no public SDK and
no external loading; the extension API (`V2_EXTENSION_API_VERSION = 2`) is
internal, and the version 1 engine was removed.

## Responsibilities and boundaries

Contracts live here; adapters live in the app:

| Contract (yard-core) | Adapter (app) |
| --- | --- |
| `repositories/*` interfaces | `src/lib/database/*` SQLite repositories, wired in `src/lib/db.ts` |
| `services/library/scanner-service` | `ScanRunner` in `src/lib/scanner/` |
| `services/organization/*`, `services/search/*` | repository-backed services via `createExtensionServices` |
| `extensions-v2/*` contracts + host + operations + jobs | `src/lib/extensions-v2/*` adapters (host, ports, sources, policy, jobs, UI resolvers) |
| `domain/*` models | constructed by scanner/repositories, read by routes/UI |

`yard-core` never imports the app, and tools import `yard-core` only.

## Runtime behavior

Barrel (`src/index.ts`) re-exports: `domain/*`, the v2 extension API
(`extensions-v2/*`), `errors/yard-core-error`, `repositories/*`,
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
callbacks (see `docs/events.md`). There is no `services/commands/` module
(deleted in #130); `normalizeDirectoryPath` is the kept sibling.

## Contracts

- Internal contracts only: repository interfaces, service interfaces,
  extension v2 definitions, failure codes, catalog and outcome envelopes.
  Standing `V2_EXTENSION_API_STANDING = "internal"`.
- Definitions are pure data and catalog projection is JSON-safe (handlers
  and validators never serialize).

## Failure behavior and limitations

- v2 failures use typed codes (`input-invalid`, `permission-denied`,
  `selection-*`, `context-unsupported`, `payload-too-large`,
  `review-required`, `job-unknown`, `plan-*`, `handler-*`) mapped to HTTP
  by the transport table.
- Destination and source access travel through grant stores with canonical
  path containment; raw paths never reach handlers. Trusted bundled code is
  not sandboxed against direct Node imports.
- `yard-core` performs no I/O itself; misconfigured adapters (no roots, no
  DB) fail at the adapter layer, not in contracts.

## Source map (real file paths)

- `packages/yard-core/src/index.ts` — public barrel
- `packages/yard-core/src/domain/{audio-file,collection,library,playback,search,tag,filename}.ts`
- `packages/yard-core/src/repositories/{audio-file,collection,favorite,settings,tag}-repository.ts`
- `packages/yard-core/src/services/library/{library-service,scanner-service,scan-types}.ts`
- `packages/yard-core/src/services/organization/{collection,favorite,tag}-service.ts`
- `packages/yard-core/src/services/search/filter-service.ts`
- `packages/yard-core/src/extensions-v2/` — version, definition, registry, catalog, availability, permissions, grants, filesystem, host, operations, jobs, plans, extension-data, events, contributions, transport, index
- `packages/yard-core/src/errors/yard-core-error.ts`
- `packages/yard-core/src/async/map-concurrent.ts`
- `packages/yard-core/CONTEXT.md` — context language (Library, Collection, …)

## Examples

```ts
import { sanitizeFilename, V2_EXTENSION_API_VERSION } from "yard-core";

sanitizeFilename("a/b:c?.wav"); // safe file name
V2_EXTENSION_API_VERSION; // 2
```

## Related documentation

- `docs/architecture/extensions.md` — how the app executes on these contracts
- `docs/commands.md` — command metadata and outcomes
- `docs/extensions.md` — bundled tools built on the vocabulary
- `CONTEXT-MAP.md` — context relationships
