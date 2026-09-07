# Drop Rules v2

Port of the Drop Rules tool onto the v2 extension engine (D6, issue
#181). Displayed as **Drop Rules v2**. Bundled internal port, disabled
by default, explicit enable/disable, own settings namespace
(`drop-rules-v2.*`), no auto-migration from v1. The v1 Drop Rules keeps
its routes and behavior untouched.

Control what happens when a sound leaves Foleyard: copy, rename, and
mark sounds as used.

## Layout

- `src/definition.ts` — v2 definition: id `drop-rules-v2`, four
  commands (`.preview`, `.apply`, `.prepare-drag` drop scope;
  `.open-settings` global), five settings, eight contributions
  (palette ×4, drop-menu ×3, settings ×1). Permissions:
  `library:read`, `files:read`, `files:copy`, `files:write`,
  `drop:read`, `drop:modify`, `settings:read`. No
  `requiredCapabilities`.
- `src/policy.ts` — pure rename-pattern expansion (`{name}`,
  `{index}`, `{ext}`, `{format}`, `{date}`, `{time}`), sanitizing,
  in-run unique-name planning, and the `MAX_DROP_FILES` (100) bound.
- `src/handlers.ts` — preview (immediate, no side effects), apply
  (review plan in `direct` mode; copy + used report in `apply`/`job`
  modes), prepare-drag (single-file staging), open-settings
  (immediate settings surface). No v1 imports, no direct filesystem
  access, no raw staging paths.

## Run-mode contract

- **preview** — immediate. Plans output names for the dropped Library
  IDs; unknown IDs report as missing with a reason, never silent
  empty. No side effects, no destination needed.
- **apply** — `direct` returns a review plan (file table + notices);
  `apply`/`job` copy each planned file into the destination grant
  through the authorized copy op and write `foleyard-used.json` when
  `mark-used` is on. Cancellation disposes job-owned partials and
  settles cancelled, never as a misleading success.
- **prepare-drag** — stages one sound into the staging grant for
  drag-out. When no copy or rename is needed it hands back the Library
  path unstaged. Failures never strand files silently: a failed copy
  throws with a reason and stages nothing.
- **open-settings** — immediate. Returns the five setting IDs so the
  settings surface can open.

## Policies

- **Drop payload arrives as input.** Drop-scope availability (a
  validated OS drop through the real `V2DropMenu` adapter) is enforced
  by the host; the payload itself (Library IDs + destination/staging
  grants) arrives as command input and each ID is resolved against the
  Library index at run time.
- **Never overwrite.** Planned names dedupe within the run; a
  destination collision fails that file with a reason while the rest
  still process. Unrelated destination contents are never deleted.
- **Staging is grant-scoped.** Drag-out copies land in the staging
  grant via the copy op — never a raw configured path, and only owned
  job output is ever disposed on cancellation.
- **Used report is bookkeeping.** `foleyard-used.json` is written
  through the output-text op; if a previous report already occupies
  the name, the drop still succeeds and the collision is recorded as a
  warning with a reason.
- **Bounds.** At most `MAX_DROP_FILES` (100) sounds per preview/apply;
  larger drops reject with a reason instead of truncating silently.

## Before/after parity

| v1 workflow | v2 behavior | Notes |
| --- | --- | --- |
| Preview Drop Rules | Same, via `preview` | Planned names + missing with reasons; no side effects |
| Apply Drop Rules | Same, via `apply` + review | `direct` previews a review plan; `apply`/`job` copy through the destination grant |
| Prepare Drag | Same, via `prepare-drag` + staging grant | Single sound; unstaged fast path when no copy/rename is needed |
| Configure Drop Rules | Same, via `open-settings` + settings surface | Returns the five setting IDs |
| Copy on drop | Same, own namespace | `drop-rules-v2.copy-on-drop` |
| Rename on drop + pattern | Same, own namespace | `drop-rules-v2.rename-on-drop`, `drop-rules-v2.rename-pattern` (`{name}`, `{index}`, `{ext}`, `{format}`, `{date}`, `{time}`) |
| Prepared drag folder | **Changed** | v1 took a raw staging path; v2 stages into a staging grant (grant-scoped, only owned output disposed). The setting remains as the display name for the staging grant |
| Mark used report | Same intent, via output-text op | `drop-rules-v2.mark-used`; `foleyard-used.json` in the destination; a colliding previous report warns instead of failing the run |
| Missing sources | Explicit, with reasons | v1 warned per file; v2 reports missing IDs and skips them, never silent empty |
| `drop.preview` / `drop.write` capabilities | Permission-only | Matches the make-pack-v2 precedent |
| Contributions | drop-menu (v1 surface) plus palette + settings | Resolved through the generic drop-menu adapter |

Explicitly unsupported / deliberately changed: raw-path staging
directories (grant-scoped staging instead), overwriting existing
destination files, distinguishing unreadable files (no `stat` op —
absent files report as missing), and silent v1→v2 settings migration.

## Use it

1. Settings → Extensions → **Drop Rules v2** → enable.
2. Approve the declared permissions.
3. Drop sounds onto the Library drop zone and pick Preview/Apply, or
   run Prepare Drag from the palette with a staging grant.
