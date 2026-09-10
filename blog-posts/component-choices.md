# Why these components: T3 history analysis

Research for giving the blog posts more soul. Evidence first, interpretation flagged.

## How this was built

- Live DB untouched. Backup: `C:\Users\doddg\AppData\Local\Temp\opencode\t3-backup\state.sqlite`
  (first backup had a corrupt page under GROUP BY; re-taken clean, queries routed
  around the bad path; per-thread fetch hardened with try/except).
- Project: `foleyard-v2` (`a7745ad0-...`), workspace `C:\Users\doddg\Documents\repos\foleyard-v2`.
- 66 threads indexed chronologically (full table in earlier session notes; index file
  in temp). 17 component/UI threads dumped in full (messages + activity summaries).
- Rule applied throughout: user messages = intent, assistant messages = supporting
  context, git = truth about what shipped. Confidence per finding.

## 1. Glassy and translucent won; bright orange pills lost

**Choice:** the component language is dark, restrained, near-black, glassy; orange
is an accent, not a fill.

**Why (user's words):** thread #54 (2026-09-09). Asked what felt wrong, the answer:
"a bit of everything, they just don't feel like they make sense, especially with
the glowy, transparent glassy type feel." The orchestrator's own summary back:
"controls failing to belong to the app's glowy, translucent style" with a fix
direction of "subtle translucent fills, finer borders, consistent proportions, and
more selective orange emphasis." Variant C's brief (thread #58) bans "generic solid
orange buttons" outright.

**Git proof:** `src/components/kit/` (30 primitives), `src/components/variant-i/`
(styles, components, index, README, test), variants A-J in
`src/app/prototype/component-library/`. Confidence: high.

## 2. The "Analyse with CLAP" button was the style anchor

**Choice:** new components orbit one reference: the CLAP action button.

**Why:** thread #57: "the only thing I really liked from this were the buttons like
'anaylse with clap' etc" while inputs, tags, small buttons "don't really match"
and are "hard to read", palette "weak". Thread #53: once surrounding chrome fit,
"the 'model ready', 'tag with filename rules', and analyse with clap' don't look
at all like the current ui" — i.e. even the anchor needed re-seating, but it
remained the anchor.

**Git proof:** component-library-i screenshot shows Analyze with CLAP in
default/hover/active/loading/disabled states. Confidence: high.

## 3. Pills were questioned; the answer was even smaller than badges

**Choice:** provenance marks are bare mono letters (M, D, AI + confidence), no pill,
no badge.

**Why:** thread #53: 'in provenance, the "M, D, AI" are pills right? why not
badges instead?' plus 'does the provenance part do anything anyway?' The response
in code went past badges to near-nothing: 10px mono marks with tooltips.

**Git proof:** `src/components/FileTable/tag-origin-mark.tsx` (committed in
`0f53487`, #193): plain spans, `font-mono text-[10px] font-bold`, title tooltips
("Added by hand", "Fired by a filename rule", "Suggested automatically at X
confidence"). Confidence: high.

## 4. Components, not layout: the rule that ran the trials

**Choice:** ten variants changed elements only; page structure was frozen.

**Why:** thread #57: 'Your layout on "B" was great, you didn't have to change the
layout on E, just the components, remember you're redesigning the elements
themselves.' Variant C's brief (#58) is a DO-NOT list: no page/structure/grid/
sidebar/navigation/spacing changes, no new design direction, no palette swap.
When work escaped the prototype it was reverted same-day (#56: "NO. YOU ARE ONLY
TOUCHING THE PROTOTYPE", "BAD. UNDO.").

**Git proof:** variant files share the trial grid; `variant-i.tsx` vs `variant-i/`
extraction. Confidence: high.

## 5. Variant I won by surviving; app-v3 is a twin, not a replacement

**Choice:** Variant I extracted to a real library; app-v3 rebuilds the app around it.

**Why:** thread #58 arc: C (constrained) → D (match reference image) → critique
loop (popdown gone, "doesn't match", accessibility) → F (D layout + E palette) →
G (motion, "my favourite") → H (missing components + the real transport,
"redesign the actual apps transport in your style, not some basic whatever") →
I (sweep for leftovers, kill overflow/blank space) → J ("rebuild the entire app's
UI, using this component library"). Thread #61: "I mean COPY exactly... rebuild
every surface... in the exact same interface as app/." And the twin framing:
"I basically want to see app-v3 as the same thing we have currently, but with the
new components."

**Git proof:** `src/components/variant-i/`, `src/app/prototype/app-v3/`,
`docs/variant-i-app-v3-*.md`. Confidence: high for the sequence; medium that G
being "favourite" is what selected I (I descends from H which descends from G,
per the thread, but no explicit "I wins because G" message).

## 6. The command bar won; the origins tab is on probation

**Choice:** auto-tag-fit's command-bar direction is the blessed one; origins must
earn its space or become a dropdown.

**Why:** thread #51: "I really like command bar, ignore tag-origins for now",
"each thing is smaller... keeping 1 page view", "ignore tag-origins unless you
can make it into something that conveys useful information, currently I don't
think it does." Thread #53: "is there any need for [provenance] when we could
just add it in a 'drop-down' in the command bar?" and "minimise the info...
shouldn't be bloated."

**Git proof:** `src/app/prototype/auto-tag-fit/` variants (current/system/passes/
command/pinned/minimal/compact). Confidence: high.

## 7. Auto-tag was born from a rejected extension pitch

**Choice:** the whole auto-tag arc descends from one surviving sketch.

**Why:** thread #39 (Sept 6 night design fight, 40 user messages). Three extension
concepts pitched; verdict: "the only one that makes sense here is 'MAYBE' the
'Want List B' the coverage board, but I think that could then be apart of a 'Auto
tagging' extension, ie, when files are indexed, and with the extension turned on,
it auto tags each file in the background, and updates the coverage board etc.
otherwise, the other two extension ideas are useless." The night continued as
layout combat ("THE LAYOUT STILL ISN'T CHANGING. im on about the whole page",
"change all 3 variants to different versions of the layout... this is a major
thinking task") until the brief crystallized: "this is supposed to be an 'auto
tagging' extension, we need to display which files are being tagged, what tags,
which files, charts."

**Git proof:** issues #184-#188 (wayfinder spikes) → #189-#197 chain; prototype
board → `src/components/AutoTagBoard/board.tsx`. Confidence: high. This is the
single most load-bearing motive in the series: the feature exists because a
coverage board needed a reason to exist.

## 8. v2 was demanded from scratch, 10/10, docs included

**Choice:** rebuild, don't migrate; reference port; every surface.

**Why:** thread #37: "improve the actual system first, and then migrating them
over", "Scale of 1-10 how much better... How can we make it a 10/10", "build this
v2 from scratch, not on top of v1, and... build 1 of the existing extensions as
an example, make sure to touch all surfaces, like docs etc."

**Git proof:** commit `e181dbd` (PR #196): contracts, registry, six ports,
parity tables in every README, migration guide. Confidence: high.

## 9. The pixel law behind the reskin

**Choice:** token-guarded surfaces, ticket-machine execution, prototype-matching
motion.

**Why:** thread #11: reskin as a loop over issues with "token law — binding"
(#16), one ticket per run. Thread #16: "keep functionality the exact same",
"Stop running lints, builds, tests, just get the tickets done", then forensic
UI policing: "Why the fuck did you not keep it consistent with our mb-4 mt-4",
sidebar boxes must "FIT DYNAMICALLY", organize animation "isnt the same as the
prototype version". The reskin reads mechanical because it was run like a machine.

**Git proof:** reskin #19-33 / port #45-59 commit runs; `820f881` (prototype route
restored for reference). Confidence: high.

## 10. The non-compromises list (voice fuel, not fact)

Thread #27 asked for a T3-Code-style "what makes foleyard special... things we
can never compromise on" list. Its content is product voice, not component
evidence. Useful as tone reference for soul edits; do not quote its claims as
decisions. Confidence: n/a (voice only).

## Quotable lines (verbatim, typos intact)

- "they just don't feel like they make sense, especially with the glowy,
  transparent glassy type feel." (#54 — the whole component program in one line)
- "the only thing I really liked from this were the buttons like 'anaylse with
  clap' etc" (#57 — the anchor)
- 'why not badges instead?' (#53 — the question the mono marks answer)
- "remember you're redesigning the elements themselves" (#57 — the trials' rule)
- "BAD. UNDO." (#56 — the process has teeth)
- "redesign the actual apps transport in your style, not some basic whatever
  you made" (#58 — the bar for H)
- "I basically want to see app-v3 as the same thing we have currently, but with
  the new components." (#61 — the twin, not a replacement)
- "I really like command bar, ignore tag-origins for now" (#51 — the verdict)
- "the only one that makes sense here is 'MAYBE' the 'Want List B'" (#39 — the
  night auto-tag was born)
- "improve the actual system first, and then migrating them over" (#37 — v2's
  founding order)
- "Why the fuck did you not keep it consistent with our mb-4 mt-4" (#16 — the
  pixel law; use sparingly, one profanity max per series)

## Suggested soul injections (APPLIED 2026-09-10 — see articles)

- POST-001: open the origin story with #39's MAYBE. The trust-model post earns
  its hook by admitting the feature began as a rejected pitch's survivor.
- POST-002: use #37's "from scratch, not on top of v1" + 10/10 exchange as the
  architecture post's spine; it already argues the piece's thesis in dialogue.
- POST-003: thread #16's consistency policing explains why the reskin feels
  systematic; one mt-4/mb-4 line humanizes the token-law section.
- POST-006: lead with #54's "don't feel like they make sense" + the CLAP-button
  anchor (#57); the trials post becomes a story about finding one good button
  and rebuilding the world around it.
- POST-008: #51's command-bar verdict + "why is origins on there?" already
  present; add #53's pills-vs-badges question as the open loop it is.
- Series-wide: keep profanity to a single quoted line; the voice is blunt, not
  the swearing. Never fabricate motives for W-G (still gap) or the tagged-0
  cause (still gap).

## Gaps this pass did not close

- Whether G-being-favourite is literally why I was extracted (sequence supports,
  no explicit message).
- #27's "special" list content beyond its first message (assistant reply is
  supporting context only; not mined for claims).
- Activities for #39/#58 are tool-call heavy; file-level proof rests on git +
  worktree state, which is sufficient.
