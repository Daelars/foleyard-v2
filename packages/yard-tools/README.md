# Yard Tools

Bundled Foleyard extension packages live under `packages/yard-tools/*`.
Each tool declares a manifest, commands, permissions, and settings against
`yard-core` contracts and runs in-process through the guarded extension host.

## Catalog

| Package | Extension id | Commands | Docs |
| --- | --- | --- | --- |
| `sound-shelf` (`@foleyard/sound-shelf`) | `sound-shelf` | 4 — shelf add/remove/clear/list | `docs/extensions.md`, `docs/commands.md` |
| `make-pack` (`@foleyard/make-pack`) | `make-pack` | 3 — pack from selection/shelf/recent | `docs/extensions.md`, `docs/commands.md` |
| `drop-rules` (`@foleyard/drop-rules`) | `drop-rules` | 4 — configure/preview/apply/prepare-drag | `docs/extensions.md`, `docs/filesystem.md` |
| `folder-janitor` (`@foleyard/folder-janitor`) | `folder-janitor` | 4 — scan library/folder, remove files, delete folders | `docs/extensions.md`, `docs/commands.md` |
| `library-gatherer` (`@foleyard/library-gatherer`) | `library-gatherer` | 2 — preview/gather | `docs/extensions.md`, `docs/commands.md` |
| `smart-collections` (`@foleyard/smart-collections`) | `smart-collections` | 1 — save search | `docs/extensions.md`, `docs/collections.md` |

Layout per package: `src/{manifest,command-definitions,commands,
permissions,settings,service,types,index}.ts`, versioned by its own
`package.json` (currently `1.0.0`). There is no external discovery or
loading — these six are the complete set.

## Further reading

- `docs/extensions.md` — permissions, settings UI, catalog projection
- `docs/commands.md` — the 18-command table and execution model
- `docs/architecture/extensions.md` — registration → transport → host → UI trace
- `docs/architecture/yard-core.md` — contracts these tools build against
