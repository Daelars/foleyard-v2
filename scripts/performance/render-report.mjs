// Refresh the local HTML explainer and Markdown plan from the last successful run.
import { readFile, writeFile } from 'node:fs/promises';
const r=JSON.parse(await readFile('benchmarks/performance/latest.json','utf8'));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
const ms=value=>`${value.toFixed(value<10?2:1)} ms`;
const ratio=(a,b)=>`${(a/b).toFixed(1)}×`;
const q=r.queries,c=r.cacheControlled,s=r.scanScale;
const wavBefore=median(r.waveformPaired.map(p=>p.current.ms)),wavAfter=median(r.waveformPaired.map(p=>p.candidate.ms));
const scan=kind=>median(r.scans.filter(s=>s.scenario===kind).map(s=>s.ms));
const rows=[
 ['Cached waveform, occupied slots',c.current.occupiedMs.median,c.candidate.occupiedMs.median,'Hit-only experiment; two controlled 250 ms holds'],
 ['Five-minute PCM16 WAV',wavBefore,wavAfter,'Specialized TypeScript loop; exact peaks on tested fixtures'],
 ['Deep filename page, 100k rows',q['analyzed-baseline'].deep.elapsedMs.median,q['composite-index'].deep.elapsedMs.median,'Compared after statistics on both sides'],
 ['Duration first page, 100k rows',q['analyzed-baseline'].duration.elapsedMs.median,q['composite-index'].duration.elapsedMs.median,'Duration sort index has a write-cost tradeoff'],
 ['Touch 10k unchanged rows, both indexes',s.touch10000ByIndex['with-sort-indexes'].median,s.unchangedTouchCandidate.median,'Timestamp-only update; active rows with unchanged ownership'],
 ['Load 100k records for scan setup',s.loadAllRecords.median,s.loadRemovalFields.median,'Narrow raw projection; also removes Drizzle mapping overhead'],
];
const table=rows.map(([name,before,after,note])=>`<tr><td>${name}</td><td>${ms(before)}</td><td>${ms(after)}</td><td>${ratio(before,after)}</td><td>${note}</td></tr>`).join('');
const block=`<!-- BENCHMARK RESULTS START -->
<div id="results" hidden>
<h2>There are worthwhile gains in TypeScript</h2>
<p>Start with cache admission, a specialized PCM loop, then browsing indexes paired with cheaper unchanged-row updates. These are measured local experiments. Production changes are still to be implemented.</p>
<div class="columns"><article class="panel"><h3>Waveform calculation</h3><div class="big">${ratio(wavBefore,wavAfter)} faster</div><p>${ms(wavBefore)} → ${ms(wavAfter)} for a five-minute PCM16 stereo WAV. Exact peak parity on the tested files.</p></article><article class="panel"><h3>Cached waveform waiting</h3><div class="big">${ms(c.candidate.occupiedMs.median)}</div><p>Instead of ${ms(c.current.occupiedMs.median)} under controlled contention. Two real long-file generations delayed the existing cache hit by ${ms(median(r.cacheWithRealGenerations.map(t=>t.ms)))}.</p></article></div>
<section style="overflow-x:auto"><table><thead><tr><th>Experiment</th><th>Current</th><th>Candidate</th><th>Ratio</th><th>Scope</th></tr></thead><tbody>${table}</tbody></table></section>
<h2>Implementation order</h2>
<div class="flow"><div class="node good">1. Cache hits bypass generation slots</div><div class="arrow">↓</div><div class="node good">2. Specialize PCM sample reduction; retain format fallbacks</div><div class="arrow">↓</div><div class="node">3. Narrow unchanged-row touches + filename sort index + maintained query statistics</div><div class="arrow">↓</div><div class="node">4. Bound metadata queue and reduce scan setup allocations</div><div class="arrow">↓ only if the remaining cost matters</div><div class="node">5. Duration index, cursor pagination, workers and compressed-audio tuning</div></div>
<section class="panel"><h3>Indexing is already concurrent. More concurrency is not a clear win.</h3><p>1,000 generated WAVs: new index ${ms(scan('new-index'))}; unchanged ${ms(scan('unchanged'))}; 1% modified ${ms(scan('one-percent-changed'))}. Outstanding metadata work reached ${Math.max(...r.scans.map(s=>s.peakOutstanding))} jobs including active work.</p><p>Metadata-only medians: 16 workers ${ms(r.metadataConcurrency['16'].elapsedMs.median)}, 32 workers ${ms(r.metadataConcurrency['32'].elapsedMs.median)}, 64 workers ${ms(r.metadataConcurrency['64'].elapsedMs.median)}. Keep 16 for now. A bounded queue controls memory; it is not a demonstrated throughput improvement.</p></section>
<section class="panel"><h3>Do the indexes slow down scans?</h3><p>For 10,000 metadata updates, the scratch database took ${ms(s.metadataWrite10000['without-sort-indexes'].median)} with existing indexes, ${ms(s.metadataWrite10000['filename-only'].median)} with the filename index, and ${ms(s.metadataWrite10000['with-sort-indexes'].median)} with both proposed indexes. The duration index has a visible write cost.</p><p>Unchanged-row touches also maintain the new partial indexes because the current SQL rewrites removed_at. With both indexes, limiting a proven-unchanged touch to its timestamps reduced this batch from ${ms(s.touch10000ByIndex['with-sort-indexes'].median)} to ${ms(s.unchangedTouchCandidate.median)}. Pair that change with the browse indexes.</p></section>
<section class="panel"><h3>Rust verdict: defer the switch</h3><p>The unchanged algorithm in a persistent Node worker took ${ms(r.waveformWorker.elapsedMs.median)} versus ${ms(r.waveformMain.elapsedMs.median)} on the main thread. That is not a substantial throughput win. The specialized TypeScript loop is the stronger result. Rust was not benchmarked, so this does not establish how fast Rust would be.</p><p>Only reconsider a Rust worker after these changes if measured CPU or preview latency still misses your target. Worker event-loop samples here are inconclusive on Windows; idle timer scheduling makes them unsuitable evidence of a responsiveness win.</p></section>
<h2>What these numbers cover</h2><p class="note">${r.cpu.trim()}, Node ${r.node}, Windows. Three scan rounds; generally five repeats for the other cases. Generated audio and scratch SQLite only, warm OS cache. The PCM experiment handles canonical PCM16 stereo; it is not a replacement for the full parser. Browsing timings exclude HTTP, tags and rendering. Compressed audio was measured separately: one-minute MP3 ${ms(r.compressed.mp3.waveform.elapsedMs.median)}, FLAC ${ms(r.compressed.flac.waveform.elapsedMs.median)}. No cold-disk, network-storage or real-library measurements.</p>
<p class="note">Run again: <code>npm run bench:performance</code>. Full plan: <code>docs/performance-improvement-plan.md</code>. Raw samples: <code>benchmarks/performance/benchmark-results.json</code>.</p>
</div>
<!-- BENCHMARK RESULTS END -->`;
const template='scripts/performance/report-template.html';
const out='benchmarks/performance/report.html';
let html=await readFile(template,'utf8');
html=html.replace(/<!-- BENCHMARK RESULTS START -->[\s\S]*?<!-- BENCHMARK RESULTS END -->\s*/,'');
html=html.replace('</nav>','</nav>\n'+block);
if(!html.includes('data-view="results"'))html=html.replace('<nav aria-label="Explore performance" role="tablist">','<nav aria-label="Explore performance"><button aria-selected="false" data-view="results">00 · Measurements &amp; plan</button>');
html=html.replaceAll(' role="tab"','').replaceAll(' role="tabpanel"','');
html=html.replaceAll("['waveforms','indexing','rust']","['results','waveforms','indexing','rust']");
html=html.replace("view='waveforms'","view='results'");
html=html.replace('<h1>Where does the time go?</h1>','<h1>Make browsing and previews faster.</h1>');
html=html.replace('Fix queueing first. Measure a worker for waveform processing next. A Rust rewrite of file streaming has no supporting measurements yet.','Local benchmarks found gains in cache admission, PCM processing and SQLite queries. Here is the evidence and the TypeScript implementation plan.');
html=html.replace('No library access, production changes or measured Rust speedup.','Scratch benchmarks and synthetic interaction only. No real-library access, production changes or measured Rust speedup.');
html=html.replaceAll('aria-selected','aria-pressed');
await writeFile(out,html);
await writeFile('benchmarks/performance/benchmark-results.json',JSON.stringify(r,null,2));
const markdownTable=rows.map(([name,before,after,note])=>`| ${name} | ${ms(before)} | ${ms(after)} | ${ratio(before,after)} | ${note} |`).join('\n');
const plan=`# TypeScript performance improvement plan

Measured ${r.date}. Experimental findings from this checkout, not installed-runtime claims. Production implementation is pending.

## Decision

Keep TypeScript. Implement cache admission and PCM loop improvements first, then pair browsing indexes with cheaper unchanged-row writes. There is enough measured benefit here to postpone Rust. Rust itself was not benchmarked, and these results do not predict its performance.

## Measurements

| Experiment | Current | Candidate | Ratio | Scope |
| --- | ---: | ---: | ---: | --- |
${markdownTable}

Machine: ${r.cpu.trim()}, ${r.logicalCpus} logical CPUs, Node ${r.node}, ${r.platform}. See [raw samples](../benchmarks/performance/benchmark-results.json) and [benchmark instructions](../scripts/performance/README.md). Fixtures and databases remain under the ignored benchmarks/performance directory. The normal library and its settings were never opened.

Three scan rounds of 1,000 generated 0.1-second WAVs produced medians of ${ms(scan('new-index'))} for a new index, ${ms(scan('unchanged'))} unchanged, and ${ms(scan('one-percent-changed'))} with 1% modified. New index means empty SQLite, not cold storage. Metadata-only throughput was ${ms(r.metadataConcurrency['16'].elapsedMs.median)} at concurrency 16, ${ms(r.metadataConcurrency['32'].elapsedMs.median)} at 32, and ${ms(r.metadataConcurrency['64'].elapsedMs.median)} at 64. The small 16-to-32 difference is insufficient to change the default from 16.

Statistics matter separately from indexes. Deep filename browsing took ${ms(q.baseline.deep.elapsedMs.median)} before ANALYZE, ${ms(q['analyzed-baseline'].deep.elapsedMs.median)} after ANALYZE with existing indexes, and ${ms(q['composite-index'].deep.elapsedMs.median)} with candidate indexes and statistics. The first page fell from ${ms(q.baseline.first.elapsedMs.median)} to ${ms(q['analyzed-baseline'].first.elapsedMs.median)} from statistics alone. Query plans changed from a temporary sort, to a partial tie-break sort, to an ordered index scan. Do not attribute all of this to a new index.

## Implementation sequence

### 1. Let valid cached waveforms bypass generation admission

Small change, strong latency evidence. In src/lib/waveform-cache.ts, move cache identity/shape validation outside withGenerationSlot. Preserve the pending promise per source identity; on misses acquire a generation slot and recheck before generating. Keep atomic cache persistence and source size/mtime checks.

Acceptance: with both generation slots held behind explicit test gates, a valid cache hit completes before either gate is released. Identical uncached requests generate once. Corrupt/stale entries still regenerate. Use real generation contention in the benchmark to confirm the effect. The controlled candidate measured ${ms(c.candidate.occupiedMs.median)} versus ${ms(c.current.occupiedMs.median)}. Two real five-minute generations delayed the existing hit by ${ms(median(r.cacheWithRealGenerations.map(t=>t.ms)))}; that is a separate workload, not the candidate's before/after pair.

### 2. Specialize PCM reduction inside the existing WAV parser

Medium change, highest measured CPU opportunity. Retain src/lib/waveform-generator.ts RIFF traversal and validation. Select a decoder once by sample format, then process runs within a peak bin. The scratch PCM16 candidate uses an Int16Array and computes bin boundaries per run instead of doing generic sample reads and bin math for every frame. Keep 64 KiB buffers, bounded work and yielding.

Acceptance: compare all 512 peaks against the original for silence, full scale, opposite-phase stereo, mono/multichannel, odd frame counts and trailing bins. Extend coverage to the supported 8/16/24/32-bit integer and 32/64-bit float formats, extensible headers and unusual chunk placement. Preserve unsupported/malformed outcomes. Optimize PCM16 first; fallback to the current path for other formats until measured and checked. The scratch candidate assumes a canonical 44-byte header, so it must not be copied over the production parser. Aim to retain a several-fold win on the five-minute fixture; do not promise ${ratio(wavBefore,wavAfter)} across every format.

### 3. Pair cheaper unchanged touches with filename sorting and statistics

Medium change, strong browse evidence. In scanner reconciliation, identify the already-active, ownership-unchanged path and use a timestamp-only batch update. Preserve last_scanned_at and updated_at. Do not change generic touch semantics for callers that restore removed files or change ownership. Inspect other callers before choosing a repository method.

Then add an idempotent migration for the measured filename index:

~~~sql
CREATE INDEX idx_files_active_filename_id
ON files(filename, id) WHERE removed_at IS NULL;
~~~

Evaluate an explicit statistics refresh after substantial import/migration, outside the interactive request path. ANALYZE was benchmarked; do not assume another maintenance command gives the same plan without checking. Respect the existing migration ledger and schema initialization rules.

Why pair these changes: 10,000 touches took ${ms(s.touch10000ByIndex['without-sort-indexes'].median)} with existing indexes and ${ms(s.touch10000ByIndex['filename-only'].median)} with the filename index. Current touch SQL rewrites removed_at and library_root even when unchanged. With both candidate indexes, timestamp-only updates took ${ms(s.unchangedTouchCandidate.median)} versus ${ms(s.touch10000ByIndex['with-sort-indexes'].median)}. These are scratch write microbenchmarks, not whole-scan speedups.

Acceptance: identical row IDs and ordering for filename ties, ascending/descending, removed visibility, library root, directory, tags, favorites and Collection filters. Check EXPLAIN QUERY PLAN and real repository timing on 100k rows. Re-run complete new/unchanged/changed scans with the proposed indexes, including added files and moved files. The present browse comparison covers ascending unfiltered queries; descending and filtered variants need their own evidence. Preserve path uniqueness, soft removals, healthy-root cleanup and move reconciliation.

### 4. Bound scan backlog and narrow scan setup reads

Medium change, mostly scale and memory control. The real 1,000-file scan reached ${Math.max(...r.scans.map(s=>s.peakOutstanding))} outstanding metadata jobs including active work. In metadata-queue.ts, provide awaitable admission and a bounded deque, and await admission from reconcile.ts so discovery can pause. Keep active concurrency 16 initially. Wake blocked producers on cancel and fatal write failure, keep draining while producers wait, and expose pending/active counts. Avoid an Array.shift loop for a large backlog.

ScanRunner currently materializes all existing records before discovery and retains seenPaths. First add a narrow scan-cleanup read or pages containing only the fields removal reconciliation consumes. The scratch projection fetched 100k rows in ${ms(s.loadRemovalFields.median)} versus ${ms(s.loadAllRecords.median)} for the full repository read, including its mapping cost. A narrow array still grows with library size; paging or a scratch seen table is a later change if measurements justify it. Keep getAllFilesIncludingRemoved's existing contract for other callers.

Acceptance: pause/resume a saturated producer, cancellation during admission, fatal writer failure, parser errors, inaccessible roots and stat failures without hangs or false removals. Measure high-water queue size and isolated peak memory on at least 10k files. This pass establishes the unbounded backlog and setup cost; it does not measure an end-to-end gain from a bounded scanner.

### 5. Add optional query improvements only where they pay

The tested duration index was ON files((duration IS NULL), duration, filename, id) WHERE removed_at IS NULL. Duration browsing improved from ${ms(q['analyzed-baseline'].duration.elapsedMs.median)} to ${ms(q['composite-index'].duration.elapsedMs.median)}, but 10,000 metadata updates grew from ${ms(s.metadataWrite10000['filename-only'].median)} with filename-only indexing to ${ms(s.metadataWrite10000['with-sort-indexes'].median)} with both indexes. Benchmark realistic import workloads before choosing it. Preserve null ordering and descending tie-breaks.

Cursor pagination is lower priority after the filename index. Equal-projection raw queries took ${ms(q.offsetSameProjection.elapsedMs.median)} with OFFSET and ${ms(q.keyset.elapsedMs.median)} with an existing cursor. Cursor acquisition is excluded; those are not HTTP timings. It requires contract and client changes, stable filename/id or duration/filename/id cursors, sort/filter invalidation and mutation semantics. A roughly 3 ms indexed repository page does not by itself justify that migration.

### 6. Reassess workers and Rust after the above

Unchanged PCM code took ${ms(r.waveformMain.elapsedMs.median)} on the main thread and ${ms(r.waveformWorker.elapsedMs.median)} in a persistent worker. Worker startup was ${ms(r.workerStartupMs)} in this benchmark, which loads a broad module bundle and is not an optimized production worker startup measurement. A worker did not deliver the loop optimization's throughput gain.

Windows event-loop histogram results were inconsistent with a responsiveness claim: the worker case showed about 16 ms idle timer intervals despite similar throughput. Do not treat this as proof that workers improve or harm interactive latency. Measure actual preview/request latency under load for that decision.

One-minute MP3 and FLAC waveform medians were ${ms(r.compressed.mp3.waveform.elapsedMs.median)} and ${ms(r.compressed.flac.waveform.elapsedMs.median)}. They use the existing FFmpeg path. No compressed-audio optimization was tested. Leave HTTP Range streaming intact unless click-to-audible or seek measurements identify it as a bottleneck. Rust remains an option for residual CPU work, not a prerequisite for these gains.

## Validation and rollout

Implement each numbered item separately, with focused regressions and the repeatable benchmark before/after. Avoid hard millisecond limits in shared CI; verify parity and queue invariants there, and retain local raw timings. Production acceptance needs representative 24-bit WAVs, compressed files, large headers, multiple roots, an unreadable root, and storage matching the actual library. Measure HTTP first-byte/seek and the full file route with tag hydration, then renderer latency while scanning. No such full-stack or real-library timings were collected here.

Keep source fingerprints and environment details with future runs. Use the existing context and ADR rules for new repository operations or pagination contracts. No production change or architectural migration was made in this exploration.

## Documentation discrepancies recorded

- docs/scanning.md calls queueing bounded; source bounds active parsers only.
- docs/playback.md summarizes waveforms as FFmpeg; source has a direct JS PCM WAV path.
- docs/search.md says /api/files returns the matching count; this checkout returns hasMore and favoritesTotal, with two tag hydration reads. The benchmark's generic count timing is not a measurement of that endpoint's count work.
`;
await writeFile('docs/performance-improvement-plan.md',plan);
console.log('Updated benchmarks/performance/report.html, raw sample snapshot and docs/performance-improvement-plan.md');
