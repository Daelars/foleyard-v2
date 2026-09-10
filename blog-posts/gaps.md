# Research gaps

Things the evidence does not establish. None of these may be published as fact.
Where a post touches one of these, it says so in the article rather than guessing.

## Why the model tagged 0 of 500, and why it now tags 249 of 15,877

Relevant post: POST-005, and referenced in POST-004.

Known: the in-app run report said "CLAP: tagged 0, attached 0, skipped 500.
Nothing cleared the bar" on 2026-09-07. The Tag origins panel on 2026-09-10 shows
249 files with a `semantic_ai` origin. Model files exist under `foleyard-models/`.
`src/lib/audio-analysis/clap.ts` describes the backend as an injected seam because
onnxruntime has no Electron-ABI rebuild in this repo.

Unknown: whether the zero was caused by thresholds, vocabulary gating, the seam,
or the model itself. Also unknown is exactly what changed between the two numbers.

Required: report both runs as observations. Post 5 lists four candidate causes and
explicitly declines to pick one. Do not attribute the recovery to any specific fix.

## Why Showcase W-G was replaced by W-H, W-I and W-J

Relevant post: POST-008.

Known: `b6a3b9c` removes the W-G minis file; `cd5a4e8` adds W-H/I/J. W-H won and
went into the app mock.

Unknown: no ticket, commit body or T3 message in the sampled threads states a
reason.

Required: post 8 states plainly that the reason is not recorded. Do not invent a
design rationale.

## The 410 and 56 test counts

Relevant post: POST-007.

Known: PR #159 and the track's own commit message say "410 unit tests to 56
integration tests". The repo currently holds 91 test files, 30 of them under
`src/test/integration/`.

Unknown: an independent recount of either original figure.

Required: attribute the numbers to the track, which post 7 does in its second
paragraph, and state that the count has since grown.

## Whether app-v3 becomes the Foleyard interface

Relevant post: POST-009, mentioned in POST-010.

Known: `src/components/variant-i/` and `src/app/prototype/app-v3/` exist
uncommitted; app-v3 renders the real library; reported bugs include the sidebar tab
needing a reload, missing pagination and oversized file lists.

Unknown: whether it replaces anything.

Required: present as an in-progress prototype twin. Never as the new app.

## End-to-end performance in the real application

Relevant post: POST-006, referenced in POST-010.

Known: `docs/performance-improvement-plan.md` records microbenchmarks on generated
fixtures and scratch databases, on one machine, dated 2026-09-09. Items 1-4 are
implemented in the working tree.

Unknown: application-level scan, browse and preview latency before and after.

Required: both posts state that these are microbenchmarks and not application
latency. Never convert "loading 100k rows got 4.7 times faster" into "scanning is
4.7 times faster".

## Whether the v1 retirement is final

Relevant posts: POST-002, POST-010.

Known: the v1 tool packages are deleted, the registration table is empty, the
migration doc says nothing stays on v1, and the adoption path exists. All of this
is uncommitted at time of writing, and two regressions were reported within the
hour (v2 tools not registering, then losing their dialogs).

Unknown: whether it lands as-is, and whether the dialog regressions are fixed.

Required: describe as done in the working tree and still settling. Do not describe
it as shipped or as reverted.

## What "Foleyard v2" will be numbered

Known: the user named the release. `package.json` reads `0.1.8` at HEAD, and there
is no newer tag.

Required: use the name, never a number beyond "v2" itself, and never a date.

## Sound Rack and TanStack

Both appear only as a prototype file and a written plan respectively. Post 3 and
post 5 label them as such. Neither is scheduled, and neither may be described as
coming.
