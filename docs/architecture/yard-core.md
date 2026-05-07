# `yard-core` Architecture

## What `yard-core` is

`yard-core` is the stable business-layer package for Foleyard.

It defines:

- Domain models for audio files, libraries, tags, collections, playback, and search.
- Service and repository interfaces for scanning, search, organization, and desktop actions.
- Shared scan types and supported-audio detection.
- A lightweight command registry and simple event primitives.
- A constrained public API from `packages/yard-core/src/index.ts`.

The application now depends on these contracts through the `@yard-core` path alias. `yard-core` does not import React, Next.js route handlers, Electron windows, or UI components.

## What belongs in core

Code belongs in `yard-core` when it represents stable business behavior or a reusable boundary:

- Audio library concepts and records.
- Scan phases, validation results, and supported file detection.
- Search and browse contracts.
- Tag, collection, and favorite service boundaries.
- Desktop action interfaces.
- Internal command and event primitives intended to support future tools.

## What stays in the app layer

The app layer keeps framework and platform details:

- SQLite and Drizzle implementation details in `src/lib/database/*`.
- Filesystem access and metadata extraction in `src/lib/scanner/*` and `src/lib/metadata.ts`.
- Next.js route handlers in `src/app/api/**`.
- React UI and hooks in `src/components/**`.
- Electron startup, IPC registration, and shell integration in `electron/main/**`.

This keeps `yard-core` framework-agnostic while letting the app provide concrete adapters.

## How tools and extensions could hook in later

The command and event primitives in `yard-core` are intentionally lightweight.

Future internal tools or extensions could:

- Register commands like `library.scan`, `library.search`, `favorite.toggle`, or `desktop.reveal`.
- Depend on repository and service interfaces instead of importing app monoliths.
- Subscribe to scan or library lifecycle events through the event bus abstraction.

This is a foundation only. It is not yet a marketplace or plugin runtime.

## Files refactored

The previous monoliths were split as follows:

- `src/lib/db.ts`
  - Now a compatibility facade over:
  - `src/lib/database/connection.ts`
  - `src/lib/database/migrations.ts`
  - `src/lib/database/settings-repository.ts`
  - `src/lib/database/file-repository.ts`
  - `src/lib/database/tag-repository.ts`
  - `src/lib/database/collection-repository.ts`
  - `src/lib/database/browse-repository.ts`

- `src/lib/scanner.ts`
  - Now a facade over:
  - `src/lib/scanner/scan-state.ts`
  - `src/lib/scanner/filesystem.ts`
  - `src/lib/scanner/validation.ts`
  - `src/lib/scanner/run-scan.ts`

- `src/components/AudioPlayer.tsx`
  - Split into:
  - `src/components/AudioPlayer/use-audio-playback.ts`
  - `src/components/AudioPlayer/player-shell.tsx`
  - `src/components/AudioPlayer/volume-control.tsx`
  - `src/components/AudioPlayer/favorite-button.tsx`
  - `src/components/AudioPlayer/collection-menu.tsx`
  - `src/components/AudioPlayer/format-time.ts`
  - `src/components/AudioPlayer/types.ts`

- `src/components/FileTable.tsx`
  - Split into:
  - `src/components/FileTable/desktop-actions.tsx`
  - `src/components/FileTable/file-row.tsx`
  - `src/components/FileTable/directory-row.tsx`
  - `src/components/FileTable/breadcrumb-bar.tsx`
  - `src/components/FileTable/empty-state.tsx`
  - `src/components/FileTable/highlight-match.tsx`
  - `src/components/FileTable/types.ts`

- `electron/main.cjs`
  - Split into:
  - `electron/main/constants.cjs`
  - `electron/main/database.cjs`
  - `electron/main/errors.cjs`
  - `electron/main/window.cjs`
  - `electron/main/desktop-service.cjs`
  - `electron/main/ipc.cjs`

## Remaining modularity issues

- Route handlers still call app facades directly instead of consuming composed services from a single composition root.
- The scan runner still owns orchestration state in-process; moving that behind a dedicated service object would make testing easier.
- `page.tsx` remains a large coordination component for fetching, polling, and cross-panel state.
- Audio waveform data is still placeholder UI state rather than a separate waveform pipeline.
- There is no automated test harness yet for the new boundaries.

## Verification

After the refactor:

- `eslint` passes with one non-blocking React Compiler warning for `useVirtualizer`.
- TypeScript passes with `tsc --noEmit`.

The current structure is materially more modular while preserving the existing routes, desktop actions, playback entrypoint, and UI behavior.
