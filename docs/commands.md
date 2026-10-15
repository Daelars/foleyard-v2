# Commands

> Feature status: shipped
> Contract: internal
> Owner: `packages/yard-tools/*-v2/src/definition.ts` + `src/lib/commands.ts`
> Applies to: docs manifest ID (`commands`); development checkout when unbuilt

## What it does

Commands are the executable surface of the bundled tools. Each command
carries metadata (id, title, scope, destructive flag, selection needs,
input/result schemas, owning runtime, required capabilities, docs ref) in
its package `definition.ts` and is validated by the v2 registry at
registration. The renderer additionally ships built-in palette actions
(view, transport, file) from the descriptor table in `src/lib/commands.ts`.
There is no public command SDK and no external command source.

## Responsibilities and boundaries

- Each tool's `definition.ts` is the single source of command metadata;
  handlers live in the same package and run only through the v2 host.
- `src/lib/commands.ts` is the single source of built-in palette actions
  (id, section, gate, title, action). The palette builder and the
  palette/shortcut dispatch both read it.
- `ExtensionV2Registry` validates declarations; `ExtensionV2Host` owns the
  single execution path (direct, reviewed plan, or host-owned job).
- `packages/yard-core/src/extensions-v2/transport.ts` owns the HTTP codec:
  envelope decode, payload limits, status mapping, error envelopes.
- `GET /api/runtime` reports every built-in action and the full v2 command
  metadata (`commandsBuiltin`, `extensionsV2[].commands`).

## Built-in palette actions

| Palette id | Section | Gate | Shortcut |
| --- | --- | --- | --- |
| `view:library` | view | — | — |
| `view:favorites` | view | — | — |
| `view:shelf` | view | `sound-shelf-v2` enabled | — |
| `view:organize` | view | — | — |
| `view:tools` | view | — | — |
| `view:auto-tag` | view | `auto-tag-v2` enabled | — |
| `view:settings` | view | — | `,` (`open-settings`) |
| `transport:toggle-play` | transport | current file | Space (`toggle-playback`) |
| `transport:next` | transport | queue can step | — |
| `transport:prev` | transport | queue can step | — |
| `transport:autoplay` | transport | — | — |
| `file:toggle-favorite` | file | current file | `f` (`toggle-favorite`) |
| `file:add-to-shelf` | file | current file + shelf enabled | — |

Shortcut bindings also cover `focus-search` (`/`), `move-next` (`j`) and
`move-prev` (`k`), which have no palette entry. Defaults live in
`DEFAULT_SHORTCUTS` (`src/components/Shortcuts/shortcuts.ts`). Palette
availability is display-only; execution revalidates.

## Bundled v2 commands

All 35 commands run through `POST /api/extensions-v2/execute` (API version 2,
internal). Each port is disabled by default with explicit enable and
approval; settings namespaces exist only where the port declares settings
(`auto-tag-v2` declares none).

| Command id | Scope | Selection | Destructive | Input | Result | Docs |
| --- | --- | --- | --- | --- | --- | --- |
| `auto-tag-v2.tag-files` | global | — | | yes | yes | `commands` |
| `auto-tag-v2.preview` | global | — | | yes | yes | `commands` |
| `auto-tag-v2.list-candidates` | global | — | | yes | yes | `commands` |
| `auto-tag-v2.promote-candidate` | global | — | | yes | yes | `commands` |
| `auto-tag-v2.dismiss-candidate` | global | — | | yes | yes | `commands` |
| `auto-tag-v2.find-similar` | selection | required | | yes | yes | `commands` |
| `auto-tag-v2.clap-status` | global | — | | yes | yes | `commands` |
| `auto-tag-v2.download-model` | global | — | | yes | yes | `commands` |
| `auto-tag-v2.tag-semantic` | global | — | | yes | yes | `commands` |
| `auto-tag-v2.coverage-history` | global | — | | yes | yes | `commands` |
| `auto-tag-v2.record-coverage` | global | — | | yes | yes | `commands` |
| `auto-tag-v2.coverage-summary` | global | — | | yes | yes | `commands` |
| `auto-tag-v2.list-origins` | global | — | | yes | yes | `commands` |
| `auto-tag-v2.latest-arrivals` | global | — | | yes | yes | `commands` |
| `auto-tag-v2.remove-by-origin` | global | — | destructive | yes | yes | `commands` |
| `auto-tag-v2.rename-tag` | global | — | | yes | yes | `commands` |
| `auto-tag-v2.merge-tag` | global | — | destructive | yes | yes | `commands` |
| `drop-rules-v2.preview` | drop | — | | yes | yes | `commands` |
| `drop-rules-v2.apply` | drop | — | | yes | yes | `commands` |
| `drop-rules-v2.prepare-drag` | drop | — | | yes | yes | `commands` |
| `drop-rules-v2.open-settings` | global | — | | — | yes | `commands` |
| `folder-janitor-v2.scan-library` | global | — | | yes | yes | `commands` |
| `folder-janitor-v2.scan-folder` | folder | — | | yes | yes | `commands` |
| `folder-janitor-v2.remove-files` | selection | required | | — | yes | `commands` |
| `folder-janitor-v2.delete-folders` | global | — | destructive | yes | yes | `commands` |
| `library-gatherer-v2.preview-gather` | global | — | | yes | yes | `commands` |
| `library-gatherer-v2.gather` | global | — | | yes | yes | `commands` |
| `make-pack-v2.from-selection` | selection | required | | yes | yes | `commands` |
| `make-pack-v2.from-shelf` | global | — | | yes | yes | `commands` |
| `make-pack-v2.from-recent` | global | — | | yes | yes | `commands` |
| `smart-collections-v2.save-search` | global | — | | yes | yes | `commands` |
| `sound-shelf-v2.add-selected` | selection | required | | — | yes | `commands` |
| `sound-shelf-v2.remove-selected` | selection | required | | — | yes | `commands` |
| `sound-shelf-v2.clear` | global | — | | — | yes | `commands` |
| `sound-shelf-v2.list` | global | — | | — | yes | `commands` |

Input and result schemas are machine-readable value schemas declared in each
`definition.ts` and reported by the runtime snapshot.

## Runtime behavior

Execution model: shared availability preflight (enabled, scope, selection,
input, unknown-capability denial, granted permissions), ownership-keyed
handlers, engine-owned `runMode` (direct/apply/job), typed `{ ok, error }`
envelopes. Limits: 256 KiB body, 64 KiB input, 500 selection IDs. Status:
200 immediate/review, 202 job, 400 invalid, 403 disabled/denied, 404
unknown/unresolvable, 413 over limits, 500 host faults. Background work
goes through `POST /api/extensions-v2/jobs` with `vjob_` IDs and polling;
reviewed work goes through the plans routes, and a reviewed plan can run
as a background job through `POST /api/extensions-v2/plans/:planId/job`
so the job executes the exact reviewed targets and options. Full
contracts and author examples live in `docs/extensions-v2.md`.

The palette projects v2 commands as `v2tool:<extensionId>:<commandId>`
entries through the v2 bridge.

## Contracts

- Internal: `ExtensionV2Definition` command declarations; serializable
  catalog entries (no handler or validator functions escape).
- Envelope: `{ extensionId, commandId, selection?: { fileIds }, input? }`;
  destination access travels through the grants routes, never raw paths.
- Outcomes: `{ ok: true, outcome: { kind: "immediate" | "review" | "job",
  ... } }` or `{ ok: false, error: { code, message } }`.
- Built-ins: `BuiltinCommandDescriptor` and `BUILTIN_COMMAND_ACTIONS` in
  `src/lib/commands.ts`.

## Failure behavior and limitations

| Code | HTTP | Meaning |
| --- | --- | --- |
| `extension-not-found` / `command-not-found` | 404 | unknown id, never fetched externally |
| `extension-disabled` / `permission-denied` | 403 | tool off, or an unapproved permission |
| `input-invalid` / `selection-*` / `context-unsupported` | 400 | bad envelope, missing selection, unsupported context |
| `payload-too-large` | 413 | over body/input/selection limits |
| `job-unknown` / `plan-unknown` | 404 | missing job or plan id |
| `plan-expired` / `plan-altered` / `review-required` | 400 | reviewed-plan contract violations |

Cancellation is cooperative: work stops between operations.

## Source map (real file paths)

- `packages/yard-tools/*-v2/src/definition.ts` — v2 command declarations
- `src/lib/commands.ts` — built-in descriptor table and action map
- `packages/yard-core/src/extensions-v2/{registry,host,jobs,plans,transport}.ts`
- `src/lib/extensions-v2/host.ts` — registry + enablement composition
- `src/components/CommandPalette/command-palette.ts` — entry builder
- `src/app/library/use-palette.ts` — palette data wiring and dispatch
- `src/lib/runtime-info.ts` — `commandsBuiltin` and v2 command metadata

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

- `docs/extensions-v2.md` — authoring contracts and execution model
- `docs/events.md` — execution outcomes vs subscription events
- `docs/runtime.md` — the command projection in the runtime snapshot
- `docs/architecture/extensions.md` — end-to-end registration trace
