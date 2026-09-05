# Repository Audit

_Foleyard v0.1.8 — audited at `1ba1cb0` (main, clean tree), 2026-09-04._

Method: full read of `src/`, `packages/`, `electron/`, `scripts/`, configs and CI;
end-to-end traces of the four load-bearing paths (scan → index → list → play,
extension command → host → service → filesystem, desktop IPC → HTTP → DB, and
settings/organization mutations); plus `tsc --noEmit`, `next build`, `eslint .`,
`vitest run`, and read-only queries against the local 15,877-file database to
ground the performance claims.

> Note: `.gitignore` line 19 ignores `/docs`, so **this file is untracked**. See
> finding **H10** — that is itself a finding, not an accident of this audit.

---

## Executive Summary

Foleyard is a local-first Electron + Next.js sound-library browser. The
architecture is better than most apps of this size: there is a genuine domain
package (`yard-core`), a real repository layer over SQLite, an extension host
with a command/permission/intent protocol, and — unusually — the hard logic
(selection ranges, transport queue, palette matching, shortcut matching, scan
reconciliation) has been extracted into pure modules with 178 passing unit
tests. The scanner is well designed: batched discovery, mtime/size change
detection, soft deletes, and move reconciliation.

The problems are concentrated in three places.

**1. The release pipeline is currently broken and nothing catches it.**
`next build` exits 1 on a type error (`src/app/api/audio/route.ts:64`), which
means `bun run release:build` — the only thing the single GitHub workflow does —
cannot produce an installer. There is no CI on push or pull request, so
`tsc`, `eslint` (also red) and `vitest` are only ever run by hand. This is the
single most expensive thing in the repo, because it is the reason everything
else can rot silently.

**2. Filesystem boundary enforcement is inconsistent.** `/api/audio`,
`/api/waveform`, `/api/desktop/path` and `folder-janitor.delete-folders` all
resolve paths against the configured Library roots. `/api/extensions/library-gatherer/gather`
and `/api/extensions/make-pack` do not — they take an arbitrary
`sourceDirectories` / `destinationDirectory` from the request body and walk,
read, copy and write anywhere on disk. The trust boundary is documented as "the
local machine", which is defensible, but the boundary is enforced in four places
and skipped in two, which is the worst of both worlds.

**3. The "extension system" is a protocol, not yet a boundary.** Adding an
extension today requires editing at least five app-owned files
(`registry.ts`, a bespoke `/api/extensions/<name>/<verb>` route, a bespoke
dialog component, the `ui-intent.ts` switch, and often a hand-written panel in
`SettingsDialog.tsx`). `yard-core` also carries six exported service interfaces
with zero implementations and an `EventBus` with zero emitters and zero
subscribers. The contracts are ahead of the wiring.

Biggest opportunities, in order of value per unit of risk: fix the build and add
CI; close the two unguarded filesystem endpoints; make bulk operations and the
directory/collection queries stop doing O(library) work per request; then delete
the roughly 11,000 lines of prototype routes, dead interfaces and the
1,000-line animation engine that exists to draw one status dot.

**Verdict: targeted fixes, not structural work.** The layering is sound and
worth keeping. Nothing here argues for a rewrite. Two areas — `src/app/page.tsx`
(2,749 lines) and the per-extension app wiring — will need deliberate
restructuring within the next few features, but neither is urgent this week.

---

## Critical Issues

### C1 — `next build` fails; the desktop build and release cannot run

**Problem.** The production build fails type checking, so `build`,
`build:desktop`, `build:desktop:disposable`, `release` and `release:build` all
abort before producing an installer.

**Evidence.** `npx next build` → `Failed to type check.` → exit code 1.
`tsc --noEmit` reports 13 errors in three files:

- `src/app/api/audio/route.ts:64` — `streamResponse` declares
  `headers: Record<string, string | number>` but passes it to `NextResponse`,
  which requires `HeadersInit`. `Content-Length` is assigned a `number` at
  lines 111 and 119, which is what forces the `| number`.
- `src/app/api/extensions/sound-shelf/route.ts:32-48` (10 errors) —
  `.filter((file) => file !== null && file.removedAt === null)` does not narrow
  `IndexedAudioFile | null`, so every subsequent `file.id` / `file.filename`
  is `'file' is possibly 'null'`.
- `src/lib/scanner/scan-runner.ts:379` — `touchEntries` is declared
  `{ path: string; lastScannedAt: string }[]` but the pushed literal also
  carries `libraryRoot`, which `batchTouchFiles` genuinely needs
  (`file-repository.ts:303` writes `library_root = COALESCE(?, library_root)`).

**Why it matters.** No release can be cut from `main` right now. The runtime
behaviour is fine in all three cases — these are pure type errors — which is
exactly why they survived: `next dev` does not type-check.

**Severity: CRITICAL. Confidence: CONFIRMED** (reproduced, exit code 1).

**Proposed fix.** Three one-line changes: type the header bag as
`Record<string, string>` and `String(...)` the two numeric values; give the
shelf filter a type predicate (`(file): file is IndexedAudioFile => ...`); widen
the `touchEntries` declaration to `AudioFileTouchEntry[]` (already exported from
`@yard-core`).

**Scope.** `src/app/api/audio/route.ts`,
`src/app/api/extensions/sound-shelf/route.ts`, `src/lib/scanner/scan-runner.ts`.

**Risk.** Effectively none; no runtime semantics change.

---

### C2 — No CI on push or pull request

**Problem.** `.github/workflows/release.yml` is the only workflow and it only
triggers on `push: tags: ["v*"]` and `workflow_dispatch`. Nothing runs
`tsc --noEmit`, `eslint`, or `vitest` on a commit or a PR.

**Evidence.** `.github/workflows/` contains one file. `package.json` has
`lint` and `test` scripts that no automation invokes.

**Why it matters.** This is the root cause of C1 and of the red lint below. A
broken build reached `main` and was only discovered by an explicit audit. The
release workflow will now fail at the `bun run release:build` step, so the
first signal will be a failed tag push.

**Severity: CRITICAL. Confidence: CONFIRMED.**

**Proposed fix.** One workflow on `push`/`pull_request` running
`bun install --frozen-lockfile`, then `tsc --noEmit`, `eslint`, `vitest run`.
Roughly 30 lines; the test suite takes 2.6 s and the build 4.2 s to compile.

**Scope.** New `.github/workflows/check.yml`.

**Risk.** None. It will be red on the first run until C1 and the lint error are
fixed — fix those in the same change.

---

## High Priority

### H1 — Two extension endpoints read, copy and write arbitrary paths

**Problem.** `POST /api/extensions/library-gatherer/gather` (and `/preview`)
accept `sourceDirectories: string[]` and `destinationDirectory: string`
straight from the request body and pass them to
`LibraryGathererService.buildResult`, which does an unbounded recursive
`readdir` of each source and `copyFile` of every audio file into the
destination, then writes `foleyard-gather-report.json` there. No Library-root
containment, no granted-path check, no `realpath` check.
`POST /api/extensions/make-pack` has the same unguarded `destinationDirectory`
(it does at least resolve its *sources* through the index).

**Evidence.** `src/app/api/extensions/library-gatherer/gather/route.ts:16-37`
validates only that the fields are present.
`packages/yard-tools/library-gatherer/src/service.ts:41-48, 82-95, 131-148`.
`src/app/api/extensions/make-pack/route.ts:56-61`,
`packages/yard-tools/make-pack/src/service.ts:34-39`.
Contrast with `src/app/api/audio/route.ts:80`,
`src/app/api/waveform/route.ts:27`, `src/app/api/desktop/path/route.ts:15`,
and `packages/yard-tools/folder-janitor/src/service.ts:126-154`, which all call
`resolveExistingPathWithinRoots` or an equivalent containment check.

**Why it matters.** The packaged app runs a Next server on `127.0.0.1` with a
random port and no authentication. Any local process — and any code that
achieves script execution inside the renderer — gets an arbitrary-directory
read-and-copy plus an arbitrary-path write primitive (the report JSON, and
`mkdir -p` of any destination). Beyond security, it is a correctness hazard:
a typo'd destination in the dialog silently creates directories anywhere.

**Severity: HIGH. Confidence: CONFIRMED** (code path is unguarded end to end).

**Proposed fix.** Reuse the mechanism that already exists. Sources must resolve
within `getLibraryRoots()`; destinations must resolve within a user-granted
directory. The Electron side already maintains a granted-path registry
(`electron/main/granted-paths.cjs`) populated by `desktop:pick-folder` — expose
a `POST /api/desktop/grant` equivalent, or have the picker hand back an opaque
grant token the route validates, rather than a raw path string.

**Scope.** `src/app/api/extensions/library-gatherer/{gather,preview}/route.ts`,
`src/app/api/extensions/make-pack/route.ts`, `src/lib/filesystem-boundary.ts`,
`electron/main/{desktop-service,ipc}.cjs`.

**Risk.** Gather/Make Pack to a destination outside any picked folder will start
failing. That is the intent, but it changes behaviour for anyone typing a path
by hand — keep the desktop folder picker as the primary entry point.

---

### H2 — Two independent SQLite connections to the same file in one process

**Problem.** `src/lib/database/connection.ts` lazily creates one
`better-sqlite3` connection behind a `Proxy` and every repository facade uses
it. `src/lib/composition-root.ts:36` calls `createDatabaseConnection` **again**,
producing a second connection to the same file, and every extension command
runs against that one.

**Evidence.** `connection.ts:36-52` (module singleton) versus
`composition-root.ts:32-42`. `createAppExtensionHost()`
(`src/lib/extensions/host.ts:18`) calls `createExtensionServices()` →
`getAppServices()` on every extension request, while `/api/files`,
`/api/tags`, `/api/collections` go through `@/lib/db` → the first connection.
`DbSoundShelfStore` and `settings-store.ts` use the *first* connection, so a
single shelf request touches both.

**Why it matters.** Three concrete costs. (a) `initializeDatabaseSchema` runs
twice per process, including `backfillLibraryRoots`, which does a full
`SELECT ... WHERE library_root IS NULL` scan each time. (b) Two page caches for
one database. (c) In WAL mode, a writer on connection A and a writer on
connection B can produce `SQLITE_BUSY` — there is no `busy_timeout` pragma set
anywhere, so the default is to fail immediately. Today the write volume is low
enough that this is latent; a background scan writing batches while an
extension writes settings is exactly the collision shape.

**Severity: HIGH. Confidence: CONFIRMED** (two `new BetterSqlite3(...)` calls,
same path, same process).

**Proposed fix.** Delete `createDatabaseConnection`'s second call site; have
`getAppServices()` construct the repositories over the existing `sqlite` export.
While there, add `sqlite.pragma("busy_timeout = 5000")` in `connection.ts`.

**Scope.** `src/lib/composition-root.ts`, `src/lib/database/connection.ts`.

**Risk.** Low. The repositories already accept an injected `Database`, so this
is a wiring change. Watch for the `as unknown as Database` cast the Proxy forces
(see M-notes on type safety).

---

### H3 — The metadata queue has a 30-second hard timeout that fails the whole scan

**Problem.** After discovery, `runScan` awaits `metadataQueue.onIdle()` with the
default `timeoutMs = 30000`. If the backlog takes longer than 30 s to drain,
`onIdle` throws `"Metadata queue timed out"`, the catch block runs
`metadataUpdates.length = 0` — discarding every buffered metadata row that had
not yet hit the 250-record flush threshold — and the scan is reported as failed.

**Evidence.** `src/lib/scanner/scan-runner.ts:158-182` (the timeout and the
1 ms busy-wait), `:512` (`await metadataQueue.onIdle()` with no argument),
`:532-534` (the catch clears the buffer).

**Why it matters.** Discovery is `readdir`-bound and fast; metadata extraction
is 8-way concurrent file opens plus `music-metadata` parsing. On a first scan of
a large library the queue backlog at the end of discovery is proportional to the
library size, so this fails for exactly the users with the biggest libraries,
and it fails at the very end after minutes of work. The busy-wait is also a
1,000-wakeups-per-second timer for the entire metadata phase.

**Severity: HIGH. Confidence: HIGH CONFIDENCE** (mechanism is certain; the
trigger threshold depends on library size and disk).

**Proposed fix.** Replace the polling `onIdle` with a drain promise resolved
from the `finally` block of the worker when `activeCount === 0 && pending.length === 0`.
Keep a timeout only as a stall detector — reset it on every completed task
rather than measuring total duration — and on timeout, flush what is buffered
instead of discarding it.

**Scope.** `src/lib/scanner/scan-runner.ts` (`createMetadataQueue`, `runScan`).

**Risk.** Low; `src/lib/scanner/__tests__/scan-runner.test.ts` covers the
surrounding behaviour. Add a test that enqueues more work than the old timeout
allowed.

---

### H4 — Files whose metadata extraction failed are never retried

**Problem.** Metadata is only enqueued for records in `upsertRecords`, i.e. for
files where `changed || ownershipChanged`. `changed` is computed from
`fileSize`, `mtimeMs`, `removedAt` and `directory`. A file whose metadata
extraction produced nulls is unchanged on the next scan, so it is touched, not
re-extracted — permanently.

**Evidence.** `src/lib/scanner/scan-runner.ts:367-418`. Compounding it,
`src/lib/metadata.ts:100-111` catches *all* extraction errors and returns a
nulls record, so `createMetadataQueue`'s `onError` (`scan-runner.ts:122-125`)
almost never fires and `status.errors` under-reports. The scan runner also
passes `fullParse: false` (`:120`), so `needsFullParse`
(`metadata.ts:46-56`) — the fallback to a full `parseFile` for files whose
header parse yields no duration — is dead code during scans.

**Why it matters.** In the local database, 217 of 15,877 active files (1.4%)
have `duration IS NULL`. Those rows sort last under duration sort, show no
time in the UI, and no user action can fix them short of touching the files on
disk. There is no "rescan metadata" escape hatch anywhere in the UI.

**Severity: HIGH. Confidence: CONFIRMED** (query result plus code path).

**Proposed fix.** Add `existing.duration === null` (or a `metadataAttemptedAt`
column) to the `changed` predicate so incomplete rows are re-enqueued, and let
the second attempt use `fullParse: true`. Have `extractMetadata` distinguish
"parsed, no duration" from "failed to read" so `status.errors` means something.

**Scope.** `src/lib/scanner/scan-runner.ts`, `src/lib/metadata.ts`, possibly one
`ensureColumn` call in `src/lib/database/migrations.ts`.

**Risk.** The first scan after the change re-extracts the affected subset. Bound
it by only retrying rows that are missing `duration`, not every incomplete field.

---

### H5 — Folder Janitor silently inspects only the first 500 files in a folder

**Problem.** `scan-folder` calls `getFiles({ libraryRoot, directory, ... })`
with no `limit`, and `SqliteAudioFileRepository.getFiles` defaults to
`limit = 500`.

**Evidence.** `src/app/api/extensions/folder-janitor/scan-folder/route.ts:43-48`;
`src/lib/database/file-repository.ts:46`.

**Why it matters.** For any folder with more than 500 indexed sounds, the
Janitor reports "no issues" for files it never looked at, and
`scannedFiles` in the report is capped at 500 with no indication of truncation.
A tool whose whole job is "find the broken files" quietly reports a clean bill
of health. `scan-library` does not have this bug (it queries directly), which
makes the inconsistency easy to miss.

**Severity: HIGH. Confidence: CONFIRMED.**

**Proposed fix.** Pass an explicit high limit, or better, add a
`getAllFilesInDirectory` repository method that does not paginate — the caller
is a batch job, not a UI list.

**Scope.** `src/app/api/extensions/folder-janitor/scan-folder/route.ts`,
`src/lib/database/file-repository.ts`.

**Risk.** Larger reports and longer scans for big folders — which is the correct
behaviour. Combine with H6.

---

### H6 — Folder Janitor's library scan is O(files) sequential syscalls on the server thread

**Problem.** `FolderJanitorService.scan` iterates every file with
`fs.existsSync(file.path)` followed by `await fs.promises.stat(file.path)` — one
at a time, no concurrency — then walks every Library root recursively looking
for empty folders.

**Evidence.** `packages/yard-tools/folder-janitor/src/service.ts:27-47` (the
sequential loop), `:93-102` and `:175-208` (`findEmptyFolders`).
`src/app/api/extensions/folder-janitor/scan-library/route.ts:15-27` loads every
non-removed row first.

**Why it matters.** At 15,877 files that is ~31,700 sequential syscalls
(`existsSync` is synchronous and blocks the event loop outright). The same Node
process streams audio to the player and serves every other API route, so a
library scan stalls playback and the UI. At 100k files it is minutes of
degraded service with no progress reporting — the endpoint returns one JSON blob
at the end.

**Severity: HIGH. Confidence: CONFIRMED.**

**Proposed fix.** Drop `existsSync` (the `stat` already tells you), run stats
through a bounded concurrency pool (the scanner already has the shape at
`scan-runner.ts:96-188` — extract it), and report progress the way the library
scan does rather than returning one payload.

**Scope.** `packages/yard-tools/folder-janitor/src/service.ts`, plus a shared
concurrency helper.

**Risk.** Low; `service.test.ts` covers the report shape.

---

### H7 — Bulk actions issue one HTTP request per file, plus one extra per favourite

**Problem.** `handleBulkSaveAll` and `handleBulkTag` map the selection into
`Promise.all` over per-file `PATCH /api/files`. `handleToggleFavorite`
additionally fires `loadFavoritesCount()` — another request — on every call.

**Evidence.** `src/app/page.tsx:837-841` (`handleBulkSaveAll`),
`:868-877` (`handleBulkTag`), `:718-737` (`handleToggleFavorite` and its
trailing `void loadFavoritesCount()`).

**Why it matters.** Selecting 500 rows and pressing "Save all" issues up to
1,000 HTTP requests and 1,000 separate SQLite write transactions, all
unthrottled, against a single-threaded server that is also streaming audio. The
`PATCH` route has no batch action, so there is no way to do this correctly from
the client today. There is a correctness wrinkle too: the failure rollback in
`handleToggleFileTag` (`:806-812`) restores the pre-update file object, so
concurrent tag updates to the same file lose each other's changes.

**Severity: HIGH. Confidence: CONFIRMED.**

**Proposed fix.** Add batch actions to `PATCH /api/files`
(`{ action: "attachTag", fileIds: string[], tagId }`, `toggleFavorite` with
`fileIds` and an explicit target state) executed inside one
`sqlite.transaction`. Return the new favourites total in that response and drop
the per-item count refetch.

**Scope.** `src/app/api/files/route.ts`, `src/lib/database/{file,tag}-repository.ts`,
`src/app/page.tsx`.

**Risk.** Medium — the optimistic-update and rollback logic in `page.tsx` needs
reworking to be per-batch. Worth doing alongside the `page.tsx` split (R2).

---

### H8 — Server-side waveform generation reads whole files into memory, uncached

**Problem.** For `.wav`, `/api/waveform` does
`await fs.promises.readFile(filePath)` for files up to 256 MB, then walks the
PCM data on the main thread. There are no cache headers, and the client cache is
an in-memory `Map` capped at 256 entries that is lost on reload.

**Evidence.** `src/app/api/waveform/route.ts:11` (`MAX_WAVEFORM_FILE_SIZE`),
`:40-47`, `:105-131` (`extractWavPeaks`).
`src/components/FileTable/row-waveform.tsx:7-42` (the 256-entry `Map`).
The response carries no `Cache-Control`.

**Why it matters.** The file table is virtualised with `overscan: 20`, so
scrolling fires a burst of waveform requests. Each `.wav` request allocates the
entire file. Scrolling through a folder of 100 MB stems can allocate gigabytes
in a burst and blocks the event loop while summing samples. Nothing is persisted,
so it all happens again next launch.

Two secondary defects in the same function: `totalSamples = dataLength / 2`
assumes 16-bit mono-interleaved PCM, so 24-bit and float WAVs produce garbage
peaks; and `?peaks=abc` yields `NaN`, so the loop never runs and the endpoint
returns `[]`.

**Severity: HIGH. Confidence: CONFIRMED.**

**Proposed fix.** Stream the `data` chunk with a `createReadStream` at the chunk
offset and downsample as bytes arrive (never hold the file), honour
`fmt ` chunk `bitsPerSample`/`numChannels`, validate `peaks` with the same
`parsePageInteger` helper `/api/files` already has, and persist results —
either an `immutable` `Cache-Control` keyed on `mtimeMs:fileSize`, or a small
`waveforms` table. See also M7/M8 on unifying the two pipelines.

**Scope.** `src/app/api/waveform/route.ts`,
`src/components/FileTable/row-waveform.tsx`.

**Risk.** Low; `src/app/api/waveform/route.test.ts` exists to extend.

---

### H9 — Every mutation triggers a five-endpoint refetch, and one of them is an N+1

**Problem.** `loadInitialData()` fetches `/api/settings`, `/api/collections`,
`/api/tags`, `/api/scan`, `/api/extensions` in parallel. It is called after
creating, renaming, recolouring, converting or deleting a collection; creating a
tag; saving a search; adding a file to a collection; and after every scan
settles. Separately, `getAllCollections` runs one extra
`COUNT(*) ... WHERE filename LIKE '%q%'` per smart collection.

**Evidence.** `src/app/page.tsx:570-654` (`loadInitialData`), called at
`:1010, 1020, 1033, 1045, 1274, 1300, 1329, 1355, 1381, 1499, 1613`.
`src/lib/database/collection-repository.ts:22-63`.

**Why it matters.** Renaming a collection costs five HTTP round-trips, a
three-table join with `GROUP BY`, one full-table `LIKE` scan per smart
collection (`LIKE '%…%'` cannot use `idx_files_filename`), two `COUNT(*)` scans
in `getLibraryStats`, and a full re-registration of all six extensions. At
15,877 files each smart-collection count is a 15,877-row scan; at 100k files
with a handful of saved searches this becomes the slowest thing in the app,
triggered by the cheapest possible user action.

**Severity: HIGH. Confidence: CONFIRMED.**

**Proposed fix.** Two independent steps. (a) Give mutations targeted refetches —
a collection rename only needs `/api/collections`. (b) Compute smart-collection
counts lazily (on open) or cache them per query string; the sidebar badge does
not need to be exact on every render.

**Scope.** `src/app/page.tsx`, `src/lib/database/collection-repository.ts`,
`src/app/api/collections/route.ts`.

**Risk.** Low, but it is the kind of change that reintroduces stale-UI bugs.
Do it one mutation at a time.

---

### H10 — All architecture and domain documentation is gitignored

**Problem.** `.gitignore` ignores `/docs`, `/plan`, `AGENTS.md`, `CLAUDE.md`,
`RELEASE.md` and `redesign-plan.md`. `CONTEXT-MAP.md` **is** tracked and links
to `./docs/agents/domain.md`; `docs/agents/domain.md` in turn points at
`docs/adr/`, which does not exist.

**Evidence.** `.gitignore:17-24`. `git ls-files docs` returns nothing;
`git check-ignore -v docs/architecture/yard-core.md` →
`.gitignore:19:/docs`. Tracked: `CONTEXT-MAP.md`, `src/CONTEXT.md`,
`electron/CONTEXT.md`, `packages/yard-core/CONTEXT.md`,
`packages/yard-tools/CONTEXT.md`.

**Why it matters.** A fresh clone has the context map and the glossaries but not
`docs/architecture/yard-core.md`, `docs/architecture/extensions.md`,
`docs/agents/*` or the extension template that
`docs/architecture/extensions.md` tells contributors to copy. The project's own
convention ("read the context document and relevant ADRs before changing an
area") is unfollowable from the repository. On a second machine or a new
contributor, all of it is simply gone.

**Severity: HIGH. Confidence: CONFIRMED.**

**Proposed fix.** Un-ignore `/docs`, `AGENTS.md` and `RELEASE.md`; keep `/plan`
and `/.agents` ignored if they are genuinely scratch. Create `docs/adr/` or
remove the reference from `docs/agents/domain.md`.

**Scope.** `.gitignore`, one commit adding the existing files.

**Risk.** None, assuming nothing under `docs/` contains secrets. It does not —
it is all Markdown and a template package.

---

## Medium Priority

### M1 — `getUniqueDirectories` reads every file row to produce 634 values

`src/lib/database/browse-repository.ts:19-28` selects `directory` for every
non-removed file and de-duplicates in JavaScript. The local database has 15,877
files and 634 distinct directories — a 25× read amplification on every
`/api/directories` request, which fires on every sidebar navigation.
`getSubdirectories` (`:46-72`) calls it again. Fix: `SELECT DISTINCT directory`,
which `idx_files_directory` can serve. **Confidence: CONFIRMED.**

Related: `getSubdirectories` builds children from the raw `parentDir`
(`:66`) while `getSubdirectoriesForRoot` uses the normalized one (`:90`), so the
two produce different separators for the same input. Only the latter is reachable
from `/api/directories`; the former is effectively dead (see L-list).

### M2 — No index on `file_collections(collection_id)`

The collection listing query filters `fileCollections` by `collectionId` alone
(`file-repository.ts:51, 86-88`), but the only index is the composite primary
key `(file_id, collection_id)`, which cannot serve a leading-column-absent
lookup. `idx_file_tags_tag_id` exists for the symmetric case on tags, so this is
an oversight rather than a decision. One line in
`src/lib/database/migrations.ts`. Currently invisible (0 rows in
`file_collections` locally). **Confidence: CONFIRMED.**

### M3 — `memo` on the file rows is defeated by unstable callbacks

`useFileTableDesktopActions` returns a fresh object with fresh
`handleCopyPath`, `handleDragEnd` and `handleNativeDragStart` closures on every
render (`src/components/FileTable/desktop-actions.tsx:87-95` — no `useCallback`
anywhere in the hook). Those are passed to every `FileTableFileRow`, which is
wrapped in `memo` (`file-row.tsx:35`). The memo can therefore never hit. Because
`page.tsx` is one component, every keystroke in the search box re-renders the
whole tree, and every visible row plus its `RowWaveform` re-renders with it.
React Compiler is not enabled in `next.config.ts`, so nothing rescues this.
Fix: `useCallback` the three handlers and `useMemo` the returned object.
**Confidence: CONFIRMED.**

Cheap adjacent win: `isMultiSelected={selectedIds.includes(file.id)}`
(`FileTable.tsx:259`) is O(selection) per row; `shelfFileIdSet` two lines up
already shows the `Set` pattern.

### M4 — The file list scrolls back to the selected row on any list mutation

`FileTable.tsx:141-145` runs `virtualizer.scrollToIndex(...)` whenever `files`
changes identity. `files` gets a new identity on every optimistic update — a
favourite toggle, a tag toggle, an infinite-scroll page append. So favouriting a
row while scrolled away from the playing track snaps the viewport back to the
track. Fix: only scroll when `selectedFileId` itself changes.
**Confidence: HIGH CONFIDENCE.**

### M5 — Sorting is applied client-side over a server-paginated window

`orderedFiles` (`page.tsx:212-225`) sorts the loaded array, but the server orders
by `filename, id` and paginates with `LIMIT/OFFSET`
(`file-repository.ts:160-162`). "Sort by duration" therefore sorts only the
rows fetched so far; scrolling appends the next *filename*-ordered page and
re-sorts, producing an order that is correct locally and wrong globally. Fix:
push `sortKey`/`sortDir` into the query string and the `ORDER BY`.
**Confidence: CONFIRMED.**

### M6 — Mutation routes swallow every error and log nothing

`/api/files` `PATCH`/`DELETE`, `/api/collections` `POST`/`PATCH`/`DELETE` and
`/api/tags` all end in `catch { return NextResponse.json({ error: 'Request failed' }, { status: 500 }) }`
with no `console.error`. Creating a duplicate tag or collection name hits the
`UNIQUE` constraint and surfaces as an unexplained 500 and a "Failed to create
tag" toast. Because `electron/main/next-server.cjs:24-42` mirrors `console.error`
into `desktop-errors.log`, a single `console.error` in these handlers would make
user-reported failures diagnosable; today there is no server-side trace at all.
Fix: log the error, and map known constraint failures to 409 with a real message.
**Confidence: CONFIRMED.**

### M7 — Row waveforms are fabricated for every non-WAV format

`/api/waveform` returns real peaks only for `.wav`; every other extension goes to
`createSeededPeaks` (`route.ts:49-52, 133-152`), a deterministic PRNG seeded on
the file path. The player, meanwhile, decodes the real audio in the browser
(`src/lib/client-waveform.ts:94-131`). So the same MP3 shows invented peaks in
the list and its true shape in the transport bar. For a tool whose users scan
waveforms to find sounds, showing convincing fake data is worse than showing a
flat bar. Fix: either label the placeholder honestly (flat/neutral) or run the
row peaks through the same decode path as the player, cached.
**Confidence: CONFIRMED.**

### M8 — Two waveform pipelines with two caches and two definitions of "peaks"

Server: read WAV, 16-bit assumption, mean-absolute, 32–512 peaks, in-memory
`Map(256)` on the client. Client: fetch whole file, `AudioContext.decodeAudioData`,
channel 0, 200 peaks, IndexedDB cache keyed `mtimeMs:fileSize`. Neither reuses
the other. One of them should own peak generation and both surfaces should read
its cache. This is the main duplicated-logic finding in the codebase.
**Confidence: CONFIRMED.**

### M9 — Previewing a sound downloads it twice

`useAudioPlayback` creates `new Audio('/api/audio?id=…')` (`:58`) and, in a
separate effect, `computeAndCachePeaks` fetches the *same* URL in full and
decodes it (`:103-118` → `client-waveform.ts:104-116`). On a cache miss, a
100 MB WAV is transferred and buffered twice and fully decoded once, per
preview. Rapid J/K browsing (`handleMoveSelection`, `page.tsx:1739`) starts and
aborts one of these per keypress. Fix: fold into M8 — have the row/player share
one cached peak source rather than decoding on preview.
**Confidence: CONFIRMED.**

### M10 — Adding an extension requires editing five app-owned files

Despite the manifest/command/permission protocol, a new extension must touch:
`src/lib/extensions/registry.ts` (a hand-written `if (!registry.has(...))`
block per extension, `:70-113`); a bespoke route under
`src/app/api/extensions/<name>/<verb>/route.ts` (because
`/api/extensions/execute` rejects any `input`, `execute/route.ts:28-33`); a
bespoke dialog in `src/components/extensions/<name>/`; a new branch in
`interpretExtensionUiIntent` (`src/lib/extensions/ui-intent.ts:56-79`); and
often a hand-written settings panel — `DropRulesSettingsPanel` occupies
`SettingsDialog.tsx:1437-1789` even though `ExtensionSettingControl` (`:1815`)
already renders declared settings generically. See **R1** for the proposed
shape. **Confidence: CONFIRMED.**

### M11 — The desktop server depends on a Next.js private module and an env-var side channel

`electron/main/next-server.cjs:54-67` imports
`next/dist/server/lib/start-server`, sets `NEXT_PRIVATE_START_TIME`, asks for
`port: 0`, and then reads the actual port back out of `process.env.PORT`. None of
that is public API. A Next minor upgrade can move the module, stop populating
`PORT`, or change the `startServer` signature, and the failure mode is "the
packaged app shows a blank window" — the hardest kind to diagnose. Mitigation:
wrap it in one adapter module with an explicit version check and a startup
assertion that `process.env.PORT` is set, so the failure is loud and localized.
**Confidence: CONFIRMED** (private path), **POSSIBLE** on the breakage timing.

### M12 — `postinstall` downloads and executes a native binary with no integrity check

`scripts/postinstall.cjs:70-91` downloads
`better-sqlite3-v12.9.0-node-v137-<platform>-<arch>.tar.gz`, extracts it via
`execSync("tar -xzf …")` into `node_modules`, and the resulting `.node` is loaded
into the Next server process. There is no checksum or signature check, and
`downloadWithRedirects` (`:36-67`) will follow a redirect to plain `http`
(`const isHttps = currentUrl.startsWith("https")` picks the module per hop). The
ABI number `137` and version `12.9.0` are also hardcoded, duplicating
`package.json`. Fix: pin to https-only redirects, verify a known SHA-256, and
read the version from `package.json`. **Confidence: CONFIRMED.**

### M13 — 9,429 lines of throwaway prototype routes ship in the production build

`src/app/prototype/{app-v2,audit,extensions-diagram,redesign,revised-v2,showcase}`
are ordinary App Router routes and are compiled into every build, including the
packaged desktop app. Among them, `/prototype/audit` renders an internal
findings dashboard describing the app's own security weaknesses, and
`src/app/prototype/redesign/workspace.tsx` alone is 2,138 lines. The repo's own
recorded decision says "prototype routes are throwaway … must not ship as
product" (`src/app/prototype/audit/audit-data.ts:511`). Fix: gate the directory
behind an env check in `next.config.ts` (or move the routes to a
`(prototype)` group excluded from `build:desktop`). **Confidence: CONFIRMED.**

### M14 — Every uncaught main-process error opens a modal dialog and the app keeps running

`electron/main/errors.cjs:22-35` calls `dialog.showErrorBox` unconditionally, and
`electron/main.cjs:54-56` routes `process.on("uncaughtException")` into it. A
repeating error produces a stack of modal dialogs on top of an application that
is now in an undefined state. Fix: log always, show the dialog once per session
(or only for startup failures), and let genuinely fatal exceptions terminate.
**Confidence: CONFIRMED.**

### M15 — Search is an unescaped `LIKE '%…%'` full scan

`file-repository.ts:127` interpolates the user query into
`like(filename, '%' + query + '%')`. Drizzle parameterises the value, so this is
not injection, but `%` and `_` are not escaped — searching for `50%` matches
everything — and a leading-wildcard `LIKE` cannot use `idx_files_filename`, so
every search is a full table scan. At 15,877 rows that is fine; at 500k it is
not, and it is the only search the app has. Fix now: escape the wildcards.
Fix later: an FTS5 virtual table over `filename` (and eventually tags), which
also gives token-order-independent matching that users of sound libraries
expect. **Confidence: CONFIRMED.**

### M16 — `getFileCount` ignores four filters that `getFiles` honours

`getFileCount` (`file-repository.ts:166-196`) handles `query`, `favorites`,
`collectionId` and `showRemoved`, but silently drops `directory`, `libraryRoot`,
`atLibraryRoot` and `tagId`. Today the only caller passes `{ favorites: true }`,
so nothing is broken — but the two functions take the *same* `FileSearchQuery`
type, so the next caller that asks for a directory count will get a
library-wide number with no error. Fix: extract the shared predicate builder so
both read from one place. **Severity: MEDIUM (latent). Confidence: CONFIRMED.**

### M17 — `getTagsForFiles` has no chunking and is one constant away from breaking

`tag-repository.ts:65-85` puts every file id into a single `inArray`. It is safe
only because `MAX_PAGE_SIZE` is 500 (`src/app/api/files/route.ts:9`) and SQLite's
default variable limit is 999. `file-repository.ts:15-25, 230-249` already has
`chunkArray` and `SQLITE_MAX_VARIABLES` for exactly this. Raising the page size
to 1000 would produce a runtime error in an unrelated file.
**Confidence: CONFIRMED.**

### M18 — Weak request validation on tags and collections

`/api/tags` `POST` accepts any truthy `name` without a `typeof` check
(`route.ts:28-31`); `/api/collections` `POST` attaches a file to a collection
without verifying either id exists (`route.ts:34-37`), so a bad id surfaces as
a foreign-key failure and a generic 500. `sound-shelf/{add,remove}` check
`Array.isArray(fileIds)` but not the element types
(`add/route.ts:15-20`). None of these is exploitable in a local single-user app,
but they all turn user-visible errors into unexplained 500s. Fix: a small shared
body-validation helper; the codebase does not need a schema library for this.
**Confidence: CONFIRMED.**

---

## Low Priority

- **L1 — `scanStatus` in `src/lib/scanner/scan-state.ts` is written and never read.**
  `run-scan.ts:58-60` mirrors every progress update into it via `Object.assign`;
  `getScanStatus` reads from the runner instead (`:66-73`). Delete the module.
  **CONFIRMED.**
- **L2 — `EventBus` has zero emitters and zero subscribers.** Constructed in
  `composition-root.ts:42`, handed to every extension context as
  `services.events` (`:85`). A repo-wide grep for `.emit(` / `.subscribe(`
  outside `yard-core` returns nothing. **CONFIRMED.**
- **L3 — Six `yard-core` interfaces have no implementations and no consumers:**
  `SearchService`, `BrowseService`, `MetadataService`, `DesktopService`,
  `DesktopFileResolver`, `YardCoreError` (verified: 0 references outside
  `packages/yard-core/src`). They are exported from the package index, so they
  read as public API. **CONFIRMED.**
- **L4 — `src/components/extensions/rename-hammer/` is an empty directory**
  left behind by a removed extension. **CONFIRMED.**
- **L5 — `drizzle.config.ts` points at `./foleyard.db`; the real database is
  `foleyard.sqlite` and there is no `drizzle/` output directory.** Migrations are
  hand-rolled in `src/lib/database/migrations.ts`. `drizzle-kit` is a dev
  dependency that cannot currently do anything. Either wire it up or drop it and
  say so in a comment. **CONFIRMED.**
- **L6 — Unused dependencies:** `@radix-ui/react-dropdown-menu` and
  `@radix-ui/react-slider` (0 imports — the UI is on `@base-ui/react`),
  `sql.js` (0 imports; a full WASM SQLite build), `@types/uuid@^11` (uuid v14
  ships its own types and the major versions no longer correspond).
  **CONFIRMED.**
- **L7 — Both `bun.lock` and `package-lock.json` are tracked.** CI installs with
  bun; the npm lockfile is 348 KB of drift waiting to happen. Keep one.
  **CONFIRMED.**
- **L8 — `src/lib/dotmatrix-core.tsx` (782 lines) + `dotmatrix-hooks.ts`
  (226 lines) exist to render one decorative status dot.** The only consumer is
  `src/components/ui/dotm-square-3.tsx`, whose only consumer is
  `SettingsDialog.tsx:602`. See **R3**. **CONFIRMED.**
- **L9 — `simulateUpdate` ships in production.** `electron/main/auto-updater.cjs:92-147`
  is exposed through `ipc.cjs:82-85` and `preload.cjs:47` with no `isPackaged`
  guard, so the shipped app has an IPC endpoint that fakes an update flow.
  **CONFIRMED.**
- **L10 — `startScan` resets the scan status twice** (`scan-runner.ts:289` then
  `:456`), emitting two identical progress events. Harmless, confusing.
  **CONFIRMED.**
- **L11 — `confirmTagDelete` stays armed across tags.** `OrganizeView.tsx:95`
  is a single boolean; pressing Escape (`:186`) clears `editingTag` but not
  `confirmTagDelete`, so opening rename on the next tag shows a pre-armed
  "Sure?" button. Collections use the `confirmDeleteId` pattern correctly.
  **CONFIRMED.**
- **L12 — `/api/waveform?peaks=abc` returns `{"peaks":[]}`.**
  `Number("abc")` → `NaN` → `Math.max(32, Math.min(512, NaN))` → `NaN` → the
  loop body never runs (`route.ts:35, 63, 109`). **CONFIRMED.**
- **L13 — `setLibraryRoots` writes `libraryRoot` and `libraryRoots` in two
  un-transacted statements** (`settings-repository.ts:60-87`), storing the same
  fact twice; a failure between them desynchronises the legacy and current keys.
  **CONFIRMED.**
- **L14 — Drop Rules staging copies are never cleaned up.** Each drag copies the
  file into the staging directory (`drop-rules/src/service.ts:88-93`) with no
  eviction; with the default blank setting this lands in the OS temp directory,
  so it is bounded by OS cleanup rather than by the app. **CONFIRMED.**
- **L15 — `desktop` is computed during render from `window.desktopBridge`**
  (`desktop-actions.tsx:15`) and changes the table's grid template
  (`FileTable.tsx:173-176`), so the prerendered HTML and the first client render
  disagree in the desktop app. **POSSIBLE** (not observed; worth a look in
  devtools).
- **L16 — `eslint .` exits 1** on `page.tsx:241` (`react-hooks/set-state-in-effect`)
  plus five unused-arg warnings. The effect at `:239-249` prunes selection state
  after `orderedFiles` changes; it can be derived at render or folded into the
  place that sets `files`. **CONFIRMED.**

---

## Performance Opportunities

Ranked by expected impact on a realistic library (50k–200k files).

**Measurable / high impact**

1. **H6 — Folder Janitor's sequential `existsSync` + `stat` per file.** Two
   blocking syscalls per file on the same thread that serves audio. The single
   largest stall in the app.
2. **H8 — Whole-file reads in `/api/waveform`, with no persistent cache.**
   Burst allocation during scrolling; repeats every launch. Streaming the data
   chunk plus an `mtime`-keyed cache removes essentially all of it.
3. **H7 — N requests per bulk action.** 500-file operations become 1,000
   requests and 1,000 transactions; a batched endpoint makes it one of each.
4. **H9 — Five-endpoint refetch per mutation + per-smart-collection full `LIKE`
   scan.** Turns a rename into the most expensive operation in the app.
5. **M9 — Double download and full decode per preview.** Directly hurts the core
   J/K browsing loop on large files.
6. **M1 — `SELECT directory` over all files to derive the directory tree.**
   25× read amplification measured on the current database; grows linearly.

**Likely useful**

7. **M3 — Restore `memo` on file rows** by stabilising the desktop-action
   callbacks. Every search keystroke currently re-renders ~30 rows and their
   waveform components.
8. **M15 — Escape `LIKE` wildcards now, FTS5 later.** The full scan is
   acceptable at 16k rows and not at 500k.
9. **M2 — `idx_file_collections_collection_id`.** One line; prevents a
   full scan of the join table once collections are actually used.
10. **H3 — Replace the 1 ms busy-wait drain loop.** Removes ~1,000 timer
    wakeups/second for the whole metadata phase (and fixes the correctness bug).
11. **`/api/files` computes `getFileCount({favorites:true})` on every page**,
    including every infinite-scroll page (`route.ts:66`). Send it on the first
    page only, or with mutations that change it.

**Micro-optimisation — not worth doing**

- `selectedIds.includes(...)` per row (M3's footnote) — real but negligible next
  to the re-render it rides along with; fix it opportunistically.
- `paletteSounds` remapping the file list when the palette is closed
  (`page.tsx:1955-1965`) — a few thousand object allocations on an interaction
  boundary. Ignore.
- `resolveExistingPathWithinRoots` calling `realpath` on each root per request —
  microseconds against a file stream.
- `new Date().toISOString()` twice per upsert in `file-repository.ts:269/287` —
  irrelevant.

---

## Extensibility / Architecture

**What is good.** The dependency direction documented in
`docs/architecture/extensions.md` is actually respected: `yard-tools/*` import
only from `yard-core`, never from `src/`. `yard-core` imports no React, no Next,
no Electron. The repository classes take an injected `Database`, so they are
testable without a global (`file-repository.test.ts` does exactly this). The
pure-logic extraction — `selection.ts`, `transport-queue.ts`,
`command-palette.ts`, `shortcuts.ts`, `scan-runner.ts` behind `FileSystemSeam`
and `MetadataSeam` — is the best structural decision in the codebase and is why
178 tests exist at all.

**What is fragile.**

- *The extension boundary leaks in five directions* (M10). The protocol says
  "declare a manifest and commands"; the reality requires a route, a dialog, an
  intent branch and often a settings panel. The `input`-rejecting
  `/api/extensions/execute` (`route.ts:28-33`) is the specific reason every
  extension needs its own route: there is no way to pass validated input through
  the generic endpoint. That single restriction generates most of the per-tool
  duplication.
- *Permissions are self-granted.* `YardExtensionHost` builds the permission
  checker from `extension.manifest.permissions` (`extension-host.ts:99`), so
  `permissions.require("files:delete")` can only fail if the extension author
  forgot to declare it in their own manifest. Today this is a useful lint and
  a useful piece of documentation in the extension detail dialog. It is not a
  gate, and the code reads as though it were. Either say so in
  `docs/architecture/extensions.md`, or introduce user consent (the natural
  home is the enable toggle).
- *Two composition roots.* `src/lib/composition-root.ts` builds one object graph
  over its own connection; `src/lib/db.ts` re-exports ~40 free functions bound to
  a lazily created singleton; `src/lib/scanner/run-scan.ts:31-61` assembles a
  third by hand-packing those free functions into a `fileRepo` literal. Three
  ways to get a repository, two connections (H2). The free-function facade is
  convenient for route handlers and worth keeping — but it should be built *from*
  the composition root, not beside it.
- *`src/app/page.tsx` at 2,749 lines* holds every fetch, every mutation, every
  optimistic update, palette state, shortcut state, queue wiring and eight
  dialogs. It is a deliberate decision ("one giant client orchestrator") and it
  genuinely does make cross-view state trivial to share. But it is now the
  reason H7's rollback logic is subtle, the reason M3's re-render blast radius is
  the whole app, and the reason `loadInitialData` is used as a
  refresh-everything hammer. It does not need a rewrite; it needs its data
  layer lifted out (**R2**).
- *Extension-specific UI in the app's settings dialog.* `DropRulesSettingsPanel`
  is ~350 lines inside `SettingsDialog.tsx`, next to a generic
  `ExtensionSettingControl` that already handles the declared setting types. The
  generic path exists; the bespoke one competes with it.

**Boundaries that should exist but do not.**

- A *filesystem access boundary*. `resolveExistingPathWithinRoots` is the right
  primitive but it is applied ad hoc: four callers use it, two comparable
  endpoints do not (H1), and Electron maintains a *second*, independent notion
  of allowed paths in `granted-paths.cjs`. One module should own "which paths may
  this process touch, and why", and every filesystem-touching route should go
  through it.
- A *peak-generation boundary* (M8). Two implementations, two caches, two
  answers for the same file.

**Boundaries that exist but provide no value today.** The six unimplemented
`yard-core` service interfaces (L3) and the `EventBus` (L2). They cost nothing at
runtime but they are load-bearing in the *documentation* — a reader of
`docs/architecture/yard-core.md` will reasonably assume `SearchService` is how
search works. Delete them or mark them explicitly as reserved.

**Dependency direction** is correct throughout:
`app → yard-tools → yard-core`, with `app → electron` only via the preload
bridge type. No cycles were found between `src/lib`, `packages/yard-core` and
`packages/yard-tools`.

---

## Simplification Opportunities

1. **Delete `src/lib/dotmatrix-core.tsx` + `dotmatrix-hooks.ts` (~1,008 lines).**
   A configurable dot-matrix animation engine — phase resolvers, spiral ordering,
   reduced-motion handling — whose entire production footprint is one status
   indicator in the settings dialog (`SettingsDialog.tsx:602`). Replace with a
   ~20-line component or a CSS animation. Highest lines-removed-per-risk in the
   repo.
2. **Delete `src/lib/scanner/scan-state.ts`** and the `onProgress` mirror in
   `run-scan.ts:58-60` (L1).
3. **Delete the six unimplemented `yard-core` interfaces and the `EventBus`**
   (L2, L3), or move them to a clearly-labelled `reserved/` module.
4. **Delete `src/components/extensions/rename-hammer/`** (L4).
5. **Collapse `getSubdirectories` into `getSubdirectoriesForRoot`.** Only the
   root-scoped variant is reachable from `/api/directories`, and the two
   normalise paths differently (M1's footnote).
6. **Remove `DropRulesService.apply` / `preview`.** No route reaches them:
   `/api/extensions/execute` rejects `input`, and the only Drop Rules route is
   `prepare-drag`. Roughly 100 lines of unreachable path-handling code
   (`drop-rules/src/service.ts:22-58, 116-…`). Verify against
   `commands.ts` before deleting — they are registered, just not callable.
7. **Fold `DropRulesSettingsPanel` into the generic setting renderer** (M10).
   The panel's real value is the rename-pattern *preview*; that is one
   component, not 350 lines of bespoke layout.
8. **Drop `@radix-ui/*`, `sql.js`, `@types/uuid`** (L6) and one of the two
   lockfiles (L7).
9. **`uuid` → `crypto.randomUUID()`.** Three call sites, all server-side on
   Node 22. Removes a dependency and its types package. Low value, near-zero
   risk — bundle with other cleanup.

Counter-note: do **not** collapse the `src/lib/db.ts` facade into direct
repository imports. It reads as indirection but it is what keeps 15 route
handlers from each knowing about connection construction, and it is the seam
that makes H2's fix a one-file change.

---

## Dependency Review

| Package | Finding |
|---|---|
| `@radix-ui/react-dropdown-menu`, `@radix-ui/react-slider` | **Unused.** Zero imports; the UI layer is `@base-ui/react`. Remove. |
| `sql.js` | **Unused.** Zero imports. A full WASM SQLite build carried for nothing. Remove. |
| `@types/uuid@^11` | **Stale.** `uuid@^14` ships its own types; the major versions no longer track. Remove (or remove `uuid` entirely — see Simplification 9). |
| `drizzle-kit` | **Misconfigured** (L5). `drizzle.config.ts` names a database file that does not exist and an `out` directory that was never generated. Migrations are hand-rolled. |
| `next-themes` | **Marginal.** One consumer: `useTheme` in `src/components/ui/sonner.tsx:3`. The app hardcodes `className="dark"` in `layout.tsx:20`, so the hook always resolves the same way. Keep only if a light theme is planned; otherwise pass `theme="dark"` to `Toaster` and drop it. |
| `better-sqlite3` | **Correct choice**, but the native-module handling is the most fragile part of the build (M12, and the `NODE_MODULE_VERSION = "137"` hardcode in `postinstall.cjs:9`). |
| `music-metadata`, `@tanstack/react-virtual`, `sonner`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge` | Appropriately used, no notes. |
| `shadcn` | Used as a *runtime* dependency for `@import "shadcn/tailwind.css"` (`globals.css:3`). Unusual but deliberate; leave it. |
| `next@16.2.6` / `react@19.2.6` | Current. The private-API coupling in M11 is the risk here, not the versions. |
| Peer/version consistency | `overrides` pins `@types/react`/`@types/react-dom` to match `react@19.2.6`. Correct and deliberate. |

No deprecated packages and no known-vulnerable versions were found in the
manifest. Two lockfiles for one project is the main hygiene problem (L7).

---

## Dead / Duplicate Code

**Dead**

- `src/lib/scanner/scan-state.ts` — entire module (L1).
- `packages/yard-core/src/events/event-bus.ts`, `event-types.ts` — no emitters,
  no subscribers (L2).
- `packages/yard-core/src/services/search/{search-service,browse-service}.ts`,
  `services/library/metadata-service.ts`,
  `services/desktop/desktop-service.ts`,
  `errors/yard-core-error.ts` — no implementations, no consumers (L3).
- `src/components/extensions/rename-hammer/` — empty directory (L4).
- `SqliteBrowseRepository.getSubdirectories` — unreachable from any route
  (`/api/directories` only calls `getSubdirectoriesForRoot`).
- `DropRulesService.apply` / `preview` — no route can supply `targetDirectory`.
- `needsFullParse` in `src/lib/metadata.ts:46-56` — unreachable during scans
  because the runner always passes `fullParse: false` (H4).
- `SqliteSettingsRepository.clearLibraryData` — wired into the scan runner's
  `settingsRepo` (`run-scan.ts:51`) and never called. Note it deletes *tags and
  collections* as well as files, which is not what "clear library data" implies.
- `src/app/prototype/**` — 9,429 lines of intentionally-throwaway routes that
  currently ship (M13).
- `src/app/prototype/audit/audit-data.ts` — 44 findings from a previous audit
  pass, several of which are now **false** (e.g. `S1` claims
  `/api/waveform` takes a `?path=` parameter; it takes `?id=` and resolves
  through `resolveExistingPathWithinRoots`. `S3` claims `sandbox:false`;
  `window.cjs:39` sets `sandbox: true`). Stale audit data in the tree is worse
  than none — refresh it or delete it.

**Duplicate**

- **Database path resolution** exists twice: `src/lib/database-path.ts` and
  `electron/main/database.cjs`, with independently maintained legacy-name lists
  (`SoundSlop` / `soundslop.sqlite`). They agree today by discipline alone.
- **Peak generation** exists twice with different algorithms and caches (M8).
- **Library root storage** exists twice in the settings table (`libraryRoot`
  and `libraryRoots`, L13).
- **Filter-building** is duplicated between `getFiles` and `getFileCount`, and
  they have already diverged (M16).
- **Filename sanitisation** is duplicated between
  `make-pack/src/service.ts:192,196` and `library-gatherer`'s
  `makeUniqueOutputPath` — same regex, different function.

---

## Testing Gaps

The existing suite (30 files, 178 tests, 2.6 s) is well aimed: it covers the pure
logic where bugs are cheap to write and expensive to find. The regex-guard tests
(`root-height-chain.test.ts`, `theme-tokens.test.ts`) are a pragmatic answer to
having no DOM environment and should stay.

Worth adding, in order of the cost of the failure they prevent:

1. **A build/type gate in CI** (C2). Not a test, but it protects more than any
   test here would.
2. **Scan resilience.** `scan-runner.test.ts` should cover: a metadata backlog
   larger than the drain timeout (H3); a file with null metadata being re-queued
   on the next scan (H4); one unreadable Library root among several, asserting
   that files under the healthy roots are not marked removed.
3. **Filesystem boundary enforcement.** One table-driven test per
   filesystem-touching route asserting that a path outside the Library roots is
   rejected. This is the test that would have caught H1, and it keeps catching
   it as routes are added.
4. **`getFiles` / `getFileCount` agreement** (M16) — same query object, counts
   consistent with the returned rows. `file-repository.test.ts` already has the
   in-memory-database harness for this.
5. **Folder Janitor over a folder with more than 500 files** (H5).
6. **WAV peak extraction for 24-bit and stereo files** (H8), plus the
   `?peaks=abc` case (L12).
7. **`/api/files` DELETE with `permanent: true`** — it unlinks from disk
   (`route.ts:128`) and has no test at all. Highest-consequence code path in the
   HTTP layer.

Low value, do not add: snapshot tests of the prototype routes; tests for
`item-colors.ts` beyond what exists; anything asserting Tailwind class strings.

---

## Security / Reliability

The threat model is recorded as "local-first, no auth; the trust boundary is the
local machine", and the Electron hardening is genuinely good: `contextIsolation:
true`, `sandbox: true`, `nodeIntegration: false`, devtools gated on
`!app.isPackaged || shouldOpenDevTools()`, and a preload that exposes a
fixed, fileId-oriented API surface (`preload.cjs`). Desktop actions resolve file
ids through the index rather than accepting raw paths
(`desktop-service.cjs:12-30`). Several findings from the earlier audit pass have
clearly been fixed since.

Remaining, in order:

1. **H1 — unguarded arbitrary read/copy/write** via
   `library-gatherer` and `make-pack` destinations. The most material issue,
   because it is inconsistent with four sibling endpoints that do enforce
   containment.
2. **M12 — unverified native binary download** in `postinstall`, with an
   https→http redirect path. Affects developers and CI, not end users.
3. **The localhost API is unauthenticated.** Consistent with the stated model
   and mitigated by the random port and by browsers' CORS preflight on
   `application/json` requests. Worth *writing down* as an accepted risk next to
   `DELETE /api/files { permanent: true }`, which unlinks files from disk with
   no undo and no trash — that endpoint deserves an explicit note wherever the
   trust boundary is documented.
4. **Error messages leak absolute paths.** `extension-host.ts:137` returns raw
   `error.message` to the client; the filesystem services embed full paths in
   their errors. Harmless locally, relevant if any surface is ever shared.
5. **M14 — modal error-box storm** on repeating main-process exceptions, with
   `uncaughtException` keeping a possibly-corrupt process alive.
6. **No `busy_timeout`** on either SQLite connection (H2), so lock contention
   fails immediately rather than retrying.
7. **Observability gap** (M6). Route handlers swallow errors without logging,
   even though `next-server.cjs` already tees `console.error` to
   `desktop-errors.log`. Right now a user reporting "creating a tag failed"
   leaves no trace anywhere.
8. **L9 — `simulateUpdate` reachable in the packaged app.**

No secrets are committed. `.env*` is ignored; the only credential reference is
`secrets.RELEASE_TOKEN` in the workflow, used correctly.

---

## Suggested Refactors

### R1 — Make extensions additive instead of five-file changes

- **Current structure.** Per extension: a hand-written registration block in
  `registry.ts`; one or more `/api/extensions/<name>/<verb>/route.ts` files
  (because `/api/extensions/execute` rejects `input`); a bespoke dialog under
  `src/components/extensions/<name>/`; a branch in `ui-intent.ts`; sometimes a
  bespoke panel in `SettingsDialog.tsx`.
- **Proposed structure.** (a) A single `EXTENSIONS` array that
  `registerAllExtensions` iterates, so registration is data. (b) Allow `input`
  through `/api/extensions/execute`, validated by a per-command input schema
  declared on the command (the host already throws
  `YardCommandValidationError`, and `hostFailureStatus` already maps it to 400) —
  then extension-specific routes exist only when an extension needs something
  genuinely different. (c) Register UI intent handlers from a map keyed by intent
  type rather than an `if` chain. (d) Render extension settings through the
  existing `ExtensionSettingControl`, with an optional per-setting `preview`
  hook for cases like the rename pattern.
- **Reason.** M10. The protocol already exists; the wiring does not honour it.
- **Affected files.** `src/lib/extensions/registry.ts`,
  `src/app/api/extensions/execute/route.ts`,
  `packages/yard-core/src/extensions/extension-command.ts`,
  `src/lib/extensions/ui-intent.ts`, `src/components/SettingsDialog.tsx`,
  and the six `packages/yard-tools/*/src/commands.ts`.
- **Expected benefit.** A new extension becomes: a package, plus one entry in
  one array. It also collapses six near-identical route files.
- **Migration risk.** Medium. Opening `execute` to `input` re-opens a boundary
  that was deliberately closed — do it *with* the per-command validation, not
  before. Migrate one extension (sound-shelf, the simplest) end to end first.

### R2 — Lift the data layer out of `page.tsx`

- **Current structure.** 2,749 lines: ~40 `useState`, ~60 `useCallback`, all
  fetching, all optimistic updates, all rollbacks, plus eight dialogs.
- **Proposed structure.** Extract three hooks that own their own remote state
  and expose mutations — `useLibraryFiles` (list, pagination, sorting,
  optimistic favourite/tag updates), `useLibraryOrganization` (collections,
  tags), `useExtensionCatalog` (extensions, settings, shelf count). `page.tsx`
  keeps view/selection/palette/dialog state and composition. No state-management
  library needed; these are three custom hooks.
- **Reason.** It unblocks H7 (batch mutations need one owner of the optimistic
  update), H9 (targeted refetch instead of `loadInitialData`), M3 (a stable
  callback surface), and M5 (server-side sort).
- **Affected files.** `src/app/page.tsx`, new `src/hooks/use-library-*.ts`,
  `src/components/FileTable*`.
- **Expected benefit.** The largest file in the repo drops to roughly a third;
  the mutation paths become individually testable.
- **Migration risk.** Medium-high — this is the file every feature touches.
  Do it one hook at a time, on a branch, with the app running. Do **not**
  attempt it in the same change as H7.

### R3 — Collapse the dot-matrix engine

- **Current.** `dotmatrix-core.tsx` (782) + `dotmatrix-hooks.ts` (226) +
  `dotm-square-3.tsx` (~60), one consumer.
- **Proposed.** One ~20-line component (or a CSS keyframe animation) in
  `src/components/ui/`.
- **Reason.** L8 — an abstraction with a single call site and no second
  candidate.
- **Affected files.** Three deletions, one small addition,
  `SettingsDialog.tsx:602`.
- **Expected benefit.** ~1,000 lines removed; one less thing to maintain
  through a React upgrade.
- **Migration risk.** Very low. It is decorative; the worst case is a slightly
  different animation.

### R4 — One filesystem access module

- **Current.** `resolveExistingPathWithinRoots` used by four callers; skipped by
  two (H1); a parallel granted-path registry in Electron; per-tool containment
  checks inside `folder-janitor`.
- **Proposed.** A single `src/lib/filesystem-boundary.ts` exposing
  `resolveReadable(path)`, `resolveWritable(path)` and `grant(dir)`, backed by
  Library roots plus session grants, with the Electron picker feeding grants
  through it. Every route that touches the filesystem calls one of the three.
- **Reason.** H1, plus the duplicate notion of "allowed path" across the process
  boundary.
- **Affected files.** `src/lib/filesystem-boundary.ts`, the six filesystem
  routes, `electron/main/{granted-paths,desktop-service,ipc}.cjs`,
  `packages/yard-tools/folder-janitor/src/service.ts`.
- **Expected benefit.** New endpoints become secure by default; the boundary
  becomes testable in one place (Testing Gap 3).
- **Migration risk.** Medium — user-visible if a previously-working destination
  folder is now rejected. Ship the grant flow before the enforcement.

---

## Quick Wins

Low risk, small scope, meaningful benefit — roughly in the order I would do them:

1. Fix the three type errors (**C1**) — 3 lines, unblocks every build.
2. Add the CI workflow (**C2**) — ~30 lines.
3. Fix `page.tsx:241` so `eslint` is green (**L16**).
4. Un-ignore `/docs` and `AGENTS.md` and commit them (**H10**).
5. `SELECT DISTINCT directory` in `getUniqueDirectories` (**M1**) — one line,
   removes a 25× read amplification.
6. `CREATE INDEX IF NOT EXISTS idx_file_collections_collection_id` (**M2**) —
   one line in `migrations.ts`.
7. `sqlite.pragma("busy_timeout = 5000")` (**H2** partial) — one line.
8. Pass an explicit limit in `folder-janitor/scan-folder` (**H5**) — one line,
   fixes a silently-wrong report.
9. Scope the `scrollToIndex` effect to `selectedFileId` (**M4**) — one dependency
   array.
10. `useCallback`/`useMemo` in `useFileTableDesktopActions` (**M3**) — restores
    row memoisation.
11. `console.error` in the mutation route catches (**M6**) — makes failures
    visible in `desktop-errors.log`.
12. Delete `scan-state.ts`, `rename-hammer/`, and the unused dependencies
    (**L1, L4, L6, L7**).
13. Validate `?peaks=` with the existing integer parser (**L12**).
14. Guard `simulateUpdate` behind `!app.isPackaged` (**L9**).

---

## Larger Improvements

Need deliberate implementation, a branch, and a plan:

- **R4 / H1** — the filesystem boundary and the grant flow. Do this before
  adding any further filesystem-touching tools.
- **H3 + H4** — scan reliability: drain-promise instead of busy-wait, retry
  incomplete metadata, make `status.errors` meaningful. Ship with tests.
- **H8 + M7 + M8 + M9** — one peak pipeline with one persistent cache, honest
  about formats it cannot analyse. This is a single coherent piece of work and
  it removes the largest duplication in the codebase.
- **R2** — extracting the data layer from `page.tsx`, which then unblocks
  **H7** (batch mutation endpoints) and **H9** (targeted refetch) and **M5**
  (server-side sort).
- **R1** — the extension wiring, once R2 has settled `page.tsx`.
- **M13** — excluding prototype routes from the production build; decide at the
  same time whether `/prototype/audit`'s data is refreshed or removed.
- **M11** — an adapter with a loud startup assertion around the Next private
  server API, before the next Next.js major.
- **M15** — FTS5 for search, once the library sizes justify it. Not yet.

---

## Do Not Change

Areas I looked at closely and concluded are fine as they are:

- **`src/lib/db.ts` as a free-function facade.** It looks like needless
  indirection over the repository classes. It is not: it keeps 15 route handlers
  ignorant of connection construction and it is the seam that makes the
  two-connection fix (H2) a single-file change.
- **The lazy `Proxy` around the SQLite connection** (`connection.ts:60-72`).
  Unusual, but it is what lets modules import `db`/`sqlite` at module scope
  without opening a database during Next's build-time module evaluation. The
  `as unknown as Database` casts it forces are a fair price.
- **Soft deletes everywhere** (`removed_at`), with only explicit user action
  unlinking from disk. Exactly right for a media library.
- **The scan's change detection** (size + mtime + directory + `removedAt`) and
  `reconcileMovedFiles`' conservative "relink only on a unique metadata match"
  rule (`file-repository.ts:477`). The single-match requirement is the correct
  trade-off: it under-relinks rather than merging the wrong files.
- **Remount-per-track playback** (a new `Audio` element per file,
  `use-audio-playback.ts:56-101`). Correctness-via-teardown beats element reuse
  for a preview player, and the cleanup is complete.
- **The regex-guard tests** (`root-height-chain.test.ts`,
  `theme-tokens.test.ts`). They look like anti-patterns; the comment in the first
  explains precisely why they exist (no layout engine available) and what bug
  they lock down. Keep them, and keep the comments.
- **Dark-only theming** with vestigial light tokens. A deliberate product
  decision, cheap to carry, easy to reverse later.
- **The hand-rolled ZIP writer** (`make-pack/src/zip.ts`). Stored-mode only,
  ZIP64-aware, ~166 lines, avoids a dependency for a well-specified format, and
  it has tests. Justified.
- **The extension detail dialog and permission display.** Even though
  permissions are self-granted (see Architecture), showing users what a tool
  claims it will do is worth the code.
- **`page.tsx` being large *per se*.** The problem is what it owns (R2), not its
  line count. Splitting it by size rather than by responsibility would make it
  worse.

---

## Recommended Order of Work

1. **Unblock and protect the build.** C1 (type errors) → L16 (lint) → C2 (CI on
   push/PR). Nothing else should land before this; every later item is safer
   with it in place.
2. **Correctness and security.** H1 + R4 (filesystem boundary and grants) →
   H5 (Janitor truncation) → H4 and H3 (scan metadata retry and drain) →
   M6 (log server errors) → M18 (request validation) → M12 (postinstall
   integrity).
3. **Architectural blockers.** H2 (single connection, `busy_timeout`) →
   R2 (extract the data layer from `page.tsx`). H2 first — R2 will touch the
   same call sites.
4. **High-impact performance.** H6 (Janitor concurrency) → H8 + M7/M8/M9
   (one peak pipeline) → H7 (batch mutation endpoints, needs R2) →
   H9 (targeted refetch + smart-collection counts) → M1, M2, M3, M4, M5.
5. **Simplification.** R3 (dot matrix) → L1–L4 (dead modules) →
   M13 (prototype routes out of the build) → dependency cleanup (L6, L7) →
   the duplicate helpers in Dead/Duplicate Code.
6. **Extensibility.** R1 (data-driven registration, `input` through `execute`,
   intent map, generic settings). Last, because it is much cheaper once R2 has
   settled `page.tsx` and the simplification pass has removed the noise.
7. **Cleanup and documentation.** H10 (track the docs) can happen at any point —
   do it in step 1 with the CI change. Then reconcile
   `docs/architecture/yard-core.md`'s "Remaining modularity issues" section with
   what is actually true, refresh or delete
   `src/app/prototype/audit/audit-data.ts`, and write down the accepted
   local-trust-boundary risk.

---

## Final Scorecard

| Dimension | Score | Rationale |
|---|---|---|
| **Correctness** | 6 / 10 | Core flows — scan, index, browse, play, organize — are right, and the reconciliation logic is unusually careful. Held back by a handful of real defects with user-visible consequences: silently truncated Janitor reports (H5), metadata that is never retried (H4), a scan that fails at the finish line on large libraries (H3), and sorting that is wrong past the first page (M5). |
| **Architecture** | 7 / 10 | Genuine layering with a respected dependency direction, real seams in the scanner, and pure logic extracted for testing. Docked for three composition roots over two connections, an extension boundary that leaks into five app files, and interfaces that promise more than the wiring delivers. |
| **Maintainability** | 6 / 10 | Consistent naming, no `any`, no `@ts-ignore`, coherent module layout. Docked for `page.tsx` at 2,749 lines owning every concern, `SettingsDialog.tsx` at 1,952 with per-extension panels, ~11,000 lines of prototype and dead code in the tree, and stale audit data that actively misleads. |
| **Performance** | 5 / 10 | Fine at today's 16k files; several paths are O(library) per request and will not scale — whole-file waveform reads, sequential Janitor stats, all-rows directory derivation, N-request bulk actions, refetch-everything after trivial mutations. All are fixable without redesign, which is why this is a 5 and not a 3. |
| **Extensibility** | 5 / 10 | The protocol is well designed and the packages are properly isolated; the cost of actually adding an extension is five app-file edits. The gap between the documented model and the wiring is the whole story here. |
| **Type safety** | 7 / 10 | `strict: true`, zero `any`, zero suppression comments, meaningful domain types. Docked because the project does not currently type-check (C1), and for the `as unknown as Database` and `.all() as T[]` casts that let schema drift through silently. |
| **Reliability** | 5 / 10 | Errors are swallowed at every mutation route with no logging (M6); the metadata phase can fail an otherwise-successful scan and discard buffered work (H3); main-process exceptions spawn modal dialogs while the process keeps running (M14); no `busy_timeout` with two writers (H2). The failure states are unclear to both users and maintainers. |
| **Security** | 6 / 10 | Electron hardening is done properly and desktop actions resolve through the index rather than raw paths — better than most local apps. Docked for two endpoints that read, copy and write arbitrary paths (H1) while four siblings enforce containment, and for an unverified native-binary download (M12). |
| **Test coverage** | 5 / 10 | 178 tests over 30 files, aimed at exactly the right targets (pure logic, scan reconciliation, repositories) and fast. But nothing runs them automatically (C2), no UI behaviour is covered, and the highest-consequence path — permanent delete from disk — has no test at all. |
| **Developer experience** | 4 / 10 | Good conventions, a fast test suite, real domain documentation, a working desktop dev script. Undermined by a broken build on `main`, red lint, no CI, architecture docs that are gitignored, two lockfiles, and a `drizzle-kit` config that points at a database that does not exist. Most of this is a day's work to fix, which is what makes it worth fixing first. |

**Overall: 5.6 / 10 — a well-conceived codebase with a broken safety net.**
The structural decisions here are better than the current state of the tree
suggests. Fix the build, add CI, and close the two filesystem endpoints, and
this moves to a 7 without touching the architecture.
