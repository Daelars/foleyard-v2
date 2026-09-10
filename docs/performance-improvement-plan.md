# TypeScript performance improvement plan

Measured 2026-09-09T22:37:38.915Z. Experimental findings from this checkout, not installed-runtime claims.

## Implementation status

Items 1–4 are implemented in this checkout; the measurements table above
was refreshed by a run against the production code:

1. **Cache admission** — `src/lib/waveform-cache.ts` reads and validates
   the cache entry before `withGenerationSlot`; the slot path rechecks
   before generating. Valid hits measured 1.3 ms with both generation
   slots occupied (the pre-change path measured 264.5 ms).
2. **PCM16 specialization** — `src/lib/waveform-generator.ts` keeps the
   RIFF traversal and validation, then reduces PCM16 through an
   Int16Array view with per-run bin boundaries; other formats keep the
   generic loop. Exact peak parity pinned against the pre-change
   algorithm in `src/test/integration/waveform.test.ts` (silence, full
   scale, opposite-phase stereo, mono odd frames, six channels) and
   against the scratch candidate in the benchmark. Five-minute PCM16
   generation is 159.8 ms median (pre-change baseline 1093.5 ms).
3. **Browse indexes + cheaper unchanged touches** — the partial
   `idx_files_active_filename_id ON files(filename, id) WHERE
   removed_at IS NULL` index is in `initializeDatabaseSchema` (idempotent
   for new and existing databases). The scanner's unchanged branch now
   uses `batchTouchActiveFiles` (timestamp-only, preserving
   removed_at/library_root; `batchTouchFiles` keeps its restore/ownership
   semantics for other callers). `analyzeStatistics()` runs once after a
   completed scan, outside the interactive path. 100k-row deep filename
   paging: 3.9 ms after ANALYZE on existing indexes, 3.25 ms with the
   filename index (pre-change 76.6 ms with statistics). 10k unchanged
   touches: 40.8 ms timestamp-only (pre-change 142.5 ms with both
   candidate indexes).
4. **Bounded backlog + narrow scan setup** — `createMetadataQueue` has
   awaitable admission (default capacity 500), an index-based deque
   instead of `Array.shift`, woken producers on cancel/fatal failure, and
   `getCounts()`. `reconcile.ts` awaits admission so discovery pauses
   instead of growing the waiting list. `ScanRunner` reads the narrow
   `getScanCleanupRows()` projection (path, library root, removed state)
   before discovery; 100k rows load in 44.1 ms versus 206.5 ms for the
   full repository read. Queue invariants are pinned in
   `src/lib/scanner/metadata-queue.test.ts`.

Still deferred (item 5/6 of the original sequence): the duration index
(write-cost tradeoff needs a realistic import benchmark), cursor
pagination (indexed pages are now ~3 ms; contract/client change not
justified by these numbers), workers and Rust (the specialized loop
delivered the measured gain without them).

## Decision

Keep TypeScript. Implement cache admission and PCM loop improvements first, then pair browsing indexes with cheaper unchanged-row writes. There is enough measured benefit here to postpone Rust. Rust itself was not benchmarked, and these results do not predict its performance.

## Measurements

| Experiment | Current | Candidate | Ratio | Scope |
| --- | ---: | ---: | ---: | --- |
| Cached waveform, occupied slots | 1.30 ms | 1.25 ms | 1.0× | Hit-only experiment; two controlled 250 ms holds |
| Five-minute PCM16 WAV | 159.8 ms | 121.4 ms | 1.3× | Specialized TypeScript loop; exact peaks on tested fixtures |
| Deep filename page, 100k rows | 3.89 ms | 3.25 ms | 1.2× | Compared after statistics on both sides |
| Duration first page, 100k rows | 16.0 ms | 0.67 ms | 23.8× | Duration sort index has a write-cost tradeoff |
| Touch 10k unchanged rows, both indexes | 237.5 ms | 40.8 ms | 5.8× | Timestamp-only update; active rows with unchanged ownership |
| Load 100k records for scan setup | 206.5 ms | 44.1 ms | 4.7× | Narrow raw projection; also removes Drizzle mapping overhead |

Machine: AMD Ryzen 7 5700X 8-Core Processor, 16 logical CPUs, Node v24.14.0, win32. See [raw samples](../src/app/prototype/performance/benchmark-results.json) and [benchmark instructions](../scripts/performance/README.md). Fixtures and databases remain under the ignored benchmarks/performance directory. The normal library and its settings were never opened.

Three scan rounds of 1,000 generated 0.1-second WAVs produced medians of 263.2 ms for a new index, 40.6 ms unchanged, and 44.7 ms with 1% modified. New index means empty SQLite, not cold storage. Metadata-only throughput was 201.0 ms at concurrency 16, 193.8 ms at 32, and 225.0 ms at 64. The small 16-to-32 difference is insufficient to change the default from 16.

Statistics matter separately from indexes. Deep filename browsing took 189.2 ms before ANALYZE, 3.89 ms after ANALYZE with existing indexes, and 3.25 ms with candidate indexes and statistics. The first page fell from 16.0 ms to 0.77 ms from statistics alone. Query plans changed from a temporary sort, to a partial tie-break sort, to an ordered index scan. Do not attribute all of this to a new index.

## Implementation sequence

### 1. Let valid cached waveforms bypass generation admission

Small change, strong latency evidence. In src/lib/waveform-cache.ts, move cache identity/shape validation outside withGenerationSlot. Preserve the pending promise per source identity; on misses acquire a generation slot and recheck before generating. Keep atomic cache persistence and source size/mtime checks.

Acceptance: with both generation slots held behind explicit test gates, a valid cache hit completes before either gate is released. Identical uncached requests generate once. Corrupt/stale entries still regenerate. Use real generation contention in the benchmark to confirm the effect. The controlled candidate measured 1.25 ms versus 1.30 ms. Two real five-minute generations delayed the existing hit by 2.36 ms; that is a separate workload, not the candidate's before/after pair.

### 2. Specialize PCM reduction inside the existing WAV parser

Medium change, highest measured CPU opportunity. Retain src/lib/waveform-generator.ts RIFF traversal and validation. Select a decoder once by sample format, then process runs within a peak bin. The scratch PCM16 candidate uses an Int16Array and computes bin boundaries per run instead of doing generic sample reads and bin math for every frame. Keep 64 KiB buffers, bounded work and yielding.

Acceptance: compare all 512 peaks against the original for silence, full scale, opposite-phase stereo, mono/multichannel, odd frame counts and trailing bins. Extend coverage to the supported 8/16/24/32-bit integer and 32/64-bit float formats, extensible headers and unusual chunk placement. Preserve unsupported/malformed outcomes. Optimize PCM16 first; fallback to the current path for other formats until measured and checked. The scratch candidate assumes a canonical 44-byte header, so it must not be copied over the production parser. Aim to retain a several-fold win on the five-minute fixture; do not promise 1.3× across every format.

### 3. Pair cheaper unchanged touches with filename sorting and statistics

Medium change, strong browse evidence. In scanner reconciliation, identify the already-active, ownership-unchanged path and use a timestamp-only batch update. Preserve last_scanned_at and updated_at. Do not change generic touch semantics for callers that restore removed files or change ownership. Inspect other callers before choosing a repository method.

Then add an idempotent migration for the measured filename index:

~~~sql
CREATE INDEX idx_files_active_filename_id
ON files(filename, id) WHERE removed_at IS NULL;
~~~

Evaluate an explicit statistics refresh after substantial import/migration, outside the interactive request path. ANALYZE was benchmarked; do not assume another maintenance command gives the same plan without checking. Respect the existing migration ledger and schema initialization rules.

Why pair these changes: 10,000 touches took 143.5 ms with existing indexes and 161.5 ms with the filename index. Current touch SQL rewrites removed_at and library_root even when unchanged. With both candidate indexes, timestamp-only updates took 40.8 ms versus 237.5 ms. These are scratch write microbenchmarks, not whole-scan speedups.

Acceptance: identical row IDs and ordering for filename ties, ascending/descending, removed visibility, library root, directory, tags, favorites and Collection filters. Check EXPLAIN QUERY PLAN and real repository timing on 100k rows. Re-run complete new/unchanged/changed scans with the proposed indexes, including added files and moved files. The present browse comparison covers ascending unfiltered queries; descending and filtered variants need their own evidence. Preserve path uniqueness, soft removals, healthy-root cleanup and move reconciliation.

### 4. Bound scan backlog and narrow scan setup reads

Medium change, mostly scale and memory control. The real 1,000-file scan reached 872 outstanding metadata jobs including active work. In metadata-queue.ts, provide awaitable admission and a bounded deque, and await admission from reconcile.ts so discovery can pause. Keep active concurrency 16 initially. Wake blocked producers on cancel and fatal write failure, keep draining while producers wait, and expose pending/active counts. Avoid an Array.shift loop for a large backlog.

ScanRunner currently materializes all existing records before discovery and retains seenPaths. First add a narrow scan-cleanup read or pages containing only the fields removal reconciliation consumes. The scratch projection fetched 100k rows in 44.1 ms versus 206.5 ms for the full repository read, including its mapping cost. A narrow array still grows with library size; paging or a scratch seen table is a later change if measurements justify it. Keep getAllFilesIncludingRemoved's existing contract for other callers.

Acceptance: pause/resume a saturated producer, cancellation during admission, fatal writer failure, parser errors, inaccessible roots and stat failures without hangs or false removals. Measure high-water queue size and isolated peak memory on at least 10k files. This pass establishes the unbounded backlog and setup cost; it does not measure an end-to-end gain from a bounded scanner.

### 5. Add optional query improvements only where they pay

The tested duration index was ON files((duration IS NULL), duration, filename, id) WHERE removed_at IS NULL. Duration browsing improved from 16.0 ms to 0.67 ms, but 10,000 metadata updates grew from 26.7 ms with filename-only indexing to 84.8 ms with both indexes. Benchmark realistic import workloads before choosing it. Preserve null ordering and descending tie-breaks.

Cursor pagination is lower priority after the filename index. Equal-projection raw queries took 2.80 ms with OFFSET and 0.43 ms with an existing cursor. Cursor acquisition is excluded; those are not HTTP timings. It requires contract and client changes, stable filename/id or duration/filename/id cursors, sort/filter invalidation and mutation semantics. A roughly 3 ms indexed repository page does not by itself justify that migration.

### 6. Reassess workers and Rust after the above

Unchanged PCM code took 167.9 ms on the main thread and 173.5 ms in a persistent worker. Worker startup was 641.1 ms in this benchmark, which loads a broad module bundle and is not an optimized production worker startup measurement. A worker did not deliver the loop optimization's throughput gain.

Windows event-loop histogram results were inconsistent with a responsiveness claim: the worker case showed about 16 ms idle timer intervals despite similar throughput. Do not treat this as proof that workers improve or harm interactive latency. Measure actual preview/request latency under load for that decision.

One-minute MP3 and FLAC waveform medians were 155.8 ms and 150.5 ms. They use the existing FFmpeg path. No compressed-audio optimization was tested. Leave HTTP Range streaming intact unless click-to-audible or seek measurements identify it as a bottleneck. Rust remains an option for residual CPU work, not a prerequisite for these gains.

## Validation and rollout

Implement each numbered item separately, with focused regressions and the repeatable benchmark before/after. Avoid hard millisecond limits in shared CI; verify parity and queue invariants there, and retain local raw timings. Production acceptance needs representative 24-bit WAVs, compressed files, large headers, multiple roots, an unreadable root, and storage matching the actual library. Measure HTTP first-byte/seek and the full file route with tag hydration, then renderer latency while scanning. No such full-stack or real-library timings were collected here.

Keep source fingerprints and environment details with future runs. Use the existing context and ADR rules for new repository operations or pagination contracts. No production change or architectural migration was made in this exploration.

## Documentation discrepancies recorded

- docs/scanning.md calls queueing bounded; source bounds active parsers only.
- docs/playback.md summarizes waveforms as FFmpeg; source has a direct JS PCM WAV path.
- docs/search.md says /api/files returns the matching count; this checkout returns hasMore and favoritesTotal, with two tag hydration reads. The benchmark's generic count timing is not a measurement of that endpoint's count work.
