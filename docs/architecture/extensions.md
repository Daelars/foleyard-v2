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
- `src/lib/extensions-v2/host.ts` composes the production registry and
  per-port handlers behind `getAppV2Host()`.
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
   failure is final and never falls through to another system.
4. **Services.** Handlers use paged Library reads, named selection
   sources (shelf reads `v2shelf:sound-shelf-v2`, recent reads the
   recent record), authorized file/archive output, namespaced
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
tool packages import `yard-core` and relatives only. Diagrams live
in `public/extension-system-v2.html`.

## Contracts

- Internal, API version 2: definition vocabulary (commands, permissions,
  scopes, settings, contributions, value schemas), failure codes,
  catalog and outcome envelopes.
- Destination and source access travel through grant stores; raw paths
  never reach handlers.
- No provider contracts (waveform/metadata/search) exist; extension
  points mark them `unavailable`.

## Failure behavior and limitations

- Envelope failures precede execution; failure codes map through the
  transport status table (400/403/404/413/500).
- Null envelopes and unknown ids fail closed; nothing is fetched or loaded.
- Jobs are host-owned and cooperative; plans require host-stamped review
  and expire. No generic undo.

## Source map (real file paths)

- `packages/yard-tools/*-v2/src/{definition,handlers}.ts`
- `packages/yard-core/src/extensions-v2/{registry,catalog,availability,permissions,grants,host,jobs,plans,transport,operations}.ts`
- `src/lib/extensions-v2/host.ts` — production registry + enablement
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
- `public/extension-system-v2.html` — lifecycle diagrams
