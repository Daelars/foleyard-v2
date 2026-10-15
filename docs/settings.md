# Settings

> Feature status: shipped
> Contract: internal
> Owner: `src/lib/settings-schema.ts`, `src/lib/extensions-v2/settings-state.ts`, `src/lib/database/settings-repository.ts`
> Applies to: docs manifest ID (`settings`); development checkout when unbuilt

## What it does

Settings have three owners, and every value is local-first:

- **Extension settings (v2)** are declared by each bundled tool's
  `definition.ts` and stored in the SQLite `settings` table, namespaced
  per extension. The v2 settings routes read and write them.
- **Renderer preferences** (shortcut bindings, remove-default, volume,
  zoom) live in `localStorage` and are owned by their hooks; the server
  never reads them.
- **Library settings** (`libraryRoots`, onboarding version) live in the
  SQLite settings repository behind `/api/settings`.

Schema discovery (`src/lib/settings-schema.ts`) describes shape,
defaults and bounds for renderer and library settings; it never returns
values or library paths. There is no public settings SDK and no external
settings provider.

## Responsibilities and boundaries

- `ExtensionV2Setting` (`packages/yard-core/src/extensions-v2/definition.ts`)
  declares id, label, description, type, default and select options per
  extension. It never stores values.
- `src/lib/extensions-v2/settings-state.ts` reads and writes the
  `settings` table: authored settings under
  `extension:<extensionId>:setting:<settingId>`, workflow state under
  `v2state:<extensionId>`, approvals under `v2:approvals`, and the job
  snapshot under `v2:jobs:snapshot`. No new migration is needed.
- `src/lib/database/settings-repository.ts` owns library roots and the
  onboarding version (`onboarding_version`), including validation and
  removal through `/api/settings`.
- `src/lib/settings-schema.ts` owns discovery:
  `getRendererSettingsSchema()` returns defaults and bounds only;
  `getSettingsSchemaRefs()` lists the guides that describe them.
- The v2 host enforces per-extension namespacing: one extension cannot
  read or write another's settings, state or approvals.

## Runtime behavior

Extension setting reads return the stored value or the declared default;
corrupt rows read as defaults and are reported by `diagnose()`.
Writes validate against the declaration (`V2AuthoredSettingsStore`) and
persist before the `settings-changed` event is emitted, so a subscriber
that re-reads on receipt always observes the triggering change.

Routes:

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/extensions-v2/settings/:extensionId` | GET | Declarations, current values, effective permissions, diagnosis |
| `/api/extensions-v2/settings/:extensionId/:settingId` | PUT | Validated single-setting write |
| `/api/extensions-v2/settings/:extensionId/reset` | POST | Reset one setting (`{ settingId }`) or all (`{}`) to defaults |

Renderer preferences:

| Preference | Owner | Key | Notes |
| --- | --- | --- | --- |
| Shortcut bindings | `src/components/Shortcuts/shortcuts.ts` | `foleyard-shortcuts` | JSON map, conflict check, `DEFAULT_SHORTCUTS` fallback |
| Remove default | `src/components/Shortcuts/shortcuts.ts` | `foleyard-remove-default` | `library` \| `disk` |
| Volume | `src/components/AudioPlayer/use-volume-preferences.ts` | `foleyard-volume` | clamped 0–1, default 0.72 |
| Zoom | `src/hooks/use-zoom.ts` | `foleyard-zoom` | 50–200, desktop applies `setZoomFactor` |

Library settings are read and written through `GET`/`POST /api/settings`
actions (`validate`, `save`, `remove`, `forget`, `onboarding_complete`); the
scanner validates a root before it is stored. `remove` detaches the root's
files (soft, recoverable; `save` re-attaches them) and `forget` removes the
root and deletes its files and organization data — see
`docs/adr/library-root-detachment.md`.

Workflow state is one versioned envelope per extension with transactional
migrations; a failed migration preserves prior data or disables the
extension with a diagnosis. Host-owned job records and approvals live
apart from authored settings.

## Contracts

- Internal: `ExtensionV2Setting { id, label, description?, type,
  defaultValue, options? }` with `type` in
  `boolean | string | number | select` (`KNOWN_V2_SETTING_TYPES`).
- Internal: `SettingsSchemaEntry { id, owner, scope, type, defaultValue,
  options?, min?, max?, docsId }`; owners are `sqlite-settings`,
  `extension-kv`, `renderer-localStorage`
  (`src/lib/settings-schema.ts`).
- Internal: `validateSettingValue(schema, value): string | null` — select
  membership and numeric min/max only.

## Failure behavior and limitations

- Unknown extension on a v2 settings route: `extension-unknown` (404).
  A rejected value: `setting-invalid` with a human-readable reason (400).
- Non-string select values, out-of-range numbers and non-finite numbers
  are rejected rather than persisted raw.
- `localStorage` failures are best-effort: hooks keep the live value and
  skip persistence. Volume parsing falls back to 0.72; zoom normalizes
  to 100.
- Discovery (`getRendererSettingsSchema`) intentionally omits values and
  library paths; the v2 settings GET is data-only and never executes a
  command.

## Source map (real file paths)

- `packages/yard-core/src/extensions-v2/definition.ts` — `ExtensionV2Setting`
- `packages/yard-tools/*-v2/src/definition.ts` — per-tool setting declarations
- `src/lib/extensions-v2/settings-state.ts` — SQLite namespaced reads/writes and events
- `src/lib/settings-schema.ts` — discovery + `validateSettingValue`
- `src/lib/database/settings-repository.ts` — library roots and onboarding version
- `src/app/api/settings/route.ts` — library-roots/onboarding endpoint
- `src/app/api/extensions-v2/settings/[extensionId]/route.ts` — declarations/values/diagnosis
- `src/app/api/extensions-v2/settings/[extensionId]/[settingId]/route.ts` — write and reset
- `src/components/Shortcuts/shortcuts.ts` — shortcut/remove-default storage
- `src/components/AudioPlayer/use-volume-preferences.ts` — volume storage
- `src/hooks/use-zoom.ts` — zoom storage

## Examples

Read the renderer schema refs (defaults and bounds only):

```ts
import { getRendererSettingsSchema } from "@/lib/settings-schema";
const schema = getRendererSettingsSchema();
```

Write an extension setting through the validated route:

```bash
curl -X PUT /api/extensions-v2/settings/make-pack-v2/default-format \
  -H 'Content-Type: application/json' \
  -d '{"value":"zip"}'
```

The runnable-in-repository example `extensions-v2/settings`
(`bun run example:v2-settings`) exercises an authored setting, its
validation and reset, and a sidebar contribution through the real
extension engine without a database.

## Related documentation

- `docs/extensions-v2.md` — setting declaration and lifecycle contract
- `docs/commands.md` — execution that consumes these settings
- `docs/database.md` — the `settings` table underneath every store
- `docs/runtime.md` — `settingsSchemaRefs` in the runtime snapshot
