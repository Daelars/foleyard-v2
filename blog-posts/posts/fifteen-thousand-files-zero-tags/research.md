# Research brief: 15,000 files, 0 tags

- Post: POST-005, order 5 of 10
- Slug: `fifteen-thousand-files-zero-tags`
- Development state: **in-progress**
- Date range: 2026-09-07 to 2026-09-10
- Confidence: high
- Article: `blog-posts/posts/fifteen-thousand-files-zero-tags/index.md` (1177 words)

## Story

First contact with a real library. The tagger processed 500 files and attached none. The bigger problem was that the interface would not have shown it if it had worked.

## Release context

Foleyard v2, unreleased. Public version is 0.1.8. See `release-horizon.md`.

## What existed before

Auto Tag built and running against fixtures.

## Problem or motivation

Run reported tagged 0, attached 0, skipped 500. Separately, coverage numbers, charts, tag lists and origins did not update while a job ran.

## What changed

Nothing in this post is a fix. It reports the run, the stale-UI bug, the unclear promote control, and the current numbers.

## Evidence

- in-app run report 2026-09-07 19:25
- Tag origins panel 2026-09-10: 15877 files, 1256 manual, 615 rule, 249 AI
- coverage view: 2083/15877 tagged, last 500 arrivals 65 tagged 435 missed, no rule fired
- threads 34723c14, 681c4cd2, acb159ee, 0a01fd01

## Quotes and wording from the development record

- the following doesn't do anything? Semantic tagging ready 163016336/400000000 bytes ... no indication of whether they do anything (user)
- Semantic tagging ended as interrupted. I think we need to use our toast notifcaitons more to displayed actual readable errors etc (user)
- I hit Analyze untagged files with CLAP it analyses, but NONE OF THE UI works? none of it updates, nothing (user)
- DO NOT EDIT CODE. EXPLORE WHY THE NUMBERS ARE NOT UPDATING (user, capitals in original)

## Commits

- none

## Issues and PRs

- none

## T3 threads

- `34723c14`
- `681c4cd2`
- `acb159ee`
- `0a01fd01`
- `8171801c`

## Images used

- /blog-images/app-auto-tag-origins.png
- /blog-images/app-auto-tag.png

## What must NOT be claimed

- Do not diagnose the cause of the zero. Four candidates are listed and none is chosen.
- Do not present 249 AI-origin files as a success.

## Unknowns

- Cause of the zero. What changed between the two runs. Whether TanStack gets adopted.
