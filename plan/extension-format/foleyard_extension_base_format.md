# Foleyard Extension Base Format

This is the base format every Foleyard extension should build on.

Extensions should be small packages that add extra tools or workflows on top of `yard-core`.

Extensions should not replace Foleyard Core features. They should use Foleyard Core services through stable interfaces.

---

## Core vs Extensions

Core features are required for Foleyard to feel like Foleyard:

```txt
Library scanning
Search
Audio preview
Tags
Collections
Favourites
Drag out
Reveal in file explorer
Open externally
```

Extensions are optional tools that improve workflows:

```txt
Drop Rules
Folder Janitor
Rename Hammer
Sound Shelf
Make Pack
```

Simple rule:

```txt
If Foleyard feels broken without it, it belongs in Core.
If Foleyard works without it, but it improves a workflow, it can be an extension.
```

---

## Recommended Location

Recommended structure for first-party Foleyard extensions:

```txt
packages/
  yard-core/
  yard-tools/
    example-extension/
```

Alternative structure if you want extensions clearly separated:

```txt
extensions/
  example-extension/
```

---

## Base Folder Structure

Every extension should follow this shape:

```txt
example-extension/
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

For larger extensions, add focused files as needed:

```txt
example-extension/
  package.json
  src/
    index.ts
    manifest.ts
    commands.ts
    service.ts
    settings.ts
    permissions.ts
    types.ts
    utils.ts
    preview.ts
    report.ts
    worker.ts
```

---

## Required Files

### `manifest.ts`

Describes what the extension is.

It should define:

```txt
id
name
provider
version
description
category
permissions
commands
settings
surfaces
```

Example:

```ts
export const manifest = {
  id: "example-extension",
  name: "Example Extension",
  provider: "Foleyard",
  version: "1.0.0",
  description: "Adds a small useful workflow to Foleyard.",
  category: "workflow",
  permissions: ["library:read", "files:read"],
  commands: [
    {
      id: "example-extension.run",
      title: "Run Example Extension",
      description: "Runs the extension on the current selection.",
      scope: "selection"
    }
  ],
  surfaces: ["command-palette", "context-menu"]
};
```

---

### `commands.ts`

Registers the actions the extension adds to Foleyard.

Examples:

```txt
Run on Selection
Preview Changes
Apply Changes
Open Report
Configure Extension
```

Command shape:

```ts
export type YardCommand = {
  id: string;
  title: string;
  description: string;
  scope: "global" | "selection" | "folder" | "file" | "collection" | "drop";
  destructive?: boolean;
  requiresSelection?: boolean;
};
```

Example command registration:

```ts
export function registerCommands(context: YardExtensionContext) {
  context.services.commands.register({
    id: "example-extension.run",
    title: "Run Example Extension",
    description: "Runs this extension on the current selection.",
    scope: "selection",
    requiresSelection: true,
    handler: async () => {
      const service = createService(context);
      return service.run();
    }
  });
}
```

---

### `service.ts`

Contains the actual extension logic.

The service should use `yard-core` interfaces instead of importing app internals.

Good:

```ts
LibraryService
FileService
CollectionService
CommandRegistry
EventBus
SettingsService
```

Bad:

```ts
import something from "@/app/page";
import raw database functions directly;
import React UI components directly;
```

Basic shape:

```ts
export function createService(context: YardExtensionContext) {
  return new ExampleExtensionService(context);
}

export class ExampleExtensionService {
  constructor(private context: YardExtensionContext) {}

  async run() {
    const selectedIds = this.context.selection.fileIds;
    const files = await this.context.services.library.getFilesByIds(selectedIds);

    return files;
  }
}
```

---

### `settings.ts`

Defines user-configurable extension options.

Example:

```ts
export const settings = [
  {
    id: "safeMode",
    label: "Safe mode",
    description: "Require confirmation before changing files.",
    type: "boolean",
    defaultValue: true
  },
  {
    id: "outputStyle",
    label: "Output style",
    type: "select",
    defaultValue: "clean",
    options: [
      { label: "Clean", value: "clean" },
      { label: "Keep original", value: "original" }
    ]
  }
];
```

Base setting shape:

```ts
export type YardSetting = {
  id: string;
  label: string;
  description?: string;
  type: "boolean" | "string" | "number" | "select" | "path";
  defaultValue: unknown;
  options?: Array<{
    label: string;
    value: string;
  }>;
};
```

---

### `permissions.ts`

Declares what the extension is allowed to do.

Base permission set:

```ts
export type YardPermission =
  | "library:read"
  | "library:write"
  | "files:read"
  | "files:write"
  | "files:copy"
  | "files:rename"
  | "files:delete"
  | "collections:read"
  | "collections:write"
  | "tags:read"
  | "tags:write"
  | "favorites:read"
  | "favorites:write"
  | "desktop:reveal"
  | "desktop:open"
  | "drop:read"
  | "drop:modify"
  | "settings:read"
  | "settings:write";
```

Permission rules:

```txt
Request the smallest permissions possible.
Avoid files:delete unless absolutely needed.
Never mutate real files without user confirmation.
Never access files outside approved Foleyard library roots unless explicitly allowed.
```

---

### `types.ts`

Contains extension-specific types.

Example:

```ts
export type ExtensionResult = {
  success: boolean;
  changedFiles: number;
  errors: Array<{
    fileId: string;
    message: string;
  }>;
};

export type ExtensionSettings = {
  safeMode: boolean;
  outputStyle: "clean" | "original";
};
```

---

### `index.ts`

The public entrypoint.

Every extension should export a predictable shape:

```ts
export { manifest } from "./manifest";
export { registerCommands } from "./commands";
export { createService } from "./service";
export type * from "./types";
```

The app should be able to load it like this:

```ts
import { manifest, registerCommands, createService } from "@foleyard/example-extension";

extensionRegistry.register({
  manifest,
  registerCommands,
  createService
});
```

---

## Base Manifest Type

```ts
export type YardExtensionManifest = {
  id: string;
  name: string;
  provider: "Foleyard" | "Community";
  version: string;
  description: string;
  category: YardExtensionCategory;
  permissions: YardPermission[];
  commands: YardCommand[];
  settings?: YardSetting[];
  surfaces?: YardSurface[];
};
```

---

## Extension Categories

```ts
export type YardExtensionCategory =
  | "workflow"
  | "cleanup"
  | "rename"
  | "export"
  | "metadata"
  | "drop"
  | "collection"
  | "search"
  | "utility";
```

---

## UI Surfaces

Surfaces describe where the extension can appear.

```ts
export type YardSurface =
  | "command-palette"
  | "context-menu"
  | "toolbar"
  | "sidebar"
  | "settings"
  | "drop-menu"
  | "selection-actions";
```

Extensions should not assume they own the UI.

They declare surfaces, and the Foleyard app decides where and how to render them.

---

## Extension Context

When an extension runs, Foleyard should pass it a safe context object.

```ts
export type YardExtensionContext = {
  services: {
    library: LibraryService;
    files: FileService;
    collections: CollectionService;
    tags: TagService;
    favorites: FavoriteService;
    settings: SettingsService;
    commands: CommandRegistry;
    events: EventBus;
  };

  selection: {
    fileIds: string[];
    folderPath?: string;
    collectionId?: string;
  };

  permissions: PermissionChecker;
};
```

Extensions should work through this context instead of importing internal app files.

---

## Service Factory

Each extension should expose a service factory.

```ts
export function createService(context: YardExtensionContext) {
  return new ExampleExtensionService(context);
}
```

Example:

```ts
export class ExampleExtensionService {
  constructor(private context: YardExtensionContext) {}

  async runOnSelection() {
    const selectedIds = this.context.selection.fileIds;

    if (!this.context.permissions.has("library:read")) {
      throw new Error("Missing permission: library:read");
    }

    const files = await this.context.services.library.getFilesByIds(selectedIds);

    return files;
  }
}
```

---

## Example `package.json`

```json
{
  "name": "@foleyard/example-extension",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@foleyard/yard-core": "workspace:*"
  }
}
```

---

## Dependency Direction

Correct:

```txt
foleyard app
  ↓
yard-tools/*
  ↓
yard-core
```

Incorrect:

```txt
yard-core
  ↓
yard-tools/*
```

Also incorrect:

```txt
yard-tools/*
  ↓
random app internals
```

---

## What Each Layer Owns

### `yard-core`

```txt
Shared types
Domain models
Service contracts
Command registry
Permission types
Event bus
Repository interfaces
```

### `yard-tools/*`

```txt
Extension manifest
Commands
Settings
Permissions
Tool-specific logic
Tool-specific types
```

### Foleyard App

```txt
UI
Electron glue
API routes
Database adapters
Filesystem adapters
Extension loading
Settings screens
Permission prompts
```

---

## Extension Safety Rules

Every extension should:

```txt
Request minimal permissions
Use yard-core service interfaces
Avoid direct database access
Avoid direct Electron access
Preview risky changes before applying them
Require confirmation before writing or renaming files
Support undo where possible
Never delete files without confirmation
Stay focused on one job
```
