# Auto Tag v2

Deterministic filename-rule tagging on the v2 extension engine (issue
#190). Displayed as **Auto Tag v2**. Bundled internal port, disabled
by default, explicit enable/disable, no settings of its own (on/off is
the extension enabled flag), no auto-migration from anything. There is
no v1 auto-tag; the filename rules first appeared as the throwaway
`prototype/auto-tag` mocks.

Tag new arrivals with the seed rules. Preview plans first, tag in the
background, every write marked deterministic.

## Layout

- `src/definition.ts` — v2 definition: id `auto-tag-v2`, two
  commands (`.tag-files`, `.preview`, both global scope), no
  settings, two contributions (palette ×2). Permissions:
  `library:read`, `files:read`, `tags:read`, `tags:write`,
  `settings:read`. No `requiredCapabilities`.
- `src/rules.ts` — pure vocabulary: twelve seed token rules, the
  `MAX_TAG_FILES` (500) bound, case-insensitive matching, and the
  uncovered-word extraction feeding the candidate queue (#191).
- `src/handlers.ts` — preview (immediate, no side effects),
  tag-files (immediate in `direct` mode; progress plus cancellation
  in `job` mode). Tags are found or created by name, then attached
  with the deterministic origin. No v1 imports, no direct filesystem
  access.

## Run-mode contract

- **preview** — immediate. Plan lines per file, untagged files,
  distinct uncovered words as candidates, unknown IDs as missing.
  No side effects.
- **tag-files** — `direct` tags synchronously and settles
  immediately; `job` walks the files with progress and honours
  cancellation. Unknown IDs report as missing and per-file failures
  carry reasons; neither fails the whole run. Shared tag names are
  created once per run.

## Policies

- **Manual wins.** The repository upgrades an attachment to manual
  and never away from it, so a hand tag is never clobbered by a rule
  firing later on the same file.
- **Deterministic only.** This slice never invents tags: a file gets
  exactly what the rules fire, and uncovered words queue up as
  candidates instead of guesses.
- **Bounds.** At most `MAX_TAG_FILES` (500) sounds per call; larger
  batches reject with a reason instead of truncating silently.
- **Off means off.** Disabled or unapproved, the tool writes nothing
  and fetches nothing: no model, no inference, no migration pressure.

## Use it

1. Settings → Extensions → **Auto Tag v2** → enable.
2. Approve the declared permissions.
3. Run Preview auto-tag from the palette, then Auto-tag files —
   or wait for the post-scan trigger (#194) to run it in the
   background.
