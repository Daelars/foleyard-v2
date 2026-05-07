---
name: implement-extension
description: Implement a new Foleyard extension using the established yard-core extension system and package template. Use when the user asks to create, scaffold, or implement a custom Foleyard extension, tool, add-on, workflow helper, or yard-tools package.
---

# Implement Foleyard Extension

## Rule

Build extensions on top of `yard-core`.

Do not replace Foleyard Core features.

Core features include library scanning, search, audio preview, tags, collections, favourites, drag out, reveal in file explorer, and open externally.

Extensions are optional workflow tools.

## Before Implementing

First inspect the existing codebase.

Look for:

```txt
packages/yard-core/src/extensions/
docs/architecture/extensions.md
docs/templates/yard-extension/
packages/yard-tools/
```

If the answer can be found in the codebase, inspect the codebase instead of asking the user.

If a required decision is missing, ask one question at a time.

## Questions To Resolve

Resolve these before writing code:

1. What is the extension name?
2. What single job should this extension do?
3. What commands should it add?
4. What permissions does it need?
5. Does it write, rename, copy, delete, or only read files?
6. What settings should users be able to configure?
7. Where should it appear: command palette, context menu, toolbar, sidebar, settings, drop menu, or selection actions?
8. Does it need preview, confirmation, undo, or a report?
9. What should count as success?
10. What tests should prove it works?

Ask only the next unresolved question.

Recommend an answer with each question.

## Required Extension Shape

Every extension should follow this structure:

```txt
packages/
  yard-tools/
    extension-name/
      package.json
      src/
        index.ts
        manifest.ts
        commands.ts
        service.ts
        settings.ts
        permissions.ts
        types.ts
```

Larger extensions may add focused files such as:

```txt
preview.ts
report.ts
worker.ts
utils.ts
```

Do not stop at a partial scaffold.

If the extension exists in the app as a real feature, the package structure, public exports, routes, and UI wiring should all be coherent before finishing.

## Implementation Steps

1. Create the package under `packages/yard-tools/<extension-id>/`.
2. Start from `docs/templates/yard-extension/` if it exists.
3. Implement `manifest.ts`.
4. Implement `permissions.ts`.
5. Implement `settings.ts`, even if it exports an empty list.
6. Implement extension-specific `types.ts`.
7. Implement `service.ts` with the actual logic.
8. Implement `commands.ts` to register commands through `YardCommandRegistry`.
9. Export the public API from `index.ts`.
10. Make sure `package.json` includes the correct `yard-core` dependency.
11. Wire the extension through the extension registry if the app already supports local first-party extensions.
12. Add only the minimal app-side routes or UI needed to surface the extension.
13. Add tests if the project has a test setup.
14. Update docs only if this extension adds a new pattern.

## Manifest Requirements

The manifest must include:

```txt
id
name
provider
version
description
category
permissions
commands
settings, if needed
surfaces, if needed
```

Command IDs must be namespaced by extension ID.

Good:

```txt
rename-hammer.preview-selected
folder-janitor.scan-library
drop-rules.configure
```

Bad:

```txt
preview
scan
configure
```

If the manifest declares commands or surfaces, the implementation should honor them.

Examples:

```txt
If a `clear` command exists, the extension should expose a real clear path.
If `sidebar` is declared, there should be a real sidebar surface or the surface list should be corrected.
If `context-menu` is declared, the extension should be reachable from context actions.
```

## Permission Rules

Request the smallest permissions possible.

Use read-only permissions for read-only tools.

Writing, renaming, copying, deleting, or modifying drop behavior must be explicit in the manifest.

Avoid `files:delete` unless the user clearly asked for destructive behaviour.

For risky operations:

```txt
preview before applying
confirm before writing
support undo where practical
never delete files without confirmation
```

## Dependency Rules

Correct dependency direction:

```txt
foleyard app
  ↓
yard-tools/*
  ↓
yard-core
```

Never make `yard-core` depend on a tool.

Never import random app internals into a tool.

Do not import React, Next.js routes, Electron main process files, or raw DB helpers into an extension package.

Use the safe `YardExtensionContext` and `yard-core` service contracts inside the package.

## Client And Server Boundaries

Keep server-only code out of client components.

Rules:

```txt
Client components must not import DB code, filesystem code, SQLite code, or server-only registry helpers.
Client components should talk to extension routes or app APIs, not directly to server persistence modules.
Server routes may adapt extension state to app storage when needed.
```

If a client import causes `fs`, SQLite, or Node-only modules to leak into the browser bundle, move that logic back behind an API route.

## State And Data Rules

If an extension has real state, that state must have one clear backing store.

Do not let add, remove, and get flows each create fresh transient state.

Before finishing, verify:

```txt
all read/write routes operate on the same backing state
the extension UI reads from the same state that commands and routes mutate
the returned API shape matches what the UI renders
```

If the UI expects:

```txt
filename
format
duration
```

then the route must hydrate those fields before returning.

Do not leave the UI rendering fields that the route never provides.

## App Wiring Rules

Only add the minimum app-side wiring needed to surface the extension.

Good examples:

```txt
register the extension in the local extension registry
add a route under /api/extensions/<extension-id> when the client needs it
show the extension panel only when the extension is enabled
gate extension-only UI actions behind the extension enabled state
```

Bad examples:

```txt
import server-only extension registry code into client components
hardcode extension UI to show even when disabled
declare an extension in the grid but never wire its actions or surfaces
```

## UI Surface Checklist

If the extension appears in the UI, verify all of these:

```txt
the extension can be enabled or disabled if the app exposes extension toggles
the declared surface actually appears
actions update the visible UI without requiring a full restart
empty state is distinct from loading state
the extension UI can read the state it writes
```

For live surfaces such as sidebars, shelves, panels, or scratchpads:

```txt
trigger refresh after add/remove/clear
make sure the displayed list reflects the same backing store
```

## Testing Checklist

Test the extension behaviour that matters.

At minimum, consider tests for:

```txt
manifest is valid
commands register
duplicate command IDs are avoided
permissions are checked
service handles empty selection
service handles invalid files
risky actions require confirmation
undo works, if implemented
shared extension state does not reset unexpectedly between operations
API response shape matches UI expectations
```

## Review Checklist

Before finishing, verify:

```txt
extension follows the base folder structure
manifest is complete
command IDs are namespaced
permissions are minimal
service uses yard-core context/contracts
no random app internals are imported into the extension package
no server-only modules are imported into client components
extension routes and UI share one backing state
declared surfaces and commands are actually implemented
no UI redesign was introduced
no marketplace or remote loading was added
existing Foleyard features still work
tests/docs were added where useful
```

## Final Response

Summarize:

```txt
what extension was created
what commands it adds
what permissions it requests
what files were added
what app wiring was required
what still needs manual testing
```
