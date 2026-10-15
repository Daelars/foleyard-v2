# Expected-to-fail regressions

These integration assertions state the correct contract for live defects and
are marked expected-to-fail against their finding IDs. Fixing a defect flips
its test to `it` and removes its ledger entry in the same change; the check
cannot pass while the two disagree.

`scripts/check-expected-failures.cjs` (run in CI) does not count
`it.fails(`. It reads the structured ledger below and maps each entry to the
one test whose title starts with that ID, so a correct expected failure cannot
be silently swapped for an unrelated one:

- every `it.fails(` anywhere in the repository must carry an `[XF-...]` id and
  have exactly one ledger entry,
- every ledger entry must have exactly one matching `it.fails(` in the file it
  names,
- an expected failure outside `src/test/integration/` is reported rather than
  quietly counted,
- a review date in the past fails the check until the entry is re-reviewed.

The shared logic lives in `scripts/lib/expected-failures.cjs` and is covered by
`src/test/expected-failures.test.ts`.

## Ledger

| ID | Finding | Area | Severity | Owner | Introduced | Review by | Test |
| --- | --- | --- | --- | --- | --- | --- | --- |
| XF-B03-01 | B03 | database-correctness | data-correctness | Application | 0.1.8 | 2027-01-15 | `src/test/integration/database-correctness.test.ts` |
| XF-B09-01 | B09 | database-correctness | data-integrity | Application | 0.1.8 | 2027-01-15 | `src/test/integration/database-correctness.test.ts` |
| XF-B02-01 | B02 | data-loss-prevention | data-loss | Application | 0.1.8 | 2027-01-15 | `src/test/integration/data-loss-prevention.test.ts` |
| XF-B10-01 | B10 | data-loss-prevention | data-loss | Application | 0.1.8 | 2027-01-15 | `src/test/integration/data-loss-prevention.test.ts` |
| XF-I03-01 | I03 | scanner | data-integrity | Application | 0.1.8 | 2027-01-15 | `src/test/integration/scanner.test.ts` |
| XF-B04-01 | B04 | client-mutation-lifecycle | data-loss | Application | 0.1.8 | 2027-01-15 | `src/test/integration/client-mutation-lifecycle.test.ts` |
| XF-B04-02 | B04 | client-mutation-lifecycle | data-correctness | Application | 0.1.8 | 2027-01-15 | `src/test/integration/client-mutation-lifecycle.test.ts` |
| XF-B11-01 | B11 | client-mutation-lifecycle | data-correctness | Application | 0.1.8 | 2027-01-15 | `src/test/integration/client-mutation-lifecycle.test.ts` |

Columns:

- **ID** — stable, unique per pinned test (`XF-<finding>-<nn>`); the test title
  begins with it.
- **Finding** — the area finding code the test was written against.
- **Area** — the affected integration area.
- **Severity** — one of `data-loss`, `data-integrity`, `data-correctness`,
  `ux` (see the policy below).
- **Owner** — the owning context from `CONTEXT-MAP.md`.
- **Introduced** — the product version in which the pin was recorded (the
  `package.json` version at the commit that added it).
- **Review by** — the date by which the entry must be re-reviewed or removed.
- **Test** — the pinned test file; its title carries the ID.

## Severity policy

| Severity | Meaning | Release |
| --- | --- | --- |
| `data-loss` | A user's files, edits or intent can be destroyed irreversibly. | **Blocker** |
| `data-integrity` | Persisted state can be left inconsistent or wrong, but not destroyed. | Allowed |
| `data-correctness` | Reads or in-memory state are wrong; nothing persisted is corrupted. | Allowed |
| `ux` | Cosmetic or ergonomic only. | Allowed |

A `data-loss` finding is a release blocker: `node
scripts/check-expected-failures.cjs --release` refuses to continue while any
entry with that severity is pinned, and the release build gate
(`scripts/prepare-release.cjs` and `.github/workflows/release.yml`) runs it.
The ordinary CI check reports the blockers but passes, because an expected
failure is a known, pinned defect rather than a surprise.

## Fixing a finding

1. Flip its test from `it.fails(` to `it(` and drop the `[XF-...]` id from the
   title.
2. Delete its row from the ledger table above.

Both edits land in the same change; either one alone fails the check.
