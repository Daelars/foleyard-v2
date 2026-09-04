export type Severity = "critical" | "high" | "medium" | "low";
export type Kind = "security" | "bug" | "dead" | "improvement" | "decision";

export type Finding = {
  id: string;
  area: string;
  severity: Severity;
  kind: Kind;
  title: string;
  files: string[];
  detail: string;
  verified: boolean;
};

export const AREAS = [
  "API & data",
  "Library & player",
  "Palette, settings & dialogs",
  "Core, packages & desktop",
  "Decisions",
] as const;

export const FINDINGS: Finding[] = [
  // ── Security (all independently verifiable via the cited files) ──
  {
    id: "S1",
    area: "API & data",
    severity: "critical",
    kind: "security",
    title: "Waveform endpoint reads any local file by path",
    files: ["src/app/api/waveform/route.ts:11,17,24"],
    detail:
      "GET takes ?path=, decodes it, and fs.readFileSyncs it with no library-root check, buffering the whole file. Accept an id and resolve via getFileById like /api/audio, cap size.",
    verified: true,
  },
  {
    id: "S2",
    area: "Core, packages & desktop",
    severity: "critical",
    kind: "security",
    title: "Folder-janitor delete-folders takes arbitrary paths",
    files: ["packages/yard-tools/folder-janitor/src/service.ts:123-140", "src/app/api/extensions/folder-janitor/delete-folders/route.ts:11-24"],
    detail:
      "Route forwards body.paths verbatim to rmdirSync with no library-root containment or symlink check. Resolve against library roots and re-verify emptiness.",
    verified: false,
  },
  {
    id: "S3",
    area: "Core, packages & desktop",
    severity: "critical",
    kind: "security",
    title: "Electron ships sandbox:false with devtools and an F12 toggle",
    files: ["electron/main/window.cjs:35-41,51-60"],
    detail:
      "With the sandbox off, any renderer XSS gains preload require/IPC power. Set sandbox:true, devTools only when unpackaged, drop the F12 handler in prod.",
    verified: false,
  },
  {
    id: "S4",
    area: "Core, packages & desktop",
    severity: "critical",
    kind: "security",
    title: "IPC and execute endpoints trust renderer-supplied paths",
    files: ["electron/main/ipc.cjs:37-41", "electron/main/desktop-service.cjs:69-94", "src/app/api/extensions/execute/route.ts:28-33"],
    detail:
      "reveal-path, drag-file fallback, and generic execute() accept raw paths/selection input. Require fileId and resolve server-side against the index.",
    verified: false,
  },
  {
    id: "S5",
    area: "API & data",
    severity: "high",
    kind: "security",
    title: "Audio Range header parsed without validation",
    files: ["src/app/api/audio/route.ts:47-50"],
    detail:
      "parseInt parts flow unclamped into createReadStream; malformed ranges yield corrupt 206 responses and break seeking. Clamp 0<=start<=end<size, return 416 otherwise.",
    verified: true,
  },
  {
    id: "S6",
    area: "API & data",
    severity: "high",
    kind: "bug",
    title: "Permanent disk delete is synchronous with no undo",
    files: ["src/app/api/files/route.ts:98-112"],
    detail:
      "permanent=true loops fs.unlinkSync then marks removed — blocks the loop per file despite destructive UI copy. Use async unlink or move to trash.",
    verified: false,
  },
  {
    id: "S7",
    area: "API & data",
    severity: "high",
    kind: "bug",
    title: "Moved-file reconciliation can merge the wrong files then delete",
    files: ["src/lib/database/file-repository.ts:395-462"],
    detail:
      "Matches removed→active on filename+size+duration with a single-match rule, then moves tags/collections/favorites and deletes. Common names collide irreversibly. Require stronger identity or queue for review.",
    verified: false,
  },
  {
    id: "S8",
    area: "Core, packages & desktop",
    severity: "high",
    kind: "bug",
    title: "Scanner aborts the whole run on one bad directory",
    files: ["src/lib/scanner/filesystem.ts:22,55", "src/lib/scanner/scan-runner.ts:476-492"],
    detail:
      "readdir/stat errors escape into a run-level catch with partial batchUpsert already committed. Isolate per directory, count errors, cap depth, track visited inodes.",
    verified: false,
  },
  {
    id: "S9",
    area: "Core, packages & desktop",
    severity: "critical",
    kind: "bug",
    title: "Desktop release build wipes the user database",
    files: ["package.json:18", "electron/main/database.cjs:68-101"],
    detail:
      "build:desktop passes foleyardResetDatabaseOnBuild plus open-devtools flags, so a release launch deletes foleyard.sqlite*. Strip both flags from the release path.",
    verified: false,
  },
  // ── Library & player ──
  {
    id: "P1",
    area: "Library & player",
    severity: "high",
    kind: "bug",
    title: "Persisted volume is unclamped and can throw on load",
    files: ["src/components/AudioPlayer/use-audio-playback.ts:32-44,55,114,159-169"],
    detail:
      "Only Number.isFinite is checked, so a stored 5 or -1 hits audio.volume = … and throws IndexSizeError, breaking playback init. Clamp to [0,1] at parse, change, and apply.",
    verified: true,
  },
  {
    id: "P2",
    area: "Library & player",
    severity: "high",
    kind: "bug",
    title: "Row waveforms cache failures forever and leak paths",
    files: ["src/components/FileTable/row-waveform.tsx:7,15-28"],
    detail:
      "Failed fetches resolve [] into the never-evicted Map; absolute file paths ride in the query string into logs. Don't cache failures, cap the map, prefer id-based peaks.",
    verified: true,
  },
  {
    id: "P3",
    area: "Library & player",
    severity: "medium",
    kind: "bug",
    title: "Virtual-list border wraps a full-height spacer",
    files: ["src/components/FileTable.tsx:171-178"],
    detail:
      "rounded/border/bg sit on the spacer sized to total rows (N×64px), painting a ~640k-px box for big libraries. Move surface styling onto rows; leave the spacer transparent.",
    verified: true,
  },
  {
    id: "P4",
    area: "Library & player",
    severity: "medium",
    kind: "bug",
    title: "Autoplay toggle only gates track-advance, not initial play",
    files: ["src/components/AudioPlayer/use-audio-playback.ts:77"],
    detail:
      "audio.play() runs unconditionally on mount, so every click plays with autoplay off. Gate initial play on the flag or rename it to continue-on-ended.",
    verified: false,
  },
  {
    id: "P5",
    area: "Library & player",
    severity: "medium",
    kind: "bug",
    title: "J/K navigation uses stale index and unescaped selector",
    files: ["src/components/FileTable.tsx:86,105-108"],
    detail:
      "Order resolves from files not the rendered items (diverges with directories), passes the old index onward, and interpolates ids into querySelector without CSS.escape. Iterate items, pass the neighbor index, escape it.",
    verified: false,
  },
  {
    id: "P6",
    area: "Library & player",
    severity: "medium",
    kind: "bug",
    title: "Scrubber is mouse-only despite slider semantics",
    files: ["src/components/ui/waveform.tsx:239-280"],
    detail:
      "Only mousedown/mousemove/mouseup are wired; the focusable slider node has no key or touch handling. Add arrows/Home/End plus pointer events and keep aria-valuetext in sync.",
    verified: false,
  },
  {
    id: "P7",
    area: "Library & player",
    severity: "medium",
    kind: "bug",
    title: "Native drag collapses an existing multi-selection",
    files: ["src/components/FileTable/desktop-actions.tsx:80", "src/components/FileTable/file-row.tsx:216-220"],
    detail:
      "Drag-start re-selects the single file without modifiers, silently dropping the bulk set behind shelf/pack/queue flows. Drag the whole set when the id is inside it.",
    verified: false,
  },
  {
    id: "P8",
    area: "Library & player",
    severity: "low",
    kind: "dead",
    title: "Waveform active prop leaks onto the DOM",
    files: ["src/components/ui/waveform.tsx:29"],
    detail:
      "active?: boolean is declared but never destructured, so it spreads onto the div as an invalid attribute. Destructure it or delete it.",
    verified: true,
  },
  {
    id: "P9",
    area: "Library & player",
    severity: "low",
    kind: "dead",
    title: "TagPicker has no production importer",
    files: ["src/components/TagPicker.tsx:22"],
    detail:
      "Only the token-guard test references it; per-file tagging moved into the row context menu. Delete it or wire it into the bulk bar.",
    verified: true,
  },
  {
    id: "P10",
    area: "Library & player",
    severity: "low",
    kind: "dead",
    title: "Transport queue exposes unused dequeue surface",
    files: ["src/components/AudioPlayer/use-transport-queue.ts:38,82"],
    detail:
      "dequeue and the TransportQueueApi type are never consumed (page uses playIds/enqueue/clear/step/advance). Wire dequeue to library-remove cleanup or delete it.",
    verified: false,
  },
  {
    id: "P11",
    area: "Library & player",
    severity: "low",
    kind: "improvement",
    title: "Cap peak caches and stop caching failures",
    files: ["src/components/FileTable/row-waveform.tsx:7", "src/lib/client-waveform.ts:37-55"],
    detail:
      "Bound the in-memory map (~200 entries), skip caching empty results, and decode client-side only for the player scrubber.",
    verified: false,
  },
  {
    id: "P12",
    area: "Library & player",
    severity: "low",
    kind: "improvement",
    title: "Fix highlight-match query trim inconsistency",
    files: ["src/components/FileTable/highlight-match.tsx:6-7"],
    detail:
      "Early-out tests the trimmed query but splits on the raw one, so padded queries never highlight. Trim once and reuse.",
    verified: false,
  },
  // ── Palette, settings, dialogs ──
  {
    id: "D1",
    area: "Palette, settings & dialogs",
    severity: "high",
    kind: "bug",
    title: "Rename Hammer option toggles don't affect the preview",
    files: ["src/components/extensions/rename-hammer/RenameHammerDialog.tsx:121-123,126-140"],
    detail:
      "lowercase/replaceSpaces/numberSuffix render switches but the preview memo only depends on pattern+style, so flipping them changes nothing on a destructive tool. Feed them into applyPattern or remove them.",
    verified: true,
  },
  {
    id: "D2",
    area: "Palette, settings & dialogs",
    severity: "high",
    kind: "bug",
    title: "Folder Janitor never refreshes after destructive cleanup",
    files: ["src/components/extensions/folder-janitor/FolderJanitorDialog.tsx:141-192"],
    detail:
      "Remove/delete toast success but leave stale issues listed with live buttons; re-clicking acts on removed ids. Re-scan or prune the issue list.",
    verified: false,
  },
  {
    id: "D3",
    area: "Palette, settings & dialogs",
    severity: "medium",
    kind: "bug",
    title: "DropRules inputs desync after restore-defaults",
    files: ["src/components/SettingsDialog.tsx:1476,1506-1513,1626-1633"],
    detail:
      "Uncontrolled inputs snapshot once, so restore-defaults (and external changes) leave stale text and a stale preview. Make them controlled and sync on prop change.",
    verified: false,
  },
  {
    id: "D4",
    area: "Palette, settings & dialogs",
    severity: "medium",
    kind: "bug",
    title: "Palette highlight can scroll out of view",
    files: ["src/components/CommandPalette/CommandPalette.tsx:61-92"],
    detail:
      "Arrow keys move an index with no scrollIntoView and no listbox semantics. Add item refs with block:nearest plus role listbox/option.",
    verified: false,
  },
  {
    id: "D5",
    area: "Palette, settings & dialogs",
    severity: "medium",
    kind: "bug",
    title: "Shortcut rebinding swallows Tab",
    files: ["src/components/SettingsDialog.tsx:481-496"],
    detail:
      "Capture preventDefaults every key, then silently ignores Tab — a keyboard trap until Escape. Return before preventDefault for Tab.",
    verified: true,
  },
  {
    id: "D6",
    area: "Palette, settings & dialogs",
    severity: "low",
    kind: "dead",
    title: "ExtensionDialogShell forwards a prop nobody passes",
    files: ["src/components/extensions/ExtensionDialogShell.tsx:26,45,48"],
    detail: "onOpenChangeWrapper is defined and forwarded with zero call sites. Delete it or land its first caller.",
    verified: false,
  },
  {
    id: "D7",
    area: "Palette, settings & dialogs",
    severity: "low",
    kind: "dead",
    title: "Button/badge/card variants exist with zero usage",
    files: ["src/components/ui/button.tsx:20,27-33", "src/components/ui/badge.tsx:19-21"],
    detail:
      "link button variant, lg/icon-xs/icon-lg sizes, ghost/link badges, and the variants exports have no importers. Prune or keep deliberately as vendored API.",
    verified: false,
  },
  {
    id: "D8",
    area: "Palette, settings & dialogs",
    severity: "low",
    kind: "dead",
    title: "ui/audio-player exports ~20 unused symbols plus fixture data",
    files: ["src/components/ui/audio-player.tsx:326-609"],
    detail:
      "Only AudioPlayerProvider is imported (page.tsx:120); progress/time/button/speed components and exampleTracks ship dead. Delete or move to stories.",
    verified: true,
  },
  {
    id: "D9",
    area: "Palette, settings & dialogs",
    severity: "low",
    kind: "dead",
    title: "Single-consumer UI primitives are vendored maximally",
    files: ["src/components/ui/table.tsx", "src/components/ui/radio-group.tsx", "src/components/ui/select.tsx", "src/components/ui/accordion.tsx"],
    detail:
      "Table, radio-group, select, and accordion each serve exactly one dialog. Either accept as vendored API or trim to used exports.",
    verified: false,
  },
  {
    id: "D10",
    area: "Palette, settings & dialogs",
    severity: "low",
    kind: "improvement",
    title: "Clamp the palette index at the source",
    files: ["src/app/page.tsx:1821-1824,1930"],
    detail:
      "Index is clamped at render while arrow handlers close over list length; rapid query+key races can flash stale. Clamp in the query-change and arrow handlers instead.",
    verified: false,
  },
  // ── Shell, page, hooks ──
  {
    id: "H1",
    area: "API & data",
    severity: "high",
    kind: "bug",
    title: "Onboarding web fallback can never proceed",
    files: ["src/components/OnboardingDialog.tsx:139-156,291"],
    detail:
      "The web folder path never reaches rootDraft, so Add Folder stays disabled after a successful scan message. Store the picked name or gate on a separate ready flag.",
    verified: true,
  },
  {
    id: "H2",
    area: "API & data",
    severity: "medium",
    kind: "bug",
    title: "Fresh installs render an empty library with roots set",
    files: ["src/app/page.tsx:403-410"],
    detail:
      "The all-view with no directory bails to setFiles([]); with no directory ever selected it looks like the scan did nothing. Fall back to unfiltered files or a pick-a-folder empty state.",
    verified: false,
  },
  {
    id: "H3",
    area: "API & data",
    severity: "low",
    kind: "dead",
    title: "Scan status carries phantom fields",
    files: ["src/app/page.tsx:929-933"],
    detail:
      "Writes libraryRoot/stats fields that do not exist on ScanStatus and have no readers. Delete the write.",
    verified: false,
  },
  {
    id: "H4",
    area: "API & data",
    severity: "low",
    kind: "dead",
    title: "Accent-hover token has zero usages",
    files: ["src/app/globals.css:12,97"],
    detail: "Defined and mapped but never referenced in src. Delete it or wire hover states to it.",
    verified: true,
  },
  {
    id: "H5",
    area: "API & data",
    severity: "low",
    kind: "dead",
    title: "UpdateNotifier carries an unused import and noop subscription",
    files: ["src/components/UpdateNotifier.tsx:6,57"],
    detail:
      "isDesktopApp imported but unused; onUpdateNotAvailable subscribes an empty callback (duplicated in SettingsDialog). Delete both.",
    verified: true,
  },
  {
    id: "H6",
    area: "API & data",
    severity: "low",
    kind: "dead",
    title: "Delete handlers carry void name statements",
    files: ["src/components/SettingsDialog.tsx:537-541,551-555"],
    detail: "handleDeleteCollection/handleDeleteTag open with void name;. Drop the parameter or use it.",
    verified: true,
  },
  {
    id: "H7",
    area: "API & data",
    severity: "low",
    kind: "improvement",
    title: "Unify the five view-reset callbacks",
    files: ["src/app/page.tsx:1555-1580"],
    detail: "showLibrary/showFavorites/showShelf/showExtensions/showOrganize differ only by target. One showView(view) helper.",
    verified: false,
  },
  {
    id: "H8",
    area: "Core, packages & desktop",
    severity: "low",
    kind: "dead",
    title: "Scanner state helpers are shadowed and unused",
    files: ["src/lib/scanner/scan-state.ts:23,43"],
    detail:
      "resetScanStatus/incrementScanErrors are never imported; the runner uses private methods. Delete or delegate.",
    verified: true,
  },
  {
    id: "H9",
    area: "Core, packages & desktop",
    severity: "low",
    kind: "dead",
    title: "Single-write DB helpers wired but never called",
    files: ["src/lib/database/file-repository.ts:235,275,495-496"],
    detail:
      "upsertFile/touchFileAsSeen are exported and threaded into the scan seam but the runner only calls batch variants. Remove from the seam or keep for tests.",
    verified: false,
  },
  {
    id: "H10",
    area: "Core, packages & desktop",
    severity: "low",
    kind: "dead",
    title: "Audio-file collector only serves the benchmark script",
    files: ["src/lib/scanner/filesystem.ts:111-122"],
    detail: "collectAudioFiles is referenced only by scripts/benchmark-scan.ts while the scanner streams batches. Move it to the bench helper.",
    verified: false,
  },
  {
    id: "H11",
    area: "Core, packages & desktop",
    severity: "low",
    kind: "dead",
    title: "Yard-core legacy interfaces have no implementations",
    files: ["packages/yard-core/src/services/commands/command-registry.ts:3"],
    detail:
      "CommandRegistry, matchesDirectory, PlaybackState, LibraryRootSettings and several service interfaces have definitions but no prod implementations. Delete or document as public API.",
    verified: false,
  },
  {
    id: "H12",
    area: "Core, packages & desktop",
    severity: "low",
    kind: "improvement",
    title: "Exclude prototype routes from the production build",
    files: ["src/app/prototype/redesign/page.tsx", "src/app/prototype/showcase/page.tsx"],
    detail:
      "Throwaway routes ship in .next and the desktop package. Gate them behind a flag, tracing excludes, or move them out of the app dir.",
    verified: false,
  },
];

export const DECISIONS: { title: string; detail: string }[] = [
  { title: "Soft-delete everywhere", detail: "Files are flagged removed_at, never hard-deleted by scans; only explicit disk delete unlinks." },
  { title: "Idempotent batch scanning", detail: "Discovery upserts in batches keyed on path; metadata backfills with failures counted, not fatal." },
  { title: "Permission-gated extensions", detail: "Tools run through YardExtensionHost with manifests, string permissions, and UI intents — never direct FS from UI code." },
  { title: "Shelf is scratch, favorites are keep", detail: "Sound Shelf is an ephemeral persisted holding strip; favorites are the durable save." },
  { title: "One giant client orchestrator", detail: "page.tsx owns library, queue, palette, shortcuts, and dialogs so cross-view state stays trivially shared." },
  { title: "Remount-per-track playback", detail: "A new Audio element per file favors correctness-via-teardown over element reuse." },
  { title: "Wrap-around queue", detail: "Next/previous cycle the queue instead of stopping at the ends." },
  { title: "Pure palette builder", detail: "Command rows are pure data so matching and gating stay unit-testable without DOM." },
  { title: "Typing-guarded shortcuts", detail: "Printable keys never fire while typing; Space additionally skips buttons, sliders, and inputs." },
  { title: "Settings remount on open", detail: "Dialog body resets via key instead of syncing every prop change." },
  { title: "Destructive reads first", detail: "Janitor reports by default; cleanup is opt-in behind confirms. Gatherer copies, never moves." },
  { title: "Dark-only theme", detail: "Layout forces .dark; light tokens are vestigial. Brand and glow live in one token layer." },
  { title: "Prototype routes are throwaway", detail: "Redesign, showcase, revised, and app-v2 routes exist for review and must not ship as product." },
  { title: "Local-first, no auth", detail: "SQLite plus localhost APIs with no credentials; the trust boundary is the local machine." },
];
