# Yard Core

Yard Core defines the stable language and behavior shared by the Foleyard Application and Yard Tools.

## Language

**Library**:
The user's indexed set of local audio files and their organization data.

**Library root**:
A local directory selected as a source for the Library.
_Avoid_: Library folder

**Audio file**:
An indexed sound recording that can be browsed, searched, previewed, and organized.
_Avoid_: Track, sound item

**Scan**:
The process that reconciles Audio files under the Library roots with the Library index.

**Tag**:
A named label attached to an Audio file for organization and search.

**Collection**:
A named organization of Audio files. A regular Collection has explicit membership, while a Smart Collection derives membership from saved criteria.
_Avoid_: Playlist

## Stable surface

Yard Tools build against yard-core's contracts, not its storage. The
contracts are interfaces; the SQLite repositories in the app implement them
(`src/lib/db.ts` wires the implementations, `ScanRunner` implements
`ScannerService`), and the integration suite pins their behavior
(`database-correctness`, `scanner`, `extension-host-transport`,
`yard-core-services`).

**Intended API — keep and test**: `repositories/*` (implemented by the
SQLite repositories), `services/library/*` (settings shape, scan status),
`services/organization/*` (collections, tags, favorites), the
`normalizeDirectoryPath` utility in `services/search/filter-service.ts`
(used by the browse and file queries), and everything under `extensions/`,
`domain/`, `errors/`, and `async/`.

**Superseded — deleted in #130 with reasoning**: `services/commands/`
(`CommandRegistry`/`CommandDefinition`) predates `YardCommandRegistry`,
which is what the host actually constructs per execution; nothing ever
instantiated it. The `matchesDirectory` export had no callers while its
sibling `normalizeDirectoryPath` carries the browse path.
