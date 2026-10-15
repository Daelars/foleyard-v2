# Extension v1 retirement record

> Feature status: internal (v2 bundled; all six v1 tools retired)
> Contract: internal
> Owner: `src/lib/extensions-v2/enablement.ts`
> Applies to: docs manifest ID (`extensions-v2-migration`); development checkout when unbuilt

## What it does

Records the retirement: all six v1 tools became their v2 ports and every
product workflow runs on v2 now. The v1 packages, routes, commands,
settings and events are gone; nothing falls back to v1. Retired pairs:
Smart Collections
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

Rollback is v2-only: disable the port, or restore its defaults and
re-approve. There is no v1 fallback — re-running a retired v1 command is
not possible, and a v2 failure never falls back to v1.

## Responsibilities and boundaries

- `src/lib/extensions-v2/enablement.ts` owns persisted enablement and
  the one-time adoption from retired v1 rows.
- `docs/adr/extension-v2-coexistence.md` is superseded; it records why
  v2 was built beside v1 before the retirement.
- `docs/adr/extension-v2-permissions-trust.md` owns the trust model:
  bundled code, no sandbox.
- `docs/adr/extension-v2-jobs-recovery.md` owns job recovery and
  state-version decisions reused below.

## Runtime behavior

### What the retirement removed

The `packages/yard-tools/*` v1 packages are gone, the v1 registration
table and routes are gone, and v1 command ids 404. Adopted enablement,
approvals, listed settings and known data records moved once onto the
v2 keys, and the corresponding v1 rows were deleted, so adoption cannot
run twice. Unlisted v1 settings rows are never read again.

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

Every v2 port owns its namespace (`<id>.*`). Listed v1 settings were
adopted once at retirement; anything unlisted starts from its declared
default. There is no ongoing import and no re-migration. Each
`packages/yard-tools/<id>-v2/README.md` records the port's parity and
limitations.

### Rollback conditions

Disabling a v2 port rejects new work, requests cancellation of live
jobs and removes its UI after owned work settles; re-enabling restores
it from persisted state. Rolling back to v1 is not supported and never
replays completed file operations.

## Contracts

- Internal only. Extension API version 2 is the current and only
  engine; API version 1 is retired.
- Retired v1 settings keys (`extension:<id>:enabled`,
  `extension:<id>:setting:<settingId>`) and v2 rows
  (`v2:enablement:<id>`, `v2:approvals`, `v2:jobs:snapshot`,
  `v2state:<id>`) share the settings table without overlapping; the
  listed v1 rows are deleted as they are adopted.

## Failure behavior and limitations

- Retired v1 command ids are not routed anywhere; the request 404s.
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
  than the configured raw folder path; the native bridge mints a fresh
  grant per drag, and only falls back to the raw indexed file when the
  policy is disabled or not applicable. Folder Janitor v2 cannot tell
  an unreadable-but-present file from a missing one (no `stat` op).
  Both are documented in their package READMEs.

## Source map (real file paths)

- `docs/adr/extension-v2-coexistence.md` — superseded coexistence decision
- `docs/adr/extension-v2-permissions-trust.md` — trust model
- `docs/adr/extension-v2-jobs-recovery.md` — recovery rules
- `src/lib/extensions-v2/enablement.ts` — persisted enablement and one-time adoption
- `packages/yard-tools/make-pack-v2/README.md` — parity table
- `packages/yard-tools/sound-shelf-v2/README.md` — parity table
- `packages/yard-tools/smart-collections-v2/README.md` — parity table
- `packages/yard-tools/folder-janitor-v2/README.md` — parity table
- `packages/yard-tools/library-gatherer-v2/README.md` — parity table
- `packages/yard-tools/drop-rules-v2/README.md` — parity table
- `src/lib/extensions-v2/policy.ts` — approval persistence

## Related documentation

- `docs/extensions-v2.md` — authoring on the v2 API
- `docs/extensions-v2-make-pack.md` — reference walkthrough
- `docs/extensions.md` — the retired v1 shape
- `docs/runtime.md` — runtime identity and command inventory
