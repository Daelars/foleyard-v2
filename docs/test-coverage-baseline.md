# Test coverage baseline

Measured **5 September 2026** on `feat/123-coverage-baseline`, with `bun run test:coverage`.

| Metric | Covered | Total | Percentage |
| --- | ---: | ---: | ---: |
| Statements | 2320 | 6142 | **37.77%** |
| Branches | 1204 | 3769 | **31.94%** |
| Functions | 541 | 1561 | **34.65%** |
| Lines | 2219 | 5751 | **38.58%** |

Suite at the time of measurement: 71 files, 413 tests, all passing.

Thresholds in `vitest.config.ts` are set a point below each measured value so ordinary churn does not fail the run. Raise them as coverage rises. Never lower them to make a run pass — if coverage drops, that is the signal working.

## Why this file exists

Before this measurement the suite reported "410 tests passed" and nothing else. No coverage provider was installed, so no line or branch coverage had ever been taken here. A test count is not a coverage claim, and the gap between the two was the whole reason for the September 2026 test audit.

The number to hold onto is not the percentage. It is this: **96 of the 225 files in the report are wholly unexecuted** — no test loads them at all, accounting for 1,981 statements.

## Wholly unexecuted, by area

| Area | Files |
| --- | ---: |
| `packages/yard-core/src` | 18 |
| `src/components/AudioPlayer` | 9 |
| `src/components/FileTable` | 9 |
| `src/components/settings` | 8 |
| `src/lib/dotmatrix` | 7 |
| `src/app/api` | 5 |
| `src/components/extensions` | 5 |
| `src/app/library` | 4 |
| `src/components/organize` | 3 |
| One file each in 20 further locations | 20 |

## The largest unexecuted files

| Statements | File |
| ---: | --- |
| 252 | `src/app/library/use-library-files.ts` |
| 190 | `src/app/page.tsx` |
| 120 | `src/lib/dotmatrix/orders.ts` |
| 109 | `src/lib/dotmatrix-hooks.ts` |
| 82 | `src/lib/dotmatrix/animation-math.ts` |
| 80 | `src/components/OnboardingDialog.tsx` |
| 73 | `src/components/AudioPlayer/use-audio-element.ts` |
| 70 | `src/components/FileTable.tsx` |
| 68 | `src/components/settings/library-tab.tsx` |
| 61 | `src/app/library/use-extension-catalog.ts` |

`use-library-files.ts` is the largest unexecuted file in the repository, at 252 statements. It holds finding B04 (a delayed rollback erases newer edits) and finding B11 (an old pagination request releases a newer request's lock). Both shipped under a green suite of 410 tests, because no test loads the file.

That single row is the argument for the rebuild in #134 and #135–#142: the suite's size and its safety were unrelated.

## What is excluded from the report

- Test files themselves
- `src/components/ui/**` — vendored shadcn primitives
- `src/app/prototype/**` — throwaway prototypes, deleted once their design question is answered
- Next.js framework entrypoints with no logic of their own, and barrel `index.ts` files

## Re-measuring

```
bun run test:coverage
```

Writes a summary to the terminal, `coverage/coverage-summary.json` for tooling, and a browsable HTML report to `coverage/index.html`. The `coverage/` directory is gitignored.
