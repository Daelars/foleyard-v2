# Documentation index

> Feature status: shipped
> Contract: internal
> Owner: `src/lib/documentation.ts`
> Applies to: docs manifest ID (`foleyard-docs`, index entry `index`); development checkout when unbuilt

## What it does

This index routes readers to every live guide in the version-matched
documentation set served by `GET /api/docs` and `GET /api/docs/[...id]`.
The manifest is `DOCUMENT_REGISTRY` in `src/lib/documentation.ts`
(manifest ID `foleyard-docs`, product version `0.1.8`). In a development
checkout documents resolve from the workspace root; in packaged builds
they resolve from staged `foleyard-docs/` resources (or
`FOLEYARD_DOCS_ROOT`). Unknown IDs and traversal attempts are rejected,
reads never execute examples, and a missing staged file returns a
missing-from-build error rather than falling back. Staging is
`node scripts/prepare-docs.cjs` and verification is
`node scripts/check-docs.cjs`; both run in CI.

## Responsibilities and boundaries

- Routes to live guides only; it does not duplicate their content.
- Labels historical and experimental material explicitly so readers do
  not mistake audits or throwaway prototypes for current behavior.
- Does not describe external loading, a public SDK, or providers: none
  exist. Extensions are local-first, built against `yard-core`
  contracts, and hosted in-process.

## Runtime behavior

`getDocumentationLocation()` reports the manifest ID, matched product
version, index ID (`index`), document IDs, and the three runnable-in-repo
examples (`extensions/selected-ids`, `core/query-library`,
`extensions-v2/minimal`).
`readDocumentation(id)` allowlists the ID against the registry, resolves
the absolute path under the docs root, and reads it as UTF-8.

## Contracts

- Internal contract: `DocumentEntry { id, relativePath, status, title }`,
  `DocumentStatus = "current" | "historical" | "experimental"`.
- `GET /api/docs` returns location + document list; `GET /api/docs/[...id]`
  returns one document body. Both are read-only.

## Failure behavior and limitations

- Unknown document ID, path traversal (`..`, backslash, leading slash),
  or a path escaping the docs root: `Unknown document "<id>"`.
- Document listed in the registry but absent from the build: missing
  from-build error. Development checkouts resolve the workspace root
  independently of cwd (walks up to the `foleyard` package root).

## Source map (real file paths)

- `src/lib/documentation.ts` — registry, location resolution, allowlisted reader
- `src/app/api/docs/route.ts` — location/list endpoint
- `src/app/api/docs/[...id]/route.ts` — single-document endpoint
- `CONTEXT-MAP.md` — context map (Application, Desktop runtime, Yard Core, Yard Tools)
- `packages/yard-core/CONTEXT.md`, `src/CONTEXT.md`, `electron/CONTEXT.md`,
  `packages/yard-tools/CONTEXT.md` — context language definitions

## Live guides

| Guide | Manifest ID | Status |
| --- | --- | --- |
| Quickstart | `quickstart` | current |
| Development | `development` | current |
| Library | `library` | current |
| Scanning | `scanning` | current |
| Metadata | `metadata` | current |
| Playback and waveforms | `playback` | current |
| Search | `search` | current |
| Collections | `collections` | current |
| Filesystem | `filesystem` | current |
| Settings | `settings` | current |
| Database | `database` | current |
| Bundled extensions | `extensions` | current |
| Extension authoring (v2 API) | `extensions-v2` | current |
| Extension v1 to v2 migration | `extensions-v2-migration` | current |
| Make Pack v2 walkthrough | `extensions-v2-make-pack` | current |
| Extension v2 troubleshooting | `extensions-v2-troubleshooting` | current |
| Commands | `commands` | current |
| Events | `events` | current |
| Runtime introspection | `runtime` | current |
| Application architecture | `architecture/application` | current |
| Desktop architecture | `architecture/desktop` | current |
| yard-core architecture | `architecture/yard-core` | current |
| Extension architecture | `architecture/extensions` | current |
| Filesystem access ADR | `adr/filesystem-access` | current |
| Product overview | `readme` | current |

## Document status table

| Status | Meaning | Members |
| --- | --- | --- |
| current | Live guide, describes shipped behavior | All rows above |
| historical | Point-in-time audit, kept for reference, not current behavior | `docs/audit-2026-09/`, `docs/audits/foleyard-self-awareness-audit.md`, `docs/audits/history/` |
| experimental | Throwaway prototype, deleted once its design question is answered | `src/app/prototype/**` (excluded from coverage; never executed by docs reads) |

## Examples

Runnable examples live in `examples/`; each README states prerequisites,
invocation, expected results and version provenance:

- `examples/extensions/selected-ids/` (`bun run example:selected-ids`) —
  selected-IDs extension command through the real registry and host.
- `examples/core/query-library/` (`node examples/core/query-library/run.ts`;
  `bun` cannot dlopen better-sqlite3 on Windows, see its README) —
  disposable in-memory SQLite query via app repository contracts.
- `examples/extensions-v2/minimal/` (`bun run example:v2-minimal`) —
  minimal v2 extension (one global command) through the real v2
  registry and host. No filesystem, no database.

All three are repository-run examples, not executable installed plugins.

## Related documentation

- `CONTEXT-MAP.md` — context relationships (Application → Yard Core,
  Application → Desktop runtime, Application → Yard Tools, Yard Tools → Yard Core)
- `docs/quickstart.md` — first-run path through the guides
- `docs/development.md` — setup, tests, coverage, release
- `docs/adr/filesystem-access.md` — filesystem grants ADR
