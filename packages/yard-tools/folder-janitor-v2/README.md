# Folder Janitor v2

Port of the Folder Janitor tool onto the v2 extension engine (J4, issue
#179). Displayed as **Folder Janitor v2**. Bundled internal port,
disabled by default, explicit enable/disable, own settings namespace
(`folder-janitor-v2.*`), no auto-migration from v1. The v1 Folder
Janitor keeps its routes and behavior untouched.

Find duplicate sounds, empty files, empty folders, tiny junk files,
unusual formats, and missing files, then clean up.

## Layout

- `src/definition.ts` — v2 definition: id `folder-janitor-v2`, four
  commands (`.scan-library`, `.scan-folder`, `.remove-files`,
  `.delete-folders`), two settings, five contributions. Permissions:
  `library:read`, `library:write`, `files:read`, `files:delete`,
  `settings:read`, `settings:write`. No `requiredCapabilities`.
- `src/policy.ts` — pure issue derivation from Library index metadata
  (duplicate, empty/`broken`, tiny, unusual format), format/threshold
  parsing, path normalization, and the parallel-array report shape.
- `src/handlers.ts` — scan orchestration (index paging + bounded folder
  walk), `remove-files` (index mutation), and the destructive
  `delete-folders` plan contract. No v1 imports, no `node:fs`, no
  recursive `rmdir`.

## Run-mode contract

- **scan-library / scan-folder** — run as jobs: they page the Library
  index and walk folders through the bounded listing op, reporting
  progress and honoring cancellation. They also run in `direct`
  execute (progress/cancel become no-ops). Read-only: no plan needed.
- **remove-files** — immediate. Marks the selected index IDs removed
  (`library:write`); reversible at the index level.
- **delete-folders** — destructive: `direct` previews a review plan;
  `apply` deletes each empty folder only after the host records the
  review stamp. A client `confirmed` flag is never sufficient.

## Policies

- **Index-derived issues (no disk stat).** Duplicates (same name +
  size), empty files (`broken`), tiny files, and unusual formats come
  straight from the index — the v2 op surface has no per-file `stat`,
  and reading whole files to size them would be wrong for a scan.
- **Empty folders + missing files from the folder walk.** The bounded
  listing op walks each Library root (or the one scanned folder). A
  folder with no files and only empty subfolders is itself empty
  (matching v1). An indexed file not seen while its tree was **fully**
  walked is reported missing — never on an aborted or budget-capped
  walk, so a partial scan cannot invent false "missing" reports
  (`truncated: true` flags that case).
- **Bounds.** Up to `MAX_SCAN_RECORDS` (50,000) index records and
  `MAX_FOLDER_LISTINGS` (5,000) directory listings per scan; exceeding
  either sets `truncated`.
- **Destructive deletes are contained.** `delete-folders` runs through
  the authorized delete op: the folder must sit strictly inside a
  Library root (never a root itself) and must still be empty at delete
  time (rechecked). Source grants never authorize deletion. A
  non-empty or vanished folder fails with a reason; other folders in
  the batch still process.
- **Honest settling.** Cancelling a scan settles it cancelled with no
  partial writes. Cancelling `delete-folders` stops further deletions;
  folders already removed stay removed (a completed `rmdir` has no
  partial state to roll back).

## Before/after parity

| v1 workflow | v2 behavior | Notes |
| --- | --- | --- |
| Scan Library Mess | Same, via `scan-library` (job) | Progress + cancellation; report shape is parallel arrays |
| Scan Folder Mess | Same, via `scan-folder` (folder scope) | Folder comes from the invocation, authorized via the listing op |
| Duplicate / tiny / weird-format / empty-file | Same, from index metadata | Deterministic order; no disk read |
| Empty-folder detection | Same, via the bounded listing op | v1 used recursive `fs.readdir`; v2 uses the authorized folder walk |
| Missing-file detection | Same intent, from the folder walk | v1 used `fs.stat` per file; v2 infers absence from a completed walk and suppresses on a partial walk |
| `broken` (unreadable, not-a-file) | **Partial** | v1 read each file to tell unreadable/non-file from missing; v2 reports empty files as `broken` and absent files as `missing-file`, but cannot distinguish an unreadable-but-present file (no `stat` op) — recorded limitation |
| Remove Files from Index | Same, via `remove-files` | `library:write` (v1 used `files:write`); unknown IDs reported, never fail the batch |
| Delete Empty Folders | Same, via `delete-folders` + review | v1 deleted on call; v2 requires the review stamp and rechecks containment + emptiness at delete time |
| Settings (threshold, formats) | Same, own namespace | `folder-janitor-v2.*`; per-run input can override |
| `janitor.scan` / `library.write` / `files.delete` capabilities | Permission-only | Matches the make-pack-v2 precedent |

Explicitly unsupported / deliberately changed: distinguishing an
unreadable present file from a missing one (no `stat` op in the v2
surface); recursive folder deletion (only empty folders, one at a
time); and silent v1→v2 settings migration.

## Use it

1. Settings → Extensions → **Folder Janitor v2** → enable.
2. Approve the declared permissions.
3. Run Scan Library (palette) or Scan Folder (folder menu); review the
   report. Remove indexed files (row/bulk menu) or delete empty folders
   — deletes preview first and require confirmation.
