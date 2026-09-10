# Research brief: I deleted 410 tests

- Post: POST-007, order 7 of 10
- Slug: `deleted-410-tests`
- Development state: **implemented**
- Date range: 2026-09-05 to 2026-09-05
- Confidence: medium
- Article: `blog-posts/posts/deleted-410-tests/index.md` (1213 words)

## Story

410 unit tests replaced by 56 integration tests in one day, plus a CI gate that finally runs the production build.

## Release context

Foleyard v2, unreleased. Public version is 0.1.8. See `release-horizon.md`.

## What existed before

A suite dominated by source-text checks and tests whose only callers were themselves.

## Problem or motivation

Audit S03: source-text checks cannot prove UI behavior. S01: helpers kept alive only by tests. S04: CI omits the required production build.

## What changed

Integration tests against real SQLite and scratch directories; rendered smoke tests; CI extended to typecheck, lint, test, coverage, build, expected failures, v2 boundaries, docs bundle checks and two runnable extension examples.

## Evidence

- PR #159 merged 2026-09-05T18:44, PRs #143 #154 #155 #156 #157
- src/test/integration/ (30 files including data-loss-prevention, database-correctness, filesystem-boundary, desktop-supply-chain)
- .github/workflows/check.yml
- the zoom bug: document.documentElement.style.zoom versus viewport units, fixed in f09827c, thread 4707196e

## Quotes and wording from the development record

- Keep reasonable tests, don't go overboard to 100+, we only have 60ish tests (user)
- Are they atleast good tests? (user, thread c397b243)

## Commits

- `8ec273e`
- `742fd71`

## Issues and PRs

- PR #143
- PR #154
- PR #155
- PR #156
- PR #157
- PR #159

## T3 threads

- `0e0ec7d2`
- `bf45734d`
- `c397b243`

## Images used

- /blog-images/repo-audit-timeline.png

## What must NOT be claimed

- The 410 and 56 figures are the track's own count, not an independent recount. Post says so.
- Do not imply the suite is still 56 files. It is 91 test files now.

## Unknowns

- Independent recount of both figures.
