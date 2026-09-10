# Development Timeline (Sept 3 → Sept 10)

Pass 1 covered tag `v0.1.8` (2026-05-11) to HEAD `8839369` (2026-09-07), 104 commits.
Pass 2 (2026-09-10) re-anchors at **2026-09-03** and extends to the present. No new
commits landed on `197-board` since HEAD, so the Sept 8–10 sections below rest on
uncommitted worktree files, side branches, T3 threads, and PR #198 — marked
[worktree], medium confidence. Package version still `0.1.8`; everything remains
unreleased unless stated.

## 2026-09-03 — Extension host consolidation and copy cleanup

State: implemented-unreleased
Evidence:
- commits `65d15d7` (host module), `6e355fc` (details dispatch), `f09827c` (workspace heights),
  `81e1fb4` (unslop copy), `afacd69`, `e09b39b`, `a5ec027` (settings titles added then reverted)
- T3 threads `4707196e`, `5af5f7f0` ("continue all of the tickets in issues")
What existed before: extension execution spread across call sites; dialog copy with AI tells.
Problem: duplicated execution paths and sloppy user-facing wording.
Outcome: single host module; copy cleaned; display-scale titles tried and reverted.
Confidence: high

## 2026-09-03…04 — Visual reskin (#19–#33) and app port (#45–#59)

State: implemented-unreleased (visible in branch builds, not in 0.1.8)
Evidence:
- commits `8778693`…`167a995` (reskin 19–33), `43eb0ec`…`176549a` (port 45–59),
  `850b816`…`412157d` (showcase designs), `1bd269a`…`ecd318a` (artwork wash, scrims,
  W-D…W-K), `48c04a8`…`0ad9fcc` (Organize view, audit page, variant pipeline)
- T3 thread `0aed44e6` (reskin brief, issues #14–#18)
What existed before: older Foleyard surfaces pre-theme-tokens.
Change: theme tokens landed first, then surfaces reskinned one by one; app shell,
transport console, palette, shelf, and Organize view ported to the prototype language.
Rejected along the way: W-G minis file (`b6a3b9c`), superseded by W-H/I/J (`cd5a4e8`).
Confidence: high for implementation; medium on which showcase variant influenced which
ported surface (inferred from sequencing, not a written decision log).

## 2026-09-04…05 — Revisions hardening track

State: implemented-unreleased
Evidence:
- commits `5f078de`…`b8ed1bb` (filesystem grants, scan phases, shared SQLite,
  batch endpoints, filename behaviours, dot-matrix split), merge `9772cc1` (PR #120)
- T3 threads `dfca04b4`, `43d5b4b8` ("do everything in the open tickets")
- issues #76–#120 range; PR #120 merged 2026-09-05
What existed before: per-route SQLite handling, spread filename logic, scan metadata churn.
Problem: correctness and boundary gaps found in audit.
Outcome: shared connection, grants enforced, scan phases separated, canonical filename
behaviours in yard-core.
Confidence: high

## 2026-09-05 — Test rebuild: ~410 unit tests → ~56 integration tests

State: implemented
Evidence:
- commits `8ec273e` (collect every test file), `742fd71` (rebuild track, PR #159 merged),
  plus PRs #143–#157; `docs/audit-2026-09/` inventory and findings
- T3 threads `0e0ec7d2` ("there's no way there should be 400 tests… I told you to cut
  down significantly"), `bf45734d` (hunt for slop, performance wins, extension/indexing review)
- user directive captured verbatim: target "~50 maybe", not 300+
What existed before: hundreds of unit tests, many low-value.
Change: deleted the unit suites (see `git log --diff-filter=D` for route/library tests),
rebuilt ~56 integration tests across 8 areas with CI gating; 16 expected-to-fail
regressions pinned live defects at the time.
Confidence: high. Exact "410" and "56" come from the track's own commit message and
should be presented as the track's count, not an independently re-audited census.

## 2026-09-06 — Extension system v2 (+ six ports, disabled by default)

State: implemented-unreleased (disabled-by-default; v1 still the product surface)
Evidence:
- commit `e181dbd` (PR #196, "Feat/v2 port remaining tools"), issues #164–#182 closed,
  PRs #171–#175 area; `RELEASE.md` "Extension v2 status" section; per-tool parity tables
  in `packages/yard-tools/<id>/README.md`
- T3 threads `878dc4b9` ("read extension-v2-implementation-prompt.md and implement"),
  `8866cfcb` (prototype three extensions — rejected two, kept Sound-rack direction),
  `1c02df0f` ("So all extensions are ported over to v2?")
What existed before: v1 tools as the only extension surface.
Change: v2 contracts, registry, jobs/cancellation, permissions, transport, UI adapters,
workbench/inspector, docs/diagrams; six ports (Make Pack, Sound Shelf, Smart Collections,
Folder Janitor, Library Gatherer, Drop Rules) registered but disabled until enabled +
approved. Enabling/disabling semantics verified, no v1 settings migration.
Also in `e181dbd`: typed IPC contract, batched hydration/removal, canonical filename
adoption, browser waveform decoding with IndexedDB cache, single-pass scan metadata
(8→16 metadata concurrency, 8→32 stat fan-out).
Confidence: high

## 2026-09-07 — Auto-tag intelligence chain (#189–#197)

State: implemented-unreleased
Evidence:
- commits `825bc2b` (#189 origin-aware storage + migration v2),
  `928c322` (#190 deterministic rules on v2),
  `f13d108` (#191 candidate queue),
  `e423302` (#192 embedding store + find-similar on stub vectors),
  `0f53487` (#193 provenance UI + origin filter),
  `61d9330` (#194 post-scan trigger),
  `e340f7d` (#195 opt-in CLAP),
  `8782ebf` + `8839369` (#197 board with recharts)
- issues #183 (open wayfinder map), #184–#188 (wayfinder spikes, all closed),
  #189–#197 closed `ready-for-agent`
- T3 threads `95607d6b` (the founding brief: CLAP → vector, LanceDB, "find similar
  songs", friend's "3…" suggestion), `52b58842` (board layout critique: red square →
  one pane, cyan full-length, filter tags placement), `68714aee` (ship instructions),
  `8171801c` (v1-removal + TanStack planning, no code changes)
What existed before: tags with no notion of who made them; no machine tagging.
Problem: user wanted indexed audio to gain tags "automatically, quickly, and in the
background", switchable, off by default.
Outcome: origins (`manual`/`deterministic`/`semantic_ai`) + confidence threaded from
DB through v2 ports to the library UI (M/D/AI marks, All/Manual/Rules/AI filter);
rules engine with preview; candidate queue with explicit accept/dismiss; model-keyed
embedding store with cosine ranking over stub vectors; scan-completion trigger;
consent-gated model download with progress/cancel and an explicit inference seam;
board page with trends, sparklines, arrivals, goals.
What is deliberately NOT production inference: real CLAP weights / LanceDB backend.
HEAD ships the seam + stub vectors. Say so.
Confidence: high

## Sept 8–10 — Second-week evidence [worktree] (pass 2)

No commits; all evidence is worktree / threads / branches / PR.

### Auto-tag meets a real library

State: in-progress
Evidence:
- T3 `34723c14` (board round 2: nav pills don't fit, prototype didn't mirror the real
  UI, "why is origins on there?"), `b556c1dc` ("what's the point in Candidate queue /
  tag origins? … minimise the bloated info", plus an `auto-tag-fit` variant request),
  `681c4cd2` ("roast our implementation … how can we make our own CLAP model"),
  `acb159ee` (continuation work, zod question), `c397b243` (test count check)
- Real run data quoted in-thread: 15k untagged of 16k; "Last run 9/7 … CLAP: tagged 0,
  attached 0, skipped 500. Nothing cleared the bar."
- Worktree: `foleyard-models/clap-htsat-unfused/` (onnx + tokenizer/configs — the
  opt-in download works), `src/components/AutoTagBoard/origins.tsx` (untracked),
  `src/app/prototype/auto-tag-fit/` (untracked)
Outcome so far: provenance UI questioned by its own requester; thresholds too strict
to tag anything on first contact with 16k files. Honest in-progress material.
Confidence: medium (thread quotes + worktree files agree; no commits)

### Component library trials → app-v3 [worktree]

State: prototype (library + app-v3 uncommitted, not reviewed)
Evidence:
- T3 `2ec4601f` (bespoke-library prompt built by subagents as orchestrator),
  `da57cfe9` / `d6e08527` / `c15b7ccb` (variants B–E + glassy redesign; corrections:
  "NO. YOU ARE ONLY TOUCHING THE PROTOTYPE", "BAD. UNDO.", layout praised but
  components panned, command palette "awful"),
  `9db717c4` ("COPY exactly … rebuild every surface … app/prototype/app-v3"),
  `ee78ec00` (Variant J with real app UI/data + plan), `3d421f55` (implement +
  bug reports: v3 auto-tag sidebar tab doesn't load without reload, pagination gone,
  too many files under charts), `f92766d1` (prototype index page)
- Worktree: `src/components/kit/` (30 primitives), `src/components/variant-i/`
  (styles.css, components/, index, README, test), `src/app/prototype/app-v3/`,
  `src/app/prototype/component-library/` (variants A–J + kit pairings),
  `src/app/prototype/variant-i-library/`, `src/app/prototype/lib-adoption/`,
  docs `component-library*.md`, `variant-i-app-v3-*.md`
Confidence: medium

### Performance honesty [worktree + side branch]

State: prototype / in-progress
Evidence:
- T3 `2f1f2aad` (v2 doesn't load instantly like v1; audit + speed up; "they don't
  need to reload once loaded"), `682a19e9` (indexing gains, Rust sketch, HTML
  prototype with diagrams; friction finding/viewing it)
- Branch `prototype/performance-exploration-20260909` (+2 commits over HEAD:
  `201e7c2` scanner backpressure prototype + candidates doc,
  `a6356c9` standalone HTML prototype + dev route)
- Worktree: `scripts/performance/`, `src/app/prototype/performance/`,
  `docs/performance-improvement-plan.md` (all untracked)
- Related: `prototype/audition-queue` branch (Sept 3, five throwaway audition
  variants + no-JS tab links, self-declared throwaway)
Confidence: medium

### The v1-removal plan that got undone

State: rejected (plan, never executed)
Evidence:
- T3 `bce23d60` (audit → "just fucking send one yourself" → "undo the pr, awful plan")
- PR #198 "Add extensions v1 removal plan (cut over to v2 first)" — CLOSED unmerged
  2026-09-09; sole file `docs/audits/remove-extensions-v1-plan.md` lives only on
  branch `chore/remove-extensions-v1-plan`, absent from worktree. Its own verdict:
  "do not delete v1 in one shot."
Confidence: high (PR state + body + thread agree)

---

## 2026-09-09 22:26 → 22:27 — The v1 removal PR, opened and closed (pass 3)

State: rejected

Evidence:
- PR #198 "Add extensions v1 removal plan (cut over to v2 first)".
  createdAt 2026-09-09T22:26:01Z, closedAt 2026-09-09T22:27:26Z. 85 seconds, unmerged.
- Thread `bce23d60`: "audit the repo, write a pr on how we can safely remove all of
  extensions v1", then "you have the gh cli tool, just fucking send one yourself",
  then at 22:27:15 "undo the pr, awful plan."
- PR body verdict, quoted: "do not delete v1 in one shot. Every product workflow
  still runs on v1."

Outcome: the plan was correct and premature. The migration had not happened yet, so
a deletion order had nothing to delete safely.

Confidence: high (PR API timestamps, PR body, and thread all agree)

---

## 2026-09-10 01:41 → 03:00 — v1 tools retired for real (pass 3)

State: implemented, uncommitted

Evidence:
- Thread `86bfb0d6`: "Look at how far along we are in removing the v1 of
  extensions", then "retire them, make sure v2 extensions get their v2 versions of
  the dialogs from their respective v1 counterparts."
- Working tree: `packages/yard-tools/{drop-rules,folder-janitor,library-gatherer,
  make-pack,smart-collections,sound-shelf}` deleted, plus the v1 dialog components
  under `src/components/extensions/`.
- `src/lib/extensions/registry.ts`: registration table now empty, with a comment
  stating all six v1 tools have retired to their v2 ports and v1 routes fail closed.
- `src/lib/extensions-v2/enablement.ts`: `RETIRED_V1_TO_V2`, `RETIRED_V1_SETTINGS`,
  `RETIRED_V1_DATA`, persisted enablement under `v2:enablement:<id>`, one-time
  adoption that grants declared permissions when the v1 tool was enabled.
- `docs/extensions-v2-migration.md`: "Nothing stays on v1."
- Running app Tools page: seven v2 tools, no v1 tools.

Regressions reported the same hour, still open:
- "I've noticed extensions v2 no longer register in the extensions tab."
- "the v2 extentions, aside from make pack v2, the rest have lost their dialogs."

Supersedes: the pass-1 and pass-2 claim that six v2 ports shipped disabled by
default alongside a still-shipping v1. That is no longer true.

Confidence: high (code, docs and running app agree)

---

## 2026-09-09 21:32 → 22:37 — Measured performance work (pass 3)

State: implemented in the working tree, measured, uncommitted

Evidence:
- `docs/performance-improvement-plan.md`, untracked, measured 2026-09-09T22:37:38Z.
  Items 1-4 implemented in this checkout.
- Cache admission moved outside the generation slot: valid hit 1.3 ms with both
  slots held, against 264.5 ms for the pre-change path.
- PCM16 specialization in `src/lib/waveform-generator.ts`: five-minute file 159.8 ms
  median, pre-change baseline 1093.5 ms. Peak parity pinned in
  `src/test/integration/waveform.test.ts`.
- Partial index `idx_files_active_filename_id` plus ANALYZE: deep filename paging
  over 100k rows 189.2 ms before ANALYZE, 3.89 ms after, 3.25 ms with the index.
- `batchTouchActiveFiles` timestamp-only: 10k unchanged rows 40.8 ms against 237.5 ms.
- Bounded metadata queue, capacity 500, awaitable admission; `getScanCleanupRows()`
  narrow projection loads 100k rows in 44.1 ms against 206.5 ms.
- Decision recorded: keep TypeScript, defer Rust and workers. Worker 173.5 ms
  against 167.9 ms on the main thread, 641 ms startup. Rust never benchmarked.
- Deferred: duration-sort index (16.0 ms to 0.67 ms read, 26.7 ms to 84.8 ms write)
  and cursor pagination.
- Machine: Ryzen 7 5700X, 16 logical CPUs, Node v24.14.0, win32. Generated fixtures
  and scratch databases only; the real library was never opened.

Supersedes: the pass-2 claim that the performance track had "no numbers we're
willing to print yet."

Confidence: high (document, code and test files all present)

---

## 2026-09-10 — Blog pass 3

State: n/a, editorial

What changed:
- Release named **Foleyard v2** on explicit user instruction.
- Series rewritten from 8 posts to 10, first person singular, agent pairing on the
  record, no fixed section template, FAQ blocks removed.
- Voice profile derived from the published site prose and ~600 user messages, written
  to `~/.config/ghostwriter/{soul,blog}.md` and mirrored in this folder.
- 6 diagrams authored, 52 screenshots captured from the running dev server, all
  copied to `repos/foleyard/public/blog-images/`.
- Two factual corrections applied to the whole body of research: the v1 retirement,
  and the existence of measured performance results.
