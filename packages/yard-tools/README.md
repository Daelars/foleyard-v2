# Yard Tools

Bundled Foleyard extension packages live under `packages/yard-tools/*`.
Each tool declares a manifest, commands, permissions, and settings against
`yard-core` contracts and runs in-process through the guarded extension host.

## Catalog

| Package | Extension id | Commands | Docs |
| --- | --- | --- | --- |
| `sound-shelf-v2` (`@foleyard/sound-shelf-v2`) | `sound-shelf-v2` | 4 — shelf add/remove/clear/list | `docs/extensions-v2.md`, `docs/commands.md` |
| `folder-janitor-v2` (`@foleyard/folder-janitor-v2`) | `folder-janitor-v2` | 4 — scan library/folder, remove files, delete folders | `docs/extensions-v2.md`, `docs/commands.md` |
| `smart-collections-v2` (`@foleyard/smart-collections-v2`) | `smart-collections-v2` | 1 — save search | `docs/extensions-v2.md`, `docs/collections.md` |
| `make-pack-v2` (`@foleyard/make-pack-v2`) | `make-pack-v2` | 3 — pack from selection/shelf/recent | `docs/extensions-v2.md`, `docs/commands.md` |
| `drop-rules-v2` (`@foleyard/drop-rules-v2`) | `drop-rules-v2` | 4 — configure/preview/apply/prepare-drag | `docs/extensions-v2.md`, `docs/filesystem.md` |
| `library-gatherer-v2` (`@foleyard/library-gatherer-v2`) | `library-gatherer-v2` | 2 — preview/gather | `docs/extensions-v2.md`, `docs/commands.md` |
| `auto-tag-v2` (`@foleyard/auto-tag-v2`) | `auto-tag-v2` | 2 — preview/tag-files plus find-similar | `docs/extensions-v2.md` |

All six v1 tools (Sound Shelf, Folder Janitor, Smart Collections, Make
Pack, Drop Rules, Library Gatherer) retired to these v2 ports; see
`docs/extensions-v2-migration.md` for the retirement mechanics and each
port's package README for parity.

Layout per v2 package: `src/{definition,handlers,policy,index}.ts`
(plus package tests), versioned by its own `package.json`. There is no
external discovery or loading — these seven are the complete set.

## Further reading

- `docs/extensions.md` — retired v1 shape
- `docs/commands.md` — the retired-command table and execution model
- `docs/architecture/extensions.md` — registration → transport → host → UI trace
- `docs/architecture/yard-core.md` — contracts these tools build against
