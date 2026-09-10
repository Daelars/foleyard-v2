# Research brief: I threw away Foleyard's extension system

- Post: POST-002, order 2 of 10
- Slug: `extension-system-rebuild`
- Development state: **implemented-unreleased**
- Date range: 2026-09-06 to 2026-09-10
- Confidence: high
- Article: `blog-posts/posts/extension-system-rebuild/index.md` (1520 words)

## Story

A proposal to improve the extension system was rated about 7/10 by its own author. That rating was refused, v2 was built from scratch with Make Pack as a reference port, the other five followed, a one-shot v1 removal PR was rejected after 85 seconds, and the retirement then happened properly through an adoption path.

## Release context

Foleyard v2, unreleased. Public version is 0.1.8. See `release-horizon.md`.

## What existed before

v1: module-level registration, one execute route, a context bag, advisory filesystem, no job lifecycle, per-tool settings persistence.

## Problem or motivation

Two hosts running side by side is exactly the complexity the 7/10 rating warned about, and every product workflow still ran on v1 as of 2026-09-09.

## What changed

v2 contracts, catalog, registry, availability, permissions (21 known), enforced filesystem seam, jobs, preview/review/apply, UI contribution adapters. Seven tools registered. All six v1 tool packages deleted in the working tree; enablement, approvals, listed settings and data records adopt onto the v2 ports on first boot.

## Evidence

- packages/yard-core/src/extensions-v2/ (definition.ts ExtensionV2Permission, availability, catalog, contributions)
- packages/yard-tools/auto-tag-v2/src/definition.ts (7 declared permissions)
- src/lib/extensions/registry.ts (empty table plus retirement comment)
- src/lib/extensions-v2/enablement.ts (RETIRED_V1_TO_V2, RETIRED_V1_SETTINGS)
- docs/extensions-v2-migration.md (Nothing stays on v1)
- commit e181dbd (#196); PR #198 created 2026-09-09T22:26:01Z, closed 22:27:26Z

## Quotes and wording from the development record

- About 7/10 better as a design, if implemented well (assistant, thread 847e11b6)
- I would love to build this v2 from scratch, not on top of v1, and to build 1 of the existing extensions as an example, make sure to touch all surfaces, like docs etc (user, 847e11b6)
- undo the pr, awful plan (user, thread bce23d60, 2026-09-09T22:27:15Z)
- retire them, make sure v2 extensions get their v2 versions of the dialogs from their respective v1 counterparts (user, thread 86bfb0d6)
- I have noticed extensions v2 no longer register in the extensions tab (user, 86bfb0d6)

## Commits

- `e181dbd`

## Issues and PRs

- issue #164
- issue #165
- issue #166
- issue #167
- issue #168
- issue #169
- issue #170
- issue #171
- issue #172
- issue #173
- issue #174
- issue #175
- issue #176
- issue #177
- issue #178
- issue #179
- issue #180
- issue #181
- issue #182
- PR #196
- PR #198

## T3 threads

- `847e11b6`
- `878dc4b9`
- `1c02df0f`
- `8171801c`
- `bce23d60`
- `86bfb0d6`

## Images used

- /blog-images/diagram-extensions-v2.png
- /blog-images/diagram-extension-reach.png
- /blog-images/ext-v2-workbench.png
- /blog-images/app-extensions.png

## What must NOT be claimed

- Do not say PR #198 was revived. It was rejected; the retirement used a different approach.
- Do not say settings stay separate between v1 and v2. They now adopt across. This corrects an earlier draft.
- Do not describe the retirement as shipped. It is uncommitted and two regressions were reported the same hour.

## Unknowns

- Whether the dialog regressions are resolved.
- Whether the retirement lands as-is.
