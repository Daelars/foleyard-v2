# Development

> Feature status: shipped
> Contract: internal
> Owner: `package.json` scripts + `vitest.config.ts`
> Applies to: docs manifest ID (`development`); development checkout when unbuilt

## What it does

Defines the contributor loop: install, run, check, test, cover, and build
the app, with fixture-isolated tests and two pinned ledgers
(`docs/expected-failures.md`, `docs/test-coverage-baseline.md`).

## Responsibilities and boundaries

- Covers the local development checkout only. Release publishing lives in
  `RELEASE.md`; this guide links to it rather than duplicating it.
- Test commands use `bun run` / `bunx` as defined in `package.json`.
  The typecheck command is `bunx tsc --noEmit` (the `typecheck` script
  runs `tsc --noEmit`; `bunx` resolves the local TypeScript).
- Never lower coverage thresholds to make a run pass — a drop is the signal.

## Runtime behavior

Setup and daily loop:

```bash
bun install
bun run dev            # web app only (Next dev)
bun run dev:desktop    # Next on :3001 + Electron against it
bunx tsc --noEmit      # typecheck (package.json: typecheck)
bun run lint           # eslint . + theme CSS lint
bun run test           # npx vitest run
bun run test:coverage  # npx vitest run --coverage
bun run build          # next build (web); desktop via build:desktop
node scripts/check-v2-boundaries.cjs  # v2 dependency boundary (also in CI)
bun run docs:prepare   # stage version-matched docs (also in CI)
bun run docs:check     # verify staged docs (also in CI)
```

`predev`/`prebuild` run `scripts/verify-workspace-root.cjs`.
`dev:desktop` is implemented by `scripts/dev-desktop.cjs` and sets desktop
mode env vars. `build:desktop` rebuilds `better-sqlite3`, runs `next build`,
rebuilds the traced copy (`scripts/rebuild-traced.cjs`), and runs
`electron-builder` into `dist-electron/`.

Fixture isolation: `src/test/fixtures.ts` builds throwaway libraries and
databases per test; integration tests live in `src/test/integration/`.
`scripts/check-expected-failures.cjs` (CI) counts `it.fails(` in
`src/test/integration/` and requires the count to equal the ledger below.

Authoring a v2 extension:

```bash
node scripts/scaffold-extension-v2.cjs --name my-tool
bunx vitest run packages/yard-tools/my-tool --no-coverage
bun run example:v2-minimal
```

The scaffold writes a valid minimal package (definition, handlers,
tests, README with the static-registration snippet). Preview
contributions and invoke commands in the dev-only workbench at
`/prototype/ext-v2-workbench` with `FOLEYARD_V2_DEV_FIXTURES=1`.
The full authoring contract lives in `docs/extensions-v2.md`.

## Contracts

- Internal scripts contract in `package.json`; coverage thresholds in
  `vitest.config.ts` sit one point below the measured baseline so ordinary
  churn does not fail the run. Raise them as coverage rises.

## Failure behavior and limitations

Expected-failures ledger (`docs/expected-failures.md`, 12 entries — a PR
that fixes a finding flips its test to `it` and removes the entry in the
same change; deleting a test without fixing fails CI).
Fixed in this cycle and removed from the ledger: B01 (gather overwrite),
B05 (header-only first parse), B08 (null/malformed envelopes now 400 via
`validateTransportEnvelope`), E01-transport (host-enforced service
permissions via `guardHostServices`):

1. B03 — database-correctness: collection-branch count disagreement (#137)
2. B09 — database-correctness: unchunked, non-atomic smart conversion (#137)
3. B06 — extension-host-transport: silent 5,000-file scan cap (#138)
4. E04 — filesystem-boundary: drop-rules write with no writable path (#135)
5. E01 — filesystem-boundary: unpermitted service reachability (#135)
6. B12 — data-loss-prevention: export deletes a manifest sidecar (#136)
7. B02 — data-loss-prevention: distinct recordings inherit tags (#136)
8. B10 — data-loss-prevention: removal undone by rescan (#136)
9. I03 — scanner: order-dependent root ownership (#139)
10. B04 — client-mutation-lifecycle: late tag failure erases newer edit (#140)
11. B04 — client-mutation-lifecycle: stale deletion restores old root (#140)
12. B11 — client-mutation-lifecycle: stale page unlocks duplicate request (#140)

Coverage baseline (`docs/test-coverage-baseline.md`, measured 5 Sep 2026 on
`feat/123-coverage-baseline`): 37.77% statements, 31.94% branches, 34.65%
functions, 38.58% lines; 71 files, 413 tests passing. 96 of 225 reported
files are wholly unexecuted (1,981 statements), led by
`src/app/library/use-library-files.ts` (252 statements).

## Source map (real file paths)

- `package.json` — scripts (`dev`, `dev:desktop`, `typecheck`, `lint`, `test`, `test:coverage`, `build`)
- `vitest.config.ts` — suite + coverage thresholds
- `src/test/fixtures.ts` — fixture isolation
- `src/test/integration/` — integration suite incl. `it.fails` ledger tests
- `scripts/check-expected-failures.cjs` — ledger count check (CI)
- `scripts/dev-desktop.cjs`, `scripts/verify-workspace-root.cjs`,
  `scripts/rebuild-traced.cjs`, `scripts/clean-binary.cjs` — dev/build tooling

## Examples

The runnable-in-repository examples are `extensions/selected-ids`,
`core/query-library`, and `extensions-v2/minimal`.

## Related documentation

- `RELEASE.md` — local desktop build, release prepare/publish, auto-update requirements
- `docs/expected-failures.md` — the 12-entry ledger this guide summarizes
- `docs/test-coverage-baseline.md` — measured baseline, unexecuted files, re-measure command
- `docs/test-suite-target-shape.md` — intended suite shape
