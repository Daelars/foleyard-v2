# Research brief: Waveforms used to be instant

- Post: POST-006, order 6 of 10
- Slug: `waveforms-used-to-be-instant`
- Development state: **in-progress**
- Date range: 2026-09-06 to 2026-09-10
- Confidence: high
- Article: `blog-posts/posts/waveforms-used-to-be-instant/index.md` (1419 words)

## Story

Waveform drawing regressed from instant to visibly queued. The fix was to move decoding into the browser, then speed up the decoder, then measure indexing properly instead of guessing.

## Release context

Foleyard v2, unreleased. Public version is 0.1.8. See `release-horizon.md`.

## What existed before

Every row requested peaks from one server route with limited generation slots; even cache hits queued for a slot.

## Problem or motivation

Audit P01: warm waveforms wait behind cold generation. The stated constraint was to be near instant on a cold cache, not to cache harder.

## What changed

Browser Web Audio decode to 512 peaks with IndexedDB cache keyed on mtime and size, bounded read, server fallback for rejected formats (committed). Cache admission before slot, specialized PCM16 reduction, partial filename index plus ANALYZE, timestamp-only touches, narrow scan-setup projection, bounded metadata queue (working tree, measured).

## Evidence

- src/lib/client-waveform.ts, src/components/AudioPlayer/use-waveform-peaks.ts
- commit 14ed665 scanner split into discovery, metadata-queue, progress, reconcile
- docs/performance-improvement-plan.md measured 2026-09-09T22:37, items 1-4 implemented in checkout
- figures: 264.5 to 1.3 ms cache hit; 1093.5 to 159.8 ms five-minute PCM16; 206.5 to 44.1 ms per 100k scan-setup rows; 237.5 to 40.8 ms per 10k touches; 189.2 to 3.25 ms deep filename paging; worker 173.5 ms versus main thread 167.9 ms with 641 ms startup

## Quotes and wording from the development record

- waveform generation used to be instant? its not anymore? (user, thread ba5ac4c4)
- we need a way to keep it near instant for everything, not using caches, just like it used to (user)
- i didn't ask you to to make it faster, I asked you to look at how we can make it faster (user)

## Commits

- `14ed665`

## Issues and PRs

- none

## T3 threads

- `ba5ac4c4`
- `2f1f2aad`
- `682a19e9`

## Images used

- /blog-images/diagram-waveform.png

## What must NOT be claimed

- Every figure is a microbenchmark on generated fixtures on one machine. Never restate as application latency.
- Rust was never benchmarked. Do not imply these numbers say anything about it.

## Unknowns

- End-to-end scan and browse latency in the real app.
