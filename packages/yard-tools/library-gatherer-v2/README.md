# Library Gatherer v2

Port of the Library Gatherer tool onto the v2 extension engine (G5, issue
#180). Displayed as **Library Gatherer v2**. Bundled internal port,
disabled by default, explicit enable/disable, own settings namespace
(`library-gatherer-v2.*`), no auto-migration from v1. The v1 Library
Gatherer keeps its routes and behavior untouched.

Pull sounds from scattered folders, drives, packs, and project folders
into one main Foleyard library.

## Layout

- `src/definition.ts` — v2 definition: id `library-gatherer-v2`, two
  commands (`.preview-gather`, `.gather`, global scope), two settings,
  three contributions (palette ×2, settings). Permissions:
  `library:read`, `library:write`, `files:read`, `files:copy`,
  `settings:read`, `settings:write`. No `requiredCapabilities`.
- `src/policy.ts` — pure gather policy: audio-extension matching, flat
  output-name planning with folder-name prefixing and case-insensitive
  dedupe (`name.ext`, `name 2.ext`, …), and the parallel-array result
  shape. No services, no filesystem, no v1 imports.
- `src/handlers.ts` — `preview-gather` (bounded source walk, no side
  effects) and `gather` (source-copy op + library-mutation insert, job
  with progress and cancellation). No v1 imports, no direct filesystem
  imports, no recursive copy.

## Run-mode contract

- **preview-gather** — immediate. Lists readable source grants
  (bounded, cancellable), filters audio files, and plans flat output
  names. No side effects, no destination needed.
- **gather** — job (also runs in `direct` execute with progress/cancel
  as no-ops). Copies each planned file into the destination grant
  through the source-copy op (never overwrites: an existing name is
  skipped or fails with a reason, per `skip-duplicates`) and inserts
  index records via the library-mutation op. Cancellation disposes
  job-owned copies and settles honestly.

## Policies

- **Sources are readable grants.** External folders arrive as source
  grants (E1 #176); expired or foreign grants deny with a reason.
- **Bounds.** Up to `MAX_SOURCE_LISTINGS` (5,000) directory listings per
  preview/gather walk and `MAX_GATHER_FILES` (500) files copied per
  gather; exceeding either sets `truncated` with a reason.
- **Flat destination.** The copy op forbids path separators, so v2
  gathers into one flat folder — grouping shows up in the name
  (`<folder> - <file>`) when `preserve-folder-names` is on, not as a
  subfolder.
- **Conflicts fail with reasons, never overwrite.** Planned names
  dedupe case-insensitively within the run; destination collisions
  skip (when `skip-duplicates`) or fail with a reason.

## Before/after parity

| v1 workflow | v2 behavior | Notes |
| --- | --- | --- |
| Preview gather | Same, via `preview-gather` | Bounded walk, audio filter, planned names; no side effects |
| Gather into library | Same, via `gather` + destination grant | Source-copy op + library-mutation insert; job with progress + cancellation |
| Source folders | Readable source grants | v1 took raw paths; v2 requires authorized grants (expired/foreign deny) |
| Preserve folder names | Same, own namespace | `library-gatherer-v2.preserve-folder-names`; flat prefix, not subfolders |
| Skip duplicates | Same, own namespace | `library-gatherer-v2.skip-duplicates`; collisions skip or fail with reason, never overwrite |
| Audio extensions | Same set | wav, aif/aiff, mp3, flac, ogg, m4a, aac |
| `gather.preview` / `gather.write` capabilities | Permission-only | Matches the make-pack-v2 precedent |

Explicitly unsupported / deliberately changed: raw-path sources (grants
required), recursive folder-structure output (flat destination with
name prefixes), overwriting existing destination files, and silent v1→v2
settings migration.

## Use it

1. Settings → Extensions → **Library Gatherer v2** → enable.
2. Approve the declared permissions.
3. Run Preview Library Gather (palette) with source grants, then Gather
   Library with a destination grant.
