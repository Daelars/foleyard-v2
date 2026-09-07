# Settings

> Feature status: shipped
> Contract: internal
> Owner: `src/lib/settings-schema.ts` + `src/lib/extensions/settings-store.ts`
> Applies to: docs manifest ID (`settings`); development checkout when unbuilt

## What it does

Settings are split across three owners. Extension descriptors come from each
bundled tool's exported `YardSetting[]`; values live in SQLite via a JSON
kv-store; renderer-only preferences (shortcuts, volume, zoom, remove-default)
live in `localStorage`. Schema discovery (`src/lib/settings-schema.ts`)
describes shape and defaults but never returns values or library paths.

There is no public settings SDK and no external settings provider. Everything
is local-first and internal.

## Responsibilities and boundaries

- `YardSetting[]` (per tool `src/settings.ts`) declares id, label, type,
  default, and select options. It never stores values.
- `src/lib/extensions/kv-store.ts` (`readJsonSetting`/`writeJsonSetting`)
  is the shared JSON-over-`settings`-table primitive.
- `src/lib/extensions/settings-store.ts` namespaces keys as
  `extension:<extensionId>:setting:<settingId>`.
- Library roots, onboarding version, and extension enabled flags use the
  SQLite settings repository (`src/lib/db.ts` / `src/lib/database/*`).
- Renderer preferences use `localStorage` keys owned by their hooks; the
  server never reads them.
- `/api/settings` is a library-roots/onboarding endpoint, not a schema
  endpoint. Extension schema/values are served by `/api/extensions`.

## Runtime behavior

Extension setting reads resolve `getExtensionSettingValue(extensionId,
settingId, defaultValue)` with the manifest default as fallback; corrupt JSON
falls back to the default. Writes go through `PATCH /api/extensions` with
`{ extensionId, settingId, value }`, which coerces by type
(`coerceSettingValue`) then validates select options and numeric bounds via
`validateSettingValue` before persisting.

Renderer preferences:

| Preference | Owner | Key | Notes |
| --- | --- | --- | --- |
| Shortcut bindings | `src/components/Shortcuts/shortcuts.ts` | `foleyard-shortcuts` | 6 actions, JSON map, conflict check |
| Remove default | `src/components/Shortcuts/shortcuts.ts` | `foleyard-remove-default` | `library` \| `disk` |
| Volume | `src/components/AudioPlayer/use-volume-preferences.ts` | `foleyard-volume` (+ legacy `soundslop-volume`) | clamped 0–1, default 0.72 |
| Zoom | `src/hooks/use-zoom.ts` | `foleyard-zoom` | 50–200, desktop via `setZoomFactor` |

SQLite-backed settings (`libraryRoots`, `onboarding.version`) are read/written
through `GET`/`POST /api/settings` actions (`validate`, `save`, `remove`,
`onboarding_complete`).

## v2 settings and state beside them

v2 extensions declare their own settings
(`make-pack-v2.pack-name`, `make-pack-v2.default-format`,
`make-pack-v2.include-manifest` for the reference extension) with
runtime validation, reset semantics, and per-extension namespaces
the host enforces: one extension cannot read or write another's.
Reads and writes validate against registry declarations; corrupt
rows read as defaults with a diagnosis. Workflow state is a separate
versioned envelope per extension with transactional migrations; a
failed migration preserves prior data or disables with a diagnosis.
Host-owned job records and approvals live apart from both.

Reads: `GET /api/extensions-v2/settings/:id` (declarations, values,
diagnosis). Writes: `PUT /api/extensions-v2/settings/:id/:settingId`
(validated), reset: `POST /api/extensions-v2/settings/:id/reset`.
Persist precedes notify on every write. Storage reuses the existing
`settings` table (`extension:*:setting:*`, `v2state:<id>`,
`v2:approvals`, `v2:jobs:snapshot`) with no new migration; schema
discovery (never values) is listed in `settingsSchemaRefs` via
`extensions-v2.md`. Nothing above changes meaning: v1 settings flow
is untouched.

## Contracts

- Internal: `YardSetting { id, label, description?, type, defaultValue,
  options? }` with `type` in `boolean | string | number | select | path`
  (`packages/yard-core/src/extensions/vocabulary.ts`).
- Internal: `SettingsSchemaEntry { id, owner, scope, type, defaultValue,
  options?, min?, max?, docsId }`; owners are `sqlite-settings`,
  `extension-kv`, `renderer-localStorage`.
- `validateSettingValue(schema, value): string | null` — select-option
  membership and numeric min/max only; returns an error string or null.

## Failure behavior and limitations

- Unknown extension or setting id on PATCH: `Extension setting not found`
  (404). Failing `validateSettingValue`: 400 with the reason string.
- Non-string select values, out-of-range numbers, and non-finite numbers fall
  back or are rejected rather than persisted raw; boolean coercion uses the
  declared default for non-booleans.
- `localStorage` failures are best-effort: hooks keep the live value and skip
  persistence. Volume parsing falls back to 0.72; zoom normalizes to 100.
- Discovery (`getRendererSettingsSchema`) intentionally omits values and
  library paths. `/api/extensions` grid items include current values (they are
  the settings UI), but schema discovery never does.

## Source map (real file paths)

- `packages/yard-core/src/extensions/vocabulary.ts` — `YardSetting` type
- `packages/yard-tools/*/src/settings.ts` — per-tool descriptors
- `src/lib/settings-schema.ts` — discovery + `validateSettingValue`
- `src/lib/extensions/kv-store.ts` — JSON read/write primitive
- `src/lib/extensions/settings-store.ts` — namespaced get/set
- `src/app/api/settings/route.ts` — library roots/onboarding endpoint
- `src/app/api/extensions/route.ts` — PATCH validation + persistence
- `src/lib/extensions/registry.ts` — `toGridItem` settings projection
- `src/components/Shortcuts/shortcuts.ts` — shortcut/remove-default storage
- `src/components/AudioPlayer/use-volume-preferences.ts` — volume storage
- `src/hooks/use-zoom.ts` — zoom storage

## Examples

Set an extension select setting (validated against options):

```bash
curl -X PATCH /api/extensions \
  -H 'Content-Type: application/json' \
  -d '{"extensionId":"make-pack","settingId":"default-format","value":"zip"}'
```

Read the renderer schema refs (no values):

```ts
import { getRendererSettingsSchema } from "@/lib/settings-schema";
const schema = getRendererSettingsSchema(); // defaults + bounds only
```

The runnable-in-repository examples are `extensions/selected-ids`,
`core/query-library`, and `extensions-v2/minimal`.

## Related documentation

- `docs/extensions.md` — bundled tools, settings UI, catalog projection
- `docs/commands.md` — execution that consumes these settings
- `docs/database.md` — the `settings` table underneath the kv-store
- `docs/runtime.md` — `settingsSchemaRefs` in the runtime snapshot
