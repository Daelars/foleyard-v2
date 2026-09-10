# Foleyard component library

The shared controls live in `src/components/ui`. Use `Button` for actions,
`SoundTag` for literal sound metadata, and `StatusBadge` for workflow state.
`SettingRow` pairs a readable label and description with a switch or a control
provided as its child.

Use `default` Button for the one principal action in a group, `secondary` for
supporting actions, `outline` for confirmation or quiet emphasis, and `ghost`
for low frequency utility actions. Keep `size="sm"` for dense toolbars and
`size="icon-sm"` for icon-only controls with an accessible `aria-label`.

Tags are neutral by default. Pass `selected` only when the tag is the current
selection in that context; pass a `TagOrigin` provenance and confidence
separately so those signals render as M/D/AI marks and do not become
selection colors. Use `StatusBadge` when a state needs to be named (ready,
processing, unavailable, or error).

Use `PendingButton` for async actions such as scans and model downloads. It
keeps its label, shows a spinner, and stays disabled while `pending` so a
second click cannot double-submit. Keep `pendingText` close in length to the
idle label so the row does not collapse while a job runs.

Palette rows use `CommandItem`, which is visual treatment only: the parent
(`usePalette` in `src/app/library/use-palette.ts`) owns entry data,
filtering, keyboard navigation, and execution, and passes listbox semantics
through. Opening the palette captures the focused element and closing it
(Escape, selection, or toggle) restores focus there.

The development specimen at `/prototype/component-library` renders these
components over representative workspace content and includes an operable
command palette. Real palette, scan, and auto-tag consumers use the same
shared material tokens from `src/app/globals.css`.
