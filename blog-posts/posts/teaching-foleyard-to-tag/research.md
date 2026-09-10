# Research brief: Teaching Foleyard to tag itself, and to show its work

- Post: POST-004, order 4 of 10
- Slug: `teaching-foleyard-to-tag`
- Development state: **implemented-unreleased**
- Date range: 2026-09-06 to 2026-09-08
- Confidence: high
- Article: `blog-posts/posts/teaching-foleyard-to-tag/index.md` (1457 words)

## Story

Auto Tag, built on v2 from the start, with tag provenance as the foundation rather than an afterthought.

## Release context

Foleyard v2, unreleased. Public version is 0.1.8. See `release-horizon.md`.

## What existed before

Tags were plain strings. Nothing recorded who made a tag.

## Problem or motivation

Machine tags you cannot trace make search worse, not better, and you trust the results for a while first.

## What changed

Origin plus confidence on every tag attachment (migration v2), deterministic rules with preview, candidate queue with explicit accept, embedding store with cosine find-similar, post-scan chunked idempotent trigger, opt-in CLAP with consent-gated download and approved vocabulary, coverage board with recharts.

## Evidence

- commits 825bc2b 928c322 f13d108 e423302 0f53487 61d9330 e340f7d 8782ebf 8839369
- issues #189-#195, #197
- src/lib/audio-analysis/clap.ts (CLAP_MODEL_ID Xenova/clap-htsat-unfused, CLAP_ESTIMATED_BYTES 400000000, injected seam)
- packages/yard-tools/auto-tag-v2/src/definition.ts (7 permissions)
- live app: origin filter All/Manual/Rules/AI, M marks in rows

## Quotes and wording from the development record

- So what you supposed to add was the prototype in full, with the charts, everything, including tag origins, with the exact same styling, you'll have to install recharts (user, thread 95607d6b)
- I really like command bar (user, thread 34723c14)
- ignore tag-origins unless you can make it into something that conveys useful infomation, currently I don't think it does (user, 34723c14)

## Commits

- `825bc2b`
- `928c322`
- `f13d108`
- `e423302`
- `0f53487`
- `61d9330`
- `e340f7d`
- `8782ebf`
- `8839369`

## Issues and PRs

- issue #189
- issue #190
- issue #191
- issue #192
- issue #193
- issue #194
- issue #195
- issue #197

## T3 threads

- `95607d6b`
- `52b58842`
- `68714aee`
- `34723c14`
- `acb159ee`

## Images used

- /blog-images/diagram-auto-tag.png
- /blog-images/app-library-files.png
- /blog-images/app-auto-tag.png
- /blog-images/autotag-fit-current.png
- /blog-images/autotag-fit-command.png

## What must NOT be claimed

- Do not present semantic tagging as production inference.
- Do not imply the board layout is frozen.

## Unknowns

- Vocabulary governance, thresholds, long-term vector store.
