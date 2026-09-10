# Settings + contribution example

Declares one authored setting and one `sidebar` contribution, resolves
the contribution through the shared availability evaluator
(`buildEffectiveV2Catalog` + `resolveV2PointContributions`), and executes
the contributed command with the stored setting through the real v2 host.
The setting store is an in-memory port: no database, no filesystem, no
user files. Imports `yard-core` only.

## Prerequisites

- `bun` (runs TypeScript natively) with workspace dependencies
  installed (`bun install` at the repo root).
- No user files needed; no filesystem writes are performed.
- Version provenance: checkout-matched, internal contract (matches this
  checkout's `yard-core` v2 API version 2; there is no external
  compatibility promise).

## Invocation

```bash
bun run example:v2-settings
# or directly
bun examples/extensions-v2/settings/run.ts
```

## Expected output

- Case 0 passes: an unwritten setting reads its declared default
  (`"unlabeled"`).
- Case 1 passes: a valid write reads back (`"kick"`), and a non-string
  write is rejected without changing the stored value.
- Case 2 passes: the sidebar contribution resolves unavailable with
  `permission-denied` without approval, available when enabled and
  approved, and absent when disabled.
- Case 3 passes: executing the contributed command returns
  `"label: kick"` and follows an updated setting (`"label: snare"`).
- Case 4 passes: reset restores the declared default.
- The script prints all five case results and exits non-zero on any
  mismatch.

## See also

- `docs/settings.md` — setting ownership, validation and routes.
- `docs/extensions-v2.md` — the authoring guide this demo follows.
- `examples/extensions-v2/minimal/` — the smallest runnable extension.
