# SoundSlop

SoundSlop is a local-first sound library browser for large collections of sound effects and music cues. It indexes audio files from a folder on your machine, lets you browse by directory, search quickly, preview sounds, favorite files, and build custom playlists.

## Features

- Local library indexing for MP3, WAV, FLAC, OGG, AIFF, AAC, and M4A files
- Folder-first browsing with searchable file results
- Bottom audio player with waveform scrubbing, volume, favorites, and playlist assignment
- Playlists for custom sound groups, cues, kits, or project-specific selections
- Favorites view
- Settings modal for library path validation, scanning, playlists, and tags
- SQLite-backed local database using `better-sqlite3` and Drizzle ORM

## Stack

- Next.js 16
- React 19
- Bun
- Tailwind CSS 4
- Base UI / shadcn-style components
- Drizzle ORM
- SQLite via `better-sqlite3`
- ElevenLabs UI waveform component

## Requirements

- Bun
- Node.js 18 or newer
- A local folder containing audio files

## Getting Started

Install dependencies:

```bash
bun install
```

Start the development server:

```bash
bun run dev
```

Open:

```text
http://localhost:3000
```

Then open Settings, choose your library folder, validate it, save it, and run a scan.

## Scripts

```bash
bun run dev
```

Run the Next.js dev server.

```bash
bun run build
```

Create a production build and type-check the app.

```bash
bun run start
```

Run the production server after building.

```bash
bun run lint
```

Run ESLint.

## Local Data

SoundSlop stores indexed metadata in a local SQLite database in the project root:

```text
soundslop.sqlite
soundslop.sqlite-wal
soundslop.sqlite-shm
```

These files are ignored by git because they are machine-specific runtime data.

The audio files themselves are never copied into the app. SoundSlop stores paths and metadata only.

## Library Scanning

The scanner:

- validates that the configured folder exists and is readable
- discovers supported audio files recursively
- extracts metadata such as duration, format, channels, and file size
- marks missing files as removed
- preserves favorites, playlists, and tags when moved files can be safely matched by filename, file size, and duration

If you rename parent folders, run a scan again. The app will attempt to reconcile moved files instead of losing playlist/favorite state.

## Playlists

Playlists are custom groupings of sounds. Add the currently selected sound from the audio player with `Add to Playlist`.

Deleting a playlist removes only the playlist and its memberships. It does not delete audio files from disk or from the library index.

## Notes

- This is designed as a single-user local app.
- Absolute file paths are stored in the local SQLite database.
- The app is not intended to be deployed publicly without changing the file access model.
