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
removed. The `use-library-files.ts` hook loads and coordinates the file
list on the client.

### Root detachment (#271)

Removing a Library root is soft by default. The root's indexed Audio files
are marked detached (`files.detached_at`) and every Library read — search,
browse, directory listing, counts, favourites, Collection and tag reads,
playback and waveform — treats them as not owned through one shared
predicate (`ownedFileWhere` in `src/lib/database/file-ownership.ts`;
`isOwnedAudioFile` in yard-core). The rows are **not** deleted: tags,
favourites, Collection membership and embeddings survive.

Re-adding the same root reattaches those records by path and identity with
their organization data; nothing else clears detachment. Root removal is one
recoverable operation: a durable intent (`pending_root_changes`) is committed
before a single transaction drops the root from settings and marks its files,
then the intent is cleared; an interrupted removal is reconciled on the next
scan. An explicit `forget` action (`POST /api/settings { action: "forget" }`)
removes the root **and** deletes its files and organization data. The full
decision is `docs/adr/library-root-detachment.md`.

## Contracts

- `AudioFileRepository` / `SettingsRepository` interfaces in
  `packages/yard-core/src/repositories/*`, implemented by the SQLite
  repositories wired in `src/lib/db.ts`.
- `ScanFileRecord` / `PathValidation` shapes in
  `packages/yard-core/src/services/library/scan-types.ts`.
- Ownership: `AudioFile.detachedAt` (null when owned) and
  `isOwnedAudioFile` in `packages/yard-core/src/domain/audio-file.ts`;
  `ownedFileWhere` / `notDetachedWhere` in
  `src/lib/database/file-ownership.ts`; root changes in
  `src/lib/database/root-detachment.ts`.

## Failure behavior and limitations

- Root outside readable storage or containing no audio: validation fails,
  root not saved.
- Removed-then-rescanned files can reappear (finding B10,
  expected-to-fail): removal is undone by rescan.
- Collection-branch counts disagree with the main list (finding B03,
  expected-to-fail); root ownership is order-dependent across multiple
  roots (finding I03, expected-to-fail).
- Detached records stay invisible until their root is re-added; a detached
  root nested inside an owned root is rediscovered by that owned root's scan
  (#309, overlapping roots).

## Source map (real file paths)

- `packages/yard-core/src/domain/audio-file.ts` — Audio file domain record
- `packages/yard-core/src/services/library/scan-types.ts` — scan/file record shapes,
  `SUPPORTED_AUDIO_EXTENSIONS`
- `src/lib/database/file-repository.ts` — file repository facade
- `src/lib/database/file-ownership.ts` — the shared ownership predicate
- `src/lib/database/root-detachment.ts` — detach/forget/reattach + recovery journal
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

The runnable-in-repository example `core/query-library` exercises a
library query against the checkout; `examples/extensions-v2/minimal`
covers extension authoring instead.

## Related documentation

- `docs/scanning.md` — how roots get reconciled into the index
- `docs/search.md` — query, pagination, sort, LIKE escaping
- `docs/filesystem.md` — grants, readable/writable resolution, permanent delete
- `docs/collections.md` — Collections, tags, favorites
- `docs/adr/library-root-detachment.md` — the root removal decision