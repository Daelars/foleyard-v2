# Foleyard component library handoff

This is an implementation prompt prepared from the working checkout and five user-supplied screenshots on 9 September 2026. It is a design proposal, not documentation of shipped behavior.

## Task

Create a small, bespoke component library for Foleyard and integrate it into the affected UI. Foleyard is a local sound-library workspace for browsing, auditioning, tagging, scanning, and organizing audio. Its controls need to support sustained desktop use alongside dense file lists and playback controls.

The user dislikes the current action buttons, tag pills, scan button, switches, and command palette. Their clarification was: "a bit of everything, they just don't feel like they make sense, especially with the glowy, transparent glassy type feel."

Working interpretation: these controls do not belong convincingly to the surrounding translucent, softly glowing app. Preserve that atmosphere and give it a consistent set of controls. This interpretation is provisional. If the user supplies positive references or clarifies that they dislike the glass itself, adjust the visual direction accordingly. Do not claim they approved a particular radius, font, or palette.

Deliver working components, a compact development specimen page, and real integrations. A gallery of disconnected mockups is insufficient.

The supplied negative references are local attachments. Open them before designing. In their original order:

1. Auto-tag toolbar: `C:/Users/doddg/.t3/userdata/attachments/2ec4601f-c642-4e37-bb03-8a9d22ddaaa3-a673a868-76c9-4bff-95b6-cfd3dd8597dc.png`
2. Tag pills: `C:/Users/doddg/.t3/userdata/attachments/2ec4601f-c642-4e37-bb03-8a9d22ddaaa3-81ad46a3-95b1-47e6-ae37-00439b77126f.png`
3. Scan action: `C:/Users/doddg/.t3/userdata/attachments/2ec4601f-c642-4e37-bb03-8a9d22ddaaa3-cd34ce49-960c-4616-8531-474fd6eee8a1.png`
4. Switch/card crop: `C:/Users/doddg/.t3/userdata/attachments/2ec4601f-c642-4e37-bb03-8a9d22ddaaa3-f0f2e4bd-2dc4-4e13-99f9-94059b81b8d7.png`
5. Command palette: `C:/Users/doddg/.t3/userdata/attachments/2ec4601f-c642-4e37-bb03-8a9d22ddaaa3-fb134dc3-7f9a-452c-a679-2bc318bef25a.png`

If these paths are unavailable in a different workspace, request the references again. Their absence does not make the written observations evidence of a preferred replacement.

## Read and protect first

- Follow `AGENTS.md`, `docs/index.md`, `CONTEXT-MAP.md`, `docs/agents/domain.md`, and `src/CONTEXT.md`. Read the relevant application ADRs and feature guides before editing their UI.
- Read `docs/development.md`, `docs/scanning.md`, `docs/settings.md`, `docs/metadata.md`, and `docs/commands.md` for the workflows you touch. Consult `docs/extensions.md` and the v2 guide where extension enablement or auto-tag behavior is involved.
- Inspect `git status` and the current diff first. This checkout contains substantial unrelated work, including changes to auto-tag, tag provenance, extensions, dependencies, and prototypes. Preserve all of it. Do not reset files, replace an entire dirty component with an older version, or regenerate the lockfile incidentally.
- Source wins over historical documents. `src/app/prototype/**` contains experiments, not approved specifications or evidence of installed capabilities.
- Work in the Application context. Leave indexing, CLAP analysis, database contracts, IPC, job execution, and core/tool packages alone unless a demonstrated UI requirement truly needs a change.

## Verified starting points

The checkout uses Next.js 16, React 19, Tailwind 4, Base UI, CVA, Lucide, and locally owned shadcn components. `components.json` specifies `base-nova`, CSS variables, and `@/components/ui`. Existing controls import `@base-ui/react`; do not substitute Radix APIs or add a competing UI framework.

| Concern | Inspect |
| --- | --- |
| Theme and font declarations | `src/app/globals.css`, `src/app/layout.tsx` |
| Shared controls | `src/components/ui/button.tsx`, `badge.tsx`, `switch.tsx`, `input.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `card.tsx` |
| Auto-tag controls and tag badges | `src/components/AutoTagBoard/board.tsx`, `src/components/AutoTagBoard/origins.tsx` |
| Tag meaning and provenance | `src/components/FileTable/tag-origin-mark.tsx`, `src/components/FileTable/file-row.tsx` |
| Full scan action | `src/components/settings/library-tab.tsx` |
| Extension toggles and their containers | `src/components/ExtensionGrid.tsx`, `src/components/settings/extensions-tab.tsx` |
| Command palette presentation and data | `src/components/CommandPalette/CommandPalette.tsx`, `src/components/CommandPalette/command-palette.ts` |
| Existing workspace visual context | `src/components/IconRail.tsx`, `src/components/FileTable/file-row.tsx`, `src/app/page.tsx` |
| Glass and glow around playback | `src/components/AudioPlayer/player-shell.tsx` |
| Enforced theme rules | `eslint.config.mjs`, `eslint/foleyard-theme.mjs`, `scripts/lint-theme-css.cjs` |

The theme currently fixes canvas `#0b0b10`, shell `#101014`, accent fill `#f0503c`, hover `#ff5a44`, and accent text `#ff7a66`. Theme lint checks these definitions. Keep these brand values and change their usage, hierarchy, and surrounding materials. Define any new neutral, border, state, or material tokens centrally in `globals.css`, with Tailwind registration as needed.

The current button defaults to solid coral. Badges also default to solid coral and fully rounded ends. Buttons have 24, 28, and 32 px sizes, but call sites override them. The scan action forces 40 px height and wide horizontal padding. Switches use a 44 by 24 px track and 16 px white thumb. This is already a shared system, but its defaults and local overrides do not consistently fit the workspace.

The palette is currently custom dialog/listbox markup with a translucent shell, blur, accent shadow, rounded selected rows, and a coral selection outline. Global CSS contains both a restricted glow policy comment and a separate overlay-glow exception. The actual palette currently uses `shadow-glow-accent`. Reconcile comments with your chosen implementation; do not blindly copy an old prototype or spread overlay glow into all controls.

Typography needs verification in the browser. CSS names DM Sans and DM Mono, while the body rule also declares a system font stack. Naming a font does not load it. Inspect the computed font and available assets before changing typography. Use one dependable sans family for controls. Mono is for numerical data, provenance abbreviations, and shortcuts, not every toolbar label. If adding fonts, bundle appropriately licensed assets for offline desktop use.

## Visual direction

Aim for dark translucent controls that look made for this sound workspace. The depth should come from a consistent material treatment, precise borders, and restrained light. The library data and waveforms must remain easy to scan.

- Establish a small material hierarchy: workspace background, inset controls, interactive controls, and floating overlays. Define their fills, borders, and shadows centrally. Show each over both quiet and visually busy app content.
- Use a fine neutral edge and a subtle inset highlight to connect controls to the glass treatment. Make translucency readable. Avoid stacking low-opacity layers until labels disappear.
- Use coral deliberately for a principal action, a small active marker, or selected emphasis. A tag, enabled switch, current row, and destructive action must not all communicate through the same solid orange block.
- Retain subtle glow where it helps establish the app's atmosphere. Ordinary buttons and chips should primarily respond through fill, border, and text. Keep overlay depth restrained enough that its content reads before its halo. Do not put animated glow or backdrop blur on every file-row element.
- Use one coherent corner scale. Suggested starting values: 5 to 6 px for compact tags, 7 to 8 px for controls, and 12 to 14 px for floating containers. These are design starting points to validate visually, not user-approved constants. Rounded tracks can remain appropriate for switches.
- Start with 28 px compact and 32 px standard controls, 13 px control labels, 14 px body text, and 11 to 12 px auxiliary text. Use 16 px icons in standard controls and 14 px in compact ones. Align optical weight and baselines. Avoid shrinking everything to 10 px to manufacture density.
- Use 4, 8, 12, and 16 px spacing steps where they fit. Keep icon gaps and sibling control heights consistent. Let containers arrange components without overriding their visual internals.
- State transitions should be brief and quiet, roughly 120 to 160 ms for color, border, and opacity. Respect reduced motion. Avoid `transition-all` where dimensions could animate unexpectedly.
- Keep focus distinguishable from hover, selection, and activation. Check text and control contrast on the actual composited background. Do not make an unavailable action appear as unreadable debris.

## Keep the library small

Improve existing shared files first. Add a Foleyard composition only when it represents repeated behavior or a real semantic distinction. Do not create a publishable package, plugin, elaborate theme engine, or dozens of wrappers.

1. **Actions.** Refine the shared Button with clear primary, secondary, quiet, and destructive treatments, compact and standard sizes, and matching icon-only sizes. Preserve compatibility with existing consumers. Add or compose a pending state that retains width and has meaningful text. Use existing Base UI behavior and Lucide icons. Labels and icons must remain aligned in every state.
2. **Tags and status.** Separate a sound tag from a generic status badge. A tag should have quiet neutral styling by default, with a distinct current/selected treatment. Status badges must convey status in text. Preserve tag provenance and confidence where currently shown. Add an interactive tag form only for call sites that actually support interaction; passive metadata must not masquerade as a button.
3. **Switch and setting row.** Refine the shared Switch and create a reusable labeled setting-row composition if it removes real duplication. Align the switch with its label, keep descriptions legible, and provide an accessible name. Checked, unchecked, disabled, hover, and focus states must be recognizable through more than color. A smaller visible track may have a larger usable hit area.
4. **Input and search treatment.** Bring the existing Input and palette search field into the same material, height, typography, and focus system. Cover placeholder, entered text, disabled, and invalid states. Avoid an unrelated search-box design just because it lives in an overlay.
5. **Floating panel and command item.** Reuse the existing dialog foundation for focus management where appropriate. Give palette rows, shortcut hints, selected state, separators, and scrolling a consistent treatment. Extract only the reusable parts; keep command data and execution outside the visual components.

Follow the repo's shadcn skill. Inspect installed components and fetch official component documentation before changing APIs. Use Base UI `render` composition where needed. Put appearance in component variants and semantic tokens. Keep call-site `className` primarily for layout. Do not install a preset or overwrite customized components wholesale.

## Integrate against the five problem examples

### Auto-tag actions

The screenshot shows model status, a disabled Download model action, filename-rule tagging, CLAP analysis, and an overflow menu. Its labels and arrangement match `PinnedCommandBar` in `src/app/prototype/auto-tag-fit/variant-minimal.tsx`. Treat this as a negative visual reference, not a live workflow specification. The current live board presents Filename rules and Semantic tagging in separate panels. Trace the mounted implementation before editing and apply the new components there. Do not silently adopt the prototype's information architecture.

Bring related actions onto a consistent baseline and size. Make model readiness readable as status. Establish one obvious principal action for the current context, with secondary actions that still look usable. Preserve model readiness gating, busy/job gating, download confirmation, selected versus untagged-file scope, rule tagging, CLAP analysis, progress, cancellation, and outcome feedback. Do not rename or combine operations in ways that obscure their different effects.

### Tag chips

The screenshot contains orange `#thunder` pills alongside neutral `#weather` and `#impact` pills. In the current board, one badge branch uses the default variant when `tag.name === current.tag`. That orange indicates the current tag in that context, not necessarily provenance.

Retain this distinction using a restrained selected treatment, such as a tinted fill and a clear edge or small marker. Preserve the literal tag name, any hash convention used by that context, and M/D/AI provenance with confidence where available. Do not repurpose provenance colors as selection state. Check wrapping, long names, repeated tags, and rows with several tags. Avoid ambiguous tiny interactive pills.

### Start Full Scan

Replace the oversized locally styled scan action with the shared action treatment that fits its settings row. Keep the existing handler, no-roots gating, starting and running states, spinner, progress, and surrounding scan statistics. The component must remain stable as its label changes. Visual QA must use fixtures or a disposable library, not trigger a scan of the user's library just to capture a busy state.

### Switches and cards

The narrow screenshot crop cannot conclusively identify the owner. Inspect both `ExtensionGrid.tsx` and `settings/extensions-tab.tsx` against the visible card edge and switch placement. Apply the shared switch and row language at the confirmed location, with the other as a consistency check.

Fix the relationship between the switch and its container, not merely the thumb color. Use consistent border weight, inset, vertical alignment, and label spacing. Preserve extension enable/disable callbacks and disclosure behavior. Clicking the switch must not accidentally expand its containing section. Do not flatten every settings panel or redesign the whole Extensions page.

### Command palette

Make this the strongest demonstration of the same component family. Retain a translucent floating panel with controlled depth, a crisp search header, clear active result, and legible right-aligned hints. Avoid an outlined orange capsule around every selected row if a subtler selection band reads better. Use glow as part of the shared material treatment, not a detached decorative halo.

Preserve query updates, filtering, entry order and IDs, keyboard navigation, Enter execution, Escape, pointer selection, active-item scrolling, and empty results. Audit focus trapping and focus restoration, accessible dialog naming, and input/listbox semantics as part of adopting the dialog foundation. Verify the existing parent controller before moving keyboard logic so events do not execute twice.

## Build and review in context

Create one development-only specimen route following the repo's prototype conventions, for example `/prototype/component-library`. Import the real shared components. Do not duplicate their styles in showcase-only markup.

Include a compact state matrix plus realistic compositions: an auto-tag action group, a sound-file row with several tags, a scan settings row, extension setting rows, and the command palette over a representative workspace. Use fixtures for processing, unavailable, error, and empty states. Keep controls operable so hover, focus, keyboard, and checked behavior can be inspected.

First establish the material, typography, and action/tag family together. Inspect them visually before extending the treatment to switches and the palette. Then migrate the identified real consumers and remove their conflicting appearance overrides. Avoid a global find-and-replace. Review other Button, Badge, Switch, and Dialog consumers affected by shared defaults.

Capture before and after at the same viewport and zoom. Check normal desktop width and a narrower window, long filenames and labels, both sparse and dense content, and supported application zoom settings. Preserve percentage-based root heights; viewport-height replacements can break app zoom. Prefer one overlay blur over hundreds of blurred cells.

Use the player and active rail as context for restrained glow, without assuming the user has endorsed every existing detail. Check them for regressions when shared controls change. Leave their layout and playback behavior intact. FileTable is virtualized; preserve its current row measurements, keyboard behavior, and scrolling. Do not introduce a generic list-row abstraction or change row height as part of this component exercise.

Run `bun run typecheck`, `bun run lint`, and the relevant existing component and interaction tests. Discover current test paths rather than copying paths from dated audit files. Add tests for meaningful changed behavior such as focus restoration, keyboard execution, switch event separation, or pending-action gating. Do not add tests that merely assert a class string or mirror visual implementation. Report pre-existing failures separately and do not weaken checks.

## Completion criteria

- The five affected examples visibly belong to one family when rendered inside the workspace.
- Actions, tags, and statuses have distinct visual roles. Small orange pills are no longer the universal emphasis mechanism.
- Translucency, borders, corner radii, text, and interaction states are consistent and readable over real content.
- The implementation consists of a small set of reusable components and compositions, with appearance overrides removed at migrated call sites.
- Existing workflow behavior and the user's unfinished changes are preserved.
- Keyboard and focus behavior works; icon-only actions and switches have accessible names; reduced motion and application zoom remain usable.
- The specimen route uses production components, and the real screens use them too.
- Deliver a concise usage guide, the changed-file list, before/after images, and exact validation results. State any screenshot-to-source uncertainty or unverified runtime behavior plainly.

Do not stop after describing the design. Implement, inspect, refine, and integrate it. Keep the result small enough that a future contributor can understand how to choose and use a control without hunting through screen-specific styling.
