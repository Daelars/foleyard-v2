# Sound Shelf v2

Port of the Sound Shelf tool onto the v2 extension engine (S2, issue
#177). Displayed as **Sound Shelf v2**. Bundled internal port, disabled
by default, explicit enable/disable, own settings namespace
(`sound-shelf-v2.*`), no auto-migration from v1. The v1 Sound Shelf
keeps its behavior and its own record (`extension:sound-shelf:items`)
untouched; the v2 store starts empty under `v2shelf:sound-shelf-v2`.

A short-term scratchpad of Library sounds while searching — explicit
add/remove/clear/list. Not favorites, not a smart Collection.

## Layout

- `src/definition.ts` — v2 definition: id `sound-shelf-v2`, four
  commands (`.add-selected`, `.remove-selected`, `.clear`, `.list`), no
  settings, eight contributions (palette ×4, file-context-menu ×2,
  selection-actions, sidebar). One permission: `library:read` (matching
  v1). No `requiredCapabilities`: the app host exposes no capabilities.
- `src/handlers.ts` — command handlers. Every effect runs through the
  v2 shelf op (E1 #176). No v1 imports, no direct storage access, no
  favorites and no Collections.

## Run-mode contract

All four commands settle immediately (`immediate` outcome): there is no
destructive filesystem effect to review, so no plan/grant/job machinery
is involved. `add`/`remove` read the selected sounds from the
invocation; `clear`/`list` are global.

## Policies

- **Index-backed store.** The shelf holds Library index IDs. `add`
  validates every ID against the index before writing — an ID outside
  the index rejects the whole call and nothing is stored.
- **Self-repair on read.** `list` prunes IDs that left the Library
  index (removed or unknown) and writes the repaired list back, so the
  scratchpad never accumulates dead entries. The pruned IDs are
  reported as `repaired`.
- **Persist before notify.** The op commits the row first and emits
  `state-changed` afterwards, so a subscriber that re-reads on receipt
  always observes the triggering change.
- **Per-extension isolation.** The store keys rows per extension ID, so
  one extension can never read or write another's scratchpad.
- **Dedupe.** Re-adding an already-shelved sound is a no-op for that ID
  (`added` counts only new entries); the shelf never doubles an entry.
- **Limits.** 2,000 IDs per shelf (`V2_MAX_SHELF_IDS`), rejected before
  any write.
- **Permissions first.** Every command checks `library:read` before
  touching the store; an unauthorized handler stays confined.

## Before/after parity

| v1 workflow | v2 behavior | Notes |
| --- | --- | --- |
| Add to Shelf (selection) | Same, via `add-selected` (selection scope) | IDs deduped; removed records reject at preflight before writing |
| Remove from Shelf (selection) | Same, via `remove-selected` | Reports removed count and remaining total |
| Clear Shelf | Same, via `clear` | Now behind `library:read` (v1 `clear` skipped the permission check — **fixed**) |
| List Shelf | Same, via `list`, plus read-time repair | v1 returned raw IDs including dead entries; v2 prunes and reports them |
| In-memory store | **Persisted** in the `settings` table (`v2shelf:sound-shelf-v2`) | v1 store was ephemeral per host instance and lost on reload — **fixed**; no new migration |
| `shelf.read`/`shelf.write` capabilities | Permission-only (`library:read`) | Matches the make-pack-v2 precedent; the app host exposes no capabilities |
| Contributions | context-menu + sidebar (v1 surfaces) plus palette + bulk bar | Resolved through the generic v2 contribution points |
| Result shape | `{ added, removed, total }` / `{ ids, repaired, total }` | Validated against the command result schema |

Explicitly unsupported: silent v1→v2 store migration (the v2 shelf
starts empty on purpose; the v1 record is left intact), and shelving
more than 2,000 sounds in one shelf.

## Use it

1. Settings → Extensions → **Sound Shelf v2** → enable.
2. Approve the declared permission (`library:read`).
3. Pick sounds, then Add to Shelf (v2) from the row menu, bulk bar, or
   palette. Open the Shelf from the sidebar; Remove or Clear as needed.
