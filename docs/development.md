# Development

> Feature status: shipped
> Contract: internal
> Owner: `package.json` scripts + `vitest.config.ts`
> Applies to: docs manifest ID (`development`); development checkout when unbuilt

## What it does

Defines the contributor loop: install, run, check, test, cover, and build
the app, with fixture-isolated tests, the expected-failures ledger
(`docs/expected-failures.md`) and the coverage thresholds in
`vitest.config.ts`.

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
node scripts/check-command-inventories.cjs  # command inventories + READMEs vs definitions (also in CI)
bun run docs:prepare   # stage version-matched docs (also in CI)
bun run docs:check     # verify staged docs (also in CI)
```

`predev`/`prebuild` run `scripts/verify-workspace-root.cjs`.
`dev:desktop` is implemented by `scripts/dev-desktop.cjs` and sets desktop
mode env vars. `build:desktop` rebuilds `better-sqlite3`, runs `next build`,
writes build provenance (`scripts/write-build-provenance.cjs`), stages and
checks the docs bundle (`prepare-docs` + `check-docs`, so a stale or missing
`staged-docs/foleyard-docs` fails the build), rebuilds the traced copy
(`scripts/rebuild-traced.cjs`), and runs `electron-builder` into
`dist-electron/`. The release workflow packages through the same chain and
asserts the staged manifest carries the build id.

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
tests, README with the static-registration snippet). The full
authoring contract lives in `docs/extensions-v2.md`.

Archive artifacts (audit reports, plans, HTML explainers) live in the
separate `Daelars/foleyard-archive` checkout. Review them in `next dev`
at `/prototype/archive`; the viewer resolves `FOLEYARD_ARCHIVE_DIR`
first, then the sibling `../foleyard-archive` checkout. Content in that
checkout never ships and is never read by production builds.

## Contracts

- Internal scripts contract in `package.json`; coverage thresholds in
  `vitest.config.ts` sit one point below the measured baseline so ordinary
  churn does not fail the run. Raise them as coverage rises.

## Failure behavior and limitations

Expected-failures ledger (`docs/expected-failures.md`, 8 entries — a PR
that fixes a finding flips its test to `it` and removes the entry in the
same change; deleting a test without fixing fails CI):

1. B03 — database-correctness: collection-branch count disagreement (#137)
2. B09 — database-correctness: unchunked, non-atomic smart conversion (#137)
3. B02 — data-loss-prevention: distinct recordings inherit tags (#136)
4. B10 — data-loss-prevention: removal undone by rescan (#136)
5. I03 — scanner: order-dependent root ownership (#139)
6. B04 — client-mutation-lifecycle: late tag failure erases newer edit (#140)
7. B04 — client-mutation-lifecycle: stale deletion restores old root (#140)
8. B11 — client-mutation-lifecycle: stale page unlocks duplicate request (#140)

Previously fixed and removed from the ledger: B01 (gather overwrite),
B05 (header-only first parse), B06 (silent 5,000-file scan cap), B08
(null/malformed envelopes now 400 via `validateTransportEnvelope`), B12
(export deletes a manifest sidecar), E01 and E01-transport (host-enforced
service permissions via `guardHostServices`), E04 (drop-rules write with
no writable path).

The September 2026 coverage snapshot and target-shape plan moved to the
`Daelars/foleyard-archive` checkout. The live suite, `vitest.config.ts`
thresholds and `bun run test:coverage` are the source of truth.

## Source map (real file paths)

- `package.json` — scripts (`dev`, `dev:desktop`, `typecheck`, `lint`, `test`, `test:coverage`, `build`)
- `vitest.config.ts` — suite + coverage thresholds
- `src/test/fixtures.ts` — fixture isolation
- `src/test/integration/` — integration suite incl. `it.fails` ledger tests
- `scripts/check-expected-failures.cjs` — ledger count check (CI)
- `scripts/check-command-inventories.cjs` — command inventories and package
  READMEs checked against the v2 definitions (CI)
- `scripts/dev-desktop.cjs`, `scripts/verify-workspace-root.cjs`,
  `scripts/rebuild-traced.cjs`, `scripts/clean-binary.cjs` — dev/build tooling

## Examples

The runnable-in-repository examples (derived from `examples/`) are
`core/query-library`, `extensions-v2/minimal` and
`extensions-v2/settings`; CI runs all three.

## Related documentation

- `RELEASE.md` — local desktop build, release prepare/publish, auto-update requirements
- `docs/expected-failures.md` — the 8-entry ledger this guide summarizes
