# Test suite target shape

Agreed 5 September 2026. The suite is being rebuilt from **410 mostly-unit tests across 70 files** to **50 integration tests across 8 areas**.

## Why

410 passing tests did not catch a single one of the 27 findings in the September 2026 audit, including eight P1 and P2 defects that shipped under a green suite: B01, B02, B03, B04, B11, B12, E01 and E04.

The measured baseline in [test-coverage-baseline.md](./test-coverage-baseline.md) explains how. Coverage sits at 37.77% of statements, and 96 of 225 reported files are wholly unexecuted. The largest unexecuted file in the repository is `src/app/library/use-library-files.ts` at 252 statements — which holds B04 and B11. The suite's size and its safety were unrelated, so reducing the size does not spend safety.

The failure was distribution, not volume. 410 tests crowded onto a third of the modules at 1.9 assertions each, while the rest had none.

## The eight areas

| Ticket | Area | Files before | Tests before | Tests after |
| --- | --- | ---: | ---: | ---: |
| #135 | Filesystem grant boundary | 2 | 21 | 8 |
| #136 | Data-loss prevention | 6 | 21 | 8 |
| #137 | Database correctness | 9 | 55 | 8 |
| #138 | Extension host + transport | 16 | 112 | 8 |
| #139 | Scanner | 2 | 17 | 6 |
| #140 | Client mutation lifecycle | 8 | 61 | 5 |
| #141 | Desktop + supply chain | 7 | 41 | 5 |
| #142 | Component + layout | 20 | 82 | 2 |
| | **Total** | **70** | **410** | **50** |

Every file in the repository is assigned to exactly one area. The "before" column reconciles to the recorded run of 410.

## Sequencing

This is an expand–contract migration.

1. **Expand** (#134, this ticket): build the shared fixtures. Delete nothing.
2. **Migrate** (#135–#142): each area writes its integration tests *and deletes the unit tests they replace in the same change*. Each area is self-contained, so CI stays green from one ticket to the next, and they can land in any order.
3. **Contract**: helpers that existed only so a node-environment test could import them get inlined back into their components as part of #142.

## Rules that hold across every area

- **A cut may not lose coverage.** Every area ticket carries a criterion that its coverage, measured against the #123 baseline, does not fall. If it does, the cut went too deep and the specific test comes back.
- **Assertions state the correct contract, never current behaviour.** Where an area covers a live defect, the assertion is written correct and marked expected-to-fail against its finding ID. Fixing the bug flips it green on its own.
- **Nothing is deleted for being short.** SQLite escaping and variable-limit tests, the filesystem boundary suite, transport hydration, scanner behaviour, Electron hardening and the postinstall integrity checks all survive the rebuild in some form.
- **#136 is the floor.** Data-loss prevention drops only 21 to 8, deliberately. It is the one area where losing an assertion costs a user their files.

## Fixtures

`src/test/fixtures.ts` owns what was previously copied per file:

| Fixture | Replaces |
| --- | --- |
| `createTestDatabase()` | 7 files standing up their own in-memory SQLite |
| `audioFileRecord(overrides)` | hand-built row literals, so a test states only the field it is about |
| `createScratchLibrary()` | 19 files making their own temp directories |
| `.grant()` on a scratch library | manual `registerGrant` wiring |
| `callRoute(handler, options)` | 12 files building their own `NextRequest` |
| `deferred()` | nothing yet — required by #140, where out-of-order completion is the point |
