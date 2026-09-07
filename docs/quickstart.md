# Quickstart

> Feature status: shipped
> Contract: none
> Owner: `src/app/library`
> Applies to: docs manifest ID (`quickstart`); development checkout when unbuilt

## What it does

Walks a new user through the core loop: add a Library root, scan it,
search the index, preview audio, and organize results into Collections
and tags. Each step links to the guide that documents it in full.

## Responsibilities and boundaries

- Covers the shipped user path only: local audio files under configured
  Library roots. No external loading, cloud sync, public SDK, or
  third-party providers are involved or claimed.
- Uses Collection terminology throughout (regular and smart Collections,
  tags, favorites). The term "playlist" is avoided per the domain language.
- Does not cover extension authoring, release engineering, or prototype
  screens under `src/app/prototype/**` (experimental, throwaway).

## Runtime behavior

1. **Add a root.** Open Settings → Library and choose a local directory
   with the folder picker. The path is validated
   (`validateLibraryRoot`: normalized, readable, sample audio count) and
   stored via the settings repository. See `docs/library.md`.
2. **Scan.** `POST /api/scan` starts a `ScanRunner` run through
   `src/lib/scanner/run-scan.ts`: discovery → reconcile →
   metadata-queue → progress. Poll `GET /api/scan` (or rely on
   `use-scan-polling.ts`, 2 s interval) until `running` is false.
   See `docs/scanning.md`.
3. **Search.** Type in the library view. `GET /api/files?q=…` runs a
   Drizzle read with `LIKE` escaping, pagination (`limit`/`offset`),
   and `filename`/`duration` sort. See `docs/search.md`.
4. **Preview.** Select a row and press play. The player streams
   `GET /api/audio?id=…` (HTTP Range) and renders peaks from
   `GET /api/waveform?id=…`. See `docs/playback.md`.
5. **Organize.** Create a Collection, attach tags, or toggle favorites;
   smart Collections derive membership from a saved `{ q }` filter.
   The Settings Metadata tab manages Collections and tags.
   See `docs/collections.md` and `docs/metadata.md`.

## Contracts

- User-visible flow only; no API stability promise beyond the routes
  named above. Route query shapes are documented in `docs/search.md`
  and `docs/scanning.md`.

## Failure behavior and limitations

- Unreadable or audio-free directory: validation reports the reason and
  the root is not saved.
- Scan is best-effort per file: individual metadata failures are counted
  (`failed`/`errors` in `ScanStatus`) without aborting the run.
- Collection-branch counts currently disagree with the main file list
  (finding B03, expected-to-fail); search does not use full-text or
  semantic ranking — substring `LIKE` only.

## Source map (real file paths)

- `src/app/library/use-library-view.ts` — library view coordination
- `src/app/library/use-library-files.ts` — file list loading (largest unexecuted file, 252 stmts)
- `src/app/library/use-settings-scan.ts` — settings scan controls
- `src/hooks/use-scan-polling.ts` — 2 s scan polling
- `src/components/AudioPlayer/player-shell.tsx` — player composition

## Examples

There is no extension authoring in this path (see
`docs/extensions-v2.md` for that), and prototype screens under
`src/app/prototype/**` stay experimental and throwaway. Once the
loop above works, Make Pack v2 is worth a look: Settings,
Extensions, enable it, approve its permissions, and pack a few
sounds (see `docs/extensions-v2-make-pack.md`). The runnable-in-repository
examples are `extensions/selected-ids`, `core/query-library`, and
`extensions-v2/minimal` (reported by `getDocumentationLocation()`);
all three run against the checkout.

## Related documentation

- `docs/library.md` — roots, file identity, browsing, removal
- `docs/scanning.md` — scan lifecycle, phases, polling, partial failure
- `docs/playback.md` — player, range streaming, waveforms, format matrix
- `docs/collections.md` — regular/smart Collections, tags, favorites, Sound Shelf
- `docs/development.md` — setup, tests, and release for contributors
