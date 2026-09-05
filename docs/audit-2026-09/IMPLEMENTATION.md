# Implementation handoff

Start here. The user requested a repository audit, an interactive proposal and a plan for another agent. They explicitly said not to commit code. This session changed no production behavior and made no commits, pushes, issues or PRs.

The current branch is `prototype/repo-audit-indexing-extensions`. All new work is uncommitted in this working directory. A fresh checkout of the branch will NOT contain it. Preserve the working directory or obtain permission to capture the artifacts before moving work elsewhere.

Read [FINDINGS.md](FINDINGS.md), [query-benchmark.json](query-benchmark.json), and the proposal data in [findings.ts](../../src/app/prototype/repo-audit/findings.ts). Findings include evidence, proposed changes and acceptance checks. They are a review backlog, not 27 verified bugs. B10 is a product-semantics decision. Performance items mostly remain hypotheses.

## Existing work to preserve

Before this session, `AGENTS.md` and `src/app/page.tsx` were modified. These untracked documents also existed: `docs/code-reduction-modularisation-audit.md`, `docs/modularisation-audit.md`, and `docs/revisions-progress.md`. Do not stage, reset, overwrite or claim those edits. This audit reflects the current working tree, including them. The older progress document is not an authoritative status list for the current code.

New files from this session are confined to `docs/audit-2026-09/`, `src/app/prototype/repo-audit/`, and `scripts/prototype-repo-audit.cjs`.

## Preview

Run `node scripts/prototype-repo-audit.cjs` from the repository root. Next listens on loopback port 3011; a preview-only proxy listens on loopback port 3012. Open `http://127.0.0.1:3012/prototype/repo-audit?variant=A`.

The existing Tailscale service on port 443 is preserved. This session added `tailscale serve --bg --https=8443 http://127.0.0.1:3012`.

Tailnet URL: https://cognitehedron.tail0710d7.ts.net:8443/prototype/repo-audit?variant=A

Use A for the library workbench, B for the operation timeline, C for the implementation desk. The floating arrows change the URL; keyboard arrows work outside form fields. Scan state, extension grants and review choices live only in memory. Scan counts and filenames are examples. No variant has been selected or validated by the user yet.

The preview proxy accepts only GET/HEAD for the prototype, Next assets, development fonts and favicon. It rejects app API routes. It also forwards WebSocket upgrades only for `/_next/webpack-hmr`. This connection is required for this Next development preview to hydrate and become interactive. Omitting it caused the original inert controls despite every script returning HTTP 200.

Follow-up browser verification passed after restoring WebSocket forwarding: A to B to C layout switching, Cleanup filtering to four findings, scrolling the main container, scan completion, destination grant, gather preview and keep-both completion. The collaborative browser connector became available for this follow-up. This supersedes the initial browser-verification limitation below. The scrolling fix gives the prototype its own `min-h-0 flex-1 overflow-y-auto` container because the app body intentionally hides overflow.

To stop this preview's Tailscale entry, use `tailscale serve --https=8443 off`. Do not use `tailscale serve reset`, which would remove the user's existing service too. Stop the specific preview launcher and its Next child if shutting down local processes. Logs are in `%TEMP%/foleyard-audit-preview.log` and `%TEMP%/foleyard-audit-preview-error.log`.

## Work order

Follow repo shipping rules when implementation is authorized: one issue per branch and PR, `feat/<issue-number>-<slug>`, exactly one `Closes #<number>`, approximately 400 changed lines or split dependent work. These are proposed issue-sized slices, not permission to implement or publish now. Check GitHub before creating anything; no open issues were returned during this audit.

1. **E04, close the Drop Rules filesystem bypass.** Touch Drop Rules command input, extension transport and host file operations. Resolve indexed IDs server-side, require the destination grant, and deny unhandled filesystem transports. Use the E04 reproduction as a failing safety regression by inverting its expectation. Cover preview and apply, disabled extensions, unindexed source paths, external sources, missing grants and junction escapes. Keep the owned drag-staging exception described in `docs/adr/filesystem-access.md`; do not accidentally remove normal desktop drag behavior.

2. **B01, prevent Gather destination replacement.** Reserve names against existing disk entries and the plan, then use exclusive writes. Return per-file completed/skipped/failed outcomes. Test different-size same-name collisions, same-size distinct content, concurrently created output, and an I/O failure after earlier successful copies. Do not label equal name and size as proven duplicate content. Invert the scratch overwrite reproduction.

3. **B12, own Make Pack temporary files.** Use unique exclusive temporary storage, reserve the final output, and only clean up files created by this operation. Test a pre-existing sidecar and two simultaneous same-name exports. Review ZIP partial writes and failure cleanup with fault injection before retaining the handwritten ZIP implementation. Do not replace it merely because it is long; streaming and ZIP32 limits are already useful behavior.

4. **B02, preserve file identity.** First stop automatic merges based only on metadata. Keep ambiguous move candidates separate. Then implement a stable-ID move with explicit identity evidence and a transaction. Cover two removed candidates for one active file, an old tombstone matching an existing unrelated recording, cross-root moves, and shelf/recent-pack references. A content fingerprint strategy needs its own measured cost decision. Avoid hashing every file on every scan.

5. **B03, unify collection query filters.** Apply the same search/favorites/root/tag predicates to rows and counts, with collection membership added. Invert the query reproduction. Check escaped percent/underscore and deterministic sort order. Keep this independent of search-index optimization.

6. **B04, version optimistic mutations.** Start with tag operations and per-field versions, then deletion/view-generation ownership in a separate slice if needed. Reproduce out-of-order success and failure using deferred promises. A failed tag attach may only undo its own change. An old deletion failure must not restore a previous view. Keep useful current batch tests; the existing comments claiming concurrent edits are never clobbered are too broad.

7. **B11, own pagination locks.** Use request identity for lock release, cancel obsolete fetches, and avoid duplicate page appends. Test an old page completing after a query change while a new page is pending. Offset pagination during an actively changing scan still needs a defined consistency contract; cursor paging alone does not create snapshot isolation.

8. **B06, remove Janitor truncation.** Page through all indexed files in scope with bounded batches. If a deliberate limit remains, return explicit incomplete status. Cover 5,001 and larger files and avoid a single large response. Do not simply increase the constant again.

9. **B07, constrain Janitor directory traversal.** Represent folder scope separately from all Library roots. Traverse only the chosen folder, report unreadable subtrees, and distinguish direct-child versus recursive scan semantics. Ensure root folders are not offered as deletable empty folders. Preserve the final containment and emptiness checks.

10. **B05, finish metadata in one scan.** Separate header parsing from fallback policy. New/changed files should fall back when metadata is incomplete; errors should identify the affected file and retryability. Add real audio fixtures for headers beyond 32 KiB, truncated data and unsupported codecs. Preserve last-known metadata until replacement is successfully parsed if that is the chosen UI contract.

11. **I01, bound scan work.** Give the metadata queue a fixed pending cap, an awaitable capacity signal and cancellation. Discovery should stop scheduling on fatal errors. Ensure cancelling does not permit stale callbacks to mutate a later scan. Test slow and permanently stalled extractors and database flush errors. Replace shifting a large array only as part of this bounded queue change.

12. **I03, define root ownership.** Prefer longest canonical containing root, or explicitly reject overlap if the user chooses simpler semantics. Test parent/child order, case variants, trailing separators and inaccessible roots. Do not rely on order in the settings array.

13. **I02, scope reconciliation by scan generation.** Introduce per-root run status and last-seen generation with SQL cleanup restricted to fully enumerated roots. Avoid materializing all historical rows and every seen path. Offline and unreadable subtrees must retain records. Measure unchanged-scan write cost before changing timestamps. Add watcher-driven incremental indexing later, with full-scan repair after overflow/restart.

14. **B10, decide exclusion semantics.** Present the current behavior to the user: remove from library is undone by a scan. If persistent exclusion is intended, store it separately from missing-file status and give the user a restore action. This is not settled by the prototype.

15. **E01, enforce capability grants centrally.** Pass host-owned services that check effective grants on every operation. A manifest declares requested permissions; it does not grant them. The existing six built-ins run trusted Node code and can import `node:fs`, so this is not a sandbox. Do not enable arbitrary community code until a worker/process boundary, restricted RPC, resource limits and package trust policy exist.

16. **E02, consolidate built-in definitions.** Make an extension definition own manifest, command input validation, request/result adaptation and UI contribution metadata. Keep UI and server implementations in separate entrypoints to avoid bundling server code into the client. Migrate one extension first; prove another can be added without modifying generic host switches. Avoid a new registry for every concern.

17. **E03, add long-operation jobs.** Define `queued/running/cancelling/completed/partial/failed/cancelled` states and an operation ID. Prefer one progress transport with polling fallback. Expose per-root and per-file outcomes, cancellation, bounded history and safe retry behavior. User-visible pause should mean stop scheduling, not pretend to interrupt an already running file copy. Disabling an extension must prevent new work; decide how running work settles.

18. **B08, validate extension envelopes.** Use existing request helpers for execute and settings PATCH. Validate IDs, selections, paths, declared setting options and numeric bounds. Map failures to controlled responses. Test null/arrays/malformed JSON rather than relying on TypeScript assertions.

19. **B09, make collection conversion scalable and atomic.** Use `INSERT ... SELECT` and one transaction for membership plus conversion. Test beyond the runtime's bind-variable limit, rollback on injected failure and removed-file exclusion.

20. **P01, separate waveform cache hits from generation slots.** Keep source identity checks and atomic cache publishing. Add bounded client reuse keyed by file ID and version. Measure cold generation, warm retrieval and scroll revisits under concurrent requests. Do not remove the semaphore or persistent cache.

21. **P02, bound directory browsing.** Compare indexed parent-directory storage with a normalized directory table. Account for scan updates and removed files. Check plans and latency on deep/wide roots before adding a cache that needs invalidation.

22. **P03, tune actual queries.** Use the included scratch benchmark as an initial candidate, then benchmark real schema/data without mutating user content. Include root listing, directory listing, favorites, tag membership, collection search, substring search and duration order, plus concurrent scan writes. Report p50/p95 and index size/write cost. Do not claim the synthetic 8x result as an app-wide speedup. Preserve substring semantics if evaluating FTS.

23. **P04, batch extension hydration.** Add bounded ID lookup preserving order and deduplicating IDs. Use it for shelf and packs. Resolve canonical roots once per operation but retain final file boundary checks. Count queries before and after on 1,000 items.

24. **S01, remove dead toggle paths.** Delete `applyFavoriteToggle`, `applyTagToggle` and only their obsolete tests. Confirm production references again before deleting. Do not confuse `applyBulkFavorite`/`applyBulkTag` with the unused functions.

25. **S02, collapse forwarding layers.** Choose one repository access convention and a single composition root. Keep injectable repositories for SQLite integration tests. Remove `pageLimit()` and identity transport lambdas. Treat tiny `createService` factories as low-priority API choices, not performance defects. Avoid another broad file-splitting exercise.

26. **S03, make UI checks prove layout.** Add a small browser smoke for zoom, overflow and keyboard navigation; keep intentional token-policy checks where they still matter. Keep permission, transaction, parser, sorting and selection behavioral tests even when individually short.

27. **S04, enforce build checks.** Add `next build` to the PR workflow. Keep desktop release verification separately. Prototype routes currently return not-found in production but still appear in the build route inventory, so do not leave successive design experiments in main indefinitely. Retire obsolete audit status documents only after reconciling them with actual issue/commit state.

## Target design

The app should coordinate workflows; the host should validate and authorize; file operations should own safe I/O; the index should own identity and reconciliation. Extensions should describe optional behavior and invoke those operations. Avoid teaching the app every command's filesystem rules.

Suggested scan records: run ID, root ID, phase, enumeration completeness, discovered count, metadata successes/failures, cancellation state, started/finished times and last successful generation. Suggested file records: stable ID, canonical path, root owner, source version, metadata state, last-seen generation, missing status and a separate user exclusion. These are design proposals, not a migration to apply blindly.

Suggested operation records: job ID, extension/command IDs, granted scope, state, progress, per-item outcome and retryability. Preview is a plan, not permission to overwrite. Recheck relevant conditions when executing it.

Keep the filesystem ADR's canonical-root and desktop-grant behavior. A future network-accessible live app or third-party executable extension system changes the trust model and requires an explicit ADR decision. The prototype's extra grants are illustrative; the production manifest still supplies its own permission list today.

## Verification and limits

Existing baseline: 70 Vitest files, 410 tests passed. Separate audit evidence: 5 tests passed, deliberately asserting current faulty behavior. Run it with `node node_modules/vitest/vitest.mjs run --config docs/audit-2026-09/reproduce.config.ts`. Never merge these bug-preserving assertions unchanged into the product suite. Convert each into an expected-correct regression while fixing the corresponding issue.

TypeScript, repository ESLint and Next production build passed during the audit. The initial `npx tsc` resolved the wrong command despite local TypeScript being installed; direct local entrypoints worked. Use `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/eslint/bin/eslint.js .`, `node node_modules/vitest/vitest.mjs run`, and `node node_modules/next/dist/bin/next build` for reliable local verification.

HTTP smoke passed through the actual tailnet URL: variants A/B/C returned 200 with the page title and findings; all 22 unique linked Next assets returned 200. `/api/files` returned 404 and a prototype POST returned 405. The computer-use tool reported no available browser, so visual and interactive browser smoke remains unverified. Next compilation and HTTP responses are not a substitute for that check. Before selecting a design, test the simulated actions and switcher in a browser, including a narrow screen and keyboard navigation.

The audit covers all first-party areas by inventory, reference searches, targeted control-flow review and the full existing test suite. It does not prove every file is correct or that every bug has been found. Native packaged Electron behavior, physical audio-device playback, interrupted network drives, large real audio libraries and actual low-level I/O races were not exercised. Those need focused verification during the relevant implementation slices.
