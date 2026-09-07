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

The v1 system (six tools, `YARD_EXTENSION_API_VERSION = 1`) keeps
running untouched beside it. See `docs/extensions-v2-migration.md`
for coexistence rules.

## Responsibilities and boundaries

- `packages/yard-core/src/extensions-v2/` owns framework-free
  contracts: definitions, registry, catalog, invocation, availability,
  permissions, grants, filesystem guards, operations, jobs, plans,
  settings/state stores, events, contributions, transport.
- `src/lib/extensions-v2/` owns application adapters: host
  composition, Library ports over repository contracts, node file
  ports, settings/state rows, archive codec, shelf/recent sources,
  policy persistence, job wiring, UI resolvers, dev fixtures.
- `src/app/api/extensions-v2/` owns thin HTTP wrappers over the
  transport codec. One host execution path serves HTTP and direct
  invocation.
- `src/components/extensions-v2/` owns generic renderers: palette,
  menus, selection actions, toolbar, sidebar, settings, drop zone,
  forms, previews, job progress, results.
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
disabled and denied until explicit enable + approval.

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
| `/api/extensions-v2` | GET | serializable catalog, effective permissions |
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
invocation keys return the existing job.

Plans (`vplan_` IDs) bind extension, command, validated
targets/options, authorization context, expiry, and invocation.
Single use, 15-minute default TTL capped at 1 hour. Apply revalidates
targets, grants, permissions, and availability.

Settings are author-declared and validated with reset semantics.
Workflow state is versioned with transactional migrations; a failed
migration preserves prior data or disables with a diagnosis. The host
owns job records separately. Persist precedes notify on every write.

Events are five typed contracts only: `settings-changed`,
`state-changed`, `approvals-changed`, `job-transition`,
`contributions-changed`. Only the host emits. Handlers never receive
the bus. Per-chunk job progress is never an event.

### Contribution points

Eight declared types resolve through production adapters with stable
`v2:{ext}:{contrib}` keys, `order ?? 100` ordering, keep-both
collision rule, and per-item availability:

command-palette, file-context-menu, folder-context-menu (shared
context-menu adapter), selection-actions, toolbar, sidebar, settings,
drop-menu. Forms, previews, and results render from input schemas and
plan previews through generic components. Disabling an extension
removes its UI and listeners.

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
- `src/components/extensions-v2/` — generic renderers
- `packages/yard-tools/make-pack-v2/` — reference extension
- `scripts/scaffold-extension-v2.cjs` — scaffolding CLI
- `src/app/prototype/ext-v2-workbench/` — development workbench (dev-only)
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

Expected: the scaffold writes `package.json`, `src/definition.ts`,
`src/handlers.ts`, `src/index.ts`, a vitest suite, and a README;
the generated suite passes 3/3. The definition holds one global
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

Prerequisites: dev server (`bun run dev`) plus
`FOLEYARD_V2_DEV_FIXTURES=1` for fixture commands.

Declare an object input schema on the command. The generic form
(`src/components/extensions-v2/interaction.tsx`) builds fields via
`inputFieldsForSchema`, shows validation errors, and posts to
`POST /api/extensions-v2/execute`. Preview the same shape in the
workbench at `/prototype/ext-v2-workbench` without writing app code.
Expected: mistyped input returns 400 `input-invalid`; valid input
reaches the handler. Provenance: API v2 input contracts.

### 4. Add a sidebar list

Prerequisites: same as 3.

Declare a `sidebar` contribution pointing at a global command whose
result is a string. The generic sidebar panel
(`src/components/extensions-v2/sidebar.tsx`) renders loading, empty,
error, and item-action states. Make Pack v2's `make-pack-v2.side-shelf`
is the shipped reference; `fixture-surface` proves the adapter
without product content. Expected: the panel appears when the
extension is enabled and approved, and vanishes on disable.
Provenance: API v2 contribution contracts.

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
(no new migration).

### 6. Run a guarded operation

Prerequisites: none beyond the checkout; this is a host unit pattern.

Write the handler against `context.operations.library` /
`context.operations.files` only. A handler that skips its own
permission check still cannot read or write: every service method
rechecks the effective set, and unapproved calls fail with
`permission-denied`. The operations suite
(`packages/yard-core/src/extensions-v2/operations.test.ts`) holds the
conformance cases, including bounded 5,200-record paging and
owned-only cleanup. Expected: undeclared access fails closed; no
overwrites outside job-owned output. Provenance: API v2 operation
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
queued, running, then a terminal state with partial outcomes;
cancel moves running work to cancellation-requested and settles
cancelled after owned cleanup. Duplicate invocation keys return the
existing job. Reload-safe: poll by ID after reconnect. Provenance:
API v2 jobs, app `jobs.ts` with settings-table snapshot persistence.

### 8. Subscribe to events

Prerequisites: renderer context or workbench session.

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
await store.migrateTo(2, {
  1: (data) => ({ ...data, packName: String(data.name ?? "") }),
});
```

Expected: transactional per-version steps; failure preserves prior
data and disables with an actionable diagnosis; reset recovers.
Legacy unversioned blobs read as version 0. Provenance: API v2
`extension-data.ts`.

## Related documentation

- `docs/extensions-v2-migration.md` — v1 preservation and cutover rules
- `docs/extensions-v2-make-pack.md` — reference extension walkthrough
- `docs/extensions-v2-troubleshooting.md` — failure diagnosis
- `docs/commands.md` — v1 commands beside these v2 contracts
- `docs/runtime.md` — v1/v2 identity in the runtime snapshot
- `docs/architecture/extensions.md` — end-to-end execution traces
- `public/extension-system-v2.html` — implementation diagrams
