# Research brief: The library designs that didn't ship

- Post: POST-008, order 8 of 10
- Slug: `library-designs-that-didnt-ship`
- Development state: **prototype**
- Date range: 2026-09-03 to 2026-09-04
- Confidence: medium
- Article: `blog-posts/posts/library-designs-that-didnt-ship/index.md` (1263 words)

## Story

A design review that offered five directions per element and asked for winners by letter, plus a reskin track that went backwards and a settings dialog rejected five times.

## Release context

Foleyard v2, unreleased. Public version is 0.1.8. See `release-horizon.md`.

## What existed before

Shipped 0.1.8 interface.

## Problem or motivation

Iterating on a single mockup produces drift, not decisions.

## What changed

Showcase with five designs per element; winners palette F, quiet popups, rounded console, W-H organize, wired into an app-v2 mock. Organize view shipped to the app (48c04a8). Settings not redesigned.

## Evidence

- src/app/prototype/showcase, revised-v2, app-v2, redesign (banner reads rev 28)
- app-v2 banner: Winners wired: palette F, quiet popups, rounded console, W-H organize
- commits cd5a4e8 (W-H/I/J), b6a3b9c (W-G removed), 48c04a8 (Organize view)
- thread 4707196e, 2026-09-03

## Quotes and wording from the development record

- this is just weaker than the orignal (user)
- you've made the entire ui more simple the colours don't work, the gradients? the wave forms? you're supposed to make this design better (user)
- THE FOCUS RING IS STILL THERE WHEN I HOVER (user)
- This settings dialog is just absolute slop. this is tragically awful (user)
- ALL YOU HAD TO DO WITH REMOVE THE CHIP BESIDE LIBARY ... YOU WORKED FOR 21 MINUTES FOR THAT? (user, paraphrased in the post)

## Commits

- `8778693`
- `cd5a4e8`
- `b6a3b9c`
- `48c04a8`

## Issues and PRs

- none

## T3 threads

- `4707196e`
- `0aed44e6`
- `5af5f7f0`
- `11138765`

## Images used

- /blog-images/design-showcase.png
- /blog-images/design-app-v2.png
- /blog-images/design-redesign.png
- /blog-images/app-organize.png

## What must NOT be claimed

- Do not invent a reason for the W-G removal. See gaps.md.
- Do not claim a variant-to-surface mapping without per-file evidence.

## Unknowns

- Why W-G was replaced.
