# Remove extensions v1 (cut over to v2 first)

> Plan status: proposal, no code deleted.
> Base: `main` @ `e181dbd`.
> Author model: Muse Spark (`opencode-go/muse-spark-1.3-contributor`), via T3 Code / OpenCode harness.

## Verdict

Do not delete v1 in one shot. Every product workflow still runs on v1
(`docs/extensions-v2-migration.md`: no bundled tool has migrated, no cutover
scheduled). Deleting now breaks shelf, pack, drop-rules, janitor, gatherer,
and smart-collections with no data migration. Land the cutover first, then
delete in the slices below.

## v1 inventory (verified on `main`)

Six v1 packages under `packages/yard-tools/` (18 commands total):

- `sound-shelf/`, `make-pack/`, `drop-rules/`, `folder-janitor/`,
  `library-gatherer/`, `smart-collections/` — each
  `src/{manifest,command-definitions,commands,permissions,settings,service,types,index}.ts`
  plus `sound-shelf/store.ts`, `make-pack/zip.ts`, `drop-rules/staging.ts`.

v1 core (`packages/yard-core/src/extensions/`):

- `vocabulary.ts` (`YARD_EXTENSION_API_VERSION = 1`), `extension-registry.ts`,
  `extension-command-registry.ts`, `extension-context.ts`, `extension-host.ts`,
  `index.ts`, re-exported from `packages/yard-core/src/index.ts`.
- v2 lives beside it in `packages/yard-core/src/extensions-v2/` — do not touch.

v1 app layer (`src/lib/extensions/`, 14 files):

- `registry.ts` (6-entry table), `runtime.ts`, `host.ts`, `catalog.ts`,
  `guarded-services.ts`, `settings-store.ts`, `kv-store.ts`,
  `sound-shelf-store.ts`, `make-pack-recent-store.ts`, `setting-previews.ts`,
  `sound-shelf-events.ts`, `types.ts`, `ui-contributions.ts`, `ui-intent.ts`.

v1 routes (4 files):

- `src/app/api/extensions/route.ts`, `host-outcome.ts`,
  `execute/route.ts`, `execute/transport.ts`.

v1 UI/client callers (repoint to v2 before deleting routes):

- `src/lib/extension-client.ts`, `src/app/library/use-extension-catalog.ts`,
  `use-extension-ui.ts`, `use-palette.ts`, `use-shelf.ts`, call sites in
  `use-collections.ts` / `use-library-files.ts`,
  `src/components/FileTable/use-shelf-toggle.ts`, `ExtensionGrid.tsx`
  (app + workspace copies), settings `extensions-tab.tsx` copies,
  `src/app/page.tsx`, dialogs.
- `src/lib/runtime-info.ts` reads `extension:*:enabled` flags and reports the
  v1 `extensionSystems` entry.

Config/docs/tests:

- `vitest.config.ts` v1 `@foleyard/*` aliases, `package.json`
  `example:selected-ids`, `examples/extensions/selected-ids/`.
- Docs: `docs/extensions.md`, `docs/commands.md` v1 table,
  `docs/runtime.md` v1 section, `docs/architecture/extensions.md` v1 trace.
- Tests: `extension-host-transport`, `filesystem-boundary`,
  `runtime-introspection`, `workspace-smoke` v1 paths.

## Preconditions (cutover first, per tool)

1. Parity sign-off against each `packages/yard-tools/<id>-v2/README.md`
   table, including intentional deltas: persisted shelf, no-overwrite,
   grant-scoped writes, review plans/jobs, flat pack/gather output,
   500-file bounds.
2. Generalize the Tools-grid run button beyond Make Pack v2
   (`docs/extensions-v2-migration.md` limitation).
3. Explicit settings/data import UX. v1 rows (`extension:*:enabled`,
   `extension:*:setting:*`, `extension:sound-shelf:items`,
   `extension:make-pack:recent`) and v2 rows (`v2:approvals`, `v2state:*`,
   `v2shelf:*`) share the settings table without overlapping — no silent
   migration. Decide: keep v1 rows read-only for rollback, or one-way import
   with backup.
4. Fix stale `docs/commands.md` v2 section (lists only the 3 Make Pack v2
   commands; 6 ports exist on this base).

## Deletion slices (in order)

1. Rewire UI to v2 (`/api/extensions-v2/*`, v2 contribution clients). Keep v1
   routes mounted until UI is clean.
2. Retire routes + host: delete `src/app/api/extensions/**`,
   `src/lib/extensions/**`, `src/lib/extension-client.ts`.
3. Delete the 6 v1 `packages/yard-tools/*` dirs + `vitest.config.ts` aliases.
4. Delete core v1: `packages/yard-core/src/extensions/` + index re-exports.
   Keep `extensions-v2/`.
5. Docs/runtime/tests: update `extensions.md`, `commands.md`, `runtime.md`,
   `architecture/extensions.md`, `runtime-info.ts`, `documentation.ts` if the
   `extensions` doc is retired, `check-v2-boundaries.cjs` wording, coverage
   thresholds (re-baseline up, never lower to pass).

Shared/persisted — confirm owner before deleting:

- `kv-store.ts` / `make-pack-recent-store.ts`: `src/app/api/audio/route.ts`
  records recents; v2 `from-recent` reads via the app adapter. Confirm the
  adapter owns the record before removing the store module.

## Verify each slice

- `npm run typecheck`
- `npm run lint`
- `npx vitest run <touched>`
- `node scripts/check-v2-boundaries.cjs`
- `node scripts/check-docs.cjs`
- Manual smoke: shelf add/list, pack from selection/shelf/recent, drop
  preview/apply, janitor scan + delete-folder plan, gather preview/gather,
  save-search.

## Rollback

Possible only while `extension:*` rows are retained and file ops are
unreplayed (`docs/extensions-v2-migration.md`). Keep DB rows for at least one
release; file copies/deletes are never replayed.

## Acceptance

- Zero imports of non-`-v2`
  `@foleyard/{sound-shelf,make-pack,drop-rules,folder-janitor,library-gatherer,smart-collections}`
  and of `@/lib/extensions/*` / `/api/extensions` (non-`-v2`).
- `packages/yard-core/src/extensions/`, `src/lib/extensions/`,
  `src/app/api/extensions/` gone; `extensions-v2/` intact.
- Tests + docs checks green.
