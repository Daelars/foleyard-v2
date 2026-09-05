# Repository audit, 5 September 2026

27 findings and proposals. The highest-priority work is filesystem writes, stable file identity and stale-request rollback. No production fixes were applied. See [IMPLEMENTATION.md](IMPLEMENTATION.md) for the ordered handoff and running preview.

| Inventoried area | Files | Lines |
| --- | ---: | ---: |
| electron | 12 | 1161 |
| test | 70 | 7518 |
| packages | 75 | 3350 |
| scripts | 8 | 1421 |
| src | 186 | 22466 |
| existing prototype | 33 | 9093 |

Inventory is coverage of the search space, not a claim of line-by-line verification. Review focused on API transport, database queries/mutations, scanner phases, all six extension service/command paths, client loading/optimistic state, waveform/playback, desktop boundary/bootstrap, tests and build/release configuration. Generated/vendor UI and old prototypes received structural review, not an independent behavioral audit.

Five isolated audit tests reproduce current behavior in scratch directories or in-memory SQLite. They confirm E04, B01, E01, B02/B03 and the tag part of B04. Other items are source-traced defects, product decisions or performance hypotheses and have explicit acceptance checks below.

The real-data benchmark is still pending. The included 100,000-row synthetic benchmark reduced directory-query p50 from 0.304 ms to 0.038 ms with a candidate partial composite index. It removed a temporary ORDER BY B-tree. These are warm in-memory samples, not application latency.

## E04 ? P1 ? Drop Rules apply bypasses filesystem grants

drop-rules.apply has no transport adapter, so raw file paths and targetDirectory pass through. Its service copies directly without calling the host filesystem checks.

Source: [packages/yard-tools/drop-rules/src/service.ts](../../packages/yard-tools/drop-rules/src/service.ts).

Proposed change: Hydrate source IDs and resolve every destination through host-owned file operations. Deny filesystem commands without a transport policy.

Acceptance: With Drop Rules enabled, a request outside Library roots or without a destination grant must fail before touching disk.

## B12 ? P1 ? Pack manifest temporary name can destroy an existing file

ZIP creation writes .<packName>-manifest.tmp.json in the destination and unconditionally removes it in finally. The filename is predictable and not reserved exclusively.

Source: [packages/yard-tools/make-pack/src/service.ts](../../packages/yard-tools/make-pack/src/service.ts).

Proposed change: Use an exclusively created operation-owned temporary directory or stream the manifest entry. Reserve the final ZIP exclusively too.

Acceptance: A pre-existing manifest sidecar survives; concurrent same-name exports cannot share or delete each other's temporary files.

## B01 ? P1 ? Gather can overwrite existing audio

library-gatherer/src/service.ts: makeUniqueOutputPath checks only plannedNames; copyFile replaces an existing output. Different-size files bypass duplicate detection.

Source: [packages/yard-tools/library-gatherer/src/service.ts](../../packages/yard-tools/library-gatherer/src/service.ts).

Proposed change: Reserve names against disk and the current plan. Copy exclusively, stage output, then publish a report of actual completed files.

Acceptance: Existing hit.wav survives a gather of another hit.wav, including a destination created after preview.

## B02 ? P1 ? Move detection can merge distinct recordings

reconcileMovedFiles matches name, size and audio metadata, copies tags and collections, then deletes the old identity. No content identity or one-to-one reservation.

Source: [src/lib/database/files/batch.ts](../../src/lib/database/files/batch.ts).

Proposed change: Keep stable file IDs. Treat metadata matches as candidates; require stronger identity before relinking and preserve ambiguous records.

Acceptance: Two distinct same-size recordings never inherit each other's tags. Shelf and recent-pack references survive a real move.

## B03 ? P2 ? Collection search ignores the query

getFiles and getFileCount use a separate collection branch whose filters omit query and favorites.

Source: [src/lib/database/files/reads.ts](../../src/lib/database/files/reads.ts).

Proposed change: Use one filter builder for collection membership plus the other active filters.

Acceptance: A collection query with no matching filename returns zero rows and a zero count.

## B04 ? P1 ? Rollback erases newer edits

rollbackBulkTags restores the whole prior tag list. removeMany restores the entire old file list on failure, even after navigation.

Source: [src/app/library/use-library-files.ts](../../src/app/library/use-library-files.ts).

Proposed change: Associate requests with view generations and per-field mutation versions. Undo only the failed operation when it is still current.

Acceptance: Delayed failure cannot erase a later successful tag or replace files from a newly selected root.

## B05 ? P2 ? New files may need a second scan for metadata

fullParse is existingByPath.get(path)?.duration === null. A new record produces false, and the header parser does not fall back when false.

Source: [src/lib/scanner/reconcile.ts](../../src/lib/scanner/reconcile.ts).

Proposed change: Use header-first parsing with a full-parse fallback in the same job when required fields are missing.

Acceptance: A fixture whose metadata is beyond the first 32 KiB obtains duration on its first scan.

## B06 ? P2 ? Folder Janitor silently truncates at 5,000 files

resolveJanitorScanFolder requests a single page with MAX_SCAN_FOLDER_FILES and returns no truncation flag.

Source: [src/app/api/extensions/execute/transport.ts](../../src/app/api/extensions/execute/transport.ts).

Proposed change: Page through the scoped index or run a cancellable job; report completeness and inaccessible paths.

Acceptance: A folder containing 5,001 files either scans all of them or explicitly reports an incomplete result.

## B07 ? P2 ? Scan folder inspects unrelated roots

The folder transport passes every libraryRoot; FolderJanitorService.scan walks all roots to find empty directories.

Source: [packages/yard-tools/folder-janitor/src/service.ts](../../packages/yard-tools/folder-janitor/src/service.ts).

Proposed change: Carry an explicit scan scope through the command and constrain both file and directory work to it.

Acceptance: Scanning root A/sub never reports or traverses root B.

## B08 ? P2 ? Malformed extension requests escape validation

POST casts request.json to a type, then accesses fields before a try/catch. null and malformed JSON throw.

Source: [src/app/api/extensions/execute/route.ts](../../src/app/api/extensions/execute/route.ts).

Proposed change: Use readMutationBody, validate the entire transport envelope, and map transport failures consistently.

Acceptance: null, malformed JSON, wrong selection types and unknown commands receive controlled client errors.

## B09 ? P2 ? Smart collection conversion builds one huge INSERT

convertToRegularCollection creates one values array for all matches and does not transact membership plus conversion.

Source: [src/lib/database/collection-repository.ts](../../src/lib/database/collection-repository.ts).

Proposed change: Use INSERT SELECT inside one transaction with the collection update.

Acceptance: Convert a large collection beyond SQLite's parameter limit; injected failure leaves the smart collection intact.

## B10 ? P2 ? Remove from library returns on the next scan

Removal sets removedAt; reconciliation treats a rediscovered removed file as changed and clears removedAt.

Source: [src/lib/files/delete-files.ts](../../src/lib/files/delete-files.ts).

Proposed change: Distinguish user exclusions from missing files. Decide whether remove means hide-until-rescan or persistent exclusion, and name it accurately.

Acceptance: A user exclusion survives scans; a temporarily missing file can return normally.

## B11 ? P2 ? Old pagination completion unlocks a newer request

loadFiles resets the loading-more ref; any previous loadMore finally clears it without a request-generation check.

Source: [src/app/library/use-library-files.ts](../../src/app/library/use-library-files.ts).

Proposed change: Give each load-more request ownership of its lock; abort obsolete requests and deduplicate appended IDs.

Acceptance: A delayed old page cannot enable two simultaneous requests for the same new offset.

## E01 ? P1 ? Permissions rely on extension cooperation

createYardExtensionContext exposes options.services unchanged. Permissions come directly from the manifest; services do not enforce them.

Source: [packages/yard-core/src/extensions/extension-context.ts](../../packages/yard-core/src/extensions/extension-context.ts).

Proposed change: Enforce grants in host-owned operations. Keep bundled extensions trusted; isolate processes before allowing third-party executable packages.

Acceptance: An extension with no write grant cannot mark files removed, even if it omits permissions.require.

## E02 ? P2 ? Adding a tool still means editing the app

Registry imports, transportAdapters, UI intents and dialog hooks each know individual extension IDs.

Source: [src/lib/extensions/registry.ts](../../src/lib/extensions/registry.ts).

Proposed change: Make each built-in definition own its manifest, validation, transport adapter and UI contribution. Keep one host execution path.

Acceptance: A small built-in extension registers without edits to the generic execute route or several app switches.

## E03 ? P2 ? Long commands have no job lifecycle

The execute route awaits a single result. Host progress support exists but the route supplies no callback or cancellation signal.

Source: [src/app/api/extensions/execute/route.ts](../../src/app/api/extensions/execute/route.ts).

Proposed change: Introduce job IDs, bounded progress events, cancellation, per-item outcomes and safe retry rules for long operations.

Acceptance: Close and reopen the tool while it runs; progress remains available and cancellation stops scheduling work.

## I01 ? P2 ? Metadata queue has no backpressure

Eight workers limit active work, but enqueue can retain every remaining file; pending.shift also shifts array entries.

Source: [src/lib/scanner/metadata-queue.ts](../../src/lib/scanner/metadata-queue.ts).

Proposed change: Bound pending work and make discovery await capacity. Expose pending, active, failed and completed counts.

Acceptance: Slow metadata over 100,000 generated file records keeps pending work below a fixed cap.

## I02 ? P2 ? Every scan loads and touches the whole index

ScanRunner loads all active and removed rows, stores every seen path, and writes timestamps for unchanged files.

Source: [src/lib/scanner/scan-runner.ts](../../src/lib/scanner/scan-runner.ts).

Proposed change: Use scan generations and scoped SQL reconciliation; keep discovery status per root. Add incremental watching only after full-scan recovery is sound.

Acceptance: Measure unchanged-scan writes, peak memory and elapsed time at 10k and 100k records.

## I03 ? P2 ? Overlapping roots repeat work and change ownership

Each root is walked independently; seenPaths is not used to skip indexing duplicates. Last root processed wins libraryRoot.

Source: [src/lib/scanner/discovery.ts](../../src/lib/scanner/discovery.ts).

Proposed change: Define longest-root ownership or reject nested roots. Canonicalize roots and deduplicate discovery.

Acceptance: Reordering a parent and child root leaves ownership, counts and metadata work unchanged.

## P01 ? P2 ? Warm waveforms wait behind cold generation

Cache reads happen inside the two-slot generation semaphore. Client rows refetch on remount with no-store.

Source: [src/lib/waveform-cache.ts](../../src/lib/waveform-cache.ts).

Proposed change: Read valid disk entries before taking a generation slot; retain a bounded client cache keyed by source version.

Acceptance: Warm-cache latency stays low while two slow files generate; measure cold, warm and scroll revisit cases.

## P02 ? P2 ? Folder navigation reads all directories in a root

getSubdirectoriesForRoot loads distinct directories then computes immediate children in JavaScript each time.

Source: [src/lib/database/browse-repository.ts](../../src/lib/database/browse-repository.ts).

Proposed change: Query immediate children from a maintained directory table or indexed parent relation.

Acceptance: Compare query plans and navigation latency for a root with 50,000 directories.

## P03 ? P2 ? Search and sort need workload-specific indexes

Substring LIKE, OFFSET paging and duration sort operate with separate single-column indexes. Every file page recounts favorites.

Source: [src/lib/database/files/reads.ts](../../src/lib/database/files/reads.ts).

Proposed change: Measure EXPLAIN QUERY PLAN; add justified composite indexes and cursor paging. Evaluate substring indexing without changing search semantics.

Acceptance: Record p50/p95 search latency and deep-page latency on representative libraries before and after.

## P04 ? P3 ? Shelf and pack hydration use one query per ID

hydrateFiles and shapeShelfList call getFileById for every selected file; sources also repeatedly canonicalize roots.

Source: [src/app/api/extensions/execute/transport.ts](../../src/app/api/extensions/execute/transport.ts).

Proposed change: Batch lookup by IDs and resolve root paths once per operation, retaining final path checks.

Acceptance: 1,000-item requests use a bounded number of queries and preserve requested order.

## S01 ? P3 ? Old toggle helpers are kept alive only by tests

applyFavoriteToggle and applyTagToggle have no production call sites. Their tests exercise the superseded path.

Source: [src/app/library/file-query.ts](../../src/app/library/file-query.ts).

Proposed change: Delete the unused helpers and their tests together. Keep the batch behavior and add concurrent failure coverage.

Acceptance: Repository reference search has no live callers; typecheck and the remaining suite pass.

## S02 ? P3 ? Repository forwarding layers multiply navigation

db barrel forwards to singleton functions, which forward to class methods, which forward to reads/writes with repeated context objects.

Source: [src/lib/database/file-repository.ts](../../src/lib/database/file-repository.ts).

Proposed change: Keep a single repository instance and one adapter boundary. Replace pageLimit() with a constant; remove identity transport lambdas.

Acceptance: Public behavior stays covered by repository and route tests; callers cross fewer files.

## S03 ? P3 ? Source-text checks cannot prove UI behavior

root-height-chain.test.ts forbids text tokens but never measures layout. Theme token checks are also structural.

Source: [src/app/root-height-chain.test.ts](../../src/app/root-height-chain.test.ts).

Proposed change: Retain cheap intentional policy checks; replace layout claims with browser smoke coverage at multiple zoom levels. Do not delete behavioral tests for being small.

Acceptance: The actual window remains filled and scrollable at 75%, 100% and 125% zoom.

## S04 ? P2 ? CI omits the required production build

check.yml runs TypeScript, ESLint and Vitest but no next build, despite the repo's shipping rule.

Source: [.github/workflows/check.yml](../../.github/workflows/check.yml).

Proposed change: Add the production build to PR checks, keep prototype code on throwaway branches, and update stale audit status documents after implementation.

Acceptance: A PR with a build-only regression cannot pass CI.

## What to retain

The shared SQLite connection, transactional batch writes, parameter chunking, escaped LIKE patterns, stable server sort tie-breakers, canonical filesystem boundary, bounded active scan workers, persistent waveform cache and behavioral selection/queue tests all serve real purposes. Improve their missing cases instead of deleting them for being abstractions.

A source-text test may intentionally enforce a repository rule. It becomes misleading when it is treated as proof of rendered behavior. Tiny wrappers are cleanup candidates when they add no policy, dependency boundary or stable API; their existence alone is not a meaningful performance problem.
