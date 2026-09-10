# Commands

> Feature status: shipped
> Contract: internal
> Owner: `packages/yard-tools/*-v2/src/definition.ts` + `src/lib/extensions-v2/host.ts`
> Applies to: docs manifest ID (`commands`); development checkout when unbuilt

## What it does

Commands are the executable surface of the bundled tools. Each command
carries metadata (id, title, scope, destructive flag, selection needs,
owning runtime, required capabilities) declared in its package
`definition.ts` and validated by the v2 registry at registration. Version 1
commands and their host were removed from the app entirely (see
`docs/extensions-v2-migration.md`); the v2 engine is the only command
runtime. The renderer adds built-in palette actions (view and transport
shortcuts) and projects v2 tool commands as `v2tool:` entries. There is no
public command SDK and no external command source.

## Responsibilities and boundaries

- Each tool's `definition.ts` is the single source of metadata; handlers
  live in the same package and run only through the v2 host.
- `ExtensionV2Registry` validates declarations; `ExtensionV2Host` owns the
  single execution path (direct, reviewed plan, or host-owned job).
- `packages/yard-core/src/extensions-v2/transport.ts` owns the HTTP codec:
  envelope decode, payload limits, status mapping, error envelopes.
- The renderer palette (`src/components/CommandPalette/`,
  `src/app/library/use-palette.ts`) projects `v2tool:<extensionId>:<commandId>`
  entries through the v2 bridge; availability shown in the palette is
  revalidated at execution time.

## Runtime behavior

Seven v2 ports run through `POST /api/extensions-v2/execute` (API version 2,
internal), each disabled by default with its own settings namespace (see
`docs/extensions-v2-migration.md`).

| Command id | Title | Scope | Selection |
| --- | --- | --- | --- |
| `make-pack-v2.from-selection` | Make Pack v2 from Selection | selection | required |
| `make-pack-v2.from-shelf` | Make Pack v2 from Shelf | global | — |
| `make-pack-v2.from-recent` | Make Pack v2 from Recent Sounds | global | — |

Execution model: shared availability preflight (enabled, scope, selection,
input, unknown-capability denial, granted permissions), ownership-keyed
handlers, engine-owned `runMode` (direct/apply/job), typed `{ ok, error }`
envelopes. Limits: 256 KiB body, 64 KiB input, 500 selection IDs. Status:
200 immediate/review, 202 job, 400 invalid, 403 disabled/denied, 404
unknown/unresolvable, 413 over limits, 500 host faults. Background work
goes through `POST /api/extensions-v2/jobs` with `vjob_` IDs and polling;
reviewed work goes through the plans routes. Full contracts and author
examples live in `docs/extensions-v2.md`.

Palette: `v2tool:` ids plus the built-in shortcut actions from
`DEFAULT_SHORTCUTS` in `src/components/Shortcuts/shortcuts.ts` —
`view:toggle-playback` (Space), `view:focus-search` (/),
`view:toggle-favorite` (f), `view:next` (j), `view:prev` (k),
`view:open-settings` (,).

## Contracts

- Internal: `ExtensionV2Definition` command declarations; serializable
  catalog entries (no handler or validator functions escape).
- Envelope: `{ extensionId, commandId, selection?: { fileIds }, input? }`;
  destination access travels through the grants routes, never raw paths.
- Outcomes: `{ ok: true, outcome: { kind: "immediate" | "review" | "job",
  ... } }` or `{ ok: false, error: { code, message } }`.
- Permissions (access policy) live on v2 definitions — see
  `docs/extensions-v2.md`; capabilities (availability semantics) are part of
  the availability evaluator.

## Failure behavior and limitations

| Code | HTTP | Meaning |
| --- | --- | --- |
| `extension-not-found` / `command-not-found` | 404 | unknown id, never fetched externally |
| `extension-disabled` / `permission-denied` | 403 | tool off, or an unapproved permission |
| `input-invalid` / `selection-*` / `context-unsupported` | 400 | bad envelope, missing selection, unsupported context |
| `payload-too-large` | 413 | over body/input/selection limits |
| `job-unknown` / `plan-unknown` | 404 | missing job or plan id |
| `plan-expired` / `plan-altered` / `review-required` | 400 | reviewed-plan contract violations |

Palette availability is best-effort display; execution always revalidates,
so a visible-but-unavailable command returns the code above instead of
running. Cancellation is cooperative: work stops between operations.

## Source map (real file paths)

- `packages/yard-tools/*-v2/src/definition.ts` — v2 command declarations
- `packages/yard-core/src/extensions-v2/{registry,host,jobs,plans,transport}.ts`
- `src/lib/extensions-v2/host.ts` — registry + enablement composition
- `src/components/CommandPalette/command-palette.ts` — entry builder
- `src/app/library/use-palette.ts` — palette data wiring

## Examples

Execute a command:

```bash
curl -X POST /api/extensions-v2/execute \
  -H 'Content-Type: application/json' \
  -d '{"extensionId":"sound-shelf-v2","commandId":"sound-shelf-v2.clear","selection":{"fileIds":[]}}'
```

Palette entry id for the same family uses the `v2tool:` prefix resolved by
the v2 bridge (`sound-shelf-v2.list` → `v2tool:sound-shelf-v2:sound-shelf-v2.list`).

## Related documentation

- `docs/extensions.md` — tools, permissions, settings UI
- `docs/events.md` — execution outcomes vs subscription events
- `docs/runtime.md` — v2 projection in the runtime snapshot
- `docs/architecture/extensions.md` — end-to-end registration trace
