# Foleyard Release Train

Destination: **Foleyard v2**, unreleased. Ten posts, publication order below.

This is narrative order, not chronological order. Each post ends by pointing at
the next one, so they read as a series rather than a pile.

The arc: why the rebuild happened, what got rebuilt, what got designed and thrown
away, what works, what does not, then the announcement that ties it together.

## 1. The audit that turned into Foleyard v2

Slug: `audit-that-became-v2`
Status: in-progress
Purpose: Establish the stakes. 27 findings, four P1s, and the shape problem
underneath them.
Angle: opening post. The reason a rebuild was worth it.
Key visuals: repo audit page, v1 call-path diagram.

## 2. I threw away Foleyard's extension system

Slug: `extension-system-rebuild`
Status: implemented-unreleased
Purpose: The architecture pillar. A 7 out of 10 refused, v2 built from scratch,
the ports, and the retirement of v1.
Angle: architecture note with a reversal in it (PR #198, 85 seconds).
Key visuals: v2 diagram, reach diagram, workbench, real Tools page.

## 3. Three extensions I designed, two I deleted

Slug: `three-extensions-two-deleted`
Status: prototype
Purpose: Show the system being used, and reveal where Auto Tag came from.
Angle: prototype retrospective. Sets up post 4.
Key visuals: coverage board concept, Take Compare, Sound Rack.

## 4. Teaching Foleyard to tag itself, and to show its work

Slug: `teaching-foleyard-to-tag`
Status: implemented-unreleased
Purpose: The headline feature, led by the trust model rather than the model.
Angle: feature preview.
Key visuals: auto-tag pipeline diagram, real library with origin marks, the board,
the fit variants.

## 5. 15,000 files, 0 tags

Slug: `fifteen-thousand-files-zero-tags`
Status: in-progress
Purpose: The honest counterweight to post 4. Publish it close behind, not months
later.
Angle: development diary.
Key visuals: Tag origins panel, coverage view.

## 6. Waveforms used to be instant

Slug: `waveforms-used-to-be-instant`
Status: in-progress
Purpose: The engine pillar, with real numbers and real caveats.
Angle: performance story that states what its numbers are not.
Key visuals: waveform before/after diagram.

## 7. I deleted 410 tests

Slug: `deleted-410-tests`
Status: implemented
Purpose: Explain why rebuilding four systems in a week was not reckless.
Angle: engineering practice.
Key visuals: audit timeline page.

## 8. The library designs that didn't ship

Slug: `library-designs-that-didnt-ship`
Status: prototype / rejected
Purpose: The design process, including the five-times-rejected settings dialog and
one decision with no surviving explanation.
Angle: prototype retrospective.
Key visuals: showcase, app-v2 mock, redesign rev 28, shipped Organize view.

## 9. Ten variants to get one button right

Slug: `ten-variants-one-button`
Status: in-progress / prototype
Purpose: The component language, and the method that produced it.
Angle: design process, second wave.
Key visuals: variants A, B, D, G, I, app-v3.

## 10. Introducing Foleyard v2

Slug: `introducing-foleyard-v2`
Status: in-progress
Purpose: The payoff. What v2 is, in one place, with an explicit list of what is
missing.
Angle: release preview. Not a launch announcement, and it says so.
Key visuals: system diagram, Tools page, library with origin marks.

## Sequencing notes

- Posts 1-2 must publish before 3-5; the auto-tag story depends on the extension
  system being introduced.
- Post 5 must not lead post 4. The failure only reads as honesty if the feature has
  been introduced first.
- Post 10 must be last. It repeats claims from every earlier post and is the only
  one written for someone who has read none of them.
- Posts 6 and 7 can swap. Both are self-contained.
