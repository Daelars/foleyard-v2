# Foleyard Extensions

## What the extension system is

The Foleyard extension system is a local, headless foundation for future workflow-oriented tools.

It provides:

- extension manifests
- command registration
- permission declarations
- extension settings metadata
- safe extension context objects
- registry primitives for extensions and commands

It does not yet provide a marketplace, installation flow, remote loading, or community extension execution.

## What belongs in Foleyard Core

`yard-core` owns the stable contracts that extensions rely on:

- manifest types
- permission types and checker
- extension-safe context
- command registry
- extension registry
- stable service interfaces and event primitives

If Foleyard feels broken without it, it belongs in Core.  
If Foleyard works without it, but it improves a workflow, it can be an extension.

## What belongs in extensions

Extensions should contain optional workflow logic that improves the app without being required for the base product to function.

An extension may define:

- a manifest
- commands
- settings
- a service
- internal types
- public exports

An extension must depend on `yard-core` contracts instead of reaching into app internals.

## Required files for every extension

The documented template for future extensions is:

```txt
docs/templates/yard-extension/
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

The expected public shape is:

- `manifest`
- `registerCommands`
- `createService`
- exported extension-specific types

## Dependency direction

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

Extensions should only use `yard-core` contracts and safe context objects.

## How permissions work

Every extension declares permissions in its manifest.

The runtime creates a `PermissionChecker` from the manifest’s permission list.

Extensions can:

- ask whether a permission is granted with `has()`
- require a permission with `require()`
- inspect granted permissions with `list()`

Permissions are declarative and local. They do not automatically grant direct access to app internals or raw database functions.

## How commands work

Each extension declares its commands in the manifest.

Command IDs must be namespaced with the extension ID, for example:

```txt
example-extension.run
rename-hammer.preview-selected
folder-janitor.scan-library
```

The extension runtime exposes a `YardCommandRegistry` in the extension context.

The extension registry stores extension definitions only. It does not automatically activate commands.

Command registration is a runtime step performed by the app layer when it chooses to activate an extension.

## Safe extension context

Extensions receive a constrained context object containing:

- selected file and folder information
- a permission checker
- stable core service interfaces when available
- a Yard command registry

Extensions do not receive:

- raw database helpers
- random route handlers
- React components
- Next.js internals
- Electron window objects

## How a future custom extension should be structured

A future real extension package should live under:

```txt
packages/yard-tools/<extension-name>/
```

It should:

1. define a manifest
2. declare required permissions
3. declare commands
4. implement a service using the safe extension context
5. register commands through `registerCommands(context)`
6. export only its intended public entrypoints

## What is intentionally not implemented yet

This base system does not implement:

- marketplace UI
- remote install
- community extension loading
- direct database access from extensions
- Electron privilege escalation
- real built-in tool extensions

The existing app remains fully functional without any extension package being present.

## Testing TODOs

This repo does not currently have a dedicated automated test setup for this work.

At minimum, the following should be tested when a test harness is introduced:

- extension registration
- duplicate extension ID rejection
- manifest listing
- command registration
- duplicate command rejection
- permission checker `has()`
- permission checker `require()`
- command execution
