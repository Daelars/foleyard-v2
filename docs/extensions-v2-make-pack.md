# Make Pack v2 walkthrough

> Feature status: internal (bundled example, disabled by default)
> Contract: internal, API version 2
> Owner: `packages/yard-tools/make-pack-v2/` + `src/components/extensions/make-pack-v2/`
> Applies to: docs manifest ID (`extensions-v2-make-pack`); development checkout when unbuilt

## What it does

Walks the reference extension end to end: enable, approve, pick a
source, preview, choose a destination, run as a job, and read the
result. Make Pack v2 turns selected sounds, Sound Shelf items, or
recently previewed sounds into a folder or ZIP pack through the v2
engine only. It never executes v1 commands or calls v1 transport.

## Responsibilities and boundaries

- `packages/yard-tools/make-pack-v2/` owns export policy, command
  declarations, settings, contribution data, and schema-backed
  results. Every privileged effect runs through v2 operation
  services.
- `src/lib/extensions-v2/archive.ts` owns ZIP encoding behind the
  authorized service. `src/lib/extensions-v2/sources.ts` owns the
  shelf/recent adapters over persisted records.
- `src/components/extensions/make-pack-v2/` owns the dialog: preview,
  destination grant, cancellable job, capability-aware reveal.
- The original Make Pack keeps its behavior, routes, and settings.
  The parity table in `packages/yard-tools/make-pack-v2/README.md`
  records every workflow, intentional improvement, and explicit gap.

## Runtime behavior

### Prerequisites

- Dev or desktop checkout with a scanned Library (see
  `docs/quickstart.md` for the scan loop).
- Make Pack v2 enabled and approved (see
  `docs/extensions-v2-migration.md` for the exact calls).

### Run it from the UI

1. Pick sounds in the Library, open the Sound Shelf, or preview a
   few tracks so recent history exists.
2. Choose Pack v2 from the row menu, bulk bar, palette, or Shelf
   header. The dialog shows sources, names, output format,
   destination, conflicts, missing sources, and the manifest choice.
3. Choose a destination with the folder picker (desktop) to mint a
   destination grant. Unconfirmed plans never write.
4. Start the job, watch per-file progress, cancel anytime. The
   result lists output location, copied/skipped/failed counts with
   reasons, and an Open destination action on desktop.

### Run it from HTTP

```bash
curl '/api/extensions-v2/availability?extensionId=make-pack-v2&commandId=make-pack-v2.from-shelf'
curl -X POST /api/extensions-v2/execute \
  -H 'Content-Type: application/json' \
  -d '{"extensionId":"make-pack-v2","commandId":"make-pack-v2.from-shelf","input":{}}'
```

Expected: availability reports ready with reasons when blocked;
execute previews without side effects and returns a review plan
through the preview channel. Apply the plan or submit the same
command to `/api/extensions-v2/jobs` for background export with
progress and cancellation.

### Policies that differ from v1

- Never overwrite: existing destination files fail with a reason.
  The manifest travels as an in-memory archive entry, so no
  dot-tmp sidecar exists to delete (the v1 B12 defect class stays
  expected-to-fail on the v1 path only).
- Folder output sanitizes and dedupes case-insensitively and
  reserves `manifest.json` first. ZIP keeps Library filenames
  verbatim, so collision-heavy selections should use folder output.
- Missing records report as missing; files gone from disk report as
  skipped (folder) or fail the atomic ZIP run with the filename.
- Cancellation removes job-owned partials and settles cancelled.
  Finished packs and unrelated destination contents are never
  deleted.
- Limits: 500 entries, 1 MiB manifest text, ZIP32 (65,535 entries,
  4 GiB per entry/offset). ZIP integrity is verified with an
  independent reader in the integration suite.

## Contracts

- Input: optional `packName` (80 chars), `outputFormat`
  (folder/zip), `includeManifest` (boolean), `grantId`.
- Result: `packName`, `outputFormat`, `outputPath`, `copied`,
  `skipped`, `missing`, `failedFiles`, `failedReasons`,
  `manifestIncluded`, `revealCapability`. The host validates both
  against the schemas in `src/definition.ts`.

## Failure behavior and limitations

- Destination-less plans fail with guidance instead of writing
  somewhere unconfirmed.
- Removed selection records reject at preflight
  (`selection-unresolvable`) before anything is written.
- ZIP entry renaming is unsupported; ZIP64 over 4 GiB is
  unsupported; more than 500 sounds per run is rejected before any
  write; v1 settings never migrate silently.
- Reveal/open stays capability-aware and desktop-gated.

## Source map (real file paths)

- `packages/yard-tools/make-pack-v2/src/{definition,policy,handlers}.ts`
- `packages/yard-tools/make-pack-v2/README.md` — parity table
- `src/lib/extensions-v2/{archive,sources,make-pack-v2}.ts`
- `src/components/extensions/make-pack-v2/{MakePackV2Dialog,use-make-pack-v2}.tsx`
- `src/test/integration/make-pack-v2.test.ts` — real-filesystem exports

## Related documentation

- `docs/extensions-v2.md` — authoring guide and runnable examples
- `docs/extensions-v2-migration.md` — enable steps and v1 preservation
- `docs/filesystem.md` — grants and safe output underneath
- `docs/commands.md` — v1 pack commands beside these three
