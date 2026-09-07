# Extension v2 troubleshooting

> Feature status: internal (bundled only)
> Contract: internal, API version 2
> Owner: `src/app/prototype/ext-v2-workbench/` + `src/lib/extensions-v2/`
> Applies to: docs manifest ID (`extensions-v2-troubleshooting`); development checkout when unbuilt

## What it does

Diagnoses the common v2 failures in order: availability denials,
permission denials, grant problems, plan rejections, job outcomes,
state migration failures, and unknown capabilities. Each section
names the symptom, the check, and the fix. Exported diagnostics stay
redacted; local views may show more.

## Responsibilities and boundaries

- The workbench inspector
  (`src/app/prototype/ext-v2-workbench/inspector.tsx`) owns local
  diagnosis: invocation/job IDs, transitions, availability reasons,
  denied permission names, sanitized errors, run modes.
- `src/app/prototype/ext-v2-workbench/redact.ts` owns export
  redaction: paths, settings values, tokens, secrets, and raw stacks
  are cut within 2000-char and 100-record bounds while `vinv_`,
  `vjob_`, and `vplan_` IDs survive.
- `GET /api/runtime` owns the read-only snapshot both sides check
  first. It never executes handlers and never creates the database.

## Runtime behavior

### Start here

1. Fetch the snapshot and confirm both systems:
   `curl /api/runtime | jq '{v1: .extensionSystems[0], v2: .extensionSystems[1]}'`.
   Missing IDs mean registration never ran; `enabled: false` on v2
   means nobody enabled it yet.
2. Check availability before execution:
   `GET /api/extensions-v2/availability?extensionId=…&commandId=…`.
   The reason names the blocker (disabled, selection, capability,
   permission, context).
3. Reproduce in the workbench (`/prototype/ext-v2-workbench`) with
   `FOLEYARD_V2_DEV_FIXTURES=1` and read the inspector log.

### Failure table

| Symptom | Check | Fix |
| --- | --- | --- |
| `extension-disabled` (403) | extensions GET shows `enabled: false` | PATCH enable; disabling also cancels live jobs |
| `permission-denied` (403) | inspector names the denied permission; approvals GET shows the gap | POST the missing permission to approvals; nothing auto-grants |
| capability unavailable | command lists `requiredCapabilities`; app host exposes none, desktop adds `desktop.native` in desktop mode | remove the requirement or run where the capability exists; unknown never counts as available |
| grant rejected / expired | grants live in memory and die on restart | pick the destination again for a fresh grant ID |
| plan rejected: altered/expired/replayed | TTL is 15 min default, 1 h max, single use | prepare a fresh plan; do not resend consumed IDs |
| job interrupted after restart | job history keeps known outputs + recovery note | review outputs, resubmit with fresh authorization; effects never replay |
| state migration disabled the extension | settings GET diagnosis names the failure; prior data is preserved | fix the stored shape or reset, then re-enable |
| empty shelf/recent source | sources report store failure instead of empty | check the persisted record; the adapter never executes v1 commands |
| catalog missing an extension | registry validation rejects with a diagnostic code | fix duplicate IDs, namespace ownership, unresolved command refs, or unknown permissions |

### Diagnostics hygiene

Local inspector views show detail for the operator's own run.
Exports (runtime info file, inspector JSON, job history) carry only
redacted payloads: no grant tokens, settings values, private paths,
or raw stacks. Job snapshots persist ownership metadata and owned
output paths, never tokens. History is bounded (100 records, newest
50 retained); logs are bounded (2000 chars, 100 records).

## Contracts

- Internal. Failure codes follow the transport status map in
  `docs/extensions-v2.md` (400 invalid, 403 disabled/denied, 404
  unknown/unresolvable, 413 over limits, 500 host faults).
- Availability reasons are user-readable and stable enough to show;
  they are rechecked at execution start, so a shown-available
  command can still fail closed.

## Failure behavior and limitations

- A timeout alone cannot stop in-process work; cancellation is
  cooperative between operations.
- Reloads and reconnects poll by job ID; no ownership is lost when
  an HTTP request ends.
- Renderer state (selection, shortcuts, media) is unknown
  server-side by design.

## Source map (real file paths)

- `src/app/prototype/ext-v2-workbench/{page,inspector,redact,fixture-handlers}.tsx`
- `src/app/prototype/ext-v2-workbench/{history,reload}/route.ts`
- `src/lib/extensions-v2/{host,policy,jobs,job-client}.ts`
- `src/lib/runtime-info.ts` — read-only snapshot
- `packages/yard-core/src/extensions-v2/{availability,transport,jobs,plans}.ts`

## Related documentation

- `docs/extensions-v2.md` — authoring contracts behind these errors
- `docs/extensions-v2-migration.md` — enable/approve/revoke flow
- `docs/runtime.md` — snapshot sections to check first
- `docs/events.md` — v1 events beside the five v2 contracts
