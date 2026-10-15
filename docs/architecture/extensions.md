# Extension architecture

> Feature status: shipped
> Contract: internal
> Owner: `src/lib/extensions-v2/host.ts` + `packages/yard-core/src/extensions-v2/host.ts`
> Applies to: docs manifest ID (`architecture/extensions`); development checkout when unbuilt

## What it does

Traces the full path from a tool's static declaration to pixels:
definition → registry → catalog/availability → host → operations →
jobs/plans → UI. Version 1 was removed from the app; the v2 engine is the
only extension runtime. There is no external discovery, loading,
marketplace, or public authoring SDK.

## Responsibilities and boundaries

- Each tool package owns its `definition.ts` (pure data) and
  `handlers.ts` (operations over injected services); handlers never
  import app internals, storage drivers, React, or Electron.
- `packages/yard-core/src/extensions-v2/` owns the framework-free engine:
  registry validation, catalog serialization, availability, permissions
  and grants, host execution, jobs, plans, and the HTTP transport codec.
- `src/lib/extensions-v2/runtime.ts` owns the one process-wide v2
  runtime: registration, host execution, plans, grants, picker proofs,
  jobs, enablement, approvals, and events. Next compiles each route into its
  own bundle, so module state forks per route subtree even though the
  process is one realm; every module reads its slice through
  `getV2Runtime()` instead of keeping a per-bundle copy, and the
  creation guard is structural so a re-evaluated module reuses the
  existing runtime.
- `src/lib/extensions-v2/host.ts` composes the production registry and
  per-port handlers behind `getAppV2Host()`, held on that runtime.
- The renderer owns all UI: V3 adapters in
  `src/app/(variant-i)/components/`, palette entries, context menus,
  dialogs, and panels. Contributions declare intent; the renderer
  resolves items per point through the shared availability evaluator.

## Runtime behavior

End-to-end trace for `POST /api/extensions-v2/execute { extensionId,
commandId, selection, input }`:

1. **Registration.** Each `ensure*V2Registered()` puts its port's
   definition and handlers on the process-wide app host once
   (sound-shelf, folder-janitor, smart-collections, make-pack,
   drop-rules, library-gatherer, auto-tag). Registration never
   enables and never approves.
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
   services. A plan can also run as a background job
   (`POST /api/extensions-v2/plans/:planId/job`), which reuses the same
   plan revalidation and hands the handler the stored targets and
   options, so the job executes the reviewed plan rather than a source
   re-resolved after review. Operation errors map to typed failure
   codes; a v2 failure is final and never falls through to another
   system.
4. **Services.** Handlers use paged Library reads, named selection
   sources (shelf reads `v2shelf:sound-shelf-v2`, recent reads the
   recent record), authorized file/archive output, namespaced
   settings/state, and job reporting — never raw DB, routes, React,
   or Electron. Every output is created exclusively (the create is the
   claim, so a pre-existing file is never truncated and concurrent jobs
   cannot both claim a destination) and tracked with the created file's
   version, so cancellation cleanup removes only entries that job made.
5. **UI.** Values, review plans, and job outcomes return typed; the
   route-local adapters render dialogs, progress and results (there is
   no generic form/preview/result renderer). A terminal job exposes a
   bounded summary: a succeeded job's declared result is projected onto
   the command `result` schema (`terminal-results.ts`) with undeclared
   fields dropped and strings, arrays, and the whole projection
   hard-capped; a failed, cancelled, or interrupted job exposes a
   bounded, redacted diagnostic. The raw handler value and the
   projection are memory-only — a persisted snapshot never carries a
   value, a grant, a stack, or a private path. Per-item availability
   comes from the same evaluator as preflight. Disable removes
   contributions and listeners.

Module dependency direction (enforced by
`node scripts/check-v2-boundaries.cjs` in CI): definitions →
registry → catalog/availability → host → operations → jobs/plans;
application adapters sit above core and below routes/components;
tool packages import `yard-core` and relatives only.

## Contracts

- Internal, API version 2: definition vocabulary (commands, permissions,
  scopes, settings, contributions, value schemas), failure codes,
  catalog and outcome envelopes.
- Destination and source access travel through grant stores; raw paths
  never reach handlers. A grant is issued only when the desktop picker
  minted a single-use proof for that extension and grant kind, so a
  caller-supplied path is never consent.
- Output creation is exclusive: `V2FileContentPorts.copyFile` /
  `writeFileBytes` and `V2ArchivePorts.createZipArchive` reject an
  existing destination with `V2OutputConflictError` (a stable `code`,
  not a class identity, because route bundles re-evaluate core) and
  report the created entry's `V2FileVersion`;
  `deleteFileIfVersion` removes only that version.
- Job terminal results are bounded and schema-shaped:
  `projectV2JobResultValue` (`terminal-results.ts`) drops undeclared
  properties and caps strings, arrays, and the serialized projection;
  `redactV2JobDiagnosticMessage` removes stacks and absolute paths and
  caps message length; `persistedV2JobRecord` (`snapshot`) drops the
  value and the projection and redacts diagnostics, while
  `exposedV2JobRecord` (transport) adds the bounded value and the
  state-derived diagnostic.
- No provider contracts (waveform/metadata/search) exist; extension
  points mark them `unavailable`.

## Failure behavior and limitations

- Envelope failures precede execution; failure codes map through the
  transport status table (400/403/404/413/500).
- Null envelopes and unknown ids fail closed; nothing is fetched or loaded.
- Jobs are host-owned and cooperative; plans require host-stamped review
  and expire, and a plan-bound job reuses that review binding so it runs
  the reviewed targets/options rather than a re-resolved source. No
  generic undo.

## Source map (real file paths)

- `packages/yard-tools/*-v2/src/{definition,handlers}.ts`
- `packages/yard-core/src/extensions-v2/{registry,catalog,availability,permissions,grants,picker-proofs,host,jobs,plans,transport,operations}.ts`
- `packages/yard-core/src/extensions-v2/terminal-results.ts` — bounded
  result projection and diagnostic redaction
- `packages/yard-core/src/extensions-v2/output-ownership.ts` — created-file
  versions and the output-conflict error; `src/lib/extensions-v2/output-files.ts`
  — exclusive creation and version-checked removal
- `src/lib/extensions-v2/runtime.ts` — the one process-wide v2 runtime
- `src/lib/extensions-v2/host.ts` — production registry + enablement
- `src/lib/extensions-v2/picker-grant-client.ts` — the renderer picker-to-grant flow
- `src/app/api/extensions-v2/**/route.ts` — HTTP surface
- `src/app/(variant-i)/components/extensions/**` — V3 adapters
- `src/components/CommandPalette/` + `src/app/library/use-palette.ts`

## Examples

```bash
# Catalog (effective permissions, serializable)
curl /api/extensions-v2 | jq '.catalog.entries[].id'
# Availability (reasons, never executes)
curl '/api/extensions-v2/availability?extensionId=make-pack-v2&commandId=make-pack-v2.from-shelf'
# Execute
curl -X POST /api/extensions-v2/execute \
  -H 'Content-Type: application/json' \
  -d '{"extensionId":"sound-shelf-v2","commandId":"sound-shelf-v2.list","selection":{"fileIds":[]}}'
# Jobs and plans
curl '/api/extensions-v2/jobs'
```

## Related documentation

- `docs/extensions.md` — tool catalog and permission model
- `docs/extensions-v2.md` — v2 authoring and runnable examples
- `docs/commands.md` — command inventory and failure codes
- `docs/architecture/yard-core.md` — contracts underneath
- `docs/architecture/application.md` — routes and state ownership
- `docs/extensions-v2-migration.md` — v1 retirement record
