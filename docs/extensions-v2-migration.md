# Extension v1 to v2 migration

> Feature status: internal (v2 bundled only; no cutover scheduled)
> Contract: internal
> Owner: `docs/adr/extension-v2-coexistence.md`
> Applies to: docs manifest ID (`extensions-v2-migration`); development checkout when unbuilt

## What it does

States what stays, what moves, and what must happen before anything
moves. Today every product workflow runs on v1. Make Pack v2 is an
opt-in internal reference beside the original, not a replacement.
No bundled tool has migrated and no cutover is scheduled. A future
cutover needs its own compatibility and rollback plan per tool.

## Responsibilities and boundaries

- `docs/adr/extension-v2-coexistence.md` owns the coexistence rules.
- `docs/adr/extension-v2-permissions-trust.md` owns the trust model
  both systems share: bundled code, no sandbox.
- `docs/adr/extension-v2-jobs-recovery.md` owns job recovery and
  state-version decisions reused below.
- This guide never changes v1 behavior. It points at it.

## Runtime behavior

### What stays on v1

The six tools under `packages/yard-tools/*` (sound-shelf,
make-pack, drop-rules, folder-janitor, library-gatherer,
smart-collections), their 18 commands, routes
(`POST /api/extensions/execute`), settings namespaces, UI wiring,
and stored data keep working unchanged. v1 commands never route
through v2, and a v2 failure never falls back to v1.

### What runs on v2 today

Six bundled internal ports, each disabled by default with its own
settings namespace and no auto-migration from v1 (parity tables live
in each package README):

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
- The Tools grid run button is wired only for Make Pack v2; the other
  five ports run from the palette, menus, sidebar, settings, or drop
  zone. Generalizing the run button needs a per-extension run intent
  and is recorded as a limitation, not a regression.
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
