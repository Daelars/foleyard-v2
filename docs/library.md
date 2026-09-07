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
permanent delete unlinks the file (see `docs/filesystem.md`) and marks it
removed. The `use-library-files.ts` hook (252 statements, largest
unexecuted file) loads and coordinates the file list on the client.

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
- Collection-branch counts disagree with the main list (finding B03,
  expected-to-fail); root ownership is order-dependent across multiple
  roots (finding I03, expected-to-fail).

## Source map (real file paths)

- `packages/yard-core/src/domain/audio-file.ts` — Audio file domain record
- `packages/yard-core/src/services/library/scan-types.ts` — scan/file record shapes,
  `SUPPORTED_AUDIO_EXTENSIONS`
- `src/lib/database/file-repository.ts` — file repository facade
- `src/lib/database/files/reads.ts` — Drizzle browse/search reads
- `src/lib/database/files/writes.ts` — index writes
- `src/lib/database/files/batch.ts`, `src/lib/database/files/context.ts` — batching/context
- `src/lib/database/collection-repository.ts`, `src/lib/database/tag-repository.ts`,
  `src/lib/database/browse-repository.ts` — organization + browse stores
- `src/lib/database/connection.ts`, `src/lib/database/migrations.ts`,
  `src/lib/database/settings-repository.ts` — connection, migrations, settings
- `src/lib/db.ts` — wires SQLite implementations to `yard-core` contracts
- `src/lib/schema.ts` — Drizzle schema
- `src/app/library/use-library-files.ts` — client file-list hook

## Examples

There is no `examples/` directory in this repo. The runnable-in-repository
example `core/query-library` exercises a library query against the checkout.

## Related documentation

- `docs/scanning.md` — how roots get reconciled into the index
- `docs/search.md` — query, pagination, sort, LIKE escaping
- `docs/filesystem.md` — grants, readable/writable resolution, permanent delete
- `docs/collections.md` — Collections, tags, favorites
