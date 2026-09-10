# Release Horizon

Pass 3, 2026-09-10. Supersedes passes 1 and 2 where they conflict.

Current public version: `0.1.8` (tag `v0.1.8`, commit `d8312b2`, 2026-05-11)
Public repository on the site: `github.com/Daelars/foleyard-v1`
Next release name: **Foleyard v2**
Next version number: unknown. `package.json` still reads `0.1.8` at HEAD. Do not
invent `0.2.0` or `1.0`.
Current branch: `197-board`
Current HEAD: `8839369` (2026-09-07)
Commits in window: 104 (`v0.1.8..HEAD`)
Uncommitted worktree changes at time of writing: 203 paths

## Naming authority

"Foleyard v2" is used as the public release name on the user's explicit
instruction (2026-09-10): "I basically just want them to sound like they're
building up to a major release, introducing Foleyard v2." It is corroborated by
the repository name (`foleyard-v2`) and the public repo being `foleyard-v1`.

No version number and no ship date is claimed anywhere in the series.

## Voice decisions for this pass

- First person singular. The site's own pages say "Why I Built Foleyard" and
  "Foleyard is currently built by one person".
- The AI pairing is on the record. Posts quote real exchanges from T3 threads,
  trimmed for profanity, never invented.
- American spellings, matching the published site (favorite, organize, color).
- Voice profile written to `~/.config/ghostwriter/soul.md` and `blog.md`, mirrored
  here as `voice-soul.md` and `voice-blog-profile.md`.

## Correction to pass 2 (important)

Pass 2 recorded "six v2 ports shipped disabled by default, no v1 cutover, v1 still
ships". **That is no longer true and must not be republished.**

Verified in the working tree on 2026-09-10:

- All six v1 tool packages are deleted (`packages/yard-tools/{drop-rules,
  folder-janitor,library-gatherer,make-pack,smart-collections,sound-shelf}`).
- `src/lib/extensions/registry.ts` holds an empty registration table with a comment
  stating all six v1 tools have retired to their v2 ports.
- `docs/extensions-v2-migration.md` states "Nothing stays on v1" and describes the
  adoption mechanics.
- `src/lib/extensions-v2/enablement.ts` defines `RETIRED_V1_TO_V2`,
  `RETIRED_V1_SETTINGS` and `RETIRED_V1_DATA`, so enablement, approvals, listed
  settings and data records move to v2 on first boot after retirement.
- The running app's Tools page lists seven v2 tools and no v1 tools.

## Major release themes

1. **Extension system v2.** Contract-first definitions, sanitized catalog,
   registry, one availability check, declared-and-approved permissions (21 known),
   enforced filesystem seam, jobs with progress/cancel/recovery, preview-review-apply,
   UI contribution adapters. Seven tools run on it.
2. **Auto Tag.** Origin-aware tag storage (`manual` / `deterministic` /
   `semantic_ai` plus confidence), deterministic rules, candidate queue with
   explicit accept, embedding store with find-similar, post-scan trigger, opt-in
   CLAP semantic tagging, coverage board with charts.
3. **A faster engine.** Browser-side waveform decode with IndexedDB cache, cache
   admission before generation slot, specialized PCM16 reduction, scanner split
   into phases with a bounded metadata queue, narrow scan-setup projection,
   partial filename index plus ANALYZE.
4. **Interface language.** Showcase design review (winners: palette F, quiet
   popups, rounded console, W-H organize), Organize view shipped, component
   library variants A-J with G as favorite, Variant I extracted, app-v3 twin.
5. **Correctness and verification.** 27-finding audit, revisions track, 410 unit
   tests replaced by 56 integration tests, CI gate extended to the production
   build plus boundary, docs and example checks.

## Implemented on branch (unreleased)

- `825bc2b` origin-aware tag storage with migration v2 (#189)
- `928c322` deterministic rules tool on v2 (#190)
- `f13d108` candidate queue with explicit accept (#191)
- `e423302` embedding store plus find similar on stub vectors (#192)
- `0f53487` provenance marks and origin filter in the library UI (#193)
- `61d9330` post-scan auto-tag trigger (#194)
- `e340f7d` opt-in CLAP semantic tagging (#195)
- `8782ebf` + `8839369` auto-tag board with charts (#197)
- `e181dbd` six v2 ports (#196)
- `742fd71` test rebuild 410 to 56 (#159); `b8ed1bb` revisions track (#120)
- `14ed665` scan metadata preserved, scan phases separated (#85 #105)

## In the working tree, measured, not committed

- v1 tool retirement and adoption path (see correction above).
- Performance items 1-4 from `docs/performance-improvement-plan.md`, measured
  2026-09-09: cache admission (264.5 ms to 1.3 ms on a valid hit with slots held),
  PCM16 reduction (1093.5 ms to 159.8 ms for a five-minute file), narrow scan setup
  (206.5 ms to 44.1 ms per 100k rows), timestamp-only touches (237.5 ms to 40.8 ms
  per 10k rows), filename index plus ANALYZE (189.2 ms to 3.25 ms deep paging),
  bounded metadata queue (capacity 500).
- Component library variants A-J, `src/components/variant-i/`,
  `src/app/prototype/app-v3/`.

Every figure above is a microbenchmark on generated fixtures on one machine
(Ryzen 7 5700X, Node 24, win32). Not application latency. Say so when quoting.

## Explicitly rejected

- PR #198, "Add extensions v1 removal plan". Opened 2026-09-09T22:26:01Z, closed
  22:27:26Z, 85 seconds, unmerged. Its own verdict was "do not delete v1 in one
  shot". Never describe it as revived; the retirement that happened was a different
  approach.
- Two of three extension concepts in each prototype round; the "Sound rack"
  direction was kept as a prototype only.
- Showcase W-G minis (`b6a3b9c`), replaced by W-H/I/J (`cd5a4e8`). Reason unknown,
  see `gaps.md`.
- The settings dialog redesign, five rounds, all rejected. The shipped dialog stands.
- Rust and worker threads for the decode path, deferred with measurements.
- A duration-sort index (23.8x read gain, 3.2x write cost) and cursor pagination,
  both deferred pending a realistic import benchmark.

## Planned or open, do not describe as built

- Real production CLAP inference. `src/lib/audio-analysis/clap.ts` is an injected
  seam because onnxruntime has no Electron-ABI rebuild in this repo. The origins
  panel currently shows 249 AI-origin files against 15,877.
- TanStack adoption. A written plan exists; nothing adopted.
- Sound Rack. Prototype HTML only.
- Whether app-v3 replaces the current interface.
- End-to-end scan and browse latency measurements in the real app.
