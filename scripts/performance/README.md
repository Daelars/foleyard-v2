# Isolated TypeScript performance benchmark

Run from the repo root:

```sh
npm run bench:performance
```

Uses the installed Bun bundler to load the actual TypeScript modules under Node, matching the server runtime rather than timing Bun. On Windows the runner uses the npm-installed Bun executable under `%APPDATA%/npm/node_modules/bun/bin/bun.exe`. Dependencies come from the existing install; it does not install packages or rebuild SQLite.

Each run creates its own directory under ignored `benchmarks/performance/`. It generates 1,000 short PCM WAVs, two five-minute PCM WAVs, one-minute MP3/FLAC derivatives, caches and scratch SQLite databases. Budget roughly 150 MB per run. Fixtures and raw results remain for inspection; `benchmarks/performance/latest.json` points to the latest successful results by containing a copy of them. No user-configured roots or production database are used.

The runner exercises the real scanner, metadata extractor, waveform generator, waveform cache and file repository. Three scan rounds check new-index, unchanged and 1% modified cases. Other timings generally have five repetitions; metadata concurrency and compressed-format timings have three. Raw samples are retained. OS caches are not flushed, so new-index scans are not cold-disk measurements.

Experiments stay in scratch code and scratch databases:

- Identical waveform algorithm in a persistent Node worker, with exact result comparison and separate worker startup timing.
- A narrow PCM16 stereo reduction candidate, compared with the real implementation in alternating order. This experiment assumes a canonical 44-byte header and a little-endian host. A production implementation must keep the existing general RIFF parser and format fallbacks.
- A cache-hit-only path outside the real generation semaphore, with the same cache identity and peak validation. This is not a complete replacement cache implementation. Controlled occupied-slot measurements use two 250 ms holds; actual interference uses two real long-file generations.
- Actual repository queries before statistics, after `ANALYZE`, and after candidate partial sort indexes. Result IDs must match. A cursor query is compared to a raw OFFSET query with the same projection. Cursor acquisition is excluded.
- Supplemental 100,000-record scan setup reads and 10,000-record writes, with each candidate index configuration. A timestamp-only touch experiment applies only to rows already known to be active with unchanged ownership. The runner invokes `scan-scale.mjs` automatically.

Elapsed time, process CPU, event-loop delay and RSS snapshots are recorded. CPU includes worker-thread work. RSS snapshots are not per-case peak allocations. Instrumented stat/parser service times overlap and must not be summed to infer elapsed scan time. The scanner's outstanding metadata count includes work admitted by an upsert batch, including active jobs.

These results do not measure the full HTTP route, renderer, tag hydration, Electron, cold physical disk, network storage, all codec variants or a real user's library. They support a prioritized TypeScript plan, not a claim that Rust has been benchmarked.

After a new run, refresh the local HTML page, raw sample snapshot and Markdown plan with `node scripts/performance/render-report.mjs`. This writes those review artifacts in the checkout; it does not publish them externally.
