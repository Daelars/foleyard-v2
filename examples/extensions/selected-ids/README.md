# Selected-IDs example

Self-contained demo of the yard-core extension host over an in-memory store.
Modelled on `packages/yard-tools/sound-shelf/src` but with no filesystem
access and no user files.

## Prerequisites

- `bun` (runs TypeScript natively) or `node`.
- No user files needed; no filesystem writes are performed.
- Version provenance: checkout-matched, internal contract (matches this
  checkout's `yard-core`; there is no external compatibility promise).

## Invocation

```bash
bun run example:selected-ids
# or
bunx tsx examples/extensions/selected-ids/run.ts
# or directly
bun examples/extensions/selected-ids/run.ts
```

## Expected output

- Enabled execution returns the supplied IDs (`["file-a", "file-b"]`).
- Disabled extension fails with reason `extension-disabled`.
- Empty selection fails with reason `validation-failed`.
- The script prints all three case results and exits non-zero on any mismatch.

## See also

- `docs/extensions.md` — bundled extension model this demo mirrors.
- `docs/commands.md` — command metadata and host failure reasons.
- `docs/runtime.md` — extension identity in the runtime snapshot.
