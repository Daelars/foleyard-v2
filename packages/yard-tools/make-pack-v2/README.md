# Make Pack v2

Reference extension for the v2 extension engine (R8, issue #171).
Displayed as **Make Pack v2**. Bundled internal example, disabled by
default, explicit enable/disable, own settings namespace
(`make-pack-v2.*`), no auto-migration from v1. The v1 Make Pack keeps
its behavior, routes, and settings untouched.

## Layout

- `src/definition.ts` — v2 definition: id `make-pack-v2`, three
  commands (`make-pack-v2.from-selection`, `.from-shelf`,
  `.from-recent`), three settings (`make-pack-v2.pack-name`,
  `make-pack-v2.default-format`, `make-pack-v2.include-manifest`),
  seven contributions (palette ×3, file-context-menu, selection-actions,
  sidebar, settings). No `requiredCapabilities`: the app host
  exposes no capabilities, so any declared capability would deny every
  command as unknown.
- `src/policy.ts` — pure export policy: default/sanitized pack names,
  ID dedupe, folder output-name planning (OS-invalid sanitization,
  case-insensitive `name 2.ext` dedupe, `manifest.json` reservation),
  ZIP conflict detection, manifest shaping, option resolution, archive
  bound (`MAX_PACK_FILES = 500`, mirroring the archive service).
- `src/handlers.ts` — command handlers. Every privileged effect runs
  through the invocation's v2 operation services. No v1 imports, no
  direct filesystem access, no guessed temporary filenames.

## Run-mode contract

- `direct` (execute): always previews without side effects, returning
  a review plan through the generic preview channel (sources/names
  tables, missing/rename/no-overwrite notices, details with
  `sources`, `names`, `format`, `destination`, `conflicts`,
  `missing`, `manifestChoice`). The destination grant binds into the
  plan when one was picked.
- `apply`: exports; the destination comes from the reviewed plan.
  A destination-less plan fails with guidance instead of writing
  somewhere unconfirmed.
- `job` (submit): exports with progress reports and cooperative
  cancellation; the destination comes from the submitted input.

`runMode` is engine-owned (`V2HandlerContext.runMode`, core `host.ts`);
handlers never branch on client input flags.

## Policies

- **Never overwrite.** Existing destination files (including audio-shaped
  names and existing `manifest.json` sidecars) fail with a reason
  instead of being replaced. This fixes the v1 B12 class: the manifest
  travels to the ZIP as an in-memory archive entry (core
  `V2ArchiveEntry`), never a predictable `.<pack>-manifest.tmp.json`
  sidecar that `finally` deletes.
- **Collision reservation.** Folder output sanitizes and dedupes
  case-insensitively (`Hit.wav` + `hit.wav` → `Hit.wav`, `hit 2.wav`);
  `manifest.json` is reserved first when a manifest is written. ZIP
  entry names are Library filenames verbatim (core-owned), so
  case-insensitive entry collisions and manifest collisions block in
  the preview with guidance to use folder output.
- **Missing sources.** Records gone from the Library index report as
  `missing`; files gone from disk report as `skipped` (folder) or fail
  the atomic ZIP run with the filename in the reason. Removed
  selection records reject at preflight (`selection-unresolvable`)
  before anything is written.
- **Cancellation.** Cancelling removes job-owned incomplete output by
  ownership (`workspace.dispose`) and settles the job as cancelled —
  never a misleading success. Finished packs and unrelated
  destination contents are never deleted.
- **Limits.** 500 entries (service bound, rejected before any write),
  1 MiB manifest text, ZIP32 (no ZIP64): 65,535 entries, 4 GiB per
  entry/offset. Failures remove partial outputs.
- **ZIP integrity.** The app codec (`src/lib/extensions-v2/archive.ts`)
  streams entries with CRC32 + data descriptors; the integration suite
  verifies every archive with an independent EOCD/central-directory
  reader (bytes, names, manifest, counts).

## Before/after parity

| v1 workflow | v2 behavior | Notes |
| --- | --- | --- |
| Pack from selection | Same, via `from-selection` (selection scope) | IDs deduped; removed records reject before writing |
| Pack from Sound Shelf | Same, via `from-shelf` + app-owned `shelf` source adapter | Adapter reads the persisted Shelf record directly; never executes v1 commands |
| Pack from recent sounds | Same, via `from-recent` + app-owned `recent` source adapter | Adapter reads the persisted recent record; store failures report instead of returning empty |
| Folder output | Same files + `manifest.json` | Written flat into the picked destination (the destination **is** the pack folder); v1 nested `dest/packName/` |
| ZIP output | Same archive + manifest entry | Stored (uncompressed) ZIP; manifest is an in-memory entry |
| Pack name setting | Same, per-run + `pack-name` default | 80-char cap, OS-invalid sanitized, per-source fallback |
| Default format setting | Same (`default-format` folder/zip) | Own namespace; no migration from v1 |
| Include-manifest setting | Same (`include-manifest` boolean) | Reserved against collisions |
| Input validation | Same messages where sensible | `outputFormat`/`includeManifest` type-checked; 500-entry bound |
| Preview | Richer: source table, rename/conflict notices, missing list | Generic plan-preview UI + dialog |
| Destination selection | Desktop picker → destination grant | Grant-scoped writes; tokens never reach handlers |
| Confirmation | Explicit Start (job) or review confirm (apply) | Unconfirmed plans never write |
| Job progress | Per-file progress via job reporter | Poll the job route; reload-safe by job ID |
| Cancellation | Removes job-owned partials, settles cancelled | Documented above; v1 had no cancellation |
| Detailed results | Counts + skipped/missing/failed with reasons + output path | Validated against the result schema |
| Reveal/open | Capability-aware (`desktop:reveal` hint; desktop-gated button) | Disabled with a reason outside the desktop app |
| Manifest temp file | **Fixed, not preserved** | No dot-tmp files; sidecars survive (B12 regression test) |
| Overwrite conflicts | Fail with reason, never overwrite | v1 ZIP path also refused existing outputs; folder copies now conflict-safe too |

Explicitly unsupported: ZIP entry renaming (ZIP keeps Library filenames
verbatim — use folder output for collision-heavy selections), ZIP64
archives over 4 GiB, packing more than 500 sounds in one run, and
silent v1→v2 settings migration (re-enter the three settings; the
names match v1 on purpose).

## Use it

1. Settings → Extensions → **Make Pack v2** → enable.
2. Approve all declared permissions (the Approve button).
3. Pick sounds (or open the Shelf), then Pack v2… from the row menu,
   bulk bar, palette, or the Shelf header.
4. Preview → Choose destination → Pack. Cancel anytime; watch the
   result counts and Open destination on desktop.
