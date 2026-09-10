# Foleyard component library, second pass: redesign the components themselves

This is an implementation prompt prepared on 9 September 2026, after a first pass against
`docs/component-library-agent-prompt.md` was reviewed and judged incomplete. It is a design
proposal, not documentation of shipped behavior. Read the first prompt before this one; it
still holds. This document does not replace it, it corrects one specific failure.

## Why there is a second pass

The first pass built the right scaffolding and put it in the right places. `SoundTag` and
`StatusBadge` are mounted in `src/components/AutoTagBoard/board.tsx`, `CommandItem` is mounted
in `src/components/CommandPalette/CommandPalette.tsx`, `PendingButton` and `SettingRow` are
mounted in `library-tab.tsx` and `extensions-v2/settings.tsx`, and a specimen route exists at
`/prototype/component-library`. Integration is not the problem. Do not redo it.

The problem is that no component was actually designed. The user's words: none of the
components individually got rewritten in terms of their style or design. Inspect the current
diff and you will see why that reading is fair:

- `src/components/ui/button.tsx` kept the shadcn `base-nova` cva wholesale. Only the variant
  colour strings changed. The heights (24/28/32 px), the `rounded-lg`, the padding scale, the
  16 px icon rule, and the `has-data-[icon=inline-start]` padding trick are all inherited
  defaults that nobody chose for this app.
- `src/components/ui/badge.tsx` changed `rounded-full` to `rounded-md` and recoloured the
  `default` variant. The 20 px height, the padding, and the type treatment are untouched.
- `src/components/ui/switch.tsx` kept the 44 by 24 px track and the 16 px thumb exactly, and
  changed fill opacities and the thumb from `bg-white` to `bg-zinc-200`.
- `src/components/ui/input.tsx` is one className line with new opacity values.
- `CommandItem` in `src/components/ui/foleyard.tsx` is the palette's previous inline markup
  moved into a function. Compare the two: same element, same classes, some opacity numbers
  raised by a few hundredths.
- `SoundTag` and `StatusBadge` are `Badge` plus a call-site `className` override, which is the
  precise pattern the first prompt asked to remove. `SettingRow` is undesigned layout divs.

So the visual identity still comes from the shadcn preset. The library is a naming layer over
it. What was asked for, and what is asked for again here, is a bespoke set of controls whose
proportions, material construction, and states were decided for a dark translucent audio
workspace.

## The rule for this pass

**A component is finished when its geometry, material construction, typography, and state
model were each decided for Foleyard and are legible in its source.** Colour alone is not a
redesign. If the only thing that changed in a component's diff is which token a fill or border
resolves to, that component has not been done.

A practical test to apply per component, honestly, before you call it done:

1. Delete your version, restore the pre-pass version, render both at the same zoom over the
   same content. If a person who has not read the diff cannot tell them apart in silhouette,
   weight, and density, it is not done. Colour-only differences do not count as telling apart.
2. Read your diff for that file. If it touches only colour values, it is not done.
3. Can you state, in one sentence each, why that height, that radius, that border
   construction, and that type size are right for this app? "It is what shadcn shipped" is not
   an answer. Neither is "the first prompt suggested it", those were starting points to
   validate visually, not constants.

Rewriting a shared primitive from scratch is in scope and expected. Keep the exported names,
the variant and size prop vocabulary, and the Base UI foundations, so consumers keep working.
Replace what is inside.

## Scope, and what to leave alone

In scope: `button.tsx`, `badge.tsx`, `switch.tsx`, `input.tsx`, the palette's panel and search
header, and the compositions in `foleyard.tsx`. Also the material and radius tokens in
`src/app/globals.css` that these components resolve against.

Out of scope for this pass, unless a component genuinely cannot be fixed without it:
re-choosing which components exist, adding new components, moving integrations, changing the
information architecture of any screen, restructuring the specimen route, or touching
indexing, CLAP, database contracts, IPC, job execution, or the core and tool packages.

The first prompt's protections still apply in full and are worth restating, because this
checkout is heavily dirty with unrelated work across auto-tag, tag provenance, extensions,
dependencies, and prototypes. Read `AGENTS.md`, `docs/index.md`, `CONTEXT-MAP.md`,
`docs/agents/domain.md`, and `src/CONTEXT.md`. Inspect `git status` and the diff before
editing. Preserve every unrelated change. Do not reset a dirty file to an older version, and
do not regenerate the lockfile. Source wins over historical documents;
`src/app/prototype/**` holds experiments, not specifications.

Brand values stay: canvas `#0b0b10`, shell `#101014`, accent fill `#f0503c`, hover `#ff5a44`,
accent text `#ff7a66`, all enforced by `eslint/foleyard-theme.mjs` and
`scripts/lint-theme-css.cjs`. Change how they are used, not what they are. New neutral,
border, material, and radius tokens belong in `globals.css` with Tailwind registration, not
inline in components.

The five negative references are the same screenshots as before, re-supplied. Open them before
designing.

1. Command palette: `C:/Users/doddg/.t3/userdata/attachments/da57cfe9-5e97-4cd2-a9b2-823cd66a17f1-729fbc11-bb6d-4c26-adcc-50ac2059d14e.png`
2. Switch and card crop: `C:/Users/doddg/.t3/userdata/attachments/da57cfe9-5e97-4cd2-a9b2-823cd66a17f1-af251c2a-7958-47c4-87d3-9a699a91804c.png`
3. Start Full Scan action: `C:/Users/doddg/.t3/userdata/attachments/da57cfe9-5e97-4cd2-a9b2-823cd66a17f1-2a7ec4d8-6a32-40ee-96fc-8d9e0dd3c2b3.png`
4. Tag pills: `C:/Users/doddg/.t3/userdata/attachments/da57cfe9-5e97-4cd2-a9b2-823cd66a17f1-4c681cdf-c674-4531-8594-4a7798f1d614.png`
5. Auto-tag toolbar: `C:/Users/doddg/.t3/userdata/attachments/da57cfe9-5e97-4cd2-a9b2-823cd66a17f1-ebf73930-628b-49f1-b6f3-a1025b3bbbab.png`

The user's only stated reason for disliking these remains: "a bit of everything, they just
don't feel like they make sense, especially with the glowy, transparent glassy type feel."
Nothing since then tells you which replacement they prefer. Do not describe any radius, font,
or palette as approved.

## Establish the material system first, in one place

Before touching a component, decide the system it will be built from, write it into
`globals.css`, and look at it rendered. Every component below then resolves against these
tokens rather than inventing its own opacities. The current `--surface-control` family is a
reasonable seed, but it was written to make recolours possible, not from a decision about
materials. Revisit it.

Decide and record: how many material levels exist (workspace, inset, interactive, raised,
floating), and for each, its fill, its border construction, its inset highlight if any, and
its shadow. Decide the radius scale and how it steps with control size. Decide the elevation
rule, meaning what earns a shadow and what earns a glow. Decide the state model as tokens:
rest, hover, pressed, focus, selected, disabled, busy, each expressed through more than
colour where it can be.

The point of doing this first is that it is what makes the components look like a family
rather than five files that happen to share a palette. Render the token set over both quiet
and busy app content before proceeding.

## Per-component briefs

Each brief lists what the component is in this app, what to decide, and what behaviour must
survive. Preserving behaviour is not optional; the visual rewrite is the deliverable, a
regression is not.

### Button, `src/components/ui/button.tsx`

The workspace's action vocabulary. It appears in dense toolbars beside status text, in
settings rows beside descriptive copy, and as the principal action of a panel. Screenshots 3
and 5 are both button failures: the scan action is an oversized locally styled slab, and the
auto-tag toolbar mixes a coral fill, a dark capsule, a bare disabled label, and an ellipsis
button that share no baseline.

Decide the height scale from what those rows actually need, not from 24/28/32 because that is
what was there. Decide horizontal padding as a relationship to height rather than a per-size
constant, and decide how an icon changes it. Decide the border construction, whether a button
is a filled shape, an edged surface, or a surface with an inset top highlight, and make the
primary and secondary treatments differ structurally rather than only in fill. Decide icon
size and optical alignment against the label baseline, and verify it with a real Lucide icon
rather than assuming `size-4` sits right. Decide what pressed looks like, since the current
button has no pressed state at all. Decide whether disabled is opacity, and if so why, given
that the toolbar screenshot shows a disabled action reading as debris.

Keep the exported name, `buttonVariants`, the variant names in use (`default`, `outline`,
`secondary`, `ghost`, `destructive`), the size names in use, the Base UI `ButtonPrimitive`
foundation and its `render` composition, and `data-slot="button"`. Audit every consumer of
these defaults across the app before you change them, then remove the call-site appearance
overrides those consumers currently carry, in particular the forced 40 px height and wide
padding on the scan action in `src/components/settings/library-tab.tsx`.

`PendingButton` must keep its width stable while busy, keep a meaningful label, stay disabled
so a second click cannot double-submit, and keep `aria-busy`. Design the busy state as part of
the button rather than as a spinner glued in front of the label.

### Badge, and the tag versus status split

`src/components/ui/badge.tsx`, `SoundTag` and `StatusBadge` in `foleyard.tsx`.

A sound tag is literal metadata attached to a file, often several per row, sometimes with M/D/AI
provenance and a confidence value. A status badge names a workflow state. Screenshot 4 shows
these collapsing into the same object: solid coral pills for the current tag next to neutral
pills for the rest, with the coral reading as importance rather than as selection.

`SoundTag` must become a real component with its own construction, not `Badge` plus a
`className`. Decide its height and padding from the density of a file row with several tags,
its radius against the control radius scale, and its type treatment, including whether the
hash prefix is part of the string or a rendered affix and whether mono is right here. Decide
how selected reads without a solid fill, for example a tint with an edge, or a small marker,
and confirm it survives beside three unselected neighbours. Decide how provenance and
confidence sit inside the shape without turning a tag into a composite of unrelated
fragments. Decide whether an interactive tag is visually distinct from a passive one, and only
render the interactive form where a call site actually handles interaction.

`StatusBadge` must convey state in text and remain readable without colour. Decide its tones
from the states that exist (ready, processing, unavailable, error, neutral) and give it a
construction distinct from a tag so the two are never confused at a glance.

The base `Badge` should be reduced to whatever these two genuinely share, or left as a plain
primitive for unrelated consumers. Do not leave `SoundTag` overriding it.

Preserve the literal tag name, the hash convention of each context, the current-tag
distinction that `tag.name === current.tag` drives in the board, and provenance rendering via
`TagOriginMark`. Check wrapping, long names, repeated tags, and rows with many tags.

### Switch, and the setting row

`src/components/ui/switch.tsx`, `SettingRow` in `foleyard.tsx`.

Screenshot 2 is a crop showing a white thumb on a dark track at a card edge. The thumb is the
brightest object in the frame and belongs to a different visual world than the card it sits
in. Confirm the owner by inspecting both `src/components/ExtensionGrid.tsx` and
`src/components/settings/extensions-tab.tsx` against the visible edge and switch placement,
then fix the confirmed location and use the other as a consistency check.

Decide the track and thumb proportion rather than keeping 44 by 24 with a 16 px thumb. Decide
the track's material as a genuine inset, since a switch is one of the few controls that should
read as recessed. Decide how the thumb is constructed, its size relative to the track, its
inset, and its own surface, and how checked reads through more than colour, since colour alone
fails for a large share of users. Decide pressed and disabled. Keep the visible track small if
that suits the density, and give it a larger hit area.

`SettingRow` needs to become a designed row: decide its height, the label and description type
scale and their relationship, the divider treatment, and the alignment of the control against
the label's first line rather than the row's centre. It currently uses raw divs with ad hoc
values.

Preserve the accessible name, extension enable and disable callbacks, disclosure behaviour,
and the rule that clicking the switch must not expand its containing section.

### Input, and the palette search header

`src/components/ui/input.tsx`, and the header in `CommandPalette.tsx`.

The palette search currently imports `Input` and then overrides its height, radius, border,
background, padding, shadow, and every focus style to neutralise it. That is a sign the shared
input was not designed for the overlay case. Either design one input whose variants cover both
a bordered field and a seam-free overlay header, or design two components and be explicit
about it. Do not keep a component that every call site has to undo.

Decide height, radius, and internal padding for the standard field, the border and inset
construction, the focus treatment and how it differs from hover, and the placeholder,
disabled, and invalid states. Decide the search header's type size and vertical rhythm against
the rows below it, and how the leading icon and the `esc` hint attach to the field.

Preserve query updates, the `aria-activedescendant` wiring, and the input and listbox
semantics.

### Command palette panel and row

`src/components/CommandPalette/CommandPalette.tsx`, `CommandItem` in `foleyard.tsx`.

Screenshot 1 is the sharpest failure and should become the clearest demonstration. The panel
is a translucent slab with a detached coral halo, the selected row is an outlined coral
capsule, and the hints are quiet to the point of vanishing.

`CommandItem` must be authored rather than lifted. Decide row height and internal padding
against the panel's edges, the selection treatment as a band or surface rather than a ring,
where the accent appears if it appears, the hint's type and alignment, and how the active row
handles its shortcut affordance. Decide whether hover and keyboard-active are the same
treatment, and if not, how they differ when both are present.

For the panel, decide the radius against the control scale, the border and backdrop
construction, and the depth. Glow should be part of the material rather than a halo behind an
opaque shape. Reconcile the glow policy comment in `globals.css` with what you actually ship,
rather than leaving both the restricted policy and the overlay exception in place.

Preserve filtering, entry order and IDs, keyboard navigation, Enter execution, Escape, pointer
selection, active-item scrolling, empty results, focus capture and restoration, and the
division where `usePalette` in `src/app/library/use-palette.ts` owns data and execution while
the components own appearance. Verify the parent controller before moving any keyboard logic
so events do not fire twice.

## Working method

Do the material tokens first and look at them. Then do Button, Badge and the tag family
together, since they are the densest source of the "everything is a coral pill" problem, and
look at those before going further. Then Switch and setting rows, then Input, then the
palette. Looking means rendering in the browser at the app's real zoom over real content, not
reading the class strings back.

Use the specimen route at `/prototype/component-library` as the working surface. It already
renders the state matrix and realistic compositions with an operable palette; extend it where
your redesign needs a state it does not cover, and keep it importing the production components
rather than duplicating styles.

Follow the repo's shadcn skill. Inspect installed components and consult official Base UI
documentation before changing an API. Appearance belongs in variants and semantic tokens;
call-site `className` is for layout. Do not install a preset over customised components, do not
add a competing UI framework, and do not substitute Radix APIs for Base UI.

Capture before and after at the same viewport and zoom, where "before" is the current dirty
working tree, not the pre-first-pass state. Check normal desktop width and a narrow window,
long filenames and labels, sparse and dense content, and the supported application zoom
levels. Preserve percentage-based root heights. FileTable is virtualized: keep its row
measurements, keyboard behaviour, and scrolling, and do not introduce a generic list-row
abstraction. Prefer one overlay blur to hundreds of blurred cells. Respect reduced motion, and
keep transitions on named properties rather than `transition-all`.

Run `bun run typecheck`, `bun run lint`, and the existing component and interaction tests,
including `src/components/ui/foleyard.test.tsx`, `src/components/AutoTagBoard/board.test.tsx`,
`src/app/library/use-palette.test.tsx`, and
`src/components/settings/extensions-tab.test.tsx`. Discover current test paths rather than
trusting this list. Existing tests that assert visual implementation details may need
updating; updating them is fine, weakening them is not. Add tests only for meaningful changed
behaviour, such as focus restoration, keyboard execution, switch event separation, or pending
gating. Do not add tests that assert class strings. Report pre-existing failures separately.

## Completion criteria

- Every component named above has a diff that changes its construction, not only its colours,
  and each one visibly differs from the pre-pass version in silhouette, weight, or density.
- You can justify the height, radius, border construction, and type size of each component in
  one sentence, without appealing to shadcn defaults or to a suggested starting value.
- `SoundTag`, `StatusBadge`, `SettingRow`, and `CommandItem` are authored components, not
  `className` overrides on a primitive or markup relocated from a call site.
- The palette search field no longer has to neutralise the shared input to look right.
- Actions, tags, and statuses read as three different kinds of object, and a small coral pill
  is no longer the app's universal emphasis mechanism.
- The five screenshots, re-rendered, read as one family inside the workspace.
- All behaviour listed in the briefs still works, and the user's unrelated dirty changes are
  intact.
- `docs/component-library.md` is updated to describe what the components now are, including
  the material and radius system, so a contributor can choose a control without reading its
  source.
- The handoff states plainly which decisions are your design judgement and are still awaiting
  the user's reaction, and reports exact validation results.

Do not stop at describing the design. The previous pass produced a correct-looking structure
that left the app looking the same. This pass is judged on whether the controls look different
and better in the running app.
