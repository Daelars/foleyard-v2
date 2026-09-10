# Variant I app-v3 coverage report

Prepared 9 September 2026. Records how `/prototype/app-v3` rebuilds the
current app (`/`) with the extracted variant I library
(`src/components/variant-i/`), and how `/prototype/variant-i-library`
reproduces the I specimen from the library alone.

## Deliverables

| Route / artifact | Path | Status |
| --- | --- | --- |
| Variant I library | `src/components/variant-i/` (styles.css, index.ts, README.md, components/) | Complete |
| Comparison specimen | `src/app/prototype/variant-i-library/page.tsx` + `fixtures.ts` | Complete |
| app-v3 route | `src/app/prototype/app-v3/` (layout.tsx, page.tsx, components/) | Complete |
| This report | `docs/variant-i-app-v3-coverage.md` | Complete |

Validation: `bunx tsc --noEmit` clean; `bun run test` 649 passed + 12
expected-fail (86 files); `bun run build` succeeds (prototype routes
compile and resolve to not-found in production per the prototype layout).
`bun run lint` has pre-existing baseline errors (see Verification).

## Coverage matrix

Each row: original component/path → app-v3 adapter → library exports used →
states → validation evidence.

### Shell and navigation

| Original | Adapter | Library used | States | Evidence |
| --- | --- | --- | --- | --- |
| `src/components/IconRail.tsx` | `components/rail.tsx` `V3IconRail` | rail tile classes, `Switch`-family tokens | active/inactive, counts badge, settings lit, auto-tag conditional | Browser: 6 rail items with badges; mobile dialog opens rail |
| `src/components/DesktopTitleBar.tsx` | `components/title-bar.tsx` `V3DesktopTitleBar` | `--vi-*` tokens | drag region, hover, danger close | Same bridge logic; restyled buttons |
| Mobile navigation `Dialog` (ui) in `src/app/page.tsx` | `components/rail.tsx` + library `Dialog` | `Dialog`, `DialogTitle` | open/close on backdrop, rail selection closes | Browser: hamburger opens rail dialog at narrow width |
| Header search + palette button + save-search (inline in `page.tsx`) | inline in `page.tsx` | `Field`-style classes, `Kbd`, `Button` | focus glow, invalid none, clear, count | Browser: search focus ring, ⌘K button with file count |
| Sort/filter header (origin chips, name/time sort) | inline in `page.tsx` + `V3FileTable` header | mono uppercase labels, accent-active chip | pressed origin filter | Browser: All/Manual/Rules/AI chips render |
| Shelf pack/clear actions (inline) | inline in `page.tsx` | `Button` tones | Sure? arm/cancel | Behavior identical to `/` |

### Library and favorites

| Original | Adapter | Library used | States | Evidence |
| --- | --- | --- | --- | --- |
| `src/components/FileTable.tsx` | `components/file-table/file-table.tsx` `V3FileTable` | `Breadcrumb`, `EmptyState`, row classes | virtualization, j/k keys, selection scroll, load-more, container border | Browser: same directories/header as `/`; click into folder → h1 + breadcrumb update |
| `src/components/FileTable/breadcrumb-bar.tsx` | `components/file-table/breadcrumb-bar.tsx` | `Breadcrumb`-style crumbs, ghost `Button` | back, root, segments, collection crumb | Browser: Library/SFX crumbs |
| `src/components/FileTable/directory-row.tsx` | `components/file-table/directory-row.tsx` | `DirectoryRow`-style row | hover, janitor scan context action | Browser: 5 folder rows render |
| `src/components/FileTable/file-row.tsx` | `components/file-table/file-row.tsx` `V3FileRow` | row classes, `TagOriginMark` (kept), `RowWaveform` (kept) | selected (accent bar + tint), multi-selected, playing glyph, favorite, drag handle | Compiles; row height 64px kept so virtualization math is unchanged |
| `src/components/FileTable/file-row-menu.tsx` | `components/file-table/row-menu.tsx` + `context-menu.tsx` | `Menu`, `MenuItem`, `MenuSeparator`, `TagOriginMark` | right-click popup, copy path, favorite, make pack, shelf toggle (via `useShelfToggle`), tag checklist with provenance, v2 contributions with unavailability reasons | `V3RowMenuItems` unit-verified via types; right-click wiring in `V3FileTable` |
| `src/components/FileTable/empty-state.tsx` | `components/file-table/empty-state.tsx` | `EmptyState`-style + ghost `Button` | search empty / nothing here | No dedicated error panel, matching FileTable today |
| `src/components/FileTable/bulk-bar.tsx` | `components/bulk-bar.tsx` `V3SelectionBulkBar` | `BulkBar`, `Menu`, `MenuItem` | save all, queue, shelf (gated), tag dropdown, staged library/disk removal, v2 actions slot, clear | `components/bulk-bar.test.tsx`: choose/confirm/cancel mapping, shelf gating, tag apply — 5 tests pass |
| Desktop drag-out / copy path | `useFileTableDesktopActions` reused verbatim | — | native drag, copy toast | Same hook as `/` |

### Collections and shelf

| Original | Adapter | Library used | States | Evidence |
| --- | --- | --- | --- | --- |
| Smart-search views, shelf membership | inline in `page.tsx` (unchanged wiring) | `Button` | pack entry points gated on extension enabled | Same props as `/` |
| Add-to-collection popup in `AudioPlayer/collection-menu.tsx` | `components/player.tsx` | `Menu`, `MenuItem`, `MenuSeparator` | collections, Smart meta, file counts, new-collection | Browser: player absent without selection (same as `/`); popup logic ported |
| Extension drop offers (`extensions-v2/drop-zone.tsx`) | `components/extensions/drop-zone.tsx` `V3LibraryDropZone` | `Button` + I overlay classes | drag overlay, validated offers, rejection, Escape, focus restore | Drag/validate logic copied verbatim from `V2DropMenu` |

### Organize

| Original | Adapter | Library used | States | Evidence |
| --- | --- | --- | --- | --- |
| `src/components/OrganizeView.tsx` + `organize/tags-section.tsx` | `components/organize.tsx` `V3OrganizeView` | `TagChip` (chip), `TagEditor`, `TagComposer`, `ColorSwatch`, `NewTagButton` | filter chip, double-click edit, arm-confirm delete, rename commit, composer | `tag-confirm` + `name-color-composer` logic reused; escape arm resolution preserved via editor callbacks |
| `organize/collections-section.tsx` | `components/organize.tsx` `V3CollectionsSection` | `ColorSwatch`, `Button`, I tokens | expand, smart count request, rename, delete arm, Open (color fill) | `resolveCollectionCount` reused; color treatment kept (app-specific data) |

### Auto-tag

| Original | Adapter | Library used | States | Evidence |
| --- | --- | --- | --- | --- |
| `src/components/AutoTagBoard/board.tsx` | `components/auto-tag/auto-tag.tsx` `V3AutoTagBoard` | `Tabs`/`TabPanel`, `CoverRow`, `QueueCard`, `StatusBadge`, `ScanStat`, `ProvTag`, `SkeletonRow`, `EmptyState`, `Progress`, `Button` | coverage rail, queue promote/dismiss, scan/analysis progress, similar, download/model states | Same props (`enabled/page/onPageChange/onOpenExtensionControls`); promote/dismiss call the two real v2 operations; job polling copied; charts kept recharts with I tokens (library has no charts). Latest arrivals capped to the 8 most recent files; the per-tag file list under the chart is a bounded scroll panel (max-h-64, `vi-scroll`) with Prev/Next paging intact. Both board tabs stay mounted (hidden toggle) so the origins data persists across tab switches. Quiet poll moved from 15s to 30s and recharts animations disabled, and the per-tag file list only refetches when the aggregate coverage summary actually changed |
| `src/components/AutoTagBoard/origins.tsx` | `components/auto-tag/auto-tag/origins.tsx` `V3TagOrigins` | `ProvTag`, `StatusBadge`, `MenuItem` rows | origins filter, candidate queue, promote/dismiss | Same v2 commands; queue rows keep distinct promote/dismiss labels and busy guard |

Copy audit (text removed from the board as redundant; the section titles
or visible counts already say it): "· N to go" after the tagged/total
counter, "· history vs goal" on the All tags list, the "N landed · N
tagged · N missed" line above Latest arrivals (the Untagged/Tagged section
headers carry the counts), "explicit accept only" under both candidate
queues, and the "{N} words need review" summary on the board's queue
(`QueueCard` gained an optional `hideSummary` prop; the specimen route is
unchanged). Kept: "Tags · n/m at goal", "Files · 1–50 of N", "Showing
X–Y of Z", the origins summary line and its "can count in more than one
origin category" footnote, "deterministic · manual tags always win", and
the empty/error instructions.

Scroll performance: measured 32ms avg / 256ms p95 frame times during
scroll while the board was updating vs 15.5ms on `/`. Quiet polls are now
no-ops when nothing changed — every fetched slice (aggregate, history,
arrivals batch, last run, candidate queue, CLAP status) is signature-compared
against the previous payload and setState is skipped when identical, and
the error-clearing setState is skipped when already null. A quiet poll with
no changes therefore causes zero re-renders, so scrolling is not
interrupted every 30s. The two `blur-3xl` ambience spans in the provider
were measured and ruled out (identical frame times with them hidden).

Whole-route perf audit: the row context-menu callbacks in `V3FileTable`
were inline closures per row, defeating the `memo` on `V3FileRow`/
`V3DirectoryRow` (every page re-render re-rendered all visible rows);
`useRowContextMenu` now memoizes its callbacks and the table holds stable
`handleFileContextMenu`/`handleDirectoryContextMenu`, so row memo works
and only affected rows re-render. Everything else audited as parity or
cheaper: ExtensionGrid mouse gradient is rAF-throttled (as the original);
settings tabs mount eagerly in the original too (v3 hides inactive ones,
so strictly lighter); the file table resolves v2 row-menu items only when
the menu opens (the original resolves per row per render); no stray timers
outside the 30s board poll, the page's mount-time loads (as the original)
and the player's ResizeObserver; the palette, dialogs, onboarding and bulk
bar render only while open; the player re-renders on audio timeupdate at
the same rate as the original. FileTable scroll with a populated library
could not be measured in this checkout (no indexed files); its per-render
cost is now strictly at or below the original's.

### Tools/extensions

| Original | Adapter | Library used | States | Evidence |
| --- | --- | --- | --- | --- |
| `src/components/ExtensionGrid.tsx` | `components/extensions/extension-grid.tsx` `V3ExtensionGrid` | `Button`, `Switch`, `SkeletonRow`, `EmptyState`, monogram tile | pending disable, primary action, details, empty, loading, mouse-tracked radial | Same props incl. `trailing` |
| `extensions-v2/tools-cards.tsx` | `components/extensions/tools-cards.tsx` `V3ToolsCards` | `ToolCard`, `StatusBadge`, `V3JobProgress` | perms/approval, reset, settings, run pack, job polling | Real `fetchV2JobStatus`/`pollV2JobUntilSettled`; no fake jobs |
| `extensions-v2/sidebar-panels.tsx` | `components/extensions/sidebar-panels.tsx` | I panels, `MenuItem` rows, `Switch` | unavailability reasons, focus restore | Same `catalog/uiState/onInvoke` |
| `extensions-v2/settings-section.tsx` | `components/extensions/settings-section.tsx` `V3ExtensionsSection` | `ExtensionRow`, `SettingRow`/`SettingSwitchRow`, `Select`, `Field`, `V3SettingControl` | approval, reset, per-setting validation (`validateV2SettingValue`) | Self-contained like the original |
| `extensions-v2/menus.tsx` `V2SelectionActions` | `components/extensions/selection-actions.tsx` `V3SelectionActions` | `Button`, `Puzzle` icon | eligible/ineligible messaging | Same props |

Live enablement sync: `V3ToolsCards` and `V3ExtensionsSection` accept an
optional `onEnabledToggle` fired after an enable/disable PATCH settles; the
route passes `v2Catalog.refresh()` so the rail's Auto tag item appears and
disappears immediately. (The original `/` does not refresh its catalog on
these toggles — the rail only updates on reload there too; this is a
v3-local improvement that leaves `/` untouched.)

### Playback

| Original | Adapter | Library used | States | Evidence |
| --- | --- | --- | --- | --- |
| `src/components/AudioPlayer.tsx` + `player-shell.tsx` | `components/player.tsx` `V3AudioPlayer` | `TransportPanel`, `PlayButton`, `Button`, `IconButton`, `Scrubber`, `Slider`, `Menu` | real audio via `useAudioPlayback` (reused), real peaks normalized, seek, volume/mute, autoplay, favorite, collection popup, dismiss | Same forwardRef contract (`togglePlayback`); player placement kept (fixed bottom shell) |

### Command palette

| Original | Adapter | Library used | States | Evidence |
| --- | --- | --- | --- | --- |
| `src/components/CommandPalette/CommandPalette.tsx` | `components/palette.tsx` `V3CommandPalette` | `CommandPanel`, `CommandRow`, `CommandSection`, `CommandFooter`, `Kbd` | real sections/entries, filtering, active row, scroll-into-view, esc | Browser: palette opens with 13 real entries, section headers, footer count; filter "auto" → 1 transport result; Escape closes |

### Settings

| Original | Adapter | Library used | States | Evidence |
| --- | --- | --- | --- | --- |
| `src/components/settings/SettingsDialog.tsx` | `components/settings/settings-dialog.tsx` `V3SettingsDialog` | `Dialog` family, `Tabs`/`TabPanel` | 6 tabs, status line, reset remount | Browser: dialog opens with all tabs; tab switching verified via aria-selected + panel display |
| `settings/library-tab.tsx` | `components/settings/library-tab.tsx` | `SettingRow`, `Select`, `Field`, `Button`, `ScanStat`, `ValidationMsg`-style dynamic panel | root add/remove with confirm, scan start/status | Same props; validation carries real `ValidationResult` (library `ValidationMsg` is fixture text, so composed from primitives) |
| `settings/metadata-tab.tsx` | `components/settings/metadata-tab.tsx` | `SettingRow`, `Switch`, `ColorSwatch`, `Button` | collections/tags, conversions | Same props |
| `settings/extensions-tab.tsx` | `components/settings/extensions-tab.tsx` | `ExtensionRow`, `Switch`, `Button` | enable, settings, v2 slot | Same props |
| `settings/appearance-tab.tsx` | `components/settings/appearance-tab.tsx` | `Slider`, `SettingRow` | zoom 50–200 | Same props |
| `settings/shortcuts-tab.tsx` | `components/settings/shortcuts-tab.tsx` | `ShortcutRow`, `Kbd`, `SettingSwitchRow` | rebind capture (verbatim logic), reset, remove-default radios | Same props |
| `settings/about-tab.tsx` | `components/settings/about-tab.tsx` | `Button`, `TagChip`, I tokens | runtime info, service status, update check | No props; `APP_VERSION` from package.json |

### Dialogs

| Original | Adapter | Library used | States | Evidence |
| --- | --- | --- | --- | --- |
| `src/app/library/dialogs.tsx` (ExtensionDetails, SaveSearch, RenameCollection) | `components/dialogs.tsx` | `Dialog` family, `Button`, `Field`, `TagChip`, `StatusBadge` | validation guards, autofocus, remount on target | Same props; similar-sounds inline dialog ported as `V3SimilarSoundsDialog` |
| `src/components/OnboardingDialog.tsx` | `components/onboarding.tsx` `V3OnboardingDialog` | `OnboardingStepper`, `Dialog` family, `Field`, `Button` | step flow, path validate, scan start, skip | Same props; `/api/settings` validate flow kept |
| `src/app/page.tsx` similar-sounds dialog | `components/dialogs.tsx` `V3SimilarSoundsDialog` | `Dialog` family | unavailable/empty/ready states | Same content |

### Extension workflows

| Original | Adapter | Library used | States | Evidence |
| --- | --- | --- | --- | --- |
| `extensions/folder-janitor/FolderJanitorDialog.tsx` | `components/ext-flows/folder-janitor.tsx` | `Dialog` family, `Button` (loading), `Accordion`-language disclosures | scan progress in button, per-issue Reveal/Remove/Delete, batch actions, cleanup confirm | Hooks reused verbatim (`useFolderJanitor`) |
| `extensions/library-gatherer/LibraryGathererDialog.tsx` | `components/ext-flows/library-gatherer.tsx` | `Dialog` family, `Button`, `SettingRow`, `Progress`, `Alert` | sources add/remove, preview, destination grant, job progress/cancel, results, reveal | `useLibraryGathererV2` (source grants, immediate preview, destination grant, job) |
| `extensions/make-pack/MakePackDialog.tsx` | `components/ext-flows/make-pack.tsx` | `PackSourceOption`, `PackFormatOption`, `Field`, `Button` | source/name/destination/format, result/hint | `useMakePack` reused |
| `extensions/make-pack-v2/MakePackV2Dialog.tsx` | `components/ext-flows/make-pack-v2.tsx` | `Dialog` family, `Button`, `PackSourceOption`, thin progress bar | form → preview → working (cancellable) → done with skipped/missing/failed/manifest | `useMakePackV2` reused |

### Global feedback

| Original | Adapter | Library used | States | Evidence |
| --- | --- | --- | --- | --- |
| Root `Toaster` (`src/components/ui/sonner.tsx`) | `components/toasts.tsx` `VariantIToastHost` + `VariantIToaster` | `vi-toast-host` tone rings (styles.css), sonner classNames | success/error/warning/info tones | Browser-verified: single I-styled toast on scan start; root toaster suppressed via `data-variant-i-toasts` (observed via MutationObserver in a layout effect); original presentation restored on `/` |
| `UpdateNotifier` (root layout) | unchanged (root layout) | — | update toasts render in whichever toaster is live | Same component; toasts route to the I toaster while app-v3 is mounted |
| Tooltips | none used in adapters | `TooltipBubble` available | — | Adapters use `title` attributes and the library `TooltipBubble` where the specimen does; no Base UI portals in app-v3 |

## Library inventory ↔ specimen

Every category in the I specimen is reproduced at
`/prototype/variant-i-library` from library exports only (fixtures live in
that route). Browser computed-style comparison of controls
(primary button, switch track/thumb, field, badge) between
`/prototype/component-library?variant=I` and `/prototype/variant-i-library`
matches exactly (backgrounds, borders, radii, shadows, fonts, paddings,
heights; sub-pixel differences only from viewport width). All 39 specimen
cards render on both routes.

## Real behavior vs specimen simulation

- No `SPECIMEN_COMMANDS`, hardcoded filenames, `QUEUE`, `SHELF_COLLECTIONS`,
  fake toasts, scan intervals, playback intervals or no-op handlers in
  app-v3. Promotions/dismissals call the two distinct real v2 operations.
- Actual waveforms: `useAudioPlayback.waveformData` normalized for the
  library `Scrubber`; row waveforms keep the shipped `RowWaveform`.
- Root-removal (settings) and disk-removal (bulk) confirmations keep their
  distinct contracts; bulk staged removal maps choose → confirm+choice →
  execute onto the app's `confirmBulkRemove` state.

## Verified / unverified

Verified:
- Typecheck, full test suite (649 pass + 12 expected fail), production build.
- Library behavior tests (19) + bulk-bar adapter tests (5).
- Browser: both new routes render; computed styles match the I specimen;
  navigation, palette filtering/close, settings tabs, mobile rail, single
  toast render and restore-on-leave.

Unverified / blockers:
- Pixel-perfect screenshot diffing: the preview tab's snapshot tool
  failed (`PreviewAutomationExecutionError`/timeout) during this session;
  comparison was done by computed-style signatures instead. Full
  screenshot evidence (fixed viewport, aligned crops) remains to be
  captured by a human or a working capture tool.
- Hover/press/focus ring visual states, reduced-motion behavior, and
  overlay clipping at viewport edges were not captured visually; the
  relevant classes are ported verbatim from the specimen sources.
- Real-file workflows were blocked at preparation time (the dev library
  held directories but no indexed files). The 10 September pass below
  exercised them against the real library; native desktop paths remain
  untested.
- Lint: `bun run lint` reports pre-existing baseline errors (29 errors,
  20 warnings) in files outside this work (board.tsx old-skin tokens,
  lib-adoption, yard-core, ui/chart, workspace fork…). All new files lint
  with 0 errors (4 warnings: two mirror the original board's unused
  `futureRules`, one mirrors its exhaustive-deps, one compiler
  incompatible-library note on the same `useVirtualizer` call the
  original makes).
- Native-only actions (drag-out, reveal, window controls, update toasts)
  are untested in this web preview; runtime capability follows the same
  `useDesktopApp` gates as the original.

## Verification pass — real library web flows, 10 September 2026

Environment: `bun run dev` (Next 16.2.6, Turbopack) against the development
database (`foleyard.sqlite`: 15,877 active files under `P:\SoundLibary`,
21 tags, 3,014 tag attachments, 1 collection, 13,644 embeddings). Preview
browser at 1280x800 (reported viewport 1843x1152), no desktop bridge.
Ticket #200.

Verified end to end with real data:

- Shell and navigation: rail (Library, Favorites, Shelf, Organize, Auto
  tag, Extensions, Settings), mobile navigation control present,
  breadcrumbs and back navigation, folder drill-down to
  `SFX/Alarm & Chime (SFX)` (87 files).
- Library: file rows with format, provenance marks (M/D), durations and
  tag chips; search ("alarm" -> 207 results); origin filter (Manual -> 25,
  pressed state); multi-select (two of twelve) with the bulk bar (Save
  all, Tag, Remove, Remove from Index (v2), Clear).
- Playback: real audio played to completion (0:06), queue next advanced to
  the following file, transport controls (previous, pause, next, seek,
  volume, mute, autoplay, add to collection, close) present with live time.
- Favorites: the player's Like toggles to Unlike, persists, and is
  reflected in the Favorites rail badge.
- Tags: attach/detach from the row menu persists (checked through
  `GET /api/tags?fileId=...`) and shows the manual provenance mark when
  the menu is reopened.
- Context menu: Copy path, Save to favorites, tag checklist with
  provenance, Remove from library, Find similar, and v2 contributions -
  Scan Folder Mess (v2) disabled on files with its explanation, Remove
  from Index (v2), Make Pack v2 from Selection, Add/Remove from Shelf (v2).
- Shelf: add via the row menu; Shelf view with Pack Shelf v2 and Clear.
  The `sound-shelf-v2.list` command correctly returns `permission-denied`
  without the `library:read` grant.
- Organize: 21 tag chips, one collection with counts, New collection.
- Command palette (Ctrl+K): 29 commands across navigation, transport and
  v2 tools; filtering ("shelf" -> 4).
- Settings: all six tabs render with real data (Library & Storage with the
  real root and idle scan status; Collections & Tags; Extensions listing
  Auto Tag v2 and its permissions; Appearance zoom; Customisation remove
  defaults; About runtime info).
- Auto tag: coverage board (21/21 tags at goal, 2,083/15,877 tagged, 13%)
  and Tag origins (1,256 manual / 615 rule / 249 AI) with real per-file
  lists; Find similar returned ranked matches for a real file.
- Extensions: tools cards for Make Pack v2, Sound Shelf v2, Smart
  Collections v2, Folder Janitor v2 and Drop Rules v2 with permission
  counts and run buttons; Make Pack v2 dialog renders source, name,
  destination and format with Preview pack.

Observations and limitations from this pass:

- The preview snapshot tool still fails with
  `PreviewAutomationExecutionError` on app-v3, so no screenshots were
  captured; the visual-evidence gap remains open for #202.
- The row menu does not reflect a just-toggled tag attachment until it is
  reopened; reopening shows the correct provenance mark.
- One unreproduced full navigation back to `/` occurred mid-session; no
  cause was established.
- Hidden settings tabs remain mounted while another view is active (matches
  the original page's eager mount behavior).
- The About tab states "MIT Licensed" while the repository has no LICENSE
  file (pre-existing inconsistency, not part of this work).
- Make Pack execution, CLAP inference, update notifications and first-run
  onboarding were not exercised in this pass.

## Screenshot locations

None committed: the preview capture tool failed during the session.
Computed-style comparison data was captured live; re-capture is required
to close the visual gap. See `docs/variant-i-screenshots/` (empty) for
where they should land.