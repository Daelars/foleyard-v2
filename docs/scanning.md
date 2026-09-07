# Scanning

> Feature status: shipped (with known defects B03 / I03 tracked as expected-to-fail)
> Contract: internal
> Owner: `src/lib/scanner/*` + `packages/yard-core/src/services/library/*`
> Applies to: docs manifest ID (`scanning`); development checkout when unbuilt

## What it does

Scanning reconciles audio files under the Library roots with the Library
index: discover files, reconcile against existing records, extract
metadata in a bounded queue, and report progress until complete.

## Responsibilities and boundaries

- Local filesystem only. The scanner never fetches remote content and
  there is no external provider or public SDK surface.
- `ScanRunner` (`src/lib/scanner/scan-runner.ts`) implements the
  `ScannerService` contract from `yard-core`; routes are thin adapters
  (`POST /api/scan` starts, `GET /api/scan` reports status).
- Scan phases use yard-core vocabulary: `idle | validating | discovering |
  indexing | metadata | cleaning | complete | error`.

## Runtime behavior

Lifecycle: `POST /api/scan` → `src/lib/scanner/run-scan.ts` → `ScanRunner`
phases:

1. **Validating/discovery** — `validation.ts` checks each root;
   `discovery.ts` walks roots matching `SUPPORTED_AUDIO_EXTENSIONS`
   (`.mp3 .wav .ogg .flac .aiff .m4a .aac`, case-insensitive, final
   extension wins).
2. **Reconcile** — `reconcile.ts` (`markRemovedFiles`) diffs discovered
   paths against the index: unchanged files skipped, missing files marked
   removed, new/changed files queued.
3. **Metadata-queue** — `metadata-queue.ts` extracts metadata with
   concurrency 16 and write batches of 250 (`METADATA_CONCURRENCY`,
   `METADATA_WRITE_BATCH_SIZE` in `scan-runner.ts`).
4. **Progress** — `progress.ts` (`createScanStatus`/`finishScanStatus`)
   maintains `ScanStatus { running, phase, discovered, indexed,
   skippedUnchanged, metadataProcessed, added, updated, removed, failed,
   errors, … }`; the client polls via `src/hooks/use-scan-polling.ts`
   (`GET /api/scan` every 2 s; transient poll errors ignored; settle
   callback fires when `running` flips false).

## Contracts

- `ScannerService`, `ScanStatus`, `ScanSummary`, `PathValidation`,
  `ScanFileRecord` in
  `packages/yard-core/src/services/library/{scanner-service,scan-types}.ts`.
- `FileSystemSeam` / `MetadataSeam` in `src/lib/scanner/types.ts`:
  seams tests and tools implement instead of touching disk.

## Failure behavior and limitations

- Partial failure is normal: per-file metadata errors increment
  `failed`/`errors` without aborting the run; the summary records them.
- B03 (expected-to-fail): collection-branch counts disagree with the
  file list (#137).
- I03 (expected-to-fail): order-dependent root ownership — overlapping
  roots attribute files by scan order (#139).
- Extension-host transport caps scans at 5,000 files silently (finding
  B06, expected-to-fail).

## Source map (real file paths)

- `src/app/api/scan/route.ts` — start/status route adapter
- `src/lib/scanner/run-scan.ts` — run entrypoint
- `src/lib/scanner/scan-runner.ts` — `ScanRunner` (phases, concurrency, batching)
- `src/lib/scanner/discovery.ts`, `src/lib/scanner/reconcile.ts`,
  `src/lib/scanner/metadata-queue.ts`, `src/lib/scanner/progress.ts`,
  `src/lib/scanner/validation.ts`, `src/lib/scanner/filesystem.ts`,
  `src/lib/scanner/types.ts` — phase modules and seams
- `src/lib/scanner.ts` — legacy/coordinating scanner surface
- `src/hooks/use-scan-polling.ts` — client polling
- `src/app/library/use-settings-scan.ts` — settings scan controls
- `packages/yard-core/src/services/library/scan-types.ts` — status/summary shapes,
  `SUPPORTED_AUDIO_EXTENSIONS`

## Examples

There is no `examples/` directory in this repo. No runnable example covers
scanning; `core/query-library` queries post-scan state against the checkout.

## Related documentation

- `docs/library.md` — roots and file identity
- `docs/metadata.md` — what extraction produces
- `docs/development.md` — expected-failures ledger (B03, I03, B06)
- `docs/filesystem.md` — root readability and grants
