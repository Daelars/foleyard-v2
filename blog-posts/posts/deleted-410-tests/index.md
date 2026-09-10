---
title: "I deleted 410 tests"
slug: "deleted-410-tests"
excerpt: "Foleyard had 410 unit tests and a layout bug they could never have caught. Replacing them with 56 integration tests made the suite smaller, slower, and far more useful."
release_target: "foleyard-v2"
development_status: "implemented"
development_start: "2026-09-05"
development_end: "2026-09-05"
series: "building-foleyard-v2"
tags: ["foleyard-v2", "testing", "engineering"]
cover: "/blog-images/repo-audit-timeline.png"
---

Foleyard had 410 unit tests. In one day they became 56 integration tests, and the
suite got substantially better at its job.

I want to be careful with those two numbers, because they are the track's own
count rather than something I recounted independently. The ratio is the point, and
so is the reason.

## The test that could not have caught the bug it was for

Here is the one that convinced me.

There was a test called `root-height-chain.test.ts`. Its job was to protect the
app's layout by making sure certain CSS tokens did not appear in certain files. It
read source text and checked for forbidden strings. It passed reliably.

Then I hit an actual layout bug. Zoom the app out below 100 percent and the whole
interface rendered shorter than the window, leaving a dead strip of canvas below
the content. Not subtle. The first thing you would notice.

The cause was that Foleyard applies zoom through `document.documentElement.style.zoom`,
and the root height chain used viewport units, which do not track root zoom. The
fix was to move that chain to percentages so it scales uniformly at any zoom level.

The test guarding the root height chain was never going to find that, because it
had never rendered anything. It was a search over source code wearing the costume
of a behavioral test. The audit put the general version of this well: a source-text
check cannot prove rendered behavior. It becomes misleading the moment you treat it
as proof.

That is 410 tests worth of green ticks that meant less than they appeared to.

## Tests that existed to keep dead code alive

The second category was worse in a quieter way.

The audit found helpers whose only remaining callers were their own tests. Delete
the test and nothing in the product notices. Those tests were not verifying
Foleyard, they were preserving code, and the coverage number they contributed made
the suite look healthier than it was.

There is a real cost to this beyond tidiness. Every one of those tests is a thing
that has to be updated when you refactor. A suite full of tests that guard nothing
makes changing the system more expensive without making it any safer, which is
precisely backwards.

## 410 passing tests, 96 modules never loaded

The number that settled it is this one.

![Test health panel: 9 test files, 53 tests, 52.68 percent statements covered, 20 of 224 modules with no test loads, down from 96](/blog-images/repo-audit-test-health.png)

*The test-health readout from the audit page, after the rebuild. The line
underneath is the part that matters.*

At the point the audit ran, Foleyard had 410 passing tests and 96 modules that no
test ever loaded at all. Not modules with weak coverage. Modules where nothing in
the suite so much as imported them.

One of those 96 was the file holding two defects that had already shipped.

A passing count and a coverage claim are two different claims, and I had been
reading the first one as though it were the second. 410 green ticks told me the
tests passed. They told me nothing whatsoever about whether the code that broke was
being tested, and for 96 modules the answer was no.

After the rebuild, that figure went from 96 modules to 20, and statement coverage
went from 37.77 percent to 52.68 percent, with a smaller suite. Both numbers are
dated 5 September and will be stale by the time you read this. The direction is the
point.

## What replaced them

Fifty-six integration tests that run against a real SQLite database and real files
in scratch directories, plus a couple of genuinely rendered smoke tests instead of
component tests that asserted on source text.

The names are the interesting part, because they read like the audit's list of
findings turned into permanent guards:

- `data-loss-prevention.test.ts`
- `database-correctness.test.ts`
- `filesystem-boundary.test.ts`
- `desktop-ipc-contract.test.ts`
- `desktop-supply-chain.test.ts`
- `scanner.test.ts` and `scanner-full-parse.test.ts`
- `waveform.test.ts` and `client-waveform.test.ts`

The pack export that could delete one of your files, the gather that could
overwrite your audio, the tool that could write outside your granted folders:
those now have tests that would actually notice. Not tests that check whether a
particular string appears in a particular file.

These are slower. An integration test that opens a database and writes real files
is never going to match a unit test that checks a pure function. I will take that
trade every time for an app whose failure modes are all about databases and real
files.

## The rule I gave myself afterwards

When the auto-tag work started, the test count began creeping back up, and I said
this:

> Keep reasonable tests, don't go overboard to 100+, we only have 60ish tests.

That was not a target. It was an instruction against a specific failure: an agent
that will happily generate two hundred tests for a feature and leave you with the
exact suite I had just deleted, in a new coat.

I should be honest that the count has grown since. Auto Tag, the extension ports
and the origins work all brought real coverage with them, and there are more test
files in the repo now than there were the day after the rebuild. That is fine. The
number was never the thing. The question I ask about each one is whether it would
fail if the behavior it describes broke, and a surprising proportion of the
original 410 would have answered no.

## The other half of the fix

Deleting tests only helps if the remaining checks actually run.

The audit found that CI ran TypeScript, ESLint and Vitest, and did not run a
production build, despite the repo's own rule that a build is required before
shipping. So a change that broke the build could pass every check.

The gate now runs typecheck, lint, tests, coverage, the production build, a check
that expected failures are still the expected ones, an architectural boundary check
that stops v2 code importing v1, the documentation bundle checks, and two runnable
examples that exercise the extension API for real.

That last one matters more than it sounds. The examples are the only tests that
prove somebody could actually build an extension against the documented API,
because they are what a person following the docs would write.

## Why this is in a series about a release

Because the previous four posts describe throwing away and rebuilding the extension
system, the tagging model, the scanner and the waveform path, all in about a week,
mostly working with agents that will cheerfully do whatever I ask.

None of that is safe on top of 410 tests that check for strings. The test rebuild
is not a side quest in Foleyard v2. It is the thing that made the rest of it
possible to attempt.

Next: the library redesigns that never shipped, and the settings dialog that took
me five attempts to get wrong.
