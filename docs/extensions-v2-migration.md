# Extension v1 to v2 migration

> Feature status: internal (v2 bundled; all six v1 tools retired)
> Contract: internal
> Owner: `docs/adr/extension-v2-coexistence.md`
> Applies to: docs manifest ID (`extensions-v2-migration`); development checkout when unbuilt

## What it does

States what stays, what moves, and what must happen before anything
moves. All six v1 tools have retired to their v2 ports; every product
workflow runs on v2 now. Retired pairs: Smart Collections
(save-search through `smart-collections-v2`), Make Pack (pack exports
through `make-pack-v2`), Drop Rules (drop handling through
`drop-rules-v2`), Library Gatherer (gathering through
`library-gatherer-v2`), Sound Shelf (scratchpad through
`sound-shelf-v2`), and Folder Janitor (cleanup reports through
`folder-janitor-v2`). Their v1 packages, commands, and settings rows
are gone, and enablement, approvals and listed settings were adopted
once onto the v2 ports. The Sound Shelf contents moved from
`extension:sound-shelf:items` (`{ fileIds }`) to `v2shelf:sound-shelf-v2`
(`{ ids }`); the Folder Janitor settings moved to the
`folder-janitor-v2.*` namespace.

## Retirement mechanics

The pattern, in `src/lib/extensions-v2/enablement.ts`:

1. **Persisted v2 enablement.** The v2 enabled set was memory-only and
   reset every boot; enablement now persists per extension under
   `v2:enablement:<id>` and hydrates once per boot. A missing database
   falls back to the old memory-only behavior.
2. **One-time adoption.** For each retired pair in
   `RETIRED_V1_TO_V2`, the first boot after retirement finds the v2
   enablement row absent and the v1 `extension:<id>:enabled` row
   present, adopts the value, deletes the v1 row, and grants the v2
   tool's declared permissions when the tool was enabled (v2 denies
   without approval). Listed settings (`RETIRED_V1_SETTINGS`) and data
   records (`RETIRED_V1_DATA`, e.g. the make-pack recent list) move to
   their v2 keys the same way; v1 rows are deleted even when a v2
   value already exists, since the retired tool never reads them
   again. Deleting the v1 rows makes adoption run once.
3. **UI flip.** The save-search call in
   `src/app/library/use-collections.ts`, the shelf slice
   (`src/app/library/use-shelf-v2.ts`, hydrated through
   `/api/files?ids=`), the janitor dialog
   (`src/components/extensions/folder-janitor-v2/`), and the header
   gating in the page routes read the v2 tools now.

Rollback of any single tool: re-register the v1 package and re-create
the v1 settings rows; the shared collections table makes saved
searches readable either way. The v1 shelf row is gone once adopted —
restoring it needs the pre-retirement `{ fileIds }` payload.

## Responsibilities and boundaries

- `docs/adr/extension-v2-coexistence.md` owns the coexistence rules.
- `docs/adr/extension-v2-permissions-trust.md` owns the trust model
  both systems share: bundled code, no sandbox.
- `docs/adr/extension-v2-jobs-recovery.md` owns job recovery and
  state-version decisions reused below.
- This guide never changes v1 behavior. It points at it.

## Runtime behavior

### What stays on v1

Nothing stays on v1. The `packages/yard-tools/*` v1 packages are gone,
the registration table is empty, and `POST /api/extensions/execute`
fails closed on every id (404). Retired v1 command ids never route
through v2, and a v2 failure never falls back to v1.

### What runs on v2 today

Seven bundled internal ports, each disabled by default with its own
settings namespace (parity tables live in each package README). All
six retired tools are active implementations now: their enablement
was adopted from the retired v1 tools and the app serves save-search,
pack exports, drop handling, library gathering, the shelf scratchpad
and janitor cleanup reports through them.

- Make Pack v2 (`make-pack-v2`): three commands, three settings, seven
  contributions.
- Sound Shelf v2 (`sound-shelf-v2`): add/remove/clear/list through the
  v2 shelf store with read-time repair.
- Smart Collections v2 (`smart-collections-v2`): save-search through
  the v2 collections ops; invalid queries fail with reasons.
- Folder Janitor v2 (`folder-janitor-v2`): scan-library, scan-folder,
  remove-files, delete-folders (review plan required for deletes).
- Library Gatherer v2 (`library-gatherer-v2`): preview-gather and
  gather through readable source grants plus library-mutation inserts.
- Drop Rules v2 (`drop-rules-v2`): preview, apply, prepare-drag,
  open-settings through destination/staging grants with rename
  patterns and a used-sounds report.
- Auto Tag v2 (`auto-tag-v2`): preview and tag-files with
  deterministic filename rules, the candidate queue, a vector-backed
  find-similar row entry, and opt-in CLAP semantic tagging over the
  approved vocabulary (parity notes in its package README).

Two dev-only conformance fixtures (`fixture-surface`,
`fixture-worker`) prove the remaining contribution points, jobs,
permissions, and state isolation. Fixtures register only with
`FOLEYARD_V2_DEV_FIXTURES=1` in non-production runtimes and never
enter production catalogs or packaged builds.

### Enable and approve (explicit, reversible)

1. Settings, Extensions, enable Make Pack v2.
2. Approve its declared permissions (Approve button, or
   `POST /api/extensions-v2/extensions/make-pack-v2/approvals`
   with `{ permissions: [...] }`).
3. Disabling rejects new work, requests cancellation of live jobs,
   and removes its UI and listeners after owned work settles.

```bash
curl -X PATCH /api/extensions-v2/extensions/make-pack-v2 \
  -H 'Content-Type: application/json' -d '{"enabled":true}'
curl -X POST /api/extensions-v2/extensions/make-pack-v2/approvals \
  -H 'Content-Type: application/json' \
  -d '{"permissions":["library:read","files:read","files:copy","files:write","settings:read","settings:write","desktop:reveal","desktop:open"]}'
```

### Settings and state

Every v2 port starts in its own namespace (`<id>.*`). None copy or
rewrite v1 settings. Re-enter the settings; the names match v1 on
purpose. There is no silent migration and no automatic import. Any
future replacement of v1 needs a separate compatibility and rollback
plan.

### Cutover and rollback conditions

No tool migrates until its parity, data, and recovery checks pass in
a separate change. A deployment chooses one active implementation
per extension ID. Rollback to v1 is possible only while stored data
stays compatible, and it never replays completed file operations.
Each `packages/yard-tools/<id>/README.md` holds the parity table its
migration must satisfy.

## Contracts

- Internal only. v1 API version 1 and v2 API version 2 coexist;
  neither implies compatibility with the other.
- v1 settings keys (`extension:<id>:enabled`,
  `extension:<id>:setting:<settingId>`) and v2 rows
  (`v2:approvals`, `v2:jobs:snapshot`, `v2state:<id>`) share the
  settings table without overlapping.

## Failure behavior and limitations

- Enabling v2 changes nothing for v1 tools, data, or routes.
- Revoking approval returns the extension to deny-by-default;
  in-flight runs fail closed at their next permission check.
- Restart expires destination grants and interrupts live jobs with
  known outputs; history stays reviewable.
- Every Tools grid card except Drop Rules v2 has a run button opening
  its dialog or view (`V2_RUN_LABELS` in
  `src/components/extensions-v2/run-labels.ts`): pack/shelf/search/
  janitor/gather/auto-tag. Drop Rules v2 has none by design — its UI
  is the drop zone plus the palette and settings surface. Dialog-owned
  palette and row/menu commands (janitor scans/deletes, gather)
  likewise open their dialogs instead of invoking headless.
- Drop Rules v2 stages drag-out copies into a staging grant rather
  than the configured raw folder path; Folder Janitor v2 cannot tell
  an unreadable-but-present file from a missing one (no `stat` op).
  Both are documented in their package READMEs.

## Source map (real file paths)

- `docs/adr/extension-v2-coexistence.md` — coexistence rules
- `docs/adr/extension-v2-permissions-trust.md` — trust model
- `docs/adr/extension-v2-jobs-recovery.md` — recovery rules
- `packages/yard-tools/make-pack-v2/README.md` — parity table
- `packages/yard-tools/sound-shelf-v2/README.md` — parity table
- `packages/yard-tools/smart-collections-v2/README.md` — parity table
- `packages/yard-tools/folder-janitor-v2/README.md` — parity table
- `packages/yard-tools/library-gatherer-v2/README.md` — parity table
- `packages/yard-tools/drop-rules-v2/README.md` — parity table
- `src/lib/extensions-v2/policy.ts` — approval persistence
- `public/extension-system-v2.html` — coexistence and migration diagrams

## Related documentation

- `docs/extensions-v2.md` — authoring on the v2 API
- `docs/extensions-v2-make-pack.md` — reference walkthrough
- `docs/extensions.md` — the six v1 tools
- `docs/runtime.md` — v1/v2 identity side by side
