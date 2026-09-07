# Playback and waveforms

> Feature status: shipped
> Contract: internal
> Owner: `src/components/AudioPlayer/*` + `src/app/api/audio/route.ts` + `src/lib/waveform-*.ts`
> Applies to: docs manifest ID (`playback`); development checkout when unbuilt

## What it does

Previews indexed audio in the library workspace: the `AudioPlayer`
composition streams file bytes with HTTP Range support and renders a
peak waveform generated locally with FFmpeg.

## Responsibilities and boundaries

- Local playback only. The server streams bytes of files already under
  Library roots; there is no streaming provider, external loading, or
  public SDK.
- Waveforms are locally computed derivatives, cached on disk
  (`.waveform-cache/`); they are not embedded tags and never modify audio.
- Domain terms: Audio file, Collection, favorites. "Playlist" is avoided.

## Runtime behavior

`AudioPlayer` composes `player-shell.tsx` with `use-audio-element.ts`
(element lifecycle), `use-audio-playback.ts` (play/pause/seek state),
`use-transport-queue.ts` + `transport-queue.ts` (queue order),
`use-waveform-peaks.ts` (peak fetching via `src/lib/client-waveform.ts`),
`use-volume-preferences.ts`, `volume-control.tsx`, `favorite-button.tsx`,
and `collection-menu.tsx`.
`GET /api/audio?id=…` resolves the record via `getFileById`, confines the
path with `resolveExistingPathWithinRoots(file.path, getLibraryRoots())`,
serves `Range` bytes (`parseByteRange`, suffix ranges supported, 206
partial / 200 full) with the per-extension MIME map, and — as a side
effect — records the file as a recent Make Pack candidate
(`recordRecentMakePackFile` in
`src/lib/extensions/make-pack-recent-store.ts`).
`GET /api/waveform?id=…&peaks=N` (N in 32–512, default 180) resolves the
same way, calls `getWaveformPeaks` (`src/lib/waveform-cache.ts`), decodes
via `src/lib/waveform-decoder.ts`, generates with FFmpeg
(`src/lib/waveform-generator.ts`, `resizeWaveform` for the requested count).

Format matrix (`SUPPORTED_AUDIO_EXTENSIONS` in
`packages/yard-core/src/services/library/scan-types.ts`:
`.mp3 .wav .ogg .flac .aiff .m4a .aac`):

| Extension | Indexed | Metadata parsed | Waveform (FFmpeg) | Playback (`/api/audio` MIME) |
| --- | :-: | :-: | :-: | --- |
| `.mp3` | yes | yes | yes | `audio/mpeg` |
| `.wav` | yes | yes | yes | `audio/wav` |
| `.ogg` | yes | yes | yes | `audio/ogg` |
| `.flac` | yes | yes | yes | `audio/flac` |
| `.aiff`/`.aif` | `.aiff` indexed; `.aif` served | yes | yes | `audio/aiff` |
| `.m4a` | yes | yes | yes | `audio/mp4` |
| `.aac` | yes | yes | yes | `audio/aac` |

Playback ultimately depends on the browser's `<audio>` codec support for
the served MIME, not just indexability. Indexing/metadata/waveform support
must not be read as a playback guarantee for every browser.

## Contracts

- Internal route contracts: `/api/audio?id=<fileId>` with optional
  `Range` header; `/api/waveform?id=<fileId>&peaks=<32–512>`.
- `ScanPhase`/extension matcher (`isSupportedAudioFile`,
  `createExtensionMatcher`) shared from `yard-core` scan-types.

## Failure behavior and limitations

- Missing record, `removedAt` set, or path outside roots: 404.
- Malformed Range on an empty/unknown size: served as full 200 or 400/416
  per `parseByteRange` outcome; unsatisfiable starts return null.
- Waveform failure logs server-side and returns 500
  (`Failed to generate waveform`); the player still streams audio.
- `/api/audio` unconditionally records a recent Make Pack entry on
  success — clients cannot opt out per request.

## Source map (real file paths)

- `src/components/AudioPlayer/player-shell.tsx`, `use-audio-element.ts`,
  `use-audio-playback.ts`, `use-transport-queue.ts`, `transport-queue.ts`,
  `use-waveform-peaks.ts`, `use-volume-preferences.ts`, `volume-control.tsx`,
  `favorite-button.tsx`, `collection-menu.tsx`, `types.ts`
- `src/app/api/audio/route.ts` — Range streaming + recent-recording side effect
- `src/app/api/waveform/route.ts` — waveform endpoint
- `src/lib/waveform-cache.ts`, `src/lib/waveform-generator.ts`,
  `src/lib/waveform-decoder.ts`, `src/lib/client-waveform.ts` — cache, FFmpeg
  generation, decoding, client fetch
- `packages/yard-core/src/services/library/scan-types.ts` — `SUPPORTED_AUDIO_EXTENSIONS`
- `src/lib/extensions/make-pack-recent-store.ts` — recent side effect store

## Examples

There is no `examples/` directory in this repo. No runnable example covers
playback; peaks can be inspected via `GET /api/waveform?id=<id>` in a
development checkout.

## Related documentation

- `docs/library.md` — file identity and roots gating every stream
- `docs/filesystem.md` — readable-path resolution used by both routes
- `docs/collections.md` — Collection menu and favorites in the player
- `docs/search.md` — finding files to preview
