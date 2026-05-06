# Codex Prompt: Refactor Foleyard Core into `yard-core`

You are working on my app, Foleyard.

Foleyard is a local-first desktop audio library browser built with Next.js + Electron. Its absolute core features are:

1. Local Audio Library Scanning
   - User chooses a root directory
   - App scans supported audio files: mp3, wav, flac, etc.
   - Extracts metadata: duration, sample rate, bit depth, format, path, parent folder

2. Audio Playback
   - Streams local audio
   - Supports seeking, play/pause, volume
   - Shows waveform visualization

3. Sound Organization
   - Tags with custom colors
   - Collections/playlists
   - Favorites

4. Search & Browse
   - Filename search with highlighting
   - Hierarchical directory navigation
   - Filtering by favorites, collections, and tags

5. Desktop Integration
   - Electron app
   - Native drag-and-drop out to external apps
   - Reveal in file explorer
   - Open files externally

## Current Modularity Issues

- `db.ts` is too large and contains too many unrelated database operations.
- `scanner.ts` is too monolithic and handles too many scan phases.
- `AudioPlayer.tsx` mixes UI, waveform logic, playback controls, and state.
- `FileTable.tsx` mixes virtual scrolling, search highlighting, context menus, drag-drop, and row rendering.
- `electron/main.cjs` mixes window creation, IPC, migrations, and native desktop features.

## Goal

Refactor the app toward a 10/10 modular architecture by creating a new core package/service called `yard-core`.

## Important

Do **not** redesign the UI.

Do **not** remove existing features.

Do **not** change the user-facing behavior unless absolutely necessary.

Do **not** build a marketplace or extension system yet.

The goal is to create a clean foundation where extensions/tools could eventually hook into core services without modifying monolithic files.

## Preferred Architecture

Create a local package/module called:

```txt
packages/yard-core
```

This should act as the stable core layer for Foleyard.

`yard-core` should contain:

- Domain models
- Service interfaces
- Core service implementations
- Repository interfaces
- Command registration primitives if useful
- Event types if useful
- Shared types
- Feature boundaries

The app should depend on `yard-core`, not the other way around.

## Suggested Structure

```txt
packages/
  yard-core/
    src/
      index.ts

      domain/
        audio-file.ts
        library.ts
        tag.ts
        collection.ts
        playback.ts
        search.ts

      services/
        library/
          library-service.ts
          scanner-service.ts
          metadata-service.ts
          scan-types.ts

        organization/
          tag-service.ts
          collection-service.ts
          favorite-service.ts

        search/
          search-service.ts
          browse-service.ts
          filter-service.ts

        desktop/
          desktop-service.ts

        commands/
          command-registry.ts
          command-types.ts

      repositories/
        audio-file-repository.ts
        tag-repository.ts
        collection-repository.ts
        favorite-repository.ts
        settings-repository.ts

      events/
        event-bus.ts
        event-types.ts

      errors/
        yard-core-error.ts
```

## Refactor Direction

### 1. Database Layer

Break the current massive `db.ts` into focused repositories.

Create repository interfaces in:

```txt
packages/yard-core/src/repositories
```

Keep concrete SQLite/database implementations in the app layer or in an adapter folder.

Avoid putting raw database details directly into UI components or API routes.

API routes should call services/repositories rather than raw DB helper functions.

### 2. Library Scanning

Split scanning into clear phases:

- Discover files
- Filter supported audio files
- Extract metadata
- Compare with indexed files
- Insert/update/remove records
- Emit scan progress

Move reusable scan logic into `yard-core`.

Keep OS-specific filesystem behavior behind an interface where possible.

### 3. Audio Playback

Split `AudioPlayer.tsx` into smaller pieces:

- Playback state hook
- Waveform hook/component
- Transport controls component
- Volume control component
- Timeline/seek component
- Presentational shell

Keep actual browser audio element logic separate from UI rendering.

Do **not** move React UI into `yard-core`.

Shared playback types/state machines may live in `yard-core`.

### 4. Organization

Move tag, collection, playlist, and favorite logic behind services:

- `TagService`
- `CollectionService`
- `FavoriteService`

API routes should become thin wrappers.

Keep schema and domain types cleanly separated.

### 5. Search & Browse

Split `FileTable.tsx` into:

- Table container
- Virtualized list
- Row component
- Context menu component
- Drag/drop behavior
- Search highlighting utility/component

Move search/filter/browse logic into `yard-core` services.

UI should receive already-filtered or clearly queryable data.

### 6. Desktop / Electron

Split `electron/main.cjs` into modules:

- Window creation
- IPC registration
- Native file actions
- Drag/drop support
- App lifecycle
- Migrations/startup

IPC handlers should call a desktop service layer where possible.

Keep preload security boundaries intact.

Do **not** weaken Electron security.

### 7. Command Foundation

Add a lightweight command registry in `yard-core`.

Core features can register commands such as:

- Scan library
- Rescan folder
- Search library
- Add to favorites
- Add to collection
- Reveal in explorer
- Open externally

This is **not** an extension marketplace yet.

It is just a clean internal foundation for future tools/extensions.

### 8. Public API

`packages/yard-core/src/index.ts` should export only stable public types/services.

Avoid exporting internal implementation details.

Make imports clean and intentional.

### 9. Tests

Add or update tests where practical.

At minimum, add tests for:

- Supported audio file detection
- Scan phase behavior
- Search/filter behavior
- Repository/service boundaries if existing test setup allows

If full tests are not possible, add clear TODOs and keep the refactor safe.

### 10. Safety

Preserve current behavior.

Keep existing routes working.

Keep existing Electron desktop features working.

Keep drag-and-drop working.

Keep audio preview working.

Keep tags, collections, playlists, and favorites working.

## Deliverables

1. Create `packages/yard-core`.
2. Move shared domain types and service boundaries into `yard-core`.
3. Refactor the largest monolithic files into smaller modules.
4. Update imports and wiring.
5. Keep the app running.
6. Add a short architecture note explaining the new structure.

## Architecture Note

Create this file:

```txt
docs/architecture/yard-core.md
```

It should explain:

- What `yard-core` is
- What belongs in core
- What should stay in the app layer
- How future tools/extensions could hook into commands/services
- Which files were refactored
- Any remaining modularity issues

## Definition of Success

- Core features still work.
- `db.ts`, `scanner.ts`, `AudioPlayer.tsx`, `FileTable.tsx`, and `electron/main.cjs` are no longer monoliths.
- Core business logic is separated from UI/API/Electron glue.
- `yard-core` provides stable service boundaries.
- The app is easier to extend without editing huge central files.

## Working Style

Before changing code, inspect the existing structure and make a concise refactor plan.

Then implement the refactor in small, safe steps.

Prefer preserving behavior over making large risky rewrites.

Do not over-abstract for a hypothetical marketplace.

The immediate goal is a clean, modular core foundation.

## Core Principle

The app should depend on `yard-core`, not the other way around.

`yard-core` should not know about:

- React
- Next.js routes
- Electron windows
- shadcn components
- UI layout

`yard-core` should know about:

- Audio files
- Libraries
- Tags
- Collections
- Favorites
- Search
- Commands
- Desktop actions as interfaces
- Service boundaries
