# Library

> Feature status: shipped
> Contract: internal
> Owner: `packages/yard-core` (domain) + `src/lib/database/*` (SQLite implementation)
> Applies to: docs manifest ID (`library`); development checkout when unbuilt

## What it does

The Library is the user's indexed set of local audio files plus
organization data. Users configure Library roots (local directories),
browse indexed audio files, and remove entries. Scanning reconciles the
filesystem with the index (see `docs/scanning.md`); this guide covers
roots, file identity, browsing, and removal.

## Responsibilities and boundaries

- `packages/yard-core/src/domain/audio-file.ts` defines the Audio file
  record language; `src/lib/database/*` implements persistence over
  SQLite/Drizzle. Yard Tools build against `yard-core` contracts, never
  storage directly.
- The Library indexes local files only. There is no external loading,
  cloud library, or public SDK.
- Domain term is Collection, never playlist.

## Runtime behavior

Roots are stored through the settings repository and read back via
`getLibraryRoots()` for every scan, browse, stream, and waveform call.
Validation (`src/lib/scanner/validation.ts`) normalizes the candidate,
checks readability, and samples audio files before a root is saved.
Browsing reads through `src/lib/database/files/reads.ts` (Drizzle),
filtered by query, favorites, Collection, tag, directory, and library
root, with pagination. Removal is soft by default (`removedAt` set);
permanent delete records a durable intent, unlinks the file only while it
still matches the indexed identity, and marks it removed (see
`docs/filesystem.md`); an interrupted permanent delete is reconciled on the
next scan. A removed path that reappears under a new name is reconciled as a
move using the same size+mtime identity (see "Identity signals and moves");
the `use-library-files.ts` hook loads and coordinates the file list on the
client.

## Identity signals and moves

A move and a removed-and-replaced file look identical at the directory
level: the old path is gone and a new one appeared. The Library tells them
apart with the same identity signal permanent deletion validates against
(#269, #274). This is the documented decision for "which signals count as
the same recording":

- **Identity is size and mtime only.** Two records describe the same
  recording when `fileSize` and `mtimeMs` are both known and equal.
  Filename, path, duration, codec, and directory are not identity signals.
  A null on either side is never a match: an unknown signal fails closed.
- **Same root only.** A move is considered only within one Library root. The
  same size and mtime under a different root is a different file.
- **A real move preserves organization data.** When exactly one active file
  matches the removed path, it inherits the removed recording's Collections,
  tags, embeddings, and favorite flag, and the removed row is dropped.
- **Ambiguity is never guessed.** When a removed path matches more than one
  active file, or one active file is the only match for more than one removed
  path, the result is ambiguous. The scan records it in the `ambiguous_moves`
  journal and reports it in scan status (`ambiguousMoves`); it does not copy
  organization data. The removed record and its data stay put, and the new
  path stands as a separate add — so a distinct recording never inherits
  another's data.
- **No content hashing on scan.** Hashing every file is too expensive at
  Library scale, so a scan never hashes content. Hashing is allowed only as
  an explicit, user-initiated confirmation of an already-ambiguous case,
  never automatically.

## Contracts

- `AudioFileRepository` / `SettingsRepository` interfaces in
  `packages/yard-core/src/repositories/*`, implemented by the SQLite
  repositories wired in `src/lib/db.ts`.
- `ScanFileRecord` / `PathValidation` shapes in
  `packages/yard-core/src/services/library/scan-types.ts`.

## Failure behavior and limitations

- Root outside readable storage or containing no audio: validation fails,
  root not saved.
- Removed-then-rescanned files can reappear (finding B10,
  expected-to-fail): removal is undone by rescan.
- A replacement recording never inherits a distinct recording's tags,
  embeddings, favorites, or Collections (finding B02, #136; fixed). The
  earlier relink matched on filename, size and audio metadata and handed the
  removed row's data to a different recording; it now matches on size+mtime
  only and fails closed on an ambiguous match.
- The identical-size-and-mtime blind spot is inherited from the #269
  identity signal: a genuinely different recording that happens to share
  both size and mtime with exactly one removed row can still be read as a
  move. Ambiguity (more than one candidate) is the case the journal catches.
- Collection-branch counts disagree with the main list (finding B03,
  expected-to-fail); root ownership is order-dependent across multiple
  roots (finding I03, expected-to-fail).

## Source map (real file paths)

- `packages/yard-core/src/domain/audio-file.ts` — Audio file domain record
- `src/lib/files/identity.ts` — the size+mtime identity signal shared by
  permanent deletion and move reconciliation
- `packages/yard-core/src/services/library/scan-types.ts` — scan/file record shapes,
  `SUPPORTED_AUDIO_EXTENSIONS`
- `src/lib/database/file-repository.ts` — file repository facade
- `src/lib/database/files/reads.ts` — Drizzle browse/search reads
- `src/lib/database/files/writes.ts` — index writes
- `src/lib/database/files/batch.ts`, `src/lib/database/files/context.ts` — batching/context,
  move reconciliation
- `src/lib/database/move-journal.ts` — `ambiguous_moves` storage
- `src/lib/database/collection-repository.ts`, `src/lib/database/tag-repository.ts`,
  `src/lib/database/browse-repository.ts` — organization + browse stores
- `src/lib/database/connection.ts`, `src/lib/database/migrations.ts`,
  `src/lib/database/settings-repository.ts` — connection, migrations, settings
- `src/lib/db.ts` — wires SQLite implementations to `yard-core` contracts
- `src/lib/schema.ts` — Drizzle schema
- `src/app/library/use-library-files.ts` — client file-list hook

## Examples

The runnable-in-repository example `core/query-library` exercises a
library query against the checkout; `examples/extensions-v2/minimal`
covers extension authoring instead.

## Related documentation

- `docs/scanning.md` — how roots get reconciled into the index
- `docs/search.md` — query, pagination, sort, LIKE escaping
- `docs/filesystem.md` — grants, readable/writable resolution, permanent delete
- `docs/collections.md` — Collections, tags, favorites
