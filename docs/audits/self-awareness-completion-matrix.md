# Self-awareness implementation completion matrix

Audit: `docs/audits/foleyard-self-awareness-audit.md` (6 Sep 2026, `0.1.8`).
Target: 10/10 readiness against the audit's self-awareness model.
Status date: 6 Sep 2026. All P0/P1/P2 recommendations implemented or
reconciled below. P3 (marketplace, arbitrary third-party loader, standalone
SDK, MCP server, provider framework) intentionally not built; limitations are
exposed in runtime info and docs.

## Ledger reconciliation

- Baseline at start: 14 `it.fails()` vs 16 ledger entries (check failed).
- B01 and B05 already passed as `it()`; entries removed (docs fix).
- This cycle fixed B08 (envelope validation) and E01-transport (host
  enforcement); tests flipped to `it()`, entries removed.
- Final: 12 `it.fails()` vs 12 entries — `check-expected-failures` passes.
- Suite: 18 files, 100 passed + 12 expected-fail (112 total).

## P0 (contract truth prerequisites)

| Audit item | Files | Behavior | Validation |
| --- | --- | --- | --- |
| API standing explicit | `packages/yard-core/src/extensions/vocabulary.ts` (`YardContractStanding`, `YARD_EXTENSION_API_VERSION=1`, `YARD_EXTENSION_API_STANDING=internal`), all new guides carry Feature status + Contract headers | Extension contract declared internal, versioned separately from app `0.1.8` / core `0.1.0` | `bunx tsc`, `docs/check` |
| Permission semantics truthful | Same + `docs/extensions.md`, `docs/filesystem.md`, `docs/adr/filesystem-access.md`, runtime `limitations[]` | Trusted-declarations → host-enforced for provided services; no sandbox claim against direct Node imports; no external loading claimed | `runtime-introspection.test.ts` (denial without cooperative check) |

## P1

| Audit item | Files | Behavior | Validation |
| --- | --- | --- | --- |
| D1 docs entry point | `docs/index.md` | Routing, status vocabulary, history/experimental labels | `check-docs.cjs` links |
| D2 correct contradictions | `README.md`, `RELEASE.md`, `docs/architecture/yard-core.md`, `docs/architecture/extensions.md`, `packages/yard-tools/README.md`, `docs/adr/README.md` | Collections terminology, disposable-build flags, `release:build` workflow, `Foleyard-Setup-*` names, rewritten guides | manual + `check-docs` |
| D3 agent routing | `AGENTS.md`, `docs/agents/domain.md` (untouched, linked) | Section 11 routing verbatim, no duplication | read |
| D4 ledger | `docs/expected-failures.md`, `docs/development.md` | B01/B05/B08/E01-transport removed with passing tests; 12/12 match | `check-expected-failures.cjs` passes |
| D5 history archive | `docs/audits/history/` (4 moves + banners), `docs/audit-2026-09/*` banners | Historical docs cannot be mistaken for instructions | `check-docs` inter-audit links |
| C1 serializable core | `vocabulary.ts` (`defineYardCommand`, `describeYardCommand`, `describeYardManifest`), `extension-host.ts` (`guardHostServices`), `index.ts` exports | One command source, function-free descriptions, host-owned enforcement | new tests + suite |
| C2 six tools share definitions | `packages/yard-tools/*/src/command-definitions.ts` (new), `manifest.ts` + `commands.ts` + `index.ts` per tool | Manifests spread `COMMAND_DEFINITIONS`; registration spreads same metadata + handler/inputSchema; IDs preserved | `tsc`, transport test (IDs/permissions) |
| C3 catalog projection | `src/lib/extensions/catalog.ts` | `projectCatalogEntry`, no handler/validator leakage | `runtime-introspection.test.ts` |
| C4 catalog route compat | `src/app/api/extensions/route.ts` (`?view=catalog`), `registry.ts` unchanged shape | Existing grid UI untouched; full descriptions additive | suite |
| C5 app command table | `src/lib/commands.ts`, `use-palette.ts` (`toolPaletteId`), `command-palette.ts` (unchanged IDs) | Built-in descriptors + unified `tool:{ext}:{cmd}`; shortcuts preserved | `tsc`, manual |
| C6 capabilities | `src/lib/capabilities.ts` | 18 semantic capabilities with owner/status/contract/permissions/docsId; availability derived from composition | new test |
| C7 transport + enforcement | `extension-host.ts` guard, `guarded-services.ts`, `execute/transport.ts` (`resolveDropRuleCommand`, `validateTransportEnvelope`), `execute/route.ts` | Drop Rules apply requires grant; preview validates readability; null/malformed/mistyped envelopes 400; disabled extensions blocked | B08/E01 tests now `it()` green; suite |
| R1 server runtime | `src/lib/runtime-info.ts`, `src/app/api/runtime/route.ts` | Read-only snapshot, unknown/absent providers, no DB init for identity, no secrets | `documentation-bundle.test.ts` |
| R2 desktop runtime | `electron/main/runtime-info.cjs`, `ipc-channels.cjs` (+`desktop:get-runtime-info`), `ipc.cjs`, `preload.cjs`, `src/lib/desktop.ts`, `about-tab.tsx` export | Main owns identity/channels/paths; bridge exposes `getRuntimeInfo`; Help/About exports JSON | desktop contract tests updated + green |
| P1 docs bundle | `src/lib/documentation.ts`, `scripts/prepare-docs.cjs`, `scripts/check-docs.cjs`, `package.json` scripts, `electron-builder.yml` extraResources, CI steps | Allowlisted IDs, traversal rejection, manifest with versions/revision/hashes, staged `foleyard-docs/` | `docs:prepare` + `docs:check` green |
| P2 builder/CI | Same + `.github/workflows/check.yml`, `release.yml` | Docs + examples verified pre-upload | CI config (build verified locally via `bun run build`) |
| X1 selected-ids example | `examples/extensions/selected-ids/` | Real registry+host, shared metadata, enabled/disabled/selection cases, no fs writes | `bun run example:selected-ids` green |
| X3 introspection tests | `src/test/integration/runtime-introspection.test.ts`, `documentation-bundle.test.ts` | Projection, permissions, envelopes, events, traversal, migration, secret exclusion | 13/13 green |

## P2

| Audit item | Files | Behavior | Validation |
| --- | --- | --- | --- |
| R3 DB version | `src/lib/database/migrations.ts` (`CURRENT_SCHEMA_VERSION=1`, `schema_migrations` ledger, `getDatabaseVersionInfo`) | Baseline existing schemas, record applied version transactionally, `user_version` not misused | new test (versioned/unversioned) |
| E1 event catalog | `src/lib/events.ts` | 11 real contracts (7 desktop IPC + shelf + bridge-ready + 2 callbacks); no EventBus claims; promotion rules in docs | new test |
| U1 UI contributions | `src/lib/extensions/ui-contributions.ts`, `ui-intent.ts` (unchanged map + `registerUiIntentHandler`), `file-row-menu.tsx` (contributedItems adapter) | Declared vs implemented separated; context-menu adapter with cleanup; unavailable providers explicit | new test |
| S1 settings schema | `src/lib/settings-schema.ts`, `api/extensions/route.ts` PATCH validation | Extension + renderer schemas, owner/scope, select/bounds validation, values excluded from discovery | suite |
| X2 query-library example | `examples/core/query-library/` | Disposable in-memory SQLite, documented query behavior, app-internal label | `node examples/core/query-library/run.ts` green (bun cannot dlopen better-sqlite3 on Windows — documented, CI uses node) |

## P3 (deferred, exposed)

Marketplace, arbitrary third-party code loader, standalone SDK, MCP server,
provider framework, external extension directories/install/compat ranges/hot
reload, public domain subscriptions, search/metadata/waveform providers:
not built. `runtime-info.limitations[]`, `docs/runtime.md`,
`docs/extensions.md` and `docs/architecture/extensions.md` state the absence
explicitly. Static bundled imports are never presented as runtime loading.

## Remaining limitations

1. Filesystem-boundary E01/E04 direct-service cases remain expected-to-fail
   (route-level fixes shipped; direct service calls bypass grants by design
   for trusted code).
2. B03/B09/B06/B12/B02/B10/I03/B04/B11 remain expected-to-fail (unrelated
   defects, tracked in ledger).
3. Full `build:desktop` installer not produced in this cycle (long native
   rebuild + signing); Next production `build` verified with new routes;
   staged-docs identity verified via prepare/check. Packaged ASAR/resource
   layout follows `electron-builder.yml` extraResources but unexecuted.
4. `example:query-library` runs under `node`, not `bun`, on Windows
   (better-sqlite3 dlopen limitation, documented in its README; CI uses node).
5. Renderer session facts (shortcuts/selection/media) report `unknown`
   server-side by design; appended client-side only via About export.
