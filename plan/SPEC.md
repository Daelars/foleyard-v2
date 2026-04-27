# SoundSlop - Local Audio Library Manager

## Tech Stack
- Next.js 16 (App Router) + TypeScript
- Bun (package manager + runtime)
- SQLite + Drizzle ORM
- Tailwind CSS + shadcn/ui (dark mode default)
- wavesurfer.js (audio playback + waveforms)
- music-metadata (metadata extraction)

## Data Model

### File
- id (UUID)
- path (absolute)
- filename
- format (mp3, wav, ogg, etc.)
- duration (seconds)
- sampleRate
- bitDepth
- channels
- fileSize
- createdAt
- updatedAt
- isFavorite (boolean)

### Tag
- id
- name
- createdAt

### FileTag (many-to-many)
- fileId
- tagId

### Collection
- id
- name
- createdAt

### FileCollection (many-to-many)
- fileId
- collectionId

## Features

### Scanning
- Manual "scan folder" button
- Auto-extract: duration, sample rate, bit depth, channels, format, file size
- Extract tags from folder/filename (V1)

### Search & Filter
- FTS5 full-text search (filename, tags, notes)
- Filter by: format, duration range, sample rate, date added
- Sort by: name, date, duration

### Audio Preview
- Stream directly from disk
- Waveform visualization
- Play/pause, volume, loop controls

### Collections & Favorites
- Single "like" (favorite) per file
- Flat collections (many-to-many)
- Create/manage collections in UI

### Bulk Operations
- Multi-select files
- Apply tags to selection
- Auto-suggest from folder/filename

### UI
- Dark mode by default
- File details panel
- Keyboard shortcuts (space, arrows)
- Copy path to clipboard

## Deployment
- Localhost only
- `bun run dev` for dev
- `bun run build && bun start` for production