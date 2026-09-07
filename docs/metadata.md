# Metadata

> Feature status: shipped
> Contract: internal
> Owner: `src/lib/metadata.ts`
> Applies to: docs manifest ID (`metadata`); development checkout when unbuilt

## What it does

Extracts technical audio metadata at scan time (and on demand) from local
files using `music-metadata`, and exposes organization metadata
(Collections, tags, favorites) managed from the Settings Metadata tab.
There is no embedded-tag writing API.

## Responsibilities and boundaries

- Extracted technical fields vs. user organization are separate systems:
  technical fields are read-only derivatives of file bytes; Collections
  and tags are user data stored in SQLite.
- `music-metadata` is a local parsing dependency, not an external
  provider or network service. Nothing is fetched remotely.
- The Settings Metadata tab manages Collections and tags; it does not
  edit embedded file tags.

## Runtime behavior

`src/lib/metadata.ts` parses in two stages: a 32 KB header read
(`HEADER_READ_BYTES = 32768`) via `parseHeader`, then a full parse only
when needed (`needsFullParse`: duration missing, sample-rate/channels
missing, or `wav`/`flac`/`aiff` missing bit depth). `AudioMetadata`
records `filename, format, codec, duration, sampleRate, bitDepth,
channels, fileSize`. MIME mapping covers `aac, aiff, flac, m4a, mp3, ogg,
wav`. The scan metadata-queue (concurrency 16, write batches of 250)
persists results through the file repository writes.

## Contracts

- Internal `AudioMetadata` interface in `src/lib/metadata.ts`; index
  record shape `ScanFileRecord` in
  `packages/yard-core/src/services/library/scan-types.ts`.
- No public or stable contract for tag writing: no endpoint or service
  writes embedded tags.

## Failure behavior and limitations

- Unparseable or partially-tagged files yield `null` fields rather than
  errors; the scan counts the file as processed with nulls, or as
  `failed` when extraction throws — the run continues.
- Distinct recordings can inherit tags incorrectly (finding B02,
  expected-to-fail, #136). A late tag failure can erase a newer edit
  (finding B04, expected-to-fail, #140).
- There is no embedded-tag writing API by design; tag edits live in the
  database only and do not modify file bytes.

## Source map (real file paths)

- `src/lib/metadata.ts` — header fallback + full parse, `AudioMetadata`
- `src/lib/scanner/metadata-queue.ts` — queued extraction during scans
- `src/lib/scanner/types.ts` — `MetadataSeam` contract
- `src/lib/database/files/writes.ts` — metadata persistence
- `src/lib/database/tag-repository.ts` — tag storage
- `src/lib/database/collection-repository.ts` — Collection storage
- `src/components/settings/*` — Settings tabs incl. Metadata management UI

## Examples

There is no `examples/` directory in this repo. No runnable example covers
metadata extraction; `core/query-library` reads post-extraction state
against the checkout.

## Related documentation

- `docs/scanning.md` — metadata-queue phase
- `docs/collections.md` — tags, Collections, favorites, Sound Shelf
- `docs/library.md` — file identity and index writes
- `docs/development.md` — expected-failures ledger (B02, B04)
