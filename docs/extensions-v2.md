# Extension authoring (v2 API)

> Feature status: internal (bundled only)
> Contract: internal, API version 2
> Owner: `packages/yard-core/src/extensions-v2/` + `src/lib/extensions-v2/`
> Applies to: docs manifest ID (`extensions-v2`); development checkout when unbuilt

## What it does

The v2 extension API lets a bundled package add a workflow by shipping
one definition and one registration call. The definition declares
identity, commands, settings, contributions, and permissions. The host
supplies validation, authorized operations, execution tracking,
persistence, and standard UI. There is no marketplace, no external
code loader, and no public stability promise. API version, extension
package version, product version, and runtime schema version stay
separate (see `packages/yard-core/src/extensions-v2/version.ts`).

Version 1 of the extension API was retired: its packages, routes,
commands, settings and events are gone, and v2 is the only extension
engine. See `docs/extensions-v2-migration.md` for the retirement
record.

## Responsibilities and boundaries

- `packages/yard-core/src/extensions-v2/` owns framework-free
  contracts: definitions, registry, catalog, invocation, availability,
  permissions, grants, filesystem guards, operations, jobs, plans,
  settings/state stores, events, contributions, transport.
- `src/lib/extensions-v2/` owns application adapters: host
  composition, Library ports over repository contracts, node file
  ports,   settings/state rows, archive codec, shelf/recent sources,
  policy persistence, job wiring, UI resolvers.
- `src/app/api/extensions-v2/` owns thin HTTP wrappers over the
  transport codec. One host execution path serves HTTP and direct
  invocation.
- `src/components/extensions-v2/` owns shared data shapes and the
  renderer-neutral resolver; the promoted surface renders the actual UI
  through route-local adapters in `src/app/(variant-i)/components/`.
  There is no generic form, preview or result renderer.
- Extensions never import React, Next routes, Electron, database
  handles, application internals, raw filesystem/process/network
  access, or v1 extension modules. `node scripts/check-v2-boundaries.cjs`
  enforces this in CI.

## Runtime behavior

### Definitions and registration

A definition carries `id`, `name`, `version`, `apiVersion: 2`,
`description`, `permissions`, `commands`, `settings`,
`contributions`, and `docsRefs`. The registry validates duplicate
IDs, namespace ownership, malformed defaults, unsupported API
versions, unresolved command references, unknown permissions, and
unsupported contribution/scope types, and rejects incompatible
definitions with actionable diagnostics. Catalogs are serializable by
construction; `assertJsonSerializable` throws on function leakage
with JSON paths.

Bundled packages use explicit static registration. There is no
installer:

```ts
import { createMinimalDefinition, registerMinimalHandlers } from "@foleyard/minimal";
import { getAppV2Host, registerV2Extension } from "@/lib/extensions-v2/host";

registerV2Extension(createMinimalDefinition());
registerMinimalHandlers(getAppV2Host());
```

Registration never enables and never approves. New extensions stay
disabled and denied until explicit enable + approval. Bundled
registration is isolated per port: a malformed definition is reported
and skipped instead of aborting the route bundle that imported the host.

`unregisterV2Extension(extensionId)` is the supported unload operation
for bundled code (there is no hot reload and no third-party unload path).
It removes the definition, its command handlers, its enablement row and
its pending UI, and requests cancellation of its live jobs; subsequent
`execute` calls fail as unknown, and a later re-registration must call
`registerHandler` again because stale handlers are never retained.

### Lifecycle hooks

A definition may declare `lifecycle` with `onEnabled` and `onDisabled`
command references (both must point at commands in the same definition;
the registry rejects unresolved references).

- Hooks run on enable and disable **after** enablement is persisted and
  **before** the `contributions-changed` notification; the PATCH route
  awaits that ordering.
- A disable hook must run after the extension is already disabled, so
  the lifecycle path skips only the enabled gate. Everything else —
  ownership, that the command is actually a declared hook, availability,
  capabilities, and effective permissions — still applies: a hook can
  never bypass a permission check.
- Hook failures are isolated and reported to the server log; the
  enablement change stands and the caller never sees a rejection, so a
  broken hook cannot leave enablement and persisted state disagreeing.

### Invocation, availability, transport

Every run gets a `vinv_` invocation ID. Availability is one pure
function (`evaluateV2Availability`) used by renderer reads and
execution preflight alike: enabled state, scope context, selection,
input, unknown-capability denial, and granted permissions. Unknown
required capabilities deny. The host rechecks at execution start.

Routes (all under `src/app/api/extensions-v2/`, envelopes
`{ ok, error }`):

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/extensions-v2` | GET | serializable catalog: effective (granted) permissions plus the declared set requirements are evaluated against |
| `/api/extensions-v2/availability` | GET | availability with reasons, never executes |
| `/api/extensions-v2/execute` | POST | immediate or reviewed execution |
| `/api/extensions-v2/plans/:planId` | GET | review a prepared plan |
| `/api/extensions-v2/plans/:planId/apply` | POST | apply a reviewed plan |
| `/api/extensions-v2/jobs` | POST / GET | submit work (202) / poll history |
| `/api/extensions-v2/jobs/:jobId` | GET | poll one job |
| `/api/extensions-v2/jobs/:jobId/cancel` | POST | request cancellation |
| `/api/extensions-v2/extensions` | GET | enablement + effective permissions |
| `/api/extensions-v2/extensions/:id` | PATCH | `{ enabled: boolean }` |
| `/api/extensions-v2/extensions/:id/approvals` | POST / DELETE | approve / revoke permissions |
| `/api/extensions-v2/grants` | POST | bridge a picked folder into a grant ID |
| `/api/extensions-v2/settings/:id` | GET | declarations + values + diagnosis |
| `/api/extensions-v2/settings/:id/:settingId` | PUT | validated write |
| `/api/extensions-v2/settings/:id/reset` | POST | reset one setting |

Limits: 256 KiB body, 64 KiB input, 500 selection IDs. Status map:
200 immediate/review, 202 job, 400 invalid, 403 disabled/denied,
404 unknown/unresolvable, 413 over limits, 500 host faults.

Handlers see an engine-owned `runMode`: `direct` previews without
side effects, `apply` runs after a reviewed plan, `job` runs in the
background. Handlers never branch on client input flags.

### Permissions and operation services

Deny by default. Effective permissions are declared intersected with
explicitly approved, in declaration order. The catalog reports the
same effective set execution enforces. Grants are destination-scoped,
expire on restart, and never reach handlers as tokens. Read paths and
mutations both need authorization. Filesystem guards enforce
canonical-path containment, traversal and link-escape denial, and
existing-ancestor resolution; job-owned cleanup removes only resources
the current job owns.

Permission and enablement changes are durable and live (#266). An
approval or enablement write that cannot be persisted is reported as a
failure, never as success, and records an explicit degraded state
(`policyHealth` on `GET /api/extensions-v2/extensions`). A grant that
could not be written is rolled back; a revocation stands fail-closed in
memory even if its write fails. A hydration failure leaves policy
unloaded (deny by default) so the next read retries instead of freezing
on a false "loaded". Operation services re-read the effective set at
every permission check, so a revocation fails a running handler closed
at its next check; a queued job rechecks before starting and is
cancelled with the typed reason when its permissions were revoked.

These services are built for trusted bundled code. They are not a
sandbox against hostile JavaScript. Do not claim untrusted extension
isolation.

### Jobs, plans, settings, events

Jobs (`vjob_` IDs) move through queued, running,
cancellation-requested, succeeded, failed, cancelled, and
interrupted. Concurrency is bounded (max 2). Cancellation is
cooperative: the host records request vs stop times and never reports
stopped while work still writes. Restart marks live jobs interrupted
with known outputs; filesystem effects never replay. Duplicate
invocation keys return the existing job. A submit checks enablement and
effective permissions, and a queued job rechecks them when it reaches
the front, so work queued before a revocation is cancelled (with the
typed reason) instead of starting; a running handler fails closed at
its next operation permission check.

A terminal job exposes a bounded summary over the polling route
(#279): `job.result.value` is the handler's declared result projected
onto the command `result` schema — undeclared fields dropped, strings,
array lengths, and the serialized projection hard-capped — and
`job.result.diagnostic` carries a bounded, redacted message for a
failed, cancelled, or interrupted job (no stacks, no absolute host
paths). The raw handler value and the projection stay in memory; a
persisted snapshot never carries a value, a grant, a stack, or a
private path.

Job persistence is coalesced (#258): state transitions and terminal
records persist immediately, while per-file progress ticks persist at
most once per two seconds, so a 500-file job performs a bounded number
of snapshot writes. Batched writes through the tag operation
(`attachMany`) land in one transaction per chunk and are idempotent per
`(file, tag)` pair, so a retried job cannot duplicate attachments.

Plans (`vplan_` IDs) bind extension, command, validated
targets/options, authorization context, expiry, and invocation.
Single use, 15-minute default TTL capped at 1 hour. Apply revalidates
targets, grants, permissions, and availability.

Settings are author-declared and validated with reset semantics; reset-all
writes each declared setting under its canonical namespaced row. Workflow
state is versioned with a declared per-version migration path; a failed
migration preserves prior data or disables with a diagnosis. State is
bounded (key length, per-value bytes, per-extension bytes and key count)
with every limit checked before persistence, and `operations.state.update`
is the atomic read-modify-write: the store is shared per extension on the
process-wide runtime, so concurrent jobs serialize instead of losing
updates. The host owns job records separately. Persist precedes notify on
every write.

Events are five typed contracts only: `settings-changed`,
`state-changed`, `approvals-changed`, `job-transition`,
`contributions-changed`. Only the host emits. Handlers never receive
the bus. Per-chunk job progress is never an event.

### Contribution points

Eight declared types resolve through the shared availability evaluator
with stable `v2:{ext}:{contrib}` keys, `order ?? 100` ordering and a
keep-both collision rule. These points mount in the workspace:

- `command-palette` → palette entries (`v2tool:` ids)
- `file-context-menu` and `folder-context-menu` → the file-table row menu
- `selection-actions` → the selection bulk bar
- `drop-menu` → the Library drop zone
- `sidebar` → the extension panel rail (`xl` and wider)

`toolbar` and `settings` are declared vocabulary with no generic mount:
each extension's settings and tool surfaces are hand-built route-local
dialogs (`make-pack-v2`, `folder-janitor-v2`, `library-gatherer-v2`,
`auto-tag-v2`, `drop-rules-v2`, `smart-collections-v2`), and previews
and results are rendered by those dialogs, not by generic components.
A contribution only renders while its extension is enabled and
approved; disabling removes its UI and listeners.

## Contracts

- Internal, API version 2, standing internal and bundled-only.
- `ExtensionV2Definition`, `V2ExecuteRequest`, `V2ExecutionResult`,
  `V2JobRecord`, `V2PlanRecord`, `V2EventPayload` in
  `packages/yard-core/src/extensions-v2/`.
- No external compatibility promise in either direction.

## Failure behavior and limitations

- Unknown capabilities deny; invalid contexts fail predictably.
- Missing, expired, or foreign grants deny.
- Altered, expired, or replayed plans reject per the documented retry rules.
- No generic undo. Reversible application changes, job-owned
  temporary cleanup, and irreversible file effects stay distinct.
- Two extensions cannot read each other's state; cross-namespace
  access is rejected by the core services.

## Source map (real file paths)

- `packages/yard-core/src/extensions-v2/{version,definition,registry,catalog}.ts` — contracts and discovery
- `packages/yard-core/src/extensions-v2/{invocation,selection,availability,transport}.ts` — invocation path
- `packages/yard-core/src/extensions-v2/{permissions,grants,filesystem,operations}.ts` — authorization
- `packages/yard-core/src/extensions-v2/{jobs,plans,extension-data,events,contributions}.ts` — lifecycle and UI data
- `src/lib/extensions-v2/host.ts` — application host composition
- `src/app/api/extensions-v2/` — HTTP wrappers
- `src/components/extensions-v2/` — shared data shapes and resolver
- `packages/yard-tools/make-pack-v2/` — reference extension
- `scripts/scaffold-extension-v2.cjs` — scaffolding CLI
- `examples/extensions-v2/minimal/` — minimal runnable example

## Author examples

Each example lists prerequisites, exact commands, expected output,
and provenance. Provenance is checkout-matched internal API version 2
unless stated otherwise.

### 1. Add a command

Prerequisites: repo checkout, `bun install` done.

```bash
node scripts/scaffold-extension-v2.cjs --name my-tool
bunx vitest run packages/yard-tools/my-tool --no-coverage
```

Expected: the scaffold writes the package files (`package.json`,
`src/definition.ts`, `src/handlers.ts`, `src/index.ts`), a vitest
suite, and a README; the generated suite passes 3/3. The definition holds one global
command (`my-tool.describe`), one setting, and palette plus settings
contributions. Remove the directory when done experimenting; bundled
packages register through explicit static registration (see above),
never through an installer. Provenance: scaffold CLI R9, API v2.

### 2. Run the minimal example

Prerequisites: `bun install` at the repo root.

```bash
bun run example:v2-minimal
```

Expected: four cases pass (serializable catalog round-trip, enabled
echo `"greeter: hello (runMode=direct)"`, disabled
`extension-disabled`, mistyped `input-invalid`). Source:
`examples/extensions-v2/minimal/run.ts`. Provenance: API v2,
`ExtensionV2Host` direct execution.

### 3. Render a standard form

Prerequisites: dev server (`bun run dev`).

Declare an object input schema on the command. Command inputs are
validated by the execution envelope and surfaced by the client adapter
that invokes the command. Exercise the same catalog and execution path
through the HTTP wrappers under `/api/extensions-v2`.
Expected: mistyped input returns 400 `input-invalid`; valid input
reaches the handler. Provenance: API v2 input contracts.

### 4. Add a sidebar list

Prerequisites: same as 3.

Declare a `sidebar` contribution pointing at a global command. The
surface's extension panel rail
(`src/app/(variant-i)/components/extensions/sidebar-panels.tsx`)
resolves items through the shared availability evaluator and renders one
panel per contributing extension. Shipped references: Make Pack v2's
`make-pack-v2.side-shelf`, Sound Shelf v2's `sound-shelf-v2.side-list`
and Auto Tag v2's status/candidate entries. Expected: the panel appears
when the extension is enabled and approved, and vanishes on disable or
approval revocation. Provenance: API v2 contribution contracts.

### 5. Add a setting

Prerequisites: dev server, extension enabled.

```bash
curl '/api/extensions-v2/settings/make-pack-v2'
curl -X PUT '/api/extensions-v2/settings/make-pack-v2/make-pack-v2.include-manifest' \
  -H 'Content-Type: application/json' -d '{"value":false}'
curl -X POST '/api/extensions-v2/settings/make-pack-v2/reset' \
  -H 'Content-Type: application/json' -d '{"settingId":"make-pack-v2.include-manifest"}'
```

Expected: GET returns declarations with values and a diagnosis;
PUT validates against the declaration (bad values return 400);
reset restores the default. Settings live namespaced per extension;
one extension cannot touch another's. Provenance: API v2 authored
settings, app `settings-state.ts` over the existing settings table
(no new migration). The self-contained version of this flow — authored
setting plus contribution resolution — is the runnable example at
`examples/extensions-v2/settings/` (`bun run example:v2-settings`).

### 6. Run a guarded operation

Prerequisites: none beyond the checkout; this is a host unit pattern.

Write the handler against `context.operations.library` /
`context.operations.files` only. A handler that skips its own
permission check still cannot read or write: every service method
rechecks the effective set, and unapproved calls fail with
`permission-denied`. The operations suite
(`packages/yard-core/src/extensions-v2/operations.test.ts`) holds the
conformance cases, including bounded 5,200-record paging and
version-checked owned-only cleanup. Expected: undeclared access fails
closed; outputs are created exclusively, so nothing outside job-owned
output is truncated or overwritten, and cleanup never deletes a
replacement at a previously owned path. Provenance: API v2 operation
services.

### 7. Run a job with progress and cancellation

Prerequisites: dev server, Make Pack v2 enabled and approved (see
`docs/extensions-v2-make-pack.md`).

```bash
curl -X POST /api/extensions-v2/jobs \
  -H 'Content-Type: application/json' \
  -d '{"extensionId":"make-pack-v2","commandId":"make-pack-v2.from-shelf","input":{"grantId":"<grant>"}}'
curl '/api/extensions-v2/jobs/<jobId>'
curl -X POST '/api/extensions-v2/jobs/<jobId>/cancel'
```

Expected: submit returns 202 with a `vjob_` ID; status polls show
queued, running, then a terminal state with partial outcomes; a
succeeded job's declared result is bounded and returned as
`job.result.value`, while a failed or cancelled job returns a bounded,
redacted `job.result.diagnostic`; cancel moves running work to
cancellation-requested and settles cancelled after owned cleanup.
Duplicate invocation keys return the existing job. Reload-safe: poll by
ID after reconnect. Provenance: API v2 jobs, app `jobs.ts` with
settings-table snapshot persistence.

### 8. Subscribe to events

Prerequisites: renderer context.

```ts
import { getV2Events } from "@/lib/extensions-v2/events";

const unsubscribe = getV2Events().subscribe("job-transition", (payload) => {
  void fetch(`/api/extensions-v2/jobs/${payload.jobId}`).then(refresh);
});
// Call unsubscribe() on unmount or disable; the bus holds no other refs.
```

Expected: transition-only delivery with sequence numbers for gap
detection; progress stays memory-only and never fires. Recovery is
always a reread of the owning store. Provenance: API v2 typed bus.

### 9. Migrate workflow state

Prerequisites: an extension with a `V2WorkflowStateStore` envelope.

```ts
// In a handler: a declared path keyed by source version, applied in order.
const { from, to } = ctx.operations.state.migrateTo(2, {
  0: (data) => ({ ...data, packName: String(data.name ?? "") }),
  1: (data) => ({ ...data, schema: "pack/v2" }),
});
```

Expected: transactional per-version steps (success commits once at the
target version); a missing step, a throw, or an over-bounds result
preserves prior data and disables with an actionable diagnosis; reset
recovers. Legacy unversioned blobs read as version 0. Writes and
`state.update` reject oversized keys and values before persisting, and
`state.update` serializes concurrent read-modify-writes. Provenance: API
v2 `extension-data.ts`.

## Related documentation

- `docs/extensions-v2-migration.md` — v1 retirement record
- `docs/extensions-v2-make-pack.md` — reference extension walkthrough
- `docs/extensions-v2-troubleshooting.md` — failure diagnosis
- `docs/commands.md` — the full command inventory
- `docs/runtime.md` — runtime identity and command inventory
- `docs/architecture/extensions.md` — end-to-end execution traces
