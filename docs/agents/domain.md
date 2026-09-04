# Domain docs

This repository uses a multi-context domain layout.

## Context locations

- `src/CONTEXT.md`: application coordination and user-facing library workflows
- `electron/CONTEXT.md`: desktop runtime and operating-system integration
- `packages/yard-core/CONTEXT.md`: audio library, indexing, search, playback, and organization
- `packages/yard-tools/CONTEXT.md`: optional workflow tools and extension behavior

`CONTEXT-MAP.md` at the repository root links these contexts.

System-wide decisions live under `docs/adr/`. Context-specific decisions live under `<context>/docs/adr/`.

Before changing an area, read its context document and relevant ADRs. Use the glossary's terms in issue titles, specs, tests, and implementation. If a needed term is missing, record the gap for `$domain-modeling`.

If a proposal contradicts an ADR, state the conflict explicitly.
