> **Historical document — dated evidence, not current instructions.** See `docs/index.md` for current guides.

# Repository Modularisation Audit

AUDIT ONLY. No production code was modified. All paths are repo-relative. LOC figures are
approximate (Read-tool line counts, `prototype/*` and `*.test.*` noted separately) — they
exist to show whether a split is meaningful, not to enforce limits.

Method: full read of `src/`, `packages/yard-core`, `packages/yard-tools`, `src/app/api`;
end-to-end traces (scan → index → list → play; extension command → host → service →
filesystem; settings/organization mutations); import/export mapping per module. A prior
reduction audit (`docs/code-reduction-modularisation-audit.md`) covers LOC/dedup economics;
this audit covers MODULE SHAPE — exact target files, symbol moves, responsibilities, and
dependency rules — so another agent can implement without redesigning.

## Executive Summary

- **Current source:** ~19.2k prod LOC across ~210 files (`src`, `packages`, `electron`;
  excludes `src/app/prototype/*` ~9.1k and tests ~4.5k). Total scanned ~31.8k.
- **Main modularity issues:**
  1. `src/app/page.tsx` (~2,757 LOC, 46× `useState`, 75× `useCallback`, 16× `useEffect`)
     mixes 8+ responsibilities: view routing, data fetching, selection, transport, palette,
     shortcuts, scan, settings, shelf, extensions, bulk actions, 12+ dialogs.
  2. `src/components/SettingsDialog.tsx` (~1,952 LOC) mixes 6 settings tabs + drop-rules
     panel + extension controls + update bridge in one component.
  3. `src/lib/database/file-repository.ts` (539 LOC) mixes query building, writes, 4 batch
     paths, move reconciliation, favorites, and per-class singleton wiring.
  4. `src/lib/scanner/scan-runner.ts` (559 LOC) mixes orchestration, discovery streaming,
     existing-record reconciliation, metadata queue, and progress emission.
  5. `src/lib/dotmatrix-core.tsx` (782 LOC) mixes pattern tables, geometry, order builders,
     animation math, and the `DotMatrixBase` renderer — cohesive math, wrong file shape.
  6. `packages/yard-core/src/extensions/*` is over-fragmented the other way: 15 files for
     ~7 one-line types, merged by double-wildcard barrels (`extensions/index.ts`,
     `yard-core/src/index.ts` 28× `export *`).
  7. Extension dialogs (`FolderJanitorDialog` 427, `LibraryGathererDialog` 348, `MakePackDialog`
     253) each re-implement scan/fetch/footer patterns around the existing `ExtensionDialogShell`.
  8. API routes re-implement pagination parsing, error envelopes, and file-batch loops per file.
- **Amount of modularisation recommended:** 7 SPLITs (2 large, 5 focused), 3 MERGEs, ~15 MOVEs,
  ~10 EXTRACTs, 2 DELETEs. Everything else KEEP.
- **Expected effect on LOC:** roughly flat (±5%). This audit optimises for ownership and
  navigation, not line-count. The companion reduction audit carries the −9 to −13% estimate.
- **Expected effect on file count:** +28 to +36 new files, −4 to −6 removed/merged → net
  ~235–245 files. More files, each with one stated responsibility.

## Repository Classification

| File / module | LOC | Verdict | Reason in one line |
|---|---|---|---|
| `src/app/page.tsx` | ~2,757 | SPLIT | 8+ responsibilities, 70+ handlers, 12+ dialogs |
| `src/components/SettingsDialog.tsx` | ~1,952 | SPLIT | 6 tabs + drop-rules + extensions + bridge in one component |
| `src/lib/database/file-repository.ts` | 539 | SPLIT | Queries + writes + 4 batch paths + reconcile + favorites |
| `src/lib/scanner/scan-runner.ts` | 559 | SPLIT | Orchestration + discovery + reconcile + metadata queue + progress |
| `src/lib/dotmatrix-core.tsx` | 782 | SPLIT | Pattern/geometry/order/animation math + renderer |
| `src/components/OrganizeView.tsx` | 513 | SPLIT | Collections section + tags section + shared swatches/composers |
| `src/components/FileTable/file-row.tsx` | 337 | SPLIT | Row render + shelf fetch + context-menu construction |
| `src/components/AudioPlayer/use-audio-playback.ts` | 193 | SPLIT | Element lifecycle + volume prefs + waveform peaks |
| `src/components/FileTable.tsx` | 281 | SIMPLIFY | Extract path-math + item-memo helpers internally (no new top-level files beyond 1) |
| `src/app/api/files/route.ts` | 157 | SIMPLIFY + EXTRACT | Extract pagination + error + batch-delete worker to shared API lib |
| `src/app/api/*` (other routes) | 20–120 ea | EXTRACT | Consume shared API lib; no per-route splits |
| `src/lib/extensions/registry.ts` | 150 | SIMPLIFY | Table-driven registration, same file |
| `src/components/CommandPalette/command-palette.ts` | 231 | SIMPLIFY | Extract per-section builder functions in-file; no new files |
| `src/components/Shortcuts/shortcuts.ts` | 185 | KEEP | Single responsibility (shortcuts domain); storage + matching belong together |
| `src/components/CommandPalette/CommandPalette.tsx` | ~150 | KEEP | Thin dialog over `command-palette.ts`; real boundary |
| `src/components/AudioPlayer.tsx` | 116 | KEEP | Null-guard + composition root; correct size |
| `src/components/AudioPlayer/player-shell.tsx` | 176 | KEEP | Presentation shell; real boundary |
| `src/components/AudioPlayer/transport-queue.ts` | 87 | KEEP | Pure tested logic; do not fragment further |
| `src/components/AudioPlayer/use-transport-queue.ts` | ~70 | KEEP | Thin hook over pure module; correct seam |
| `src/components/AudioPlayer/format-time.ts` | 9 | MERGE | One-line wrapper; merge into shared format module |
| `src/components/FileTable/*` (bulk-bar, breadcrumb-bar, directory-row, empty-state, desktop-actions, selection, highlight-match, row-waveform) | 20–220 ea | KEEP | Already single-purpose leaves; see §Do Not Modularise |
| `src/components/extensions/FolderJanitorDialog.tsx` | 427 | SPLIT | Scan state + results + footer actions per dialog; extract hook |
| `src/components/extensions/library-gatherer/LibraryGathererDialog.tsx` | 348 | SPLIT | Same pattern as above |
| `src/components/extensions/make-pack/MakePackDialog.tsx` | 253 | SPLIT | Same pattern, smaller |
| `src/components/extensions/ExtensionDialogShell.tsx` | 82 | KEEP | Good shared shell; extend, don't split |
| `src/components/ExtensionGrid.tsx` | 236 | KEEP | Grid + item type; cohesive |
| `src/components/OrganizeView.tsx` types | — | MOVE | `OrganizeCollection`/`OrganizeTag` → colocated types file |
| `src/lib/utils.ts` | 20 | SPLIT | `cn` (shared) vs format helpers (domain) |
| `src/lib/schema.ts` | 68 | SIMPLIFY + DELETE | Keep tables; delete 4 dead type aliases |
| `src/lib/db.ts` | 63 | MERGE (target) | Absorb `composition-root.ts`; keep barrel shape |
| `src/lib/composition-root.ts` | 87 | MERGE (source) | Move services into `db.ts`; delete file |
| `src/lib/desktop.ts` + `src/types/desktop-bridge.d.ts` | 59 + 9 | MERGE | Ambient augment belongs with bridge module |
| `src/types/better-sqlite3.d.ts` | 21 | KEEP | Global shim must stay ambient |
| `src/hooks/use-zoom.ts` | 69 | KEEP | Single hook, single owner (`page.tsx`); move only if view hooks relocate |
| `src/hooks/use-scan-polling.ts` | 54 | MOVE (type only) | Move `ScanStatusResponse` to scan domain; keep hook file |
| `src/lib/dotmatrix-hooks.ts` | 189 | KEEP | Stays; dotmatrix split imports from it |
| `src/lib/database/collection-repository.ts` | 174 | KEEP | Cohesive aggregate repo |
| `src/lib/database/tag-repository.ts` | 92 | KEEP | Cohesive aggregate repo |
| `src/lib/database/settings-repository.ts` | 167 | KEEP | Cohesive KV repo |
| `src/lib/database/browse-repository.ts` | 89 | SIMPLIFY | Merge the two subdirectory loops in-file |
| `src/lib/database/connection.ts` | 52 | KEEP | Connection seam |
| `src/lib/database/migrations.ts` | 129 | KEEP | Migration list; do not fragment |
| `src/lib/client-waveform.ts` | 115 | KEEP | Waveform cache seam |
| `src/lib/metadata.ts` | 98 | KEEP | Metadata seam |
| `src/lib/filesystem-boundary.ts` | 32 | KEEP | Boundary helper; routes should import it |
| `src/lib/item-colors.ts` | 37 | KEEP | Cohesive palette module |
| `src/lib/database-path.ts` | 56 | KEEP | Path resolution seam |
| `src/lib/scanner/run-scan.ts`, `filesystem.ts`, `scan-state.ts`, `validation.ts` | 20–120 ea | KEEP | Already factored; scan-runner split plugs into these |
| `src/lib/extensions/host.ts` | 20 | KEEP | Correct thin wiring |
| `src/lib/extensions/runtime.ts` | ~40 | KEEP | Registry singleton seam |
| `src/lib/extensions/ui-intent.ts` | ~60 | KEEP | Intent switch; grows by intent, not by extension (see §14) |
| `src/lib/extensions/sound-shelf-store.ts`, `settings-store.ts`, `make-pack-recent-store.ts` | 50–55 ea | EXTRACT | Extract shared KV helper; keep store classes as thin owners |
| `packages/yard-core/src/extensions/*` (15 files) | 8–150 ea | MERGE | 7 one-type files → one model module |
| `packages/yard-core/*` (domain, services, repositories) | — | KEEP | Stable contracts; no new layers |
| `packages/yard-tools/*/src` (6 extensions × manifest/commands/service/store/settings/permissions/types/index) | — | KEEP | Correct per-extension ownership |
| `src/components/ui/*` (24 primitives) | — | KEEP | shadcn leaves; dead-file deletion belongs to reduction audit |
| `src/app/prototype/*` | ~9.1k | KEEP (quarantine, not modularise) | Throwaway branches; do not restructure |
| `electron/*` | — | KEEP (out of scope) | Not inspected for this audit; no proposal |
| `*.test.*`, `__tests__` | ~4.5k | KEEP | Colocated tests stay with owners |

## Highest Priority Modularisation

1. **`src/app/page.tsx` → `src/app/library/`** — the only change that unblocks everything else.
   Without it every feature edit touches a 2.7k-file and every later move conflicts.
2. **`src/components/SettingsDialog.tsx` → `src/components/settings/`** — second-largest file;
   independent of (1), safe to parallelise once types move.
3. **`packages/yard-core/src/extensions/*` MERGE** — 30-minute change that removes 8+ files of
   navigation tax for every extension task that follows.
4. **`src/lib/database/file-repository.ts` → `src/lib/database/file/`** — unblocks scan/API work;
   method signatures stay identical so callers don't move.
5. **`src/app/api/_lib/` EXTRACT** — every route/split after this consumes it; do before dialog hooks.
6. **`src/lib/dotmatrix/` SPLIT + `src/lib/format.ts` MERGE + `composition-root` MERGE + OrganizeView
   split + dialog hooks + playback split** — independent, any order, smallest-first.

## Files to Split

### S1 — `src/app/page.tsx` (~2,757 LOC)

**Responsibilities currently inside it:**

1. Local domain types (`FileRecord:56`, `CollectionRecord:69`, `TagRecord:78`, `ScanStatus:84`,
   `emptyScanStatus:100`, `CURRENT_ONBOARDING_VERSION:116`).
2. View routing (`showLibrary:296`, `showFavorites:305`, `showExtensions:314`, `showShelf:324`,
   `showOrganize:333`, `showCollection:345`, `navigateDirectory:367`, `handleFilterTag:342`,
   `flipSort:213`, `orderedFiles:225`).
3. Library data fetching (`loadSoundShelfCount:277`, `loadFiles:384`, `loadMoreFiles:496`,
   `loadDirectories:541`, `loadInitialData:578`, `loadFavoritesCount:711`, shelf-changed
   subscription `685`, scan polling wiring).
4. File mutations (`handleToggleFavorite:727`, `handleToggleFileTag:754`,
   `handleRemoveFileFromLibrary:957`, `executeBulkRemove:902`, bulk `854–900`).
5. Collections/tags/smart-search CRUD (`handleSaveSearch:992`, `handleRenameCollection:1016`,
   `handleUpdateCollectionFilter:1032`, `handleConvertToRegularCollection:1047`,
   `handleCreateCollection:1146`, `executeDeleteCollection:1179`, `handleDeleteCollection:1222`,
   `handleCreateTag:1264`, `handleDeleteTag:1297`, `handleRenameTag:1326`,
   `handleUpdateTagColor:1352`, `handleUpdateCollectionColor:1372`, `handleAddToCollection:1498`).
6. Settings/scan/onboarding/roots (`saveLibraryRoot:1062`, `handleSaveRoot:1090`,
   `startLibraryScan:1094`, `handleStartScan:1114`, `handleCompleteOnboarding:1118`,
   `handleRemoveRoot:1226`).
7. Extensions (`handleToggleExtensionEnabled:1400`, `handleUpdateExtensionSetting:1452`,
   `executeHostedCommand:1527`, `handleScanFolder:1593`, `handleRunCommand:1604`,
   `handleMakePackFile:1850`, `handleMakePackShelf:1860`, `handleClearShelf:1865`,
   dialog closers `2174–2182`).
8. Selection + transport (`handleClearSelection:131`, `handleOpen/CloseMobileSidebar:1699–1700`,
   `handleOpenSettings:1701`, `handleSelectFile:1710`, `handleMoveSelection:1737`,
   `handleTrackEnded:1771`, `handleStepNext:1785`, `handleStepPrev:1799`,
   `handleToggleAutoplay:1813`, `handleClosePlayer:1880`).
9. Command palette (`openPalette:1886`, `closePalette:1892`, `handlePaletteQueryChange:1896`,
   `handleAddCurrentToShelf:1901`, `handlePaletteSelect:1987`).
10. Render composition (~2,180–2,757: rail, header/search, shelf banner, grids, tables, player,
    palette, settings/onboarding/extension dialogs, save-search/rename dialogs).

**Problem:** 10 responsibilities share one closure scope. Import count (~25 modules) and 70+
callbacks mean any feature change risks unrelated state; tests can't target one behaviour;
new views/dialogs only make it larger (see §14).

**Proposed files** (all under `src/app/library/`, internal to the home route except `library.types.ts`):

- `src/app/library/library.types.ts` — Owns route domain types. Moves `FileRecord`,
  `CollectionRecord`, `TagRecord`, `ScanStatus`, `emptyScanStatus`, `CURRENT_ONBOARDING_VERSION`.
  Expected ~70 LOC. Imported by every hook below + `page.tsx`. Public to route, not app-global
  (do NOT put in `src/types/`; FileTable/AudioPlayer keep their own row types).
- `src/app/library/use-library-view.ts` — Owns view routing state. Moves `currentView`,
  `selectedCollection`, `selectedDirectory`, `selectedTagId`, `searchQuery` (raw input only),
  `showLibrary/showFavorites/showExtensions/showShelf/showOrganize/showCollection/
  navigateDirectory/handleFilterTag`, `flipSort/sortKey/sortDir/orderedFiles`. Expected ~200 LOC.
  Imports `library.types`, FileTable directory types. Used by `page.tsx` + data hooks.
- `src/app/library/use-library-data.ts` — Owns server reads. Moves `files/directories/isLoadingFiles/
  hasMoreFiles`, pagination refs, `loadFiles/loadMoreFiles/loadDirectories/loadInitialData`
  (collections/tags/settings/scan/extensions bootstrap stays here as one bootstrap query; per-domain
  refresh moves to domain hooks). Expected ~250 LOC. Imports `library.types`, `@/lib/db` readers.
- `src/app/library/use-library-selection.ts` — Owns selection behaviour. Moves `selectedFile`,
  `selectedIds`, `selectionAnchorRef` (+ mirrors), `handleClearSelection/handleSelectFile/
  handleMoveSelection`. Expected ~120 LOC. Imports FileTable `selection.ts` + `SelectModifiers`.
- `src/app/library/use-favorites.ts` — Owns favorite state. Moves `favoritesCount`,
  `loadFavoritesCount/handleToggleFavorite`. Expected ~60 LOC.
- `src/app/library/use-collections.ts` — Owns collections + smart search. Moves collection state
  slice + `handleSaveSearch/handleRenameCollection/handleUpdateCollectionFilter/
  handleConvertToRegularCollection/handleCreateCollection/executeDeleteCollection/
  handleDeleteCollection/handleAddToCollection`. Expected ~200 LOC.
- `src/app/library/use-tags.ts` — Owns tags + file-tag links. Moves tag state slice +
  `handleCreateTag/handleDeleteTag/handleRenameTag/handleUpdateTagColor/handleToggleFileTag`.
  Expected ~150 LOC.
- `src/app/library/use-shelf.ts` — Owns sound-shelf view state. Moves `soundShelfItemCount/
  soundShelfFileIds`, `loadSoundShelfCount`, shelf-changed subscription, `handleBulkAddToShelf/
  handleAddCurrentToShelf/handleClearShelf`. Expected ~120 LOC. Imports
  `sound-shelf-events`, shelf API readers.
- `src/app/library/use-bulk-actions.ts` — Owns multi-select mutations. Moves `confirmBulkRemove/
  confirmClearShelf`, `handleBulkSaveAll/handleBulkAddToQueue/handleBulkTag/executeBulkRemove/
  handleRemoveFileFromLibrary`. Expected ~180 LOC. Imports selection + favorites + shelf hooks'
  types (no cross-hook state writes; takes explicit args).
- `src/app/library/use-library-settings.ts` — Owns settings/scan/onboarding. Moves `settings/
  scanStatus/showOnboarding/showSettings`, `saveLibraryRoot/handleSaveRoot/startLibraryScan/
  handleStartScan/handleCompleteOnboarding/handleRemoveRoot`, `useScanPolling` wiring.
  Expected ~180 LOC.
- `src/app/library/use-extensions-ui.ts` — Owns extension UI state. Moves `extensions/
  isLoadingExtensions/pendingExtensionId/selectedExtension`, dialog open flags
  (`folderJanitorOpen/Target/FolderPath`, `gatherOpen`, `packSource/packFileIds`,
  `showSaveSearch/renamingCollection`), `handleToggleExtensionEnabled/
  handleUpdateExtensionSetting/executeHostedCommand/handleScanFolder/handleRunCommand/
  handleMakePackFile/handleMakePackShelf`, closers. Expected ~220 LOC. Imports `ui-intent`,
  `isDesktopApp`, extension grid types.
- `src/app/library/use-transport.ts` — Owns playback queue wiring. Moves `transportQueue`
  (`useTransportQueue`), `isPlayerPlaying`, `handleTrackEnded/handleStepNext/handleStepPrev/
  handleToggleAutoplay/handleClosePlayer`. Expected ~100 LOC.
- `src/app/library/use-palette.ts` — Owns palette behaviour. Moves `paletteOpen/paletteQuery/
  paletteIndex`, refs, `openPalette/closePalette/handlePaletteQueryChange/handlePaletteSelect`.
  Expected ~150 LOC. Imports `command-palette.ts` builders.
- `src/app/library/save-search-dialog.tsx` — Owns save-search dialog. Moves save-search JSX +
  `showSaveSearch` state. Expected ~80 LOC.
- `src/app/library/rename-collection-dialog.tsx` — Owns rename dialog. Moves rename JSX +
  `renamingCollection` state. Expected ~70 LOC.

**Expected result:** `src/app/page.tsx` becomes a ~200-LOC shell: calls the hooks, derives
`railView/show*View/viewHeading` memos (keep in shell), renders rail/header/views/dialogs.
No behaviour change; props flow shell → components as today.

### S2 — `src/components/SettingsDialog.tsx` (~1,952 LOC)

**Responsibilities:** dialog shell + tab bar; library-roots tab (validate/save/remove/scan);
metadata tab (collections CRUD + tags CRUD); extensions tab (list + per-setting controls);
appearance tab (zoom/slider); shortcuts tab (rebind matrix + remove-default); about tab
(version/update bridge); drop-rules panel; shared bits (`ValidationResult:64`,
`SettingsDialogProps:73`, `APP_VERSION:62`, validation message, scan stats).

**Problem:** one file owns six product areas; adding a setting means scrolling past five
unrelated tabs; props interface (`73–122`) is a union of every tab's needs.

**Proposed files** (`src/components/settings/`, shell imports tabs; tabs import only their slice):

- `src/components/settings/SettingsDialog.tsx` — Owns shell + tab state only. Moves dialog open
  plumbing, `Tabs` bar, tab switching. Expected ~150 LOC. Imports the six tabs + types.
- `src/components/settings/settings.types.ts` — Owns shared types. Moves `ValidationResult`,
  `SettingsDialogProps` (slimmed per-tab), tab id union. Expected ~80 LOC.
- `src/components/settings/library-tab.tsx` — Owns roots + validation + scan. Moves root draft,
  validation result/fetch, save/remove/scan handlers, `ValidationMessage`, `ScanStat` rows.
  Expected ~300 LOC. Imports `@/lib/db` settings readers, desktop bridge pick-folder.
- `src/components/settings/metadata-tab.tsx` — Owns collections + tags management. Moves
  collection/tag CRUD handlers + rows. Expected ~350 LOC.
- `src/components/settings/extensions-tab.tsx` — Owns extension list + setting controls. Moves
  `expandedExtensionId`, toggle/setting handlers, `ExtensionSettingControl`. Expected ~250 LOC.
- `src/components/settings/appearance-tab.tsx` — Owns zoom/theme. Moves slider/reset handlers.
  Expected ~100 LOC.
- `src/components/settings/shortcuts-tab.tsx` — Owns rebind matrix. Moves `rebindingAction`,
  keydown capture effect, conflict list, remove-default radio. Expected ~200 LOC. Imports
  `Shortcuts/shortcuts`.
- `src/components/settings/about-tab.tsx` — Owns version/update. Moves `APP_VERSION`,
  `manualUpdateToastRef`, check-for-updates handlers. Expected ~120 LOC. Imports desktop bridge.
- `src/components/settings/drop-rules-panel.tsx` — Owns drop-rules settings. Moves
  `DropRulesSettingsPanel/CurrentBehaviour/ToggleRow/SettingGroup`, rename-pattern/drag-folder
  drafts, preview builders. Expected ~300 LOC. (Already the most separable block: `1437+`.)

**Expected result:** current file deleted; shell + 8 modules. Each tab independently reviewable;
new settings touch one file.

### S3 — `src/lib/database/file-repository.ts` (539 LOC)

**Responsibilities:** `SqliteAudioFileRepository` query surface (`getFiles:36`,
`getFileCount:166`, `getAllFilesIncludingRemoved:198`, `getFileById:222`, `getFileByPath:226`,
`getFilesByPaths:230`), writes (`upsertFile:251`, `touchFileAsSeen:293`, `markFileRemoved:392`,
`toggleFavorite:501`, `reconcileMovedFiles:414`), 4 batch paths (`batchTouchFiles:300`,
`batchUpsertFiles:314`, `batchUpdateFileMetadata:352`, `batchMarkRemoved:399`), helpers
(`chunkArray:17`, `SQLITE_MAX_VARIABLES:15`), per-file singleton wiring (bottom of file).

**Problem:** query text, transaction choreography, and reconciliation share one class body;
batch methods repeat the same chunk/transaction skeleton with different SQL.

**Proposed files** (`src/lib/database/file/`, class façade keeps exact public signatures):

- `src/lib/database/file/file-repository.ts` — Owns façade + construction. Keeps class +
  constructor + method signatures delegating to modules below. Expected ~120 LOC. Imported by
  `db.ts`, `composition-root.ts`, tests. Public.
- `src/lib/database/file/file-queries.ts` — Owns reads. Moves `getFiles/getFileCount/
  getAllFilesIncludingRemoved/getFileById/getFileByPath/getFilesByPaths`. Expected ~180 LOC.
  Imports `drizzle-orm`, `schema`, yard-core query types. Internal.
- `src/lib/database/file/file-writes.ts` — Owns single-row writes + favorites + reconcile.
  Moves `upsertFile/touchFileAsSeen/markFileRemoved/toggleFavorite/reconcileMovedFiles`.
  Expected ~140 LOC. Internal.
- `src/lib/database/file/file-batch.ts` — Owns batch paths. Moves 4 `batch*` methods +
  `chunkArray` + `SQLITE_MAX_VARIABLES` + shared `withTransaction` helper. Expected ~140 LOC.
- `src/lib/database/file/index.ts` — Owns re-export + singleton wiring (moved from file bottom).
  Expected ~20 LOC. `db.ts` imports from here (path update is the only caller change).

**Expected result:** same imports for callers (via updated `db.ts`); each change (new filter, new
batch) touches one module.

### S4 — `src/lib/scanner/scan-runner.ts` (559 LOC)

**Responsibilities:** seam interfaces (`FileSystemSeam:13`, `MetadataSeam:28`), row types
(`ExistingFileRecord:49`, `MetadataUpdateRecord:67`, `MetadataTask:77`), `ScanRunner`/`scan`
orchestration, directory discovery streaming, existing-record diff + move reconciliation,
metadata task queue, progress/status emission, `validateLibraryRoot` clone.

**Problem:** orchestration + 4 phase implementations in one file; discovery and metadata pacing
can't be reasoned about or tested without loading the whole runner.

**Proposed files** (inside existing `src/lib/scanner/`, alongside kept `run-scan.ts`,
`filesystem.ts`, `scan-state.ts`, `validation.ts`):

- `src/lib/scanner/scan-runner.ts` — Owns orchestration only. Keeps `ScanRunner` class +
  `scan()` phase ordering + constructor/seams. Expected ~150 LOC.
- `src/lib/scanner/scan-types.ts` (new; distinct from yard-core scan-types) — Owns runner row
  types. Moves `ExistingFileRecord/MetadataUpdateRecord/MetadataTask`. Expected ~40 LOC.
- `src/lib/scanner/discover.ts` — Owns discovery streaming. Moves batch walk + depth/error
  handling. Expected ~100 LOC. Imports `FileSystemSeam`.
- `src/lib/scanner/reconcile.ts` — Owns existing-record diff. Moves unchanged/added/updated/
  removed/move-reconcile decisions. Expected ~130 LOC. Imports scan-types + file repo types.
- `src/lib/scanner/metadata-queue.ts` — Owns metadata pacing. Moves task queue + concurrency +
  `MetadataSeam` calls. Expected ~120 LOC.
- `src/lib/scanner/progress.ts` — Owns status emission. Moves progress builders/counters.
  Expected ~60 LOC. (Fix `validateLibraryRoot` clone here: delegate to `validation.ts`.)

**Expected result:** `run-scan.ts` calls the slimmer runner; phases unit-testable via seams.

### S5 — `src/lib/dotmatrix-core.tsx` (782 LOC)

**Responsibilities:** public types (`MatrixPattern:8`, `DotMatrixPhase:9`,
`DotMatrixCommonProps:11`, `DotAnimationContext:31`, `DotAnimationState:44`,
`DotAnimationResolver:49`, `cx:51`), grid constants + 6 pattern tables (`55–100`), pattern
lookup (`getPatternIndexes:102`), geometry (`rowMajorIndex:106` … `normalizedRadius:132`),
animation math (`harmonicPhase:142`, `lissajousOffset:146`, `spiralOffset:157`, `isPrime:170`,
`trBlPathNorm…:196`), 6 order builders + norm/value pairs (`201–435`), mask/style/clamp/layout
utils (`442–546`), `DotMatrixBase` renderer (`564–721`), path-wave factories (`725+`).

**Problem:** pure math (importable anywhere, testable) is fused to a `"use client"` renderer;
pattern/geometry/order/animation groups are individually coherent but unaddressable.

**Proposed files** (`src/lib/dotmatrix/`, pure modules have zero React imports):

- `src/lib/dotmatrix/types.ts` — Moves all 6 exported types + `cx`. Expected ~60 LOC.
- `src/lib/dotmatrix/patterns.ts` — Moves `MATRIX_SIZE/CENTER/RANGE/MAX_RADIUS`,
  6 `*_INDEXES` tables, `PATTERN_INDEXES`, `getPatternIndexes`. Expected ~80 LOC.
- `src/lib/dotmatrix/geometry.ts` — Moves `rowMajorIndex/indexToCoord/distanceFromCenter/
  rowDistance/polarAngle/normalizedRadius/manhattanDistance`. Expected ~70 LOC.
- `src/lib/dotmatrix/orders.ts` — Moves 6 `build*Order` + norm/value pairs. Expected ~200 LOC.
- `src/lib/dotmatrix/animation-math.ts` — Moves `harmonicPhase/lissajousOffset/spiralOffset/
  isPrime/trBlPathNorm` + mask/style/clamp/layout utils. Expected ~150 LOC.
- `src/lib/dotmatrix/DotMatrixBase.tsx` — Owns rendering only. Moves component. Expected ~140 LOC.
  Imports types/patterns/geometry/orders + `dotmatrix-hooks`.
- `src/lib/dotmatrix/resolvers.ts` — Moves `createPathWaveResolver/createPathWaveComponent`.
  Expected ~80 LOC.
- Keep `src/lib/dotmatrix-core.tsx` as a ~20-line re-export shim for one release, then delete
  (see extraction map).

**Expected result:** math importable from server/tests; renderer change touches one file.

### S6 — `src/components/OrganizeView.tsx` (513 LOC)

**Responsibilities:** types (`OrganizeCollection:13`, `OrganizeTag:21`), shared `Swatches:27`,
collections section (expand/composer/rename/confirm/color), tags section (composer/edit/confirm/
color), 14 state slices (`83–95`), 4 action closures (`createCollection/commitRename/createTag/
commitTagRename`).

**Problem:** two feature sections (collections vs tags) share one state namespace and duplicate
composer/confirm/rename patterns inline.

**Proposed files** (`src/components/organize/`):

- `src/components/organize/OrganizeView.tsx` — Shell: props + two section mounts. ~60 LOC.
- `src/components/organize/organize.types.ts` — Moves both types. ~20 LOC.
- `src/components/organize/swatches.tsx` — Moves `Swatches`. ~30 LOC.
- `src/components/organize/collections-section.tsx` — Moves expanded/composer/rename/confirm
  state + actions + list JSX. ~220 LOC. Imports swatches + item-colors.
- `src/components/organize/tags-section.tsx` — Moves tag composer/edit/confirm state + pills JSX.
  ~200 LOC.
- `src/components/organize/entity-composer.tsx` — Owns shared name+color composer (extracted
  from the two duplicated composers). ~60 LOC. Used by both sections. (Genuine shared
  responsibility — the one justified new abstraction in this split.)

### S7 — Extension dialogs (427 / 348 / 253 LOC)

Each dialog mixes data-fetch/scan state, results rendering, and footer actions. The shell already
exists (`ExtensionDialogShell.tsx` KEEP). Split each dialog into view + hook; then extract one
shared fields module:

- `src/components/extensions/folder-janitor/FolderJanitorDialog.tsx` (~150 LOC view) +
  `src/components/extensions/folder-janitor/use-folder-janitor-scan.ts` (~270 LOC: scan state,
  remove/delete calls, results). Moves fetch + polling out of JSX.
- `src/components/extensions/library-gatherer/LibraryGathererDialog.tsx` (~130 view) +
  `.../use-library-gather.ts` (~210).
- `src/components/extensions/make-pack/MakePackDialog.tsx` (~120 view) +
  `.../use-make-pack.ts` (~130).
- `src/components/extensions/extension-dialog-fields.tsx` (~80, EXTRACT) — Owns shared
  path-picker row, status banner, footer button row used by all three dialogs.

### S8 — `src/components/AudioPlayer/use-audio-playback.ts` (193 LOC)

**Responsibilities:** audio element lifecycle (`audioRef`, ended/playback-change effects),
volume prefs (`VOLUME_STORAGE_KEY:9`, `LEGACY_VOLUME_STORAGE_KEYS:10`, `clampVolume:12`,
init/persist), time/duration/mute state, waveform peaks (`computeAndCachePeaks`).

**Proposed:**

- `src/components/AudioPlayer/use-volume-prefs.ts` — Moves keys + clamp + init/persist. ~50 LOC.
- `src/components/AudioPlayer/use-audio-element.ts` — Moves element creation, src wiring,
  ended/playback-change refs. ~80 LOC.
- `src/components/AudioPlayer/use-waveform-peaks.ts` — Moves peaks fetch/cache. ~50 LOC.
- `use-audio-playback.ts` — Composer calling the three; keeps signature. ~60 LOC.

## Files to Merge

### M1 — `packages/yard-core/src/extensions/*` (15 files → 5)

Current: `extension-category.ts` (1 type), `extension-surfaces.ts` (1), `extension-settings.ts` (1),
`extension-types.ts` (1), `extension-command.ts` (3), `extension-command-error.ts` (1),
`extension-ui-intent.ts` (3), `extension-manifest.ts` (1), `extension-permissions.ts` (4),
`extension-context.ts` (5), `extension-host.ts` (5), `extension-registry.ts` (1 class),
`extension-command-registry.ts` (1 class), `index.ts` + `yard-core/src/index.ts` barrels.

Why merge: file:export ratio ~1:1; answering "what is an extension" costs 8+ opens; barrels hide
origin (`export *` ×13 + ×28).

Proposed:

- `packages/yard-core/src/extensions/extension-model.ts` — Moves `YardExtensionCategory,
  YardSurface, YardSetting, YardExtensionManifest, YardCommandScope, YardCommand,
  RegisteredYardCommand, YardCommandValidationError, YardPermission, PermissionChecker,
  YardPermissionError, createPermissionChecker, YardUiIntent, createYardUiIntent, isYardUiIntent,
  YardExtensionDefinition`. ~150 LOC. Pure types + tiny guards. Public.
- Keep `extension-host.ts` (host + outcome + options), `extension-registry.ts`,
  `extension-context.ts` (+ settings/file-service types stay — they describe context, not model),
  `extension-command-registry.ts`. Each keeps its behaviour. Internal imports point at
  `extension-model.ts`.
- Rewrite both `index.ts` files as explicit named re-exports (no `export *`).
- Delete the 8 absorbed files.

Responsibility sentences: `extension-model.ts` owns the extension vocabulary and nothing that
executes; `extension-host.ts` owns command execution; `extension-registry.ts` owns
registration/lookup; `extension-context.ts` owns context construction; barrels own the public
listing.

### M2 — Format helpers → `src/lib/format.ts`

Current: `AudioPlayer/format-time.ts:1` (`formatTime`, 9 LOC) duplicates `lib/utils.ts:8`
(`formatDuration`) `m:ss` math; `lib/utils.ts:15` (`formatFileSize`) orphaned from `cn`.

Proposed: new `src/lib/format.ts` owns all duration/size formatting (`formatDuration`,
`formatTime` as alias or single function with documented null contract, `formatFileSize`,
palette `formatPaletteDuration` stays in palette module — different null contract returning
`null`, do NOT merge). `file-row.tsx:29` and `player-shell` import from `@/lib/format`.
`lib/utils.ts` keeps `cn` only. Delete `format-time.ts`.

### M3 — `src/lib/composition-root.ts` (87) → `src/lib/db.ts`

Current: two wirings — `db.ts` (63-line barrel re-exporting every repository function) and
`composition-root.ts` (`AppServices:17`, `getAppServices:32`, `createExtensionServices:64`).
`host.ts:3` uses composition-root; routes use `db.ts`/repos directly.

Proposed: move `AppServices/getAppServices/createExtensionServices` into `src/lib/db.ts`
(renamed responsibility: "database + service wiring"), delete `composition-root.ts`, update the
single importer (`host.ts:3`). No signature changes. `db.ts` responsibility: owns all
database access AND service construction; nothing else lives there.

## Code to Move

Logic living in the wrong module (each row is implementable as stated):

| Current | Symbol | Proposed | Reason |
|---|---|---|---|
| `src/app/page.tsx:56` | `FileRecord` | `src/app/library/library.types.ts` | Route type reused by 10 hooks; not page-render concern |
| `src/app/page.tsx:84` | `ScanStatus` + `emptyScanStatus` | `src/lib/scanner/scan-types.ts` or library.types (pick one; prefer scanner domain) | Duplicates hook + yard-core shapes; producer should own |
| `src/hooks/use-scan-polling.ts:5` | `ScanStatusResponse` | scanner scan-types module | Consumer redeclares producer's response shape |
| `src/types/desktop-bridge.d.ts` | global augment | `src/lib/desktop.ts` (bottom) | Sole consumer is the bridge module; kills type-only split |
| `src/components/FileTable/types.ts` | `FileTableFileRecord` + `AudioPlayer/types.ts` record | Keep both (row vs player views differ) BUT move shared subset to `library.types` Pick<> | Stops third/fourth copies in `page.tsx`/`db.ts` |
| `src/components/FileTable/bulk-bar.tsx:15` | `BulkBarTag` | `FileTable/types.ts` (extend `FileTableFileTag`) | Two tag-link shapes for one concept |
| `src/components/OrganizeView.tsx:13,21` | `OrganizeCollection/OrganizeTag` | `src/components/organize/organize.types.ts` | Consumed by sections, not shell logic |
| `src/lib/database/file-repository.ts:17` | `chunkArray` + `SQLITE_MAX_VARIABLES` | `file-batch.ts` | Batch-only helpers; queries shouldn't see them |
| `src/app/api/files/route.ts:11` | `parsePageInteger` | `src/app/api/_lib/pagination.ts` | Reused by every paginated route |
| `src/components/Shortcuts/shortcuts.ts` | storage fns (if split later) | KEEP — explicitly not moving | Storage + matching are one domain; split would fake a boundary |

## Shared Logic to Extract

Genuine same-responsibility duplication (incidental similarity excluded):

1. **`src/app/api/_lib/route-errors.ts`** — `jsonOk/jsonFail/parseJsonBody` from `files/route.ts:
   94-96,154-156` catch envelopes + `collections/tags` 400/500 pairs. Owner: API layer. Used by all
   29 routes. Do NOT centralise Next `dynamic/runtime` flags (framework-required per file).
2. **`src/app/api/_lib/pagination.ts`** — `parsePageInteger` + `DEFAULT/MAX_PAGE_SIZE` from
   `files/route.ts:8-19`. Used by `files/directories` (+ any future list route).
3. **`src/app/api/files/delete-files.ts`** — batch delete worker (concurrency-8 loop `115–151`,
   per-id `getFileById` + optional `fs.unlink` + `markFileRemoved`) callable from route + future
   folder-janitor bulk paths. Owner: files domain, not generic.
4. **`src/lib/database/kv-store.ts`** — `getJsonSetting/setJsonSetting` from the 3 extension
   stores (`sound-shelf-store.ts:14-52`, `settings-store.ts`, `make-pack-recent-store.ts` identical
   select/parse/upsert cycles). Stores keep key + row-type; SQL lives once.
5. **`src/components/organize/entity-composer.tsx`** — name+color composer from OrganizeView's two
   duplicated composers (§S6).
6. **`src/components/extensions/extension-dialog-fields.tsx`** — path-picker/status/footer rows
   shared by 3 dialogs (§S7).
7. **`src/components/FileTable/directory-navigation.ts`** — `handleBack/handleNavigateLibrary`
   path math (`FileTable.tsx:64-100`) also mirrored in `breadcrumb-bar.tsx`. One owner.
8. **`src/lib/format.ts`** (§M2).
9. NOT extracting: per-section palette builders (single 231-line pure module is fine in-file),
   collection↔tag CRUD symmetry (same shape, different aggregates — generic repo would be
   enterprise boilerplate), `EventBus` wrappers (zero emitters/subscribers today).

## Dead Code to Delete

| Location | What | Verification required before delete |
|---|---|---|
| `src/lib/schema.ts:65-68` | `Setting`, `File`, `Tag`, `Collection` type aliases | Confirm zero importers (`grep` shows `db.ts:61-63` aliases + locals used instead); `File` shadows DOM lib — delete regardless if unused |
| `src/lib/utils.ts:15` | `formatFileSize` (if zero importers) | Confirm via repo-wide import search; belongs to reduction audit — listed here because the utils split touches the file |
| `src/lib/dotmatrix-core.tsx` (shim, after S5) | Re-export shim | Delete one release after callers migrate to `lib/dotmatrix/*` |
| `src/lib/composition-root.ts` (after M3) | Whole file | Delete after `host.ts:3` + any other importer points at `db.ts` |

No other dead code claimed — commented-out corpses: none found; unreachable bodies: none found.

## Utility Cleanup

- `src/lib/utils.ts` → keeps `cn` only (30+ importers: every `ui/*`, FileTable, AudioPlayer).
  `formatDuration/formatFileSize` → `src/lib/format.ts` (§M2). Rule: `utils.ts` never gains a second
  responsibility again; new helpers go next to owners (`FileTable/`, `AudioPlayer/`, `app/library/`).
- No `helpers.ts/common.ts/misc.ts` exist — the dumping-ground pattern recurs as one-use generic
  modules, all correctly placed already: `FileTable/selection.ts` (array ops for selection),
  `highlight-match.tsx` (row highlighting), `transport-queue.ts` (queue domain). Do NOT hoist them
  into `lib/`.
- `src/lib/` root keeps only genuinely shared seams: `db.ts` (wiring), `schema.ts` (tables),
  `format.ts` (formatting), `desktop.ts` (bridge), `item-colors.ts`, `filesystem-boundary.ts`,
  `client-waveform.ts`, `metadata.ts`, `database-path.ts`. Feature hooks live in `app/library/`,
  `components/*/` — never in `lib/` root.

## State Modularisation

No global store exists and none is proposed. All state is `useState` in `page.tsx` + local dialog
state — the modularisation IS the state split (§S1):

- View state → `use-library-view` (single writer; data hooks read).
- Server slices → `use-library-data` (files/dirs), `use-collections`, `use-tags`, `use-favorites`,
  `use-shelf` (each owns its slice + refresh; no cross-writes — bulk actions take explicit args).
- Ephemeral UI → stays local (palette in `use-palette`, dialogs in `use-extensions-ui`, composers
  in sections). `debouncedSearchQuery` + timer: keep behaviour, move into `use-library-view`
  (do NOT add a store; a `useDeferredValue` swap is a reduction-audit optimisation, out of scope).
- Ref mirrors (`selectedFileRef/filesRef/tagsRef/selectedIdsRef/currentViewRef/extensionsRef`)
  shrink naturally: each hook owns its own ref; cross-hook reads go through return values, not
  shared refs.
- Extension stores (`DbSoundShelfStore`, settings-store, make-pack-recent) keep class shape over
  the extracted KV helper — state ownership unchanged, SQL deduplicated.
- Rule: hooks may import types + `lib/*` readers; hooks never import each other's internals.
  `page.tsx` shell is the only composer.

## Type and Schema Modularisation

- `library.types.ts` (new): `FileRecord/CollectionRecord/TagRecord` route views. FileTable +
  AudioPlayer keep their row types (different nullability/contracts) but `Pick<>` from one shared
  subset — no fourth copy.
- `settings.types.ts` (new): `ValidationResult`, per-tab prop slices. Slim `SettingsDialogProps`
  at shell; tabs declare their own props.
- `organize.types.ts` (new): `OrganizeCollection/OrganizeTag`.
- `scan-types.ts` (new, app scanner): runner row types; reconciles the three `ScanStatus` shapes
  by making the producer (`/api/scan` + scanner) the single owner — hook + page import it.
- `extension-model.ts` (new): extension vocabulary (§M1).
- `schema.ts`: tables stay (drizzle seam, imported via `import * as schema` in 8 files — correct);
  delete the 4 dead aliases; `db.ts:61-63` `$inferSelect` aliases stay as the app's row-type source.
- Genuinely global/shared (keep where they are): yard-core `domain/*` (AudioFile, Collection, Tag,
  Library, Search, Playback), repository interfaces, `YardExtensionContext`, palette types
  (`command-palette.ts` — palette domain owns them), shortcut types (`shortcuts.ts`).

## Frontend Modularisation

Covered by S1 (page → hooks/dialogs), S2 (settings → tabs), S6 (organize → sections), S7 (dialogs →
view+hook), S8 (playback → 3 hooks), file-row + FileTable simplifies. Component/hook/state/action
separation per module:

- Root composition: `page.tsx` shell, `SettingsDialog.tsx` shell, `OrganizeView.tsx` shell,
  `AudioPlayer.tsx` (already), dialog views. Render only; no fetches.
- Presentation children: tabs, sections, `player-shell`, table rows. Props in, events out.
- Hooks: `use-library-*`, `use-*-tab` state where tabs need it (prefer local), dialog scan hooks,
  `use-volume-prefs/element/peaks`. Own behaviour + effects.
- Actions: bulk-actions hook, dialog footer handlers (stay in hooks, not components).
- Schemas: `settings.types`, `library.types` (validation itself is server-side; no client schema
  modules needed — do NOT invent `*.schema.ts` files with no validation to own).
- Domain helpers: `entity-composer`, `swatches`, `directory-navigation`, `extension-dialog-fields`.
- Do NOT extract: tiny JSX fragments inline in rows/tabs (badges, pills, stat rows stay local
  unless a third copy appears).

## Backend Modularisation

- Routes stay one-file-per-route (Next.js idiom; 29 files KEEP). Thin them via `src/app/api/_lib/`:
  `route-errors.ts`, `pagination.ts` consumed by all list/mutation routes.
- `files/route.ts` (157): GET keeps param-mapping + `getFiles/getTagsForFiles` composition;
  PATCH keeps action switch but delegates bodies to `db.ts` functions (already does); DELETE
  delegates its batch loop to `delete-files.ts`. No `feature.service.ts` layer — routes already
  call repositories directly and that indirection would add nothing.
- `collections/tags` routes: same error-helper adoption; no split (each <120 LOC, single aggregate).
- Extension routes (`execute`, `sound-shelf/*`, `folder-janitor/*`, `gatherer/*`, `make-pack`,
  `drop-rules`, `smart-collections`): consume outcome/error helpers; each keeps its manifest/command
  mapping (that IS its responsibility). No `*.service.ts` per route — `yard-tools/*/service.ts`
  already owns behaviour; routes own HTTP translation.
- Database: `file/` split (§S3) + `kv-store.ts` extract; other repos KEEP; `browse-repository`
  loop-merge in-file; `migrations.ts`/`connection.ts` untouched.
- Scanner: `scan-runner/` phases (§S4) plug into existing `run-scan/filesystem/scan-state/
  validation`; no new repository/service layers.
- Explicitly NOT introducing: generic `repository/service` architecture per feature, factories,
  adapters, DI containers. `composition-root` is being deleted, not expanded.

## Proposed Directory Trees

### A. Home route (S1)

```text
BEFORE
src/app/
  page.tsx                      # ~2,757: everything

AFTER
src/app/
  page.tsx                      # ~200: shell (hooks + memos + render)
  library/
    library.types.ts            # ~70
    use-library-view.ts         # ~200
    use-library-data.ts         # ~250
    use-library-selection.ts    # ~120
    use-favorites.ts            # ~60
    use-collections.ts          # ~200
    use-tags.ts                 # ~150
    use-shelf.ts                # ~120
    use-bulk-actions.ts         # ~180
    use-library-settings.ts     # ~180
    use-extensions-ui.ts        # ~220
    use-transport.ts            # ~100
    use-palette.ts              # ~150
    save-search-dialog.tsx      # ~80
    rename-collection-dialog.tsx# ~70
```

### B. Settings (S2)

```text
BEFORE
src/components/
  SettingsDialog.tsx            # ~1,952

AFTER
src/components/settings/
  SettingsDialog.tsx            # ~150 shell
  settings.types.ts             # ~80
  library-tab.tsx               # ~300
  metadata-tab.tsx              # ~350
  extensions-tab.tsx            # ~250
  appearance-tab.tsx            # ~100
  shortcuts-tab.tsx             # ~200
  about-tab.tsx                 # ~120
  drop-rules-panel.tsx          # ~300
```

### C. Database + composition (S3, M3)

```text
BEFORE
src/lib/
  db.ts                         # 63 barrel
  composition-root.ts           # 87 second wiring
  database/
    file-repository.ts          # 539 mixed
    collection-repository.ts    # 174 keep
    tag-repository.ts           # 92 keep
    ...

AFTER
src/lib/
  db.ts                         # ~140: barrel + AppServices/getAppServices/createExtensionServices
  database/
    file/
      file-repository.ts        # ~120 facade
      file-queries.ts           # ~180
      file-writes.ts            # ~140
      file-batch.ts             # ~140
      index.ts                  # ~20 singleton wiring
    kv-store.ts                 # ~60 (from 3 extension stores)
    ... (rest unchanged)
```

### D. Scanner (S4)

```text
BEFORE
src/lib/scanner/
  scan-runner.ts                # 559 mixed
  run-scan.ts / filesystem.ts / scan-state.ts / validation.ts (keep)

AFTER
src/lib/scanner/
  scan-runner.ts                # ~150 orchestration
  scan-types.ts                 # ~40 (new)
  discover.ts                   # ~100
  reconcile.ts                  # ~130
  metadata-queue.ts             # ~120
  progress.ts                   # ~60
  ... (existing four unchanged)
```

### E. Dotmatrix + format + types (S5, M2, merges)

```text
BEFORE
src/lib/
  dotmatrix-core.tsx            # 782 mixed
  dotmatrix-hooks.ts            # 189 keep
  utils.ts                      # 20 (cn + 2 format fns)
src/types/
  desktop-bridge.d.ts           # 9
src/components/AudioPlayer/
  format-time.ts                # 9

AFTER
src/lib/
  dotmatrix/
    types.ts / patterns.ts / geometry.ts / orders.ts
    animation-math.ts / DotMatrixBase.tsx / resolvers.ts
  dotmatrix-core.tsx            # ~20 shim, then delete
  format.ts                     # durations + sizes (from utils + format-time)
  utils.ts                      # cn only
  desktop.ts                    # + bridge augment (types/ deleted)
```

### F. Organize, dialogs, playback, API (S6–S8, extracts)

```text
BEFORE
src/components/
  OrganizeView.tsx              # 513
  FileTable/file-row.tsx        # 337 (+ inline shelf fetch/menu)
  FileTable.tsx                 # 281 (+ inline path math)
  AudioPlayer/use-audio-playback.ts # 193
  extensions/{folder-janitor,library-gatherer,make-pack}/*Dialog.tsx
src/app/api/
  files/route.ts (pagination + errors + batch inline)

AFTER
src/components/organize/
  OrganizeView.tsx + organize.types.ts + swatches.tsx
  + collections-section.tsx + tags-section.tsx + entity-composer.tsx
src/components/FileTable/
  file-row.tsx (~220) + file-row-menu.tsx (~80) + use-shelf-toggle.ts (~50)
  directory-navigation.ts (~60, shared with breadcrumb-bar)
src/components/AudioPlayer/
  use-volume-prefs.ts + use-audio-element.ts + use-waveform-peaks.ts
  + use-audio-playback.ts (composer)
src/components/extensions/
  ExtensionDialogShell.tsx (keep) + extension-dialog-fields.tsx (new)
  + per-dialog view + use-*.ts hook
src/app/api/_lib/
  route-errors.ts + pagination.ts
src/app/api/files/
  route.ts (~90 thin) + delete-files.ts (~70 worker)
```

### G. yard-core extensions (M1)

```text
BEFORE
packages/yard-core/src/extensions/
  extension-{category,surfaces,settings,types,command,command-error,
    ui-intent,manifest,permissions}.ts (8 files, 1–4 exports each)
  extension-{host,registry,context,command-registry}.ts (keep)
  index.ts (export * x13)

AFTER
packages/yard-core/src/extensions/
  extension-model.ts            # vocabulary (absorbs the 8)
  extension-host.ts / extension-registry.ts / extension-context.ts
  extension-command-registry.ts (unchanged behaviour)
  index.ts                      # explicit named re-exports
```

## Full Extraction Map

| Current file | Symbol / responsibility | Proposed destination | Action | Reason |
|---|---|---|---|---|
| `src/app/page.tsx:56` | `FileRecord` | `src/app/library/library.types.ts` | MOVE | Shared by 10 hooks; not render concern |
| `src/app/page.tsx:69` | `CollectionRecord` | `src/app/library/library.types.ts` | MOVE | Same |
| `src/app/page.tsx:78` | `TagRecord` | `src/app/library/library.types.ts` | MOVE | Same |
| `src/app/page.tsx:84,100` | `ScanStatus`, `emptyScanStatus` | scanner scan-types (preferred) else library.types | MOVE | Producer-owned shape; kills triple declaration |
| `src/app/page.tsx:116` | `CURRENT_ONBOARDING_VERSION` | `src/app/library/library.types.ts` | MOVE | Constant with the types it versions |
| `src/app/page.tsx:131` | `handleClearSelection` | `.../use-library-selection.ts` | MOVE | Selection domain |
| `src/app/page.tsx:213,225` | `flipSort`, `orderedFiles`, sort state | `.../use-library-view.ts` | MOVE | View routing owns sort |
| `src/app/page.tsx:277` | `loadSoundShelfCount` + count/ids state | `.../use-shelf.ts` | MOVE | Shelf domain |
| `src/app/page.tsx:296–375` | `showLibrary/showFavorites/showExtensions/showShelf/showOrganize/showCollection/navigateDirectory/handleFilterTag` + view state | `.../use-library-view.ts` | MOVE | One view router replaces 7 switchers |
| `src/app/page.tsx:384,496,541,578` | `loadFiles/loadMoreFiles/loadDirectories/loadInitialData` + refs | `.../use-library-data.ts` | MOVE | Server-read ownership |
| `src/app/page.tsx:685` | `handleSoundShelfChanged` subscription | `.../use-shelf.ts` | MOVE | Shelf event belongs to shelf hook |
| `src/app/page.tsx:711,727` | `loadFavoritesCount`, `handleToggleFavorite`, count state | `.../use-favorites.ts` | MOVE | Favorite domain |
| `src/app/page.tsx:754,1326–1370` | `handleToggleFileTag` + tag CRUD | `.../use-tags.ts` | MOVE | Tag aggregate |
| `src/app/page.tsx:828–852` | `handleRebindShortcut/handleResetShortcuts/handleRemoveDefaultChange` + binding state | `.../use-library-view.ts` or new `use-shortcuts.ts` (either; document choice) | MOVE | Shortcut behaviour out of shell |
| `src/app/page.tsx:854–900,902,957` | bulk handlers + `confirmBulkRemove/confirmClearShelf` | `.../use-bulk-actions.ts` | MOVE | Multi-select mutations share confirm flow |
| `src/app/page.tsx:992–1052,1146–1224` | collection/smart-search handlers | `.../use-collections.ts` | MOVE | Collection aggregate |
| `src/app/page.tsx:1062–1136,1226` | settings/scan/onboarding/roots | `.../use-library-settings.ts` | MOVE | Settings domain |
| `src/app/page.tsx:1400–1620` | extension enable/setting/execute + intent dispatch | `.../use-extensions-ui.ts` | MOVE | Extension UI domain |
| `src/app/page.tsx:1699–1830` | sidebar/settings-open, select/move, transport | `.../use-library-selection.ts` + `.../use-transport.ts` | MOVE | Split by listed symbols |
| `src/app/page.tsx:1850–1960` | make-pack/shelf/palette-add | `.../use-extensions-ui.ts` + `.../use-shelf.ts` + `.../use-palette.ts` | MOVE | Each to its owner |
| `src/app/page.tsx:1886–2160` | palette state + `handlePaletteSelect` | `.../use-palette.ts` | MOVE | Palette behaviour |
| `src/app/page.tsx:2174–2182` | dialog closers | `.../use-extensions-ui.ts` | MOVE | Dialog ownership |
| `src/app/page.tsx:2180–2757` | render JSX (rail/header/views/dialogs) | stays in `src/app/page.tsx` + 2 new dialogs | MOVE (partial) | Shell keeps composition only |
| `src/components/SettingsDialog.tsx:62–71` | `APP_VERSION`, `ValidationResult` | `settings/settings.types.ts` (+ about-tab for version use) | MOVE | Shared types |
| `src/components/SettingsDialog.tsx:73–122` | `SettingsDialogProps` | `settings.types.ts` (slimmed per-tab) | MOVE | Prop union split by tab |
| `src/components/SettingsDialog.tsx` | roots/validate/save/remove/scan block | `settings/library-tab.tsx` | MOVE | Library tab owns it |
| `src/components/SettingsDialog.tsx` | collections + tags blocks | `settings/metadata-tab.tsx` | MOVE | Metadata tab owns it |
| `src/components/SettingsDialog.tsx` | extension list + setting controls | `settings/extensions-tab.tsx` | MOVE | Extensions tab owns it |
| `src/components/SettingsDialog.tsx` | zoom/slider block | `settings/appearance-tab.tsx` | MOVE | Appearance owns it |
| `src/components/SettingsDialog.tsx` | rebind matrix + remove-default | `settings/shortcuts-tab.tsx` | MOVE | Shortcuts own it |
| `src/components/SettingsDialog.tsx` | version/update block | `settings/about-tab.tsx` | MOVE | About owns bridge use |
| `src/components/SettingsDialog.tsx:1437+` | `DropRulesSettingsPanel` + subcomponents + drafts/preview | `settings/drop-rules-panel.tsx` | MOVE | Most separable block |
| `src/lib/database/file-repository.ts:36–250` | `getFiles/getFileCount/getAllFilesIncludingRemoved/getFileById/getFileByPath/getFilesByPaths` | `database/file/file-queries.ts` | MOVE | Read ownership |
| `src/lib/database/file-repository.ts:251–310,392–539` | `upsertFile/touchFileAsSeen/markFileRemoved/toggleFavorite/reconcileMovedFiles` | `database/file/file-writes.ts` | MOVE | Write ownership |
| `src/lib/database/file-repository.ts:300–412` | 4 `batch*` + `chunkArray` + `SQLITE_MAX_VARIABLES` | `database/file/file-batch.ts` | MOVE | Batch choreography |
| `src/lib/database/file-repository.ts` bottom | singleton wiring | `database/file/index.ts` | MOVE | Wiring with the module |
| `src/lib/scanner/scan-runner.ts:13–80` | seams + row types | seams stay; row types → `scanner/scan-types.ts` | MOVE | Type ownership |
| `src/lib/scanner/scan-runner.ts` | discovery streaming | `scanner/discover.ts` | MOVE | Phase ownership |
| `src/lib/scanner/scan-runner.ts` | diff/move-reconcile | `scanner/reconcile.ts` | MOVE | Phase ownership |
| `src/lib/scanner/scan-runner.ts` | metadata queue | `scanner/metadata-queue.ts` | MOVE | Pacing ownership |
| `src/lib/scanner/scan-runner.ts` | progress emission | `scanner/progress.ts` | MOVE | Reporting ownership |
| `src/lib/dotmatrix-core.tsx:8–53` | types + `cx` | `lib/dotmatrix/types.ts` | MOVE | Vocabulary |
| `src/lib/dotmatrix-core.tsx:55–105` | constants + pattern tables + lookup | `lib/dotmatrix/patterns.ts` | MOVE | Pattern ownership |
| `src/lib/dotmatrix-core.tsx:106–140` | geometry fns | `lib/dotmatrix/geometry.ts` | MOVE | Geometry ownership |
| `src/lib/dotmatrix-core.tsx:201–435` | order builders + norms | `lib/dotmatrix/orders.ts` | MOVE | Order ownership |
| `src/lib/dotmatrix-core.tsx:142–200,442–546` | animation math + style utils | `lib/dotmatrix/animation-math.ts` | MOVE | Animation ownership |
| `src/lib/dotmatrix-core.tsx:564–721` | `DotMatrixBase` | `lib/dotmatrix/DotMatrixBase.tsx` | MOVE | Render ownership |
| `src/lib/dotmatrix-core.tsx:725+` | path-wave factories | `lib/dotmatrix/resolvers.ts` | MOVE | Resolver ownership |
| `src/components/OrganizeView.tsx:13,21` | `OrganizeCollection/OrganizeTag` | `organize/organize.types.ts` | MOVE | Section-shared types |
| `src/components/OrganizeView.tsx:27` | `Swatches` | `organize/swatches.tsx` | MOVE | Shared presentational |
| `src/components/OrganizeView.tsx` | collections block | `organize/collections-section.tsx` | MOVE | Collection ownership |
| `src/components/OrganizeView.tsx` | tags block | `organize/tags-section.tsx` | MOVE | Tag ownership |
| `src/components/OrganizeView.tsx` | two composers | `organize/entity-composer.tsx` | EXTRACT | Genuine shared composer |
| `src/components/FileTable/file-row.tsx:90–110` | `dispatchSoundShelfChanged/toggleShelf` | `FileTable/use-shelf-toggle.ts` | MOVE | I/O out of render |
| `src/components/FileTable/file-row.tsx` | context-menu construction | `FileTable/file-row-menu.tsx` | MOVE | Menu ownership |
| `src/components/FileTable.tsx:64–100` | `handleBack/handleNavigateLibrary` | `FileTable/directory-navigation.ts` | MOVE | Path math shared w/ breadcrumb |
| `src/components/AudioPlayer/use-audio-playback.ts:9–14,36–48` | volume keys + clamp + init | `.../use-volume-prefs.ts` | MOVE | Prefs ownership |
| `src/components/AudioPlayer/use-audio-playback.ts` | element lifecycle | `.../use-audio-element.ts` | MOVE | Element ownership |
| `src/components/AudioPlayer/use-audio-playback.ts` | peaks fetch | `.../use-waveform-peaks.ts` | MOVE | Waveform ownership |
| `src/components/AudioPlayer/format-time.ts:1` | `formatTime` | `src/lib/format.ts` | MERGE | One formatter module |
| `src/lib/utils.ts:8,15` | `formatDuration/formatFileSize` | `src/lib/format.ts` | MOVE | Formatting ownership |
| `src/lib/schema.ts:65–68` | 4 type aliases | — | DELETE | Unused; `File` shadows DOM |
| `src/lib/composition-root.ts:17,32,64` | `AppServices/getAppServices/createExtensionServices` | `src/lib/db.ts` | MERGE | One wiring module |
| `src/types/desktop-bridge.d.ts` | global augment | `src/lib/desktop.ts` | MERGE | Owner-colocated type |
| `src/hooks/use-scan-polling.ts:5` | `ScanStatusResponse` | scanner scan-types | MOVE | Producer-owned type |
| `src/app/api/files/route.ts:8–19` | pagination consts + parser | `src/app/api/_lib/pagination.ts` | EXTRACT | Shared list concern |
| `src/app/api/files/route.ts` catch envelopes | error JSON | `src/app/api/_lib/route-errors.ts` | EXTRACT | Shared envelope |
| `src/app/api/files/route.ts:115–151` | batch-delete loop | `src/app/api/files/delete-files.ts` | EXTRACT | Files-domain worker |
| `src/lib/extensions/*-store.ts` (3 files) | select/parse/upsert cycle | `src/lib/database/kv-store.ts` | EXTRACT | Shared KV SQL |
| yard-core 8 one-type files | vocabulary types/guards | `extensions/extension-model.ts` | MERGE | One vocabulary module |
| FolderJanitor/Gatherer/MakePack dialogs | fetch/scan state | per-dialog `use-*.ts` | MOVE | I/O out of JSX |
| 3 dialogs | path-picker/status/footer rows | `extensions/extension-dialog-fields.tsx` | EXTRACT | Shared dialog bits |

## Expected File Changes

- **Files added:** +28 to +36 (13 library + 8 settings + 4 file-repo + 5 scanner + 7 dotmatrix
  + 5 organize + 4 dialog hooks/fields + 3 playback + 2 API lib + 1 format + misc index files).
- **Files removed:** 4–6 (`composition-root.ts`, `format-time.ts`, 8 yard-core one-type files→1,
  dotmatrix shim after migration, `desktop-bridge.d.ts`).
- **Files merged:** yard-core extensions 15→5; utils/format; db/composition-root.
- **Final file count:** ~235–245 (from ~210 prod). Net +25–35.
- **Current LOC:** ~19.2k prod (~31.8k incl. prototype/tests).
- **Likely final LOC:** ~19–20k prod (±5% — splits add shells/imports, extracts remove clones).
  LOC reduction is explicitly NOT the goal here; the reduction audit owns that number.

## Implementation Order

Another agent should execute in this exact order (each step verifiable with `tsc --noEmit` +
targeted `vitest run` + `next lint` before proceeding):

1. **Shared extracts first (no callers break):** create `src/app/api/_lib/route-errors.ts`,
   `pagination.ts`; `src/lib/format.ts`; `src/lib/database/kv-store.ts`; yard-core
   `extension-model.ts` + explicit barrels (keep old files re-exporting for one step).
2. **Schemas/types moves:** `library.types.ts`, `settings.types.ts`, `organize.types.ts`,
   scanner `scan-types.ts`, `ScanStatusResponse` move, `desktop-bridge.d.ts` merge. Update imports;
   run typecheck.
3. **Backend splits:** `database/file/` (facade keeps signatures → `db.ts` path update only);
   scanner phases; `files/delete-files.ts`; browse loop-merge; registry table-drive. Run
   `vitest run src/lib/database src/lib/scanner`.
4. **Hook extractions (page.tsx):** `use-library-view` → `use-library-data` → `use-selection` →
   `use-favorites/collections/tags/shelf` → `use-bulk-actions/settings/extensions/transport/
   palette`. Migrate `page.tsx` incrementally (one hook per commit); shell compiles throughout.
5. **UI splits:** settings tabs (one tab per commit), organize sections, dialog view+hook pairs,
   playback hooks, file-row menu/toggle, FileTable navigation helper, dotmatrix modules + shim.
6. **Merges/deletes:** point `host.ts` at `db.ts`, delete `composition-root.ts`; delete
   `format-time.ts`; delete schema aliases (after grep proves zero use); remove yard-core
   absorbed files + dotmatrix shim (after callers migrate).
7. **Boundary pass:** enforce §Dependency rules (below) with import review; move any strays found.
8. **Full verification:** `tsc --noEmit`, `next lint`, `vitest run`, `next build`; boot app, exercise
   library/shelf/scan/settings/extensions paths.

## Dependency Rules

Practical import boundaries (review-enforced, no new tooling):

- `src/app/page.tsx` (shell) may import: `app/library/*` hooks/types/dialogs, `components/*`
  views, `lib/db` readers. May NOT import: `lib/database/*` internals, `lib/scanner/*` internals,
  `yard-tools/*`, `electron/*`.
- `src/app/library/*` hooks may import: `library.types`, sibling hooks' *types* (never state),
  `lib/db`, `lib/extensions/*` events/intent, component pure helpers (`command-palette`,
  `shortcuts`, FileTable `selection`). May NOT import: components' JSX, other features' internals.
- `src/components/settings/*` tabs may import: `settings.types`, `ui/*`, `lib/db` settings readers,
  `lib/desktop`, `Shortcuts/shortcuts`. May NOT import: `app/library/*`, `database/*` internals.
- `src/components/organize/*` may import: `organize.types`, `ui/*`, `lib/item-colors`. Data access
  only via props (no direct `db` imports).
- `src/components/FileTable/*` may import: `FileTable/types`, `lib/utils`, `lib/format`,
  shelf-events. Row menu/toggle are internal. No `db` imports in components.
- `src/components/AudioPlayer/*` may import: local types, `lib/client-waveform`, `lib/format`.
  No `db` imports.
- `src/app/api/*` routes may import: `api/_lib/*`, `lib/db`, `lib/database/*`, `lib/extensions/*`,
  `yard-core`, `yard-tools/*` services. May NOT import: components, hooks, `electron` renderer.
- `src/lib/database/*` may import: `database/connection`, `lib/schema`, `yard-core` types.
  May NOT import: components, hooks, API routes, `lib/desktop`.
- `src/lib/scanner/*` may import: scanner siblings, `lib/database/*` types (via `db.ts`),
  `yard-core` scan types. May NOT import: components, routes.
- `packages/yard-core` may import: nothing app-side (zero `src/` imports). App/packages-tools
  import from it, never reverse.
- `packages/yard-tools/*` may import: `yard-core` + local siblings only. Never `src/`.
- Barrel rule: `db.ts` + `extensions/index.ts` are the only barrels; deep-import everywhere else.

## Do Not Modularise

- **`src/app/prototype/*` (~9.1k).** Throwaway routes (`redesign/workspace` 2,099 etc.).
  Restructuring throwaway code is waste; quarantine/delete per reduction audit instead.
- **`src/components/ui/*` primitives.** shadcn/Radix leaves (`button/dialog/input/...`);
  per-file ownership is the library's contract. Only action is dead-file deletion (reduction audit).
- **FileTable/AudioPlayer leaves** (`bulk-bar`, `breadcrumb-bar`, `directory-row`, `empty-state`,
  `desktop-actions`, `selection`, `highlight-match`, `row-waveform`, `player-shell`,
  `collection-menu`, `favorite-button`, `volume-control`, `transport-queue`,
  `use-transport-queue`). Already one-purpose; splitting further makes navigation worse.
- **`transport-queue.ts`, `command-palette.ts` (as files), `shortcuts.ts`.** Cohesive pure/domain
  modules at the right size; internal function extraction only.
- **`migrations.ts`, `connection.ts`, `schema.ts` tables.** Drizzle seams; fragmenting SQL
  history or connection setup adds risk for zero ownership gain.
- **`yard-tools/*` per-extension layout.** manifest/commands/service/store/settings/permissions/
  types/index per extension is correct ownership — the consistency IS the modularity.
- **`electron/*`.** Out of scope for this audit; no proposal made rather than a bad one.
- **Colocated tests.** `*.test.*` stay beside owners; no `__tests__` centralisation.
- **Cohesive algorithms:** dotmatrix order builders (kept together in `orders.ts`, not one file
  per pattern); scan discovery loop (one file, not per-branch); palette `buildPaletteEntries`
  orchestrator (one file).

## Final Target

After implementation the repository has:

- A ~200-line `page.tsx` shell composing 13 named hooks — each hook one domain, each with one
  state slice and its actions; new views/dialogs land in one hook + one component.
- A `settings/` directory where each tab is independently ownable; new settings touch one file.
- A `database/file/` module with reads/writes/batches separated behind unchanged signatures;
  a `scanner/` directory with orchestration + 4 phase modules behind seams.
- A `dotmatrix/` math library importable from server/tests plus one renderer; a `format.ts`
  single home for formatting; one DB wiring (`db.ts`); one extension vocabulary module.
- Feature-colocated types everywhere (`library/settings/organize/scan`); no `File` shadowing,
  no ambient splits, no triple-declared response shapes.
- Thin API routes over `_lib` helpers; extension dialogs as view+hook pairs over a shared shell
  and shared fields; FileTable/AudioPlayer leaves untouched.
- Clear imports following §Dependency rules; extension points that grow by adding a file
  (new tab, new hook, new scanner phase, new dialog section) instead of enlarging a giant.

## Rules

THIS IS AN AUDIT ONLY. No production code was modified.

Every SPLIT above names exact target files; every target file has a one-sentence responsibility
(see each bullet: "Owns …"). The extraction map (§Full Extraction Map) pairs every moved symbol
with CURRENT → TARGET → ACTION → REASON so implementation needs no redesign.

No one-function-per-file structures were created blindly: the smallest new modules
(`swatches`, `directory-navigation`, `kv-store`, `pagination`) each carry a reused
responsibility with 2+ consumers. No generic abstractions without evidence: no new service/
repository/factory layers, no plugin framework, no store library. No cohesive code was split:
thresholds followed responsibility boundaries, not LOC.
