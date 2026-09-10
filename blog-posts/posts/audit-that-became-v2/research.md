# Research brief: The audit that turned into Foleyard v2

- Post: POST-001, order 1 of 10
- Slug: `audit-that-became-v2`
- Development state: **in-progress**
- Date range: 2026-09-04 to 2026-09-05
- Confidence: high
- Article: `blog-posts/posts/audit-that-became-v2/index.md` (1138 words)

## Story

A full repository audit on 5 September 2026 returned 27 findings, four of them P1, and the four P1s all trace back to one shape problem in the extension system. That report is why Foleyard v2 is a rebuild.

## Release context

Foleyard v2, unreleased. Public version is 0.1.8. See `release-horizon.md`.

## What existed before

0.1.8 ships six extension tools on a system that hands each tool a context object of optional services, including a filesystem service tools were free to ignore.

## Problem or motivation

E04 Drop Rules apply bypasses filesystem grants. B12 pack manifest temporary name can destroy an existing file. B01 gather can overwrite existing audio. B02 move detection can merge distinct recordings. Underneath: E01 permissions rely on extension cooperation, E02 adding a tool means editing the app, E03 long commands have no job lifecycle.

## What changed

No production fixes in the audit itself. A revisions track followed (#120, b8ed1bb) covering query correctness, batch endpoints, the filesystem boundary, split scan phases and a shared SQLite connection.

## Evidence

- docs/audit-2026-09/FINDINGS.md (27 findings, inventory table, five reproducing tests)
- docs/audit-2026-09/IMPLEMENTATION.md
- packages/yard-core/src/extensions/extension-context.ts (optional services)
- commit b8ed1bb revisions track, 9772cc1 merge of #120

## Quotes and wording from the development record

- Scale of 1-10 how much better is the new system (thread 847e11b6, 2026-09-06)

## Commits

- `b8ed1bb`
- `9772cc1`
- `14ed665`

## Issues and PRs

- PR #120

## T3 threads

- `24a60214`
- `7eddc82a`
- `b75345d0`
- `0e0ec7d2`
- `bf45734d`

## Images used

- /blog-images/repo-audit-workbench.png
- /blog-images/diagram-extensions-v1.png

## What must NOT be claimed

- Do not say the audit fixed anything; it explicitly applied no production fixes.
- Do not claim any user lost data. The findings are possible-behavior findings, five of them reproduced in scratch directories.

## Unknowns

- Whether any of the P1 behaviors ever occurred in a real user library.
