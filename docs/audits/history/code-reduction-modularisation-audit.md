> **Historical document — dated evidence, not current instructions.** See `docs/index.md` for current guides.

# Code Reduction & Modularisation Audit

> PROTOTYPE SURFACE: this audit is visualised throwaway-style at `/prototype/code-investigation` (`?variant=A|B|C`) per `$prototype` sub-shape B (new page, last resort — no existing page hosts an audit). See `src/app/prototype/code-investigation/page.tsx` + `PrototypeSwitcher`. The markdown below is the durable record; the route is throwaway.
> Scope: `src/`, `packages/yard-core`, `packages/yard-tools`, `electron/`, `src/app/api`. No production code modified. Prototype routes (`src/app/prototype/*`, ~9,063 LOC) and tests (~4,514 LOC) excluded from prod baseline unless stated.

## Executive Summary

Foleyard v2 is a local-first Electron + Next.js sound-library browser: scan → index (SQLite/better-sqlite3 + drizzle) → list/search → play, plus an extension system (`yard-core` host + `yard-tools/*` + thin `/api/extensions/*` routes + dialogs).

Layering is sound: genuine domain package, real repository layer, pure-logic modules with tests. The bloat is concentrated, not systemic:

- **Biggest LOC reduction:** delete dead UI inventory + prototype quarantine (~500–600 LOC prod + 9k prototype quarantined from builds), collapse route epilogues/guards (~300–450 LOC), unify settings-KV stores + repo singletons (~200–350 LOC).
- **Biggest modularity problem:** `src/app/page.tsx` (~2,492 lines, 44× `useState`, 15× `useEffect`, 74× `useCallback`) is a god-component owning library/shelf/extensions/shortcuts/palette/dialogs/scan; `src/components/SettingsDialog.tsx` (~1,828 lines) owns 6 settings tabs + drop-rules panel + extension controls.
- **Biggest over-abstraction problem:** `packages/yard-core/src/extensions/*` — 15 files for ~7 one-line types merged by wildcard barrels; plus stale `yard-core` service interfaces with zero implementations alongside a second hand-rolled wiring path (`composition-root.ts` vs `lib/db.ts`).
- **Realistic reduction:** ~19,185 prod LOC → ~16,700–17,400 (−1,800 to −2,500, ~9–13%) high+likely confidence, plus structural simplification that keeps LOC flat but removes concepts (single file-record type, single outcome helper, single settings-KV).

## Current Baseline

Measured with `Get-ChildItem` + line counts (no heavy tooling installed):

- **Prod source LOC (excl. `prototype/*`, `*.test.*`, `__tests__`): ~19,185 lines across ~210 files** (`src`, `packages`, `electron`).
- **Prototype LOC: ~9,063** (`src/app/prototype/*`: `redesign/workspace.tsx` 2,099; `revised-v2/flows-alt.tsx` 827; `audit/audit-data.ts` 537; `app-v2/page.tsx` 512; `extensions-diagram/*` ~1,100; `showcase/*` ~1,200). Nearly half of prod size, ships in the same bundle tree.
- **Test LOC: ~4,514.**
- **Total scanned (`src`+`packages`+`electron`, incl. proto+tests): ~31,752.**
- **API surface: 29 route files** under `src/app/api` (`files`, `collections`, `tags`, `settings`, `scan`, `directories`, `audio`, `waveform`, `desktop/*`, `extensions/*` × ~15).
- **Densest dirs:** `src/components/ui` 24 files; `src/lib` 16; `packages/yard-core/src/extensions` 15; `src/lib/extensions` 11; `src/components/FileTable` 11; `src/components/AudioPlayer` 10; `packages/yard-tools/*` 6 extensions × ~9–10 files.

Largest prod files:

| File | Lines | Role |
|---|---|---|
| `src/app/page.tsx` | 2,492 | Home god-component |
| `src/components/SettingsDialog.tsx` | 1,828 | 6-tab settings + drop-rules + extensions |
| `src/lib/dotmatrix-core.tsx` | 672 | Dot-matrix math + renderer (only ~140 render) |
| `src/lib/scanner/scan-runner.ts` | 497 | Scan orchestration |
| `src/components/OrganizeView.tsx` | 497 | Collections/tags manager |
| `src/lib/database/file-repository.ts` | 471 | SQLite audio-file repo + singleton shim |
| `src/components/extensions/folder-janitor/FolderJanitorDialog.tsx` | 427 | Extension dialog |
| `src/components/FileTable/file-row.tsx` | 329 | Row renderer |
| `src/components/OnboardingDialog.tsx` | 323 | Onboarding |
| `src/components/FileTable.tsx` | 256 | Table orchestrator |

High-complexity areas: `page.tsx` view/fetch/handler matrix; `SettingsDialog.tsx` tab sprawl; `file-repository.ts` batch-transaction ×4 + dual-branch select; `browse-repository.ts` divergent subdirectory loops; extension route fan-out (11 near-identical epilogues); dual DB wiring (`db.ts` barrel vs `composition-root.ts`).

## Highest Priority Findings

### F1 — `page.tsx` god-component

### Problem

One client component owns navigation, fetching, sorting, selection, transport, palette, shortcuts, scan, settings, shelf, and 8+ dialogs. Adding any feature touches this file; removing one leaves state behind.

### Evidence

- `src/app/page.tsx:123-211` — 44× `useState` (files, collections, directories, tags, selection, search, palette, shortcuts, views, dialogs, shelf, sort); 15× `useRef`; 15× `useEffect`; 74× `useCallback`; 8× `useMemo`.
- Fetchers `page.tsx:269,376,488,533,570,703` + ~20 inline `fetch` handlers (`719,746,858,894,949,984,1008,1024,1039,1054,1086,1138,1171,1218,1256,1289,1318,1344,1364,1392,1444,1490,1519,1857`).
- Render `page.tsx:2178-2748` composes `IconRail`, header search, `ExtensionGrid`, `OrganizeView`, `SelectionBulkBar`, `FileTable`, `AudioPlayer`, `CommandPalette`, `SettingsDialog`, `OnboardingDialog`, 5 extension dialogs.

### Current structure

Single `HomeContent` closure; ref-mirrors (`selectedFileRef`, `filesRef`, `extensionsRef`, `currentViewRef`) to dodge dep arrays; view switchers differ by one line.

### Proposed structure

Extract by responsibility, keep `page.tsx` as composition shell (~300–400 lines):

- `src/app/_library/use-library-files.ts` (loadFiles/loadMore/loadDirectories + pagination refs)
- `src/app/_library/use-library-views.ts` (5 view switchers → one `setView(view)` + `showCollection/navigateDirectory`)
- `src/app/_collections/use-collections.ts` + `use-tags.ts` (CRUD + optimistic rollback, merging the 4 rename/filter handlers)
- `src/app/_shelf/use-sound-shelf.ts` (count + add + clear + event subscription)
- `src/app/_extensions/use-extensions.ts` (enable/setting/execute + ui-intent dispatch)
- `src/components/SaveSearchDialog.tsx`, `RenameCollectionDialog.tsx` (pull from inline JSX)

### Expected benefit

- Navigation cost: understand one feature by opening one hook, not a 2.5k file.
- Deletes 5 view-switcher clones, 4 pass-through wrappers (`handleSaveRoot→saveLibraryRoot`, `handleStartScan→startLibraryScan`, `handleDeleteCollection→executeDeleteCollection`, `handleScanFolder/handleRunCommand→executeHostedCommand`), merges create/rename/color/delete pairs.

### Estimated LOC impact

−250 to −450 (dedup) + shell stays; total LOC similar-or-down, concepts sharply down.

### Risk

Medium — touches every user path; extract incrementally behind identical behaviour, keep hook signatures stable.

### Confidence

CONFIRMED.

### F2 — Extension route epilogue ×11 + guards ×6

### Problem

Every `/api/extensions/*` route re-implements the same outcome dispatch, file guard, and array-body validation. `host-outcome.ts` already exists but lacks the `ok` branch, so nobody uses it fully.

### Evidence

- Epilogue `if (outcome.ok && outcome.type==="value") return NextResponse.json(outcome.value); return toHostFailureResponse(outcome)` at `sound-shelf/add:26-30`, `sound-shelf/remove:26-30`, `sound-shelf/clear:15-19`, `folder-janitor/scan-folder:67-71`, `scan-library:53-57`, `remove-files:26-30`, `delete-folders:35-39`, `library-gatherer/preview:39-43`, `gather:39-43`, `make-pack:90-94`, `smart-collections/save-search:27-31`.
- `getFileById` + `removedAt` 404 at `audio/route.ts:74-77`, `waveform:21-24`, `desktop/file:18-21`, `drop-rules/prepare-drag:20-23`, `make-pack:25-28`, `sound-shelf/route.ts:31-33`.
- `resolveExistingPathWithinRoots` → 404 at `audio:80-86`, `waveform:27-33`, `desktop/path:15-21`.
- Byte-identical `fileIds array required` in `sound-shelf/add:13-18` vs `remove:13-18`; identical `sourceDirectories+destinationDirectory` in `library-gatherer/preview:16-28` vs `gather:16-28`.

### Current structure

Each route file is self-contained; helpers imported piecemeal.

### Proposed structure

- `src/app/api/extensions/_shared.ts`: `toHostOutcomeResponse(outcome)`, `requireIndexedFile(id)`, `requirePathInRoots(path)`, `requireStringArray(body,key)`, `requireNoRootsGuard()`.
- Extend existing `extensions/host-outcome.ts:29-47` with the `ok` branch instead of a new file.

### Expected benefit

- −200 to −350 LOC across 15+ routes; one place to add logging (today all `catch{}` are silent — `files/route.ts:94-96,154-156`, `collections:48,83,104`, `tags:35,56,81`).

### Estimated LOC impact

−200 to −350.

### Risk

Low — pure extraction; add `console.error` in the shared catch (behaviour improvement, flag in review).

### Confidence

CONFIRMED.

### F3 — Duplicate settings-KV stores ×4 + dual DB wiring

### Problem

Four key-value JSON stores re-implement the same select/parse/upsert cycle with four key namespaces; two parallel DB instantiation paths coexist.

### Evidence

- `src/lib/extensions/sound-shelf-store.ts:14-52`, `settings-store.ts:10-55`, `make-pack-recent-store.ts:13-54`, `src/lib/database/settings-repository.ts:29-54,60-87,115-130,161-175`.
- Keys: `extension:${id}:enabled` (`settings-repository.ts:12-14`), `extension:${id}:setting:${sid}` (`settings-store.ts:6-8`), `extension:sound-shelf:items`, `extension:make-pack:recent`.
- Wiring A: `src/lib/db.ts:1-63` barrel (~40 re-exports). Wiring B: `src/lib/composition-root.ts:32-62` (`createDatabaseConnection` + `getAppServices()` singleton, `createExtensionServices()` single-used by `extensions/host.ts:3,18`).

### Current structure

Routes/repos import `db.ts` or `database/*` directly; `host.ts` goes through `composition-root`.

### Proposed structure

- `src/lib/database/settings-kv.ts`: `getKV(key,fallback)`, `setKV(key,value)`, `extensionKey(...parts)`.
- Migrate 4 stores onto it; delete per-store SQL (~150–250 LOC).
- Pick one wiring: keep `db.ts` lazy singletons, make `composition-root.getAppServices()` delegate to them (or vice versa); remove the second SQLite connection.

### Expected benefit

- −150 to −250 LOC + one connection lifecycle; kills key-namespace drift.

### Estimated LOC impact

−150 to −250.

### Risk

Low-medium — settings migration must preserve existing keys verbatim.

### Confidence

HIGH CONFIDENCE.

### F4 — Stale `yard-core` contracts + over-fragmented extension types

### Problem

`yard-core` exports service interfaces nobody implements and a 15-file extension-type fan that obscures ownership; real code bypasses the contracts with hand-rolled adapters.

### Evidence

- `packages/yard-core/src/extensions/`: `extension-category.ts` 10 lines, `extension-surfaces.ts` 8, `extension-types.ts` 7, `extension-command.ts` 20, `extension-settings.ts` 11, `extension-command-error.ts` 8, `extension-ui-intent.ts` 27 — each one type + `export *` merge via `extensions/index.ts:1-13` → `yard-core/src/index.ts:1-28` (28 wildcards).
- Dead/stale: `services/search/search-service.ts:1-6` (`SearchService<TFile>`, no implementor); `repositories/favorite-repository.ts:1-3` vs `services/organization/favorite-service.ts:1-3` vs `AudioFileRepository.toggleFavorite` — three identical declarations; `settings-repository.ts:1-8` missing plural-roots/extension/onboarding actually used; `collection-service` missing `updateCollectionColor`; `tag-service` missing rename/color/delete/`getTagsForFiles`; `browse-service` missing `getSubdirectoriesForRoot` (the one `directories/route.ts:37` calls).
- `composition-root.ts:50-59` hand-rolls `libraryService/tagService/collectionService` adapters.

### Current structure

Interface → SQLite adapter was intended; interfaces rotted.

### Proposed structure

- Collapse the 7 one-type files into `extensions/extension-model.ts` (manifest, category, surface, setting, command, intent, permissions, errors); keep `extension-host.ts`, `extension-registry.ts`, `extension-context.ts`, `extension-command-registry.ts` as the 4 behavioural files.
- Delete `SearchService` or implement it; complete or delete the 4 stale service contracts; single (non-wildcard) barrel.

### Expected benefit

- −100 to −200 LOC + far fewer files to open to answer "what is an extension?".

### Estimated LOC impact

−100 to −200.

### Risk

Low for type collapse; medium for contract completion (pick minimal honest contracts, don't invent plugin futures).

### Confidence

HIGH CONFIDENCE (fragmentation CONFIRMED; contract completion scope POSSIBLE).

### F5 — Five file-record shapes + duplicated hydration

### Problem

The same `{id, filename, path, format, duration, fileSize, isFavorite, tags}` shape is redeclared per layer; extension routes each hand-project a 6-field subset.

### Evidence

- `FileTable/types.ts:1 FileTableFileRecord` vs `AudioPlayer/types.ts:1 AudioPlayerFileRecord` vs `app/page.tsx:56 FileRecord` vs `lib/db.ts:61 FileRecord` (`$inferSelect`) vs `lib/schema.ts:66 File` (dead); `BulkBarTag:bulk-bar.tsx:15 {id,name}` vs `FileTableFileTag:types.ts:24 {id,name,color?}` vs inline `file-row.tsx:84`.
- Hydration `{id,filename,path,format,fileSize,duration}` at `scan-folder:55-62`, `scan-library:41-48`, `make-pack:30-37`, `sound-shelf:40-51` (superset), `drop-rules/prepare-drag:30-36`; `getTagsForFiles` map shared by `files/route.ts:54-60` + `sound-shelf:38-51`.
- `AudioMetadata` ×3: `lib/metadata.ts:5-14` (8 fields) vs `yard-core/metadata-service.ts:1-13` (7, missing filename/fileSize) vs `scan-runner.ts:28-47` inline.

### Proposed structure

- One `YardFile` (yard-core `domain/audio-file.ts`) as source; `FileTable`/`AudioPlayer` import it (or `Pick<>` it); delete layer-local copies.
- `toExtensionFile(row, tags?)` + `withTags(ids)` mapper; unify `AudioMetadata` on the 8-field shape.

### Expected benefit

- −80 to −150 LOC + prevents schema drift (MIME maps already drifting: `audio/route.ts:14-23` has `.aif`, `metadata.ts:18-26` doesn't).

### Estimated LOC impact

−80 to −150.

### Risk

Low — mechanical; keep distinct concepts separate (don't merge smart-filter `q` with pagination even though both coerce).

### Confidence

HIGH CONFIDENCE.

## Files That Should Be Split

- **`src/app/page.tsx` (~2,492)** — responsibilities: 5 view switchers, 6 fetchers, ~20 mutation handlers, transport/palette/shortcuts/scan/shelf/extensions, 12+ dialog mounts. Split into `_library/`, `_collections/`, `_shelf/`, `_extensions/` hooks + 2 dialog components (§F1). LOC: similar-or-down (−250–450), navigation sharply better.
- **`src/components/SettingsDialog.tsx` (~1,828)** — responsibilities: library roots, scan stats, collections CRUD, tags CRUD, extensions list + per-setting controls, appearance/zoom, shortcuts rebinding, about/updates, embedded drop-rules panel (`DropRulesSettingsPanel:1437`, `renamePatternDraft/dragOutFolderDraft:1457-1458`). Split into `settings/` dir: `SettingsDialog.tsx` (shell + Tabs), `LibrarySettings.tsx`, `MetadataSettings.tsx` (collections+tags via shared `NamedEntityRow`), `ExtensionSettings.tsx` (+ `ExtensionSettingControl:1815`), `AppearanceSettings.tsx`, `ShortcutSettings.tsx`, `DropRulesSettings.tsx`. LOC similar (±5%), ownership clear. Do NOT one-file-per-row.
- **`src/lib/database/file-repository.ts` (471)** — responsibilities: 16-col dual-branch select (`69-85` vs `141-157`), 4 batch-transaction skeletons (`300-312,314-350,352-390,399-412`), singleton shim (`517-539`). Split selects via shared column list + extract `withTransaction` helper; keep SQL together (do NOT split per-query). LOC −40–80.
- **`src/lib/dotmatrix-core.tsx` (672)** — only ~140 lines render (`DotMatrixBase:564-721`); rest is pure math (6 order builders + norms + pattern sets). Split into `dotmatrix-math.ts` (pure, testable) + `dotmatrix-view.tsx` (renderer). LOC flat; test surface clean. The file itself is cohesive — this split is about testability, lowest priority of the splits.
- **`src/components/FileTable/file-row.tsx` (329)** — row render + shelf toggle (`dispatchSoundShelfChanged:90`, `toggleShelf:94`) + filename math (`meta:108`, `filenameWithoutExtension:111`). Extract `use-shelf-toggle.ts`; keep render intact. LOC flat.

## Files That Should Be Combined

- **`packages/yard-core/src/extensions/*` (15 files → 5):** 7 files ≤27 lines each holding one type. Combine into `extension-model.ts` + keep `extension-host.ts`, `extension-registry.ts`, `extension-context.ts`, `extension-command-registry.ts`. Why: file:export ratio ~1:1 forces 7 opens to answer one question. No double-wildcard barrel after.
- **`src/components/AudioPlayer/format-time.ts` (9 lines) + `src/lib/utils.ts:8 formatDuration`:** identical `m:ss` math (differ only null-handling). Combine into one `formatDuration` in `lib/format.ts` (or keep in `utils.ts` with `cn`); delete the other. Same for `FileTable/highlight-match.tsx` (22 lines, single-use by `file-row.tsx:31,177`) — inline or colocate, not a top-level module.
- **`src/lib/database/*` singleton shims (5× verbatim `let _XRepo; getXRepo(); export const method=(...a)=>getXRepo().method(...)`):** `file:517-539`, `collection:157-174`, `tag:95-111`, `settings:178-197`, `browse:98-109` + identical constructors. Combine via generic `lazyRepo()`/base class in `database/repository.ts`. Not behaviour change.
- **`src/types/desktop-bridge.d.ts` (9 lines) → `src/lib/desktop.ts`:** ambient `Window.desktopBridge` augment consumed only by `desktop.ts`. One file, no type-only cycle.
- **`getSubdirectories` vs `getSubdirectoriesForRoot` (`browse-repository.ts:46-72` vs `75-95`):** near-identical normalize/split/rejoin loops that already diverge (`:66` raw join vs `:90` normalized — Windows-separator behaviour differs). Combine into one core loop with source-list param; add a regression test for the separator case.
- **Do NOT combine** the per-extension `yard-tools/*` packages or per-route API files — those boundaries are real (one extension = one dir; one route = one file).

## Code That Can Be Deleted

| Location | What | Safety |
|---|---|---|
| `src/components/ui/table.tsx`, `src/components/ui/select.tsx` | Whole files; zero prod importers (only `theme-tokens.test.ts:78,80` inventory) | Safe — delete files + prune test inventory refs. CONFIRMED |
| `src/lib/utils.ts:15 formatFileSize` | Zero importers repo-wide | Safe — delete export. CONFIRMED |
| `src/lib/schema.ts:65-68` (`Setting`, `File`, `Tag`, `Collection`) | Zero importers (app uses `db.ts:61-63` aliases + local interfaces); `File` shadows global | Safe — delete 4 type aliases. CONFIRMED |
| `packages/yard-core/src/services/search/search-service.ts` | `SearchService<TFile>`, no implementor; real search is `AudioFileRepository.getFiles/getFileCount` | Safe — delete or implement; prefer delete. HIGH |
| One of 3 `toggleFavorite` declarations | `favorite-repository.ts:1-3` vs `organization/favorite-service.ts:1-3` vs `AudioFileRepository.toggleFavorite` | Safe — keep one. HIGH |
| `src/lib/scanner/validation.ts:7-32` XOR `scan-runner.ts:241-266` | Exact `validateLibraryRoot` clone (import vs `this.fs` seam) | Safe — delegate one to the other. CONFIRMED |
| `FileTable/selection.ts:32 clearSelection()` | `return []` 3-line wrapper, sole prod call `page.tsx:29,132` | Safe — inline. POSSIBLE (trivial) |
| `src/app/prototype/*` (~9,063 LOC) | 6 throwaway routes; `redesign/workspace.tsx` 2,099 alone | Quarantine from builds / move to throwaway branch per prototype skill; do NOT delete history blindly. HIGH |
| `resolveItemColor` duplicate | `lib/item-colors.ts:24` vs inline in `prototype/revised-v2/shared.tsx:11` | Prototype-only; ignore unless promoting. POSSIBLE |

No commented-out corpses found (`rg ^\s*//` returns only explanatory comments). No unreachable bodies beyond the exports above.

## Duplicate Logic

Grouped by responsibility (owner recommendation bold):

- **Route outcome:** 11 epilogues → **extend `extensions/host-outcome.ts:29-47`** with `ok` branch; add `toHostOutcomeResponse()`. (§F2)
- **File guard:** 6 `getFileById+removedAt` 404s → **`requireIndexedFile(id)`**.
- **Path guard:** 3 `resolveExistingPathWithinRoots` 404s → **`requirePathInRoots(path)`**; also migrate `scan-folder:31-41` inline `path.relative` clone to **`filesystem-boundary.ts:4-11 isWithinRoot`**.
- **Body validation:** `sound-shelf/add` ≡ `remove` (byte-identical); `library-gatherer/preview` ≡ `gather`; `folder-janitor/remove-files`, `delete-folders` same idiom; `No library roots configured` 400 ×3 → shared validators.
- **Colour validation:** `collections:66` + `tags:74` regex → **import `isHexColor` from `lib/item-colors.ts:12-14`** (note drift: null-handling differs).
- **Smart-filter `q`:** `collection-repository.ts:40-61` vs `:120-147` (both `JSON.parse(filter) as {q} + like(filename)`, silent catch) → `resolveSmartFilterIds()`.
- **Select listing:** `file-repository.ts:69-85` vs `:141-157` (same 16 cols) → shared column array.
- **Batch transactions:** `file-repository.ts:300-412` ×4 identical `if-empty→prepare→transaction→txn()` → `withTransaction()`.
- **Subdirectories:** `browse-repository.ts:46-95` → one loop (fixes divergence).
- **Extension registration:** `registry.ts:71-113` six `if(!has) register` blocks → table-driven loop (sound-shelf `DbSoundShelfStore` injection stays special).
- **CRUD symmetry:** `collection-repository:66-111` vs `tag-repository:38-92` (create/rename/color/delete/attach/detach) — structurally identical but per-aggregate; unify ONLY via generic named-entity repo if introduced, else accept.
- **Page-level clones:** 5 view switchers, 4 pass-throughs, create×2, optimistic-color×2, optimistic-delete×2 (with rollback-sort), rename/filter×4, shelf-add×2, remove×2, selection-sync×3, select-file vs palette-select — all → the hook extraction in §F1.
- **SettingsDialog clones:** create×2 (`512-518` vs `525-531`), delete×2 (`520-523` vs `533-536`), 3 `Sure?/X` confirm rows (collections `855-947` vs tags `990-1040` vs roots `687-725`), avatar block ×2 (`1094-1111` vs `1127-1142`), 6 identical `TabsTrigger` classes, 3 about buttons, 6 `ScanStat`, 6 token buttons → `NamedEntityRow` + class constants.
- **OrganizeView clones:** `createCollection:97-110` vs `createTag:119-135`, `commitRename:112-117` vs `commitTagRename:137-141`, 4 `Enter/Escape` handlers, 3 `Sure?/X` confirms, 2 composers → shared composer/confirm components.
- **Incidental (do NOT merge):** per-route `dynamic/runtime` boilerplate (Next.js-required); `parsePageInteger` vs `coerceSettingValue` (different domains); `MIME_TYPES` key domains differ (but fix `.aif` drift); `new Date().toISOString()` ×15 (idiomatic clock).

## Unnecessary Abstractions

- **Double-wildcard barrels:** `extensions/index.ts:1-13` (`export *` ×13) → `yard-core/src/index.ts:1-28` (`export *` ×28). Origin-obscuring, collision-prone. Replace with explicit named re-exports; collapse one-type files first.
- **Second DB wiring:** `composition-root.ts:32-62` (`getAppServices` + hand-rolled service adapters) vs `db.ts` lazy singletons. Two SQLite connections. Keep one; make the other delegate.
- **Stale service interfaces** (§F4): `SearchService`, duplicate `toggleFavorite` ×3, subset `Settings/Collection/Tag/Browse` contracts. Delete or complete — today they mislead.
- **Pass-through wrappers in `page.tsx`:** `handleSaveRoot→saveLibraryRoot`, `handleStartScan→startLibraryScan`, `handleDeleteCollection→executeDeleteCollection`, `handleScanFolder/handleRunCommand→executeHostedCommand`. Inline.
- **Tiny one-use leaves** (combine, don't generalize): `format-time.ts`, `highlight-match.tsx`, `clearSelection()`, plus single-use `collection-menu/favorite-button/volume-control/player-shell/use-audio-playback/use-transport-queue` and `empty-state/breadcrumb-bar/directory-row/file-row/bulk-bar/row-waveform/desktop-actions` — the FileTable/AudioPlayer decompositions are GOOD (real boundaries); only the 3 generic helpers should collapse.
- **`AppServices:composition-root.ts:17`** (never imported outside file), `DesktopActionResult` duplicate (`desktop.ts:1` vs `desktop-service.ts:3`), `UpdateInfo/UpdateProgress/UpdateError` living far from `UpdateNotifier/SettingsDialog` consumers.

## Missing Useful Abstractions

Only where duplication/coupling justifies (no speculative plugin framework):

1. **`toHostOutcomeResponse()` + 4 route guards** — 15+ routes collapse; justified by 11+ verbatim sites. (§F2)
2. **`SettingsKV` + `extensionKey()`** — 4 stores collapse; justified by identical SQL cycles. (§F3)
3. **`toExtensionFile()` + `withTags()`** — 5 hydration sites; justified by 6-field projection drift.
4. **`NamedEntityRow` (collections/tags)** — `SettingsDialog` 3 confirm-rows + `OrganizeView` 2 composers; justified by 5+ clones.
5. **`use-library-*` hooks** — `page.tsx` extraction; justified by 44 states + 74 callbacks.
6. **`initialScanStatus()`** — `scan-state.ts:3-21` vs `scan-runner.ts:199-217` 17-field literals; trivial factory, low priority.
7. Do NOT build: generic entity repo (unless 2+ more aggregates appear), generic command bus beyond existing `EventBus` (zero emitters/subscribers today — prove need first), filesystem abstraction beyond `isWithinRoot`.

## State Reduction

- **`debouncedSearchQuery:page.tsx:149`** (effect `366-374` timer) → `useDeferredValue(searchQuery)`; deletes timer + second source.
- **`soundShelfItemCount:193` + `soundShelfFileIds:194`** duplicated across `loadSoundShelfCount:269-286` and shelf branch `loadFiles:384-408` → single `use-sound-shelf` hook returning `{items}` with `count = items.length` derived.
- **6 ref-mirrors** (`selectedFileRef:207`, `tagsRef:208`, `filesRef:238`, `selectedIdsRef:842`, `currentViewRef:672`, `extensionsRef:1388`) exist to dodge dep arrays in a 74-callback file → shrink to 1–2 after hook extraction (keep `filesRef` for playback tick only).
- **`orderedFiles` pruning effect `239-249`** (`setSelectedIds/setSelectedFile/anchor` on every sort) → derive visible-set with `useMemo`, prune in event handlers, not effects.
- **`confirmClearShelf` 4s auto-reset timer `812-818`** → derive from dialog open state or drop (cosmetic).
- **Global-vs-local:** `extensions`, `scanStatus`, `settings` live in page state but consumed by `SettingsDialog`/polling children — pass down or colocate; do NOT add a global store (no evidence of cross-tree need beyond props).
- **`renamePatternDraft/dragOutFolderDraft:SettingsDialog:1457-1458`** initialized once, never re-synced when `extension.settings` change → derive or `key=` remount like `rootDraft:242` (`key={resetKey}:151,159` pattern, correct).
- Correctly derived today (keep): `orderedFiles:225`, `selectedCollectionName:1625`, `railView:1636`, `viewHeading:1651`, extension flags `1673-1689`, palette memos `1917-1949`.

Estimated sync-code deletion: ~80–150 LOC once shelf/search/selection each have one owner.

## Type / Schema Reduction

- Delete dead `schema.ts:65-68` (`Setting/File/Tag/Collection`); keep tables. App standardizes on `db.ts:61-63` (`$inferSelect`) — rename to `DbFile/DbTag/DbCollection` to avoid clashing with DOM `File`.
- Unify 5 file shapes on `YardFile` (`yard-core/domain/audio-file.ts`); `FileTable`/`AudioPlayer` `Pick<>` as needed. Delete `FileTableFileRecord`, `AudioPlayerFileRecord`, `page.tsx:56` local, `BulkBarTag` vs `FileTableFileTag` (keep one with optional `color?`; fix `file-row.tsx:84` inline third copy).
- Unify 3 `ScanStatus` shapes (`page.tsx:84-98`, `use-scan-polling.ts:5-19`, `yard-core/scan-types.ts` + `scan-state.ts:1`) — route response type should be imported by hook and page, not redeclared.
- Unify `AudioMetadata` ×3 on 8-field shape (§F5); fix `.aif` MIME drift.
- Unify `selection` shape ×3 (`execute/route.ts:13-17` inline vs `extension-host.ts:37-46` vs `extension-context.ts:33-37,44-49`) — route imports yard-core type.
- Colocate: `desktop-bridge.d.ts` → `desktop.ts`; `ScanStatusResponse` → producer (`/api/scan`); `FileTableSortKey/SelectModifiers` already well-owned (keep).
- Keep separate (distinct concepts): pagination coercion vs settings coercion; `MIME_TYPES` key domains (fix drift, don't merge blindly); smart-filter `q` vs full-text query.

## Shared Utility Cleanup

- `src/lib/utils.ts` (20 lines, 3 unrelated exports): keep `cn:4` (30 importers, true shared); `formatDuration:8` single-used by `file-row.tsx:29,193` — move next to owner OR merge with `AudioPlayer/format-time.ts:1` duplicate into one `lib/format.ts`; **delete `formatFileSize:15`** (zero importers).
- No `helpers.ts/common.ts/misc.ts` exists — the dumping-ground pattern recurs as one-use generic modules: `FileTable/selection.ts`, `highlight-match.tsx`, `AudioPlayer/format-time.ts`, `transport-queue.ts` (pure + tested, fine where it is), `hooks/use-zoom.ts` + `use-scan-polling.ts` (each single-used by `page.tsx` — colocate under `app/_library/` or keep; NOT a problem, just note ownership).
- `item-colors.ts` cohesive (keep); `desktop.ts` bridge + types far from `electron/preload.cjs` consumers — acceptable (TS side needs the type); merge the `.d.ts` in.
- `composition-root.ts` vs `db.ts` — pick one owner (§F3). `lib/extensions/*` 11 files are well-scoped (keep); `lib/scanner/*` 5 files well-scoped except the `validation.ts` clone (fix).
- Rule: new shared helpers go next to their domain (`FileTable/`, `AudioPlayer/`, `app/_library/`), never into `lib/utils.ts`.

## Module Boundary Problems

- **App → Core direction OK; contracts stale:** `Application → Yard Core → SQLite` layering holds, but `yard-core` interfaces are subsets of reality so app code reaches past them (`updateCollectionColor`, tag rename/color, `getSubdirectoriesForRoot`, plural roots). Fix contracts, not layering.
- **Feature A → Feature B internals:** `page.tsx` imports `FileTable/selection`, `Shortcuts/shortcuts`, `CommandPalette/command-palette`, `AudioPlayer/use-transport-queue`, `extensions/ui-intent`, `item-colors` — all cross-feature deep imports from one god-file. Hook extraction restores boundaries.
- **Server/client:** clean (API routes + `fetch` in page/dialogs; no DB imports in components). `use-scan-polling` type triple is the only server/client shape leak.
- **DB concerns:** contained in `lib/database/*` + 4 extension stores (the KV leak — fix via `SettingsKV`). `import * as schema` in 8 files is fine (drizzle idiom).
- **Low → high:** none found. **Shared → feature:** `ui/*` leaves import nothing feature-specific (good); `lib/db.ts` barrel imports only `database/*` (good).
- **Circular:** no runtime cycles. Two type-only tangles: `desktop.ts ↔ desktop-bridge.d.ts`; `yard-core extensions/*` DAG acyclic. Smell (not cycle): dual DB wiring.
- **Central modules:** `db.ts` (~40 re-exports) is a convenience barrel, not a god-module — acceptable; prefer deep imports for `schema` (already done).
- **Domain scatter:** shelf logic in `page.tsx` + `file-row.tsx:90-94` + `sound-shelf-store.ts` + 4 routes + event `sound-shelf-events.ts`; drop-rules in `yard-tools/drop-rules` + `prepare-drag` route + `desktop-actions.tsx`; scan in `scan-runner.ts` + `run-scan.ts` + `scan-state.ts` + `use-scan-polling` + `/api/scan`. Each cluster is small — colocate shelf under `app/_shelf/`, leave the rest.

## Extensibility Improvements

Adding a 7th extension today edits ≥5 app-owned files (`registry.ts:71-113` guard block, bespoke `/api/extensions/<name>/<verb>` route(s), dialog component, `ui-intent.ts` switch, `SettingsDialog` panel). Improvements that remove copy/paste without inventing plugin futures:

- **Table-driven `registerAllExtensions`** — 6 `if(!has) register` → data table (`{id, manifest, commands, store?}`); new extension adds one row. (§D24)
- **Shared route helpers** — new extension verbs reuse `toHostOutcomeResponse/requireIndexedFile/requireStringArray`; no epilogue paste. (§F2)
- **`SettingsKV`** — new extension settings get persistence without a new store file. (§F3)
- **`YardFile` + `toExtensionFile`** — new file-consuming extension projects one way. (§F5)
- **Hook-owned views** — new view (e.g. "recent") adds one `setView` case + one fetcher branch, not 6 coordinated `setX(null)` edits. (§F1)
- Do NOT build a manifest-driven UI renderer or dynamic route loader — 6 extensions don't justify it; the 5-file cost per extension is acceptable once the per-file boilerplate shrinks.

## Estimated LOC Reduction

| Bucket | LOC | Basis |
|---|---|---|
| Current prod (excl. proto/tests) | ~19,185 | measured |
| High-confidence removals | ~700–1,100 | dead UI files (~150) + dead exports (~30) + `SearchService`/dup decls (~40) + route epilogue/guards (~250–350) + KV dedup (~150–250) + validation clone (~25) + page pass-throughs (~50) |
| Likely additional | ~1,100–1,400 | page hook extraction dedup (~250–450) + Settings/Organize row/composer unification (~200–350) + repo singleton/base (~80–150) + type/hydration unification (~150–250) + subdirectory merge + registration table (~50–100) |
| Structural (LOC-flat, concept-down) | — | `page.tsx`/`SettingsDialog` splits, `extension-model.ts` collapse, barrel explicitness, single DB wiring, `YardFile` ownership |
| **Realistic final** | **~16,700–17,400 (−1,800 to −2,500, ~9–13%)** | ranges, not precision |
| Prototype quarantine (separate) | ~9,063 moved out of bundle tree | throwaway branch / build-excluded; not counted above |

If splits increase LOC slightly (+2–5% in `SettingsDialog/`), that is acceptable — ownership is the goal.

## Proposed Target Structure

Only where change is recommended (no repo-wide re-architecture):

```
src/app/page.tsx                      # ~300-line shell (views + dialogs mount)
src/app/_library/
  use-library-files.ts                # ← page.tsx:376,488,533 (+pagination refs)
  use-library-views.ts                # ← page.tsx:288-364 (one setView)
  use-palette.ts                      # ← page.tsx:1878-2029
  use-shortcuts.ts                    # ← page.tsx:2057-2164 + shortcuts/* glue
src/app/_collections/
  use-collections.ts / use-tags.ts    # ← create/rename/color/delete × pairs
src/app/_shelf/use-sound-shelf.ts     # ← count/add/clear + SOUND_SHELF_CHANGED_EVENT
src/app/_extensions/use-extensions.ts # ← enable/setting/execute + ui-intent
src/components/
  SaveSearchDialog.tsx                # ← page.tsx:2674-2707
  RenameCollectionDialog.tsx          # ← page.tsx:2709-2746
  settings/
    SettingsDialog.tsx (shell+Tabs)
    LibrarySettings.tsx MetadataSettings.tsx ExtensionSettings.tsx
    AppearanceSettings.tsx ShortcutSettings.tsx DropRulesSettings.tsx
    NamedEntityRow.tsx                # ← 3 Sure?/X rows + 2 composers
src/app/api/extensions/_shared.ts     # ← 11 epilogues + 6 guards + 4 validators
src/lib/database/
  settings-kv.ts                      # ← 4 KV stores
  repository.ts                       # ← lazyRepo() base (5 singletons)
packages/yard-core/src/extensions/
  extension-model.ts                  # ← 7 one-type files
  extension-host.ts extension-registry.ts extension-context.ts
  extension-command-registry.ts
src/lib/format.ts                     # ← formatDuration + formatTime (one)
src/types/                            # ← deleted (merged into desktop.ts)
```

Before/after for the two giants: `page.tsx` 2,492 → shell ~350 + 6 hooks ~250–350 each; `SettingsDialog.tsx` 1,828 → shell ~150 + 6 panels ~150–350 each. Totals flat-or-down; opens-per-question 1 instead of N.

## Recommended Order of Work

1. **Dead code/removals** (safe, unblocks the rest): delete `ui/table.tsx`, `ui/select.tsx`, `formatFileSize`, `schema.ts:65-68`, `SearchService`/dup `toggleFavorite`, delegate `validateLibraryRoot`; quarantine `prototype/*` from builds.
2. **Duplicate consolidation:** route `_shared.ts` (epilogue → guards → validators); `SettingsKV`; `toExtensionFile`/`withTags`; `isHexColor` import; smart-filter + select-list + batch-txn helpers.
3. **Unnecessary abstractions:** collapse `extension-model.ts`, explicit barrels, `lazyRepo()`, inline page pass-throughs, merge `.d.ts`, delete-or-complete stale contracts.
4. **State simplification:** `useDeferredValue`, `use-sound-shelf`, prune ref-mirrors + pruning effect, `key=`-remount drafts.
5. **Oversized files:** `page.tsx` hooks, `settings/` dir, `file-row` shelf hook, `dotmatrix-math` split (last).
6. **Module boundaries:** single DB wiring, `YardFile` ownership, shelf colocation.
7. **Lower-impact:** registration table, `initialScanStatus()`, about-button/Token-button constants, `Swatches` reuse audit.

Dependencies: (2) before (5) — extract helpers first so hooks/panels consume them; (1) anytime; (4) with (5); (6) after (2–3).

## Do Not Change

- **`src/lib/scanner/scan-runner.ts` orchestration + `run-scan/filesystem/scan-state` split** — batched discovery, mtime/size detection, soft-delete + move reconciliation is load-bearing and well-factored; only fix the `validation.ts` clone and add the `initialScanStatus()` factory.
- **`FileTable/` + `AudioPlayer/` decompositions** — one-use leaves look fragmented in isolation but each is a real render/behaviour boundary (`file-row`, `bulk-bar`, `player-shell`, `use-audio-playback`, `transport-queue` + tests). Only collapse the 3 generic helpers.
- **`yard-tools/*` per-extension packages** — one dir per extension is correct ownership; shrink per-extension boilerplate instead.
- **Per-route API files** — one file per route is Next.js idiom; share helpers, don't merge routes.
- **`dotmatrix-*` math** — cohesive pure functions; split only for testability, never "because 672 lines".
- **`cn()` in `lib/utils.ts`, `button/dialog/input/badge` shadcn primitives, `TooltipProvider/Toaster/UpdateNotifier` in `layout.tsx`** — framework-required or broadly shared; leave.
- **Intentionally duplicated `MIME_TYPES` key domains** until consumers agree on dot-prefixed vs bare keys — fix the `.aif` drift with a test, don't force-merge.
- **`transport-queue.ts` pure logic + `EMPTY_QUEUE` spread discipline** — tested (74 cases referenced); don't "simplify" the spreads.

## Final Scorecard

| Dimension | Score | Why |
|---|---|---|
| Code simplicity | 6/10 | Core/scanner/repos clean; `page.tsx` + route fan-out + KV clones drag it down. |
| Duplication | 5/10 | 11 epilogues, 6 guards, 4 KV stores, 5 file shapes, page/Settings clones — all real, all fixable. |
| Modularity | 6/10 | Real packages + repos + pure modules; god-component + stale contracts break ownership. |
| File responsibility | 5/10 | Two giants (2,492 + 1,828) + 7 one-liner type files are the extremes; middle is fine. |
| Abstraction quality | 5/10 | Double-wildcard barrels, dual wiring, stale interfaces, pass-throughs vs genuinely good `FileTable/AudioPlayer` splits. |
| State ownership | 5/10 | Debounced duplicate, shelf duplicate, 6 ref-mirrors, pruning effect — one-owner hooks fix it. |
| Type/schema organisation | 5/10 | 5 file shapes, 3 scan/metadata shapes, dead `schema.ts` aliases, far-from-owner ambient types. |
| Extensibility | 6/10 | 5-file cost per extension is honest but copy/paste-heavy; table + shared helpers halve it. No speculative framework needed. |
| Repository navigability | 6/10 | Layout is predictable; answering "what is an extension/file/shelf?" costs 5–11 opens today, 1–2 after. Prototype bulk (~9k) pollutes search. |
| Overall maintainability | 6/10 | Sound bones, concentrated bloat. The ordered plan above pays off in the first two steps without a rewrite. |
