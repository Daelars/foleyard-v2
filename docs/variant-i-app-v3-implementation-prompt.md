# Variant I library and app-v3 implementation prompt

Prepared on 9 September 2026 from the working checkout. This is an implementation brief, not shipped-product documentation. Three Luna agents researched the Variant I source, the current app, and integration boundaries; the orchestrator reviewed their findings. Browser inspection was unavailable during preparation. Source references below are verified starting points, not proof of visual equivalence.

## Task

Implement this in the existing repository. Deliver a reusable component library with its own `styles.css` and `components/` directory. Copy the appearance of **only Variant I** at `http://localhost:3000/prototype/component-library?variant=I` exactly. Then build `http://localhost:3000/prototype/app-v3` as the current app with those new components used throughout.

The user's clarification is decisive: "I basically want to see app-v3 as the same thing we have currently, but with the new components."

Use `src/app/page.tsx` and its reachable components as the authority for layout, navigation, content, available actions, state transitions, and behavior. Use Variant I as the authority for component appearance. Preserve the current app's hierarchy, panel positions, view structure, density, responsive behavior, labels, and workflows. Substitute the new components at their existing locations. Where intrinsic control dimensions change to match I, retain the surrounding app layout. Do not transplant the specimen's card grid or its sample transport arrangement into the app.

This is implementation work. Continue through integration and validation. A plan, gallery, partially restyled home screen, or collection of unconnected controls does not satisfy the task.

## Protect the working checkout

Read `AGENTS.md`, `docs/index.md`, `CONTEXT-MAP.md`, `docs/agents/domain.md`, `src/CONTEXT.md`, and the relevant feature guides and ADRs before editing. Follow their source maps. Use `docs/development.md` for verification commands.

Inspect `git status` and the current diff first. This checkout already contains extensive changes, including `src/components/kit/`, `src/components/workspace/`, `src/app/workspace/`, the component-library prototype, and earlier component-library prompts. Preserve that work. Use the current working-tree implementation of `/`, including uncommitted changes, as the app baseline. Do not replace it with HEAD or a pre-existing workspace fork.

This brief replaces earlier design prompts for this task. Do not reinterpret the design from `docs/component-library-agent-prompt.md` or its redesign counterpart. Do not use Variant J, `/workspace`, `/prototype/app-v2`, or another prototype as the app specification. You may inspect existing extraction work for useful mechanisms, but verify every reused visual against I and every workflow against `/`.

Keep the original `/` app and the original Variant I specimen available and visually unchanged for comparison. Avoid backend, database, core, IPC, extension execution, dependency, or lockfile changes unless a demonstrated integration requirement needs them. Do not commit or publish as part of this task.

## Exact visual source

Read these files in full, following their imports:

- `src/app/prototype/component-library/page.tsx`, especially selection of `VariantI`.
- `src/app/prototype/component-library/variant-i.tsx`.
- `src/app/prototype/component-library/variant-d-kit.tsx`.
- `src/app/prototype/component-library/variant-g-kit.tsx`.
- `src/app/prototype/component-library/variant-h-kit.tsx`.
- `src/app/globals.css` and `src/app/layout.tsx` for the inherited theme, fonts, providers, and global rules.

I renders selected D, G, and H components. Copying those dependencies is required; adopting any other variant's design is not. Extract only the definitions and compositions that I actually uses. In particular, its animated controls use `GButton`, `GIconButton`, `GCheckbox`, `GRadio`, `GSwitch`, and `GProgress`, rather than simply all of D's exports.

The used D exports include `DSurface`, `DCard`, `DField`, `DSelect`, `DKbd`, `DStatusBadge`, `DTag`, `DAIScore`, `DCommandPanel`, `DCommandSection`, `DCommandRow`, `DCommandFooter`, `DAlert`, `DPageButton`, and `DTooltipBubble`. Do not export unused kit controls just because they share a source file.

Preserve rendered dimensions, padding, gaps, radii, typography, icon geometry, borders, alpha values, gradient stops, shadows, glow, opacity, focus rings, transitions, animation timing, and every visible state. No approximations, new preset, general glass theme, or aesthetic cleanup. Inspect computed font families instead of assuming that a CSS font name means the font is loaded.

`DSurface` currently supplies these exact tokens:

```css
--d-well: rgba(0, 0, 0, 0.42);
--d-edge: rgba(255, 255, 255, 0.09);
--d-edge-hi: rgba(255, 255, 255, 0.16);
--d-lift: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 1px 2px rgba(0, 0, 0, 0.4);
--d-sink: inset 0 1px 3px rgba(0, 0, 0, 0.55);
```

Preserve all remaining source values too. I uses `#0a0a0e` for its specimen canvas and consumes global accent variables through `color-mix(in_oklab, ...)`. Do not change the original global canvas or brand tokens to obtain this result. Reproduce I's background in the comparison specimen; retain the app shell's layout and apply I's appropriate component treatments there.

## Required ownership and API

Create this structure:

```text
src/components/variant-i/
  styles.css
  index.ts
  README.md
  components/
    provider.tsx
    button.tsx
    ...named reusable controls and compositions
src/app/prototype/app-v3/
  layout.tsx
  page.tsx
  components/
    ...app-specific presentation adapters
src/app/prototype/variant-i-library/
  page.tsx
docs/variant-i-app-v3-coverage.md
```

`src/components/variant-i/styles.css` must own the library's static visual rules, tokens, state selectors, and keyframes. Import it through the relevant prototype layouts or entry points. Scope it under a library marker such as `[data-variant-i]` and prefix component classes and animation names. Do not put a second Tailwind reset in it. Consume the established global token contract, or document exact local equivalents. Never use global `button`, `input`, `body`, or `:root` overrides to restyle the original app.

Keep dynamic values such as progress percentage, waveform data, measured positions, and user-selected tag colors in typed props or CSS variables. App adapters may arrange layout; shared control appearance belongs to the library. Converting utilities to CSS must preserve cascade order and computed values. Do not weaken theme lint to accommodate copied styles.

Expose named, typed components through `index.ts`. Preserve appropriate native attributes, refs, controlled values, distinct callbacks, disabled/loading states, labels, and composable content. Use instance-safe IDs. Reusable components must not import anything from `src/app/prototype/**`, specimen fixtures, or route-local state. Separate decorative specimen cards from app panels so a demonstration heading is never forced into an app control.

Retain suitable existing unstyled helpers, domain types, and behavior engines, including `cn`, `TagOriginMark`, `DotmSquare3`, item-color helpers, and existing Base UI machinery where appropriate. Inspect them for styling dependencies. Do not leave old styled controls visible underneath a wrapper. If using the shadcn skill, the user's explicit separate stylesheet and exact-copy requirement take precedence over its generic global-stylesheet or preset conventions.

Own portal styling explicitly. Menus, selects, dialogs, tooltips, the palette, and toasts must inherit the same library variables even outside the route wrapper. Use a scoped portal host or a scoped marker on each portal root. Preserve collision handling, clipping behavior, stacking, scroll/resize repositioning, focus trapping, Escape, outside-click handling, and focus restoration. Add missing accessibility behavior without changing the visible design.

Check every Base UI portal wrapper, including Dialog, AlertDialog, ContextMenu, DropdownMenu, Select, and Tooltip. Apply the scope to content and backdrops, or pass a supported container tied to the library host. An attribute on the route ancestor alone is insufficient.

The root layout already mounts `TooltipProvider`, `Toaster`, and `UpdateNotifier`. Resolve that integration deliberately. Do not mount a second default Sonner listener that duplicates notifications. Route-specific toast presentation must render existing app/hook notifications once with I's treatment and restore the original presentation when leaving app-v3. Any minimal shared infrastructure change must leave `/` unchanged.

## Library inventory

Extract every category rendered by I, including the less prominent sections near the bottom of `variant-i.tsx`:

| Group | Required components and states |
| --- | --- |
| Actions | Button tones and sizes, icon buttons, default/hover/pressed/focus/disabled/loading, pagination and keyboard hints |
| Entry | Text/search fields, select and popup, switches, checkboxes, radio choices, sliders, shortcut capture, validation |
| Feedback | Status badges, tags, AI score, alerts, progress, scan stats/job display, toasts, empty states, skeletons, dot-matrix status |
| Containers/navigation | Surface, card, tabs/panels, rail items, accordion, breadcrumbs, directory rows |
| Overlays | Dialog and confirmation, menu items/separators, tooltip, collection popup, command panel/sections/rows/footer and full palette |
| Library/player | File-row treatment, provenance marks, bulk bar and removal confirmation, transport controls, scrubber/waveform, favorite and volume controls |
| Organization/tools | Coverage rows, candidate queue, tag editor/composer/color choices, extension rows, tool cards/details/permissions, drop offer, validated setting rows, pack options, onboarding stepper |

Useful source anchors in `variant-i.tsx` at preparation time: ordinary controls start near line 605; transport near 1013; bulk/scan/extensions/shortcuts/queue near 1202; coverage/provenance/pack/onboarding/loading near 1348; directories near 1518; organize tags near 1567; setting rows near 1787; tool cards near 1841; floating overlays near 1941; local composition helpers near 2054. Re-read current source because line numbers can move.

Build `/prototype/variant-i-library` as a comparison specimen using only the extracted library. Reproduce I's complete specimen layout, content, and visible states there. Keep fixture data in that route. Preserve the original I implementation as the independent reference; do not make both comparison pages render the same new code and call that validation.

This extra route is a development-only validation aid. The user-facing deliverable remains app-v3.

## Rebuild the current app at app-v3

Start from the current composition in `src/app/page.tsx`. Reuse `src/app/library/*` hooks, shared domain/data helpers, playback engines, and extension contracts. Create route-local presentation adapters where needed to replace nested controls while keeping original components intact. Do not merely re-export `Home`, import the original page unchanged, or apply a CSS skin to it. Do not fork backend logic or invent a parallel state store.

Inventory the full reachable render tree before editing and record it in `docs/variant-i-app-v3-coverage.md`. Each row must name the original component/path, new adapter, library exports used, important states, and validation evidence. Update it as you work. Use the following checklist as the minimum scope, extending it for anything else reachable from `/`:

| Current app area | Sources and required coverage |
| --- | --- |
| Shell and navigation | `src/app/page.tsx`, `src/components/IconRail.tsx`, `DesktopTitleBar.tsx`; desktop rail, mobile navigation dialog, headers, counts, search/clear, sort/filter controls, collection and directory navigation |
| Library and favorites | `src/components/FileTable.tsx`, `src/components/FileTable/*`; virtualized list, row selection/range selection, active/playing/favorite states, tags and origins, waveform previews, breadcrumbs, directory rows, row menus, bulk actions and confirmations, existing loading and empty behavior |
| Collections and shelf | Collection/smart-search views, rename/save-search dialogs, shelf membership, add-to-collection popup, selection actions, pack entry points, extension drop offers |
| Organize | `src/components/OrganizeView.tsx` and descendants; tag/collection creation, rename, color, deletion, filtering, validation and empty states |
| Auto-tag | `src/components/AutoTagBoard/board.tsx`, `origins.tsx` and descendants; actual current board tabs/pages, coverage, candidate review, scan/analysis progress, provenance, errors and actions. Preserve separate promote and dismiss operations |
| Tools/extensions | `src/components/ExtensionGrid.tsx`, `src/components/extensions-v2/*`; legacy and v2 cards, enablement, settings, permissions/approval, job feedback, selection/menu contributions, sidebar panels, drop-zone states |
| Playback | `src/components/AudioPlayer.tsx`, `src/components/AudioPlayer/*`; real audio, queue, play/pause, previous/next, seek/waveform, volume/mute, autoplay, favorites, collection menu, dismiss and existing audio failure behavior. Keep the app's player placement |
| Command palette | `src/components/CommandPalette/CommandPalette.tsx`, `command-palette.ts`, palette hooks and v2 bridge; real sections/commands/results, filtering, active row, shortcuts, keyboard selection, empty results and footer |
| Settings | `src/components/settings/SettingsDialog.tsx` and all tabs: library roots and scans; metadata collections/tags; legacy/v2 extensions and settings; appearance/zoom; customisation/shortcuts and removal defaults; about/runtime information. Preserve navigation and service status |
| Dialogs | `src/app/library/dialogs.tsx`; extension details, save search, rename collection; `OnboardingDialog.tsx`; mobile navigation; similar-sounds dialog in `src/app/page.tsx`; every confirmation opened by child components |
| Extension workflows | `src/components/extensions/folder-janitor/FolderJanitorDialog.tsx`, `library-gatherer/LibraryGathererDialog.tsx`, `make-pack/MakePackDialog.tsx`, `make-pack-v2/MakePackV2Dialog.tsx` and descendants; all stages, forms, review/results, progress, errors, cancellation and confirmations |
| Global feedback | Toasts from existing hooks/actions, update notification when available, tooltips, validation, pending and disabled controls across every view |

Audit nested imports too. Replacing a top-level `SettingsDialog` while its tabs still render the old Button/Input/Switch is incomplete. Record any remaining import from `@/components/ui` or the old `kit` and justify it as nonvisual infrastructure; migrate every visible styled control. Also inspect raw markup and inline controls, since an import audit alone cannot catch them.

Apply that audit to `@/components/workspace/*` as well. Original components used by `/` may remain untouched; this requirement concerns the final app-v3 render tree. The coverage report must distinguish exact I controls, I compositions, and app-only controls composed from I, with actual paths for nested dialogs and portals. Preserve existing loading/failure behavior instead of inventing new panels: FileTable currently has no dedicated error display, and AudioPlayer does not expose a visible playback error panel.

Keep the existing root-height and CSS zoom behavior. Do not replace it with viewport-height sizing. Keep FileTable virtualization and reconcile its row measurements with the extracted row geometry so selection, keyboard movement, long lists, and scroll-to-selected remain correct. Test long filenames/tags, modifier-key and range selection, load-more, native drag-out where available, and browser drop offers.

For app controls with no exact I specimen, compose the closest extracted parts while retaining the current app's function and structure. Document the mapping. Do not omit the control or introduce another visual system. Do not add specimen-only screens or actions that the actual app does not have.

## Real behavior, not specimen simulation

The app-v3 route must use real app data and callbacks by default. Keep real search/debounce, sorting, selection, pagination, collections, tags, favorites, shelf, settings persistence, scan polling, optimistic changes, failure handling, playback and extension contributions.

Do not carry over `SPECIMEN_COMMANDS`, hardcoded filenames/paths/counts, `QUEUE`, `SHELF_COLLECTIONS`, initial fake toasts, scan intervals, playback intervals, no-op handlers, local fake permissions, or fake tag mutation state. In I, candidate promote and dismiss both remove a sample word; app-v3 must call the two distinct real operations. Root-removal and disk-removal confirmations must retain their actual different contracts. Use actual waveforms, not the specimen's generated sine peaks.

Fixtures are allowed for deterministic comparison and tests, separately from the normal route. Reuse existing handlers without invoking destructive operations on user data merely to demonstrate UI. Exercise such paths through disposable fixtures or mocks.

The prototype layout intentionally returns not-found in production builds. Keep that development-only restriction. Do not change packaging to ship app-v3. For native-only actions, inspect the runtime and matching docs as described in `docs/runtime.md`; record unavailable capabilities as unknown or untested. A browser preview does not establish Electron behavior.

## Verification and completion

1. Before extraction, capture the original I specimen and the current app's major views and overlays with fixed viewport, zoom, fonts, data, scroll position, and state. Record the environment. If browser access is unavailable, continue implementation and checks, but explicitly leave visual verification uncompleted.
2. Compare original I with `/prototype/variant-i-library` using matching fixtures. Check every section and open overlay, not only the first screen. Use screenshots, aligned crops/diffs, and computed styles. Investigate every visible mismatch. For animations, compare fixed states and separately verify timing and reduced motion. Do not conceal differences with a permissive global pixel threshold.
3. Compare `/` with `/prototype/app-v3` for layout and workflow parity at the same desktop and narrow viewports. The component pixels should change to I; the app arrangement and behavior should match `/`. Walk every row of the coverage matrix, including scrollable settings and dialogs.
4. Verify hover, press, keyboard focus, disabled, loading, empty, error, active, selected, expanded, and validation states where applicable. Check overlay clipping near viewport edges, scroll repositioning, focus return, tab navigation, shortcut capture, and reduced motion. Check navigation back to `/` for style leakage and duplicate listeners/toasts.
5. Run `bun run typecheck`, `bun run lint`, relevant Vitest tests and meaningful new behavior tests for extracted interactive controls and adapter wiring. Read existing tests and `docs/development.md` first. Validate the Next build where the environment supports it, retaining the prototype production guard. Do not change native binaries just to force a check to pass. Record baseline failures separately from regressions.
6. Inspect the final diff and import graph. The library must stand independently of prototype sources; app-v3 must actually use it throughout. Confirm the original reference routes remain unchanged and no demo simulation drives real app state.

Deliver the code, the functioning two development routes, a short library README explaining imports/props/styles/portal requirements, and the completed coverage report with screenshot locations and test results. Report exact remaining blockers or unverified states. Do not claim "exact copy" or "every surface complete" without the corresponding evidence.
