# Expected-to-fail regressions

These integration assertions state the correct contract for live defects and
are marked expected-to-fail against their finding IDs. Fixing a defect flips
its test green on its own; until then the count below must hold.

`scripts/check-expected-failures.cjs` (run in CI) counts `it.fails(` in
`src/test/integration/` and requires it to equal the entries here. A PR that
deletes one of these tests without fixing the finding fails the check. A PR
that FIXES a finding flips that test to `it` and removes its entry here in
the same change.

- B03 — database-correctness: collection-branch count disagreement (#137)
- B09 — database-correctness: unchunked, non-atomic smart conversion (#137)
- B06 — extension-host-transport: silent 5,000-file scan cap (#138)
- E04 — filesystem-boundary: drop-rules write with no writable path (#135)
- E01 — filesystem-boundary: unpermitted service reachability (#135)
- B12 — data-loss-prevention: export deletes a manifest sidecar (#136)
- B02 — data-loss-prevention: distinct recordings inherit tags (#136)
- B10 — data-loss-prevention: removal undone by rescan (#136)
- I03 — scanner: order-dependent root ownership (#139)
- B04 — client-mutation-lifecycle: late tag failure erases newer edit (#140)
- B04 — client-mutation-lifecycle: stale deletion restores old root (#140)
- B11 — client-mutation-lifecycle: stale page unlocks duplicate request (#140)
