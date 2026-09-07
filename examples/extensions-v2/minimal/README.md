# Minimal v2 example

Smallest runnable v2 extension: one global describe command through the
real v2 registry and host (`ExtensionV2Registry` +
`ExtensionV2Host` in `packages/yard-core/src/extensions-v2/`).
No filesystem access, no database, no user files. Imports `yard-core`
only, mirroring the shape `node scripts/scaffold-extension-v2.cjs`
generates without the package scaffolding.

## Prerequisites

- `bun` (runs TypeScript natively) with workspace dependencies
  installed (`bun install` at the repo root).
- No user files needed; no filesystem writes are performed.
- Version provenance: checkout-matched, internal contract (matches this
  checkout's `yard-core` v2 API version 2; there is no external
  compatibility promise).

## Invocation

```bash
bun run example:v2-minimal
# or directly
bun examples/extensions-v2/minimal/run.ts
```

## Expected output

- Case 0 passes: the catalog projection round-trips as serializable
  data carrying exactly the `minimal-greeter` entry.
- Case 1 passes: enabled execution returns
  `"greeter: hello (runMode=direct)"`.
- Case 2 passes: disabled execution fails with code
  `extension-disabled`.
- Case 3 passes: mistyped input (`{ note: 42 }`) fails with code
  `input-invalid` before any handler runs.
- The script prints all four case results and exits non-zero on any
  mismatch.

## See also

- `docs/extensions-v2.md` — the v2 authoring guide this demo follows.
- `docs/commands.md` — v2 invocation contracts and failure codes.
- `docs/runtime.md` — v2 identity in the runtime snapshot.
