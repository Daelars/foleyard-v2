# Database

> Feature status: shipped
> Contract: internal
> Owner: `src/lib/database/migrations.ts` + `src/lib/database/connection.ts`
> Applies to: docs manifest ID (`database`); development checkout when unbuilt

## What it does

A single SQLite file (better-sqlite3 + Drizzle) stores the library index,
organization data, and settings. Schema is created and evolved by hand-rolled
SQL in `src/lib/database/migrations.ts`; there is no drizzle-kit workflow
(the config would point at a nonexistent `./foleyard.db`, so it stays
unwired by design). `CURRENT_SCHEMA_VERSION = 1` with a `schema_migrations`
ledger records what was applied.

There is no remote database, no public data SDK, and no external provider.

## Responsibilities and boundaries

- `src/lib/schema.ts` declares Drizzle tables; `migrations.ts` owns the
  actual DDL (`initializeDatabaseSchema`), idempotent column backfills
  (`ensureColumn`), index creation, and library-root backfill.
- `src/lib/database/connection.ts` owns pragmas and lazy connection setup.
- `src/lib/database-path.ts` owns path resolution and legacy import.
- Repositories under `src/lib/database/*` own queries; routes and extension
  services consume them. Extensions never touch SQLite directly.

## Runtime behavior

Tables in `src/lib/schema.ts` (mirrored by DDL in `migrations.ts`):

| Table | Purpose |
| --- | --- |
| `settings` | key/value store (library roots, onboarding, extension flags/values) |
| `files` | indexed audio files + scan metadata, favorites, `removed_at` |
| `tags` / `file_tags` | tags and file membership |
| `collections` / `file_collections` | regular + smart Collections and membership |

Connections set `busy_timeout = 5000`, `journal_mode = WAL`, and
`foreign_keys = ON`. `db`/`sqlite` are lazy proxies: the first use resolves
the path, ensures desktop initialization, and runs
`initializeDatabaseSchema`. Migration applies `CREATE TABLE IF NOT EXISTS`
plus `ensureColumn` backfills (`mtime_ms`, `removed_at`, `last_scanned_at`,
`directory`, `library_root`, `codec`, `is_smart`, `filter`, `color`), creates
indexes, backfills `library_root` ownership from configured roots, then
records version 1 in `schema_migrations`.

Baseline behavior: pre-ledger databases are upgraded in place and baselined
to `CURRENT_SCHEMA_VERSION` without data loss; version recording is wrapped
in a transaction and treated as diagnostic (schema application failure is
what would throw, not ledger writes).

v2 rows reuse this table with no new migration: `extension:*:setting:*`
(authored settings), `v2state:<id>` (versioned workflow envelopes),
`v2:approvals` (explicit permission approvals), `v2:jobs:snapshot`
(newest-50 job history). The runtime snapshot reads the flags and
approvals rows through a short-lived read-only handle only when the
file exists; it never migrates (see `docs/runtime.md`).

Database paths (`src/lib/database-path.ts`):

| Mode | Path |
| --- | --- |
| Web/dev | `<cwd>/foleyard.sqlite` |
| Desktop (`FOLEYARD_DESKTOP=1`) | `%APPDATA%/Foleyard/foleyard.sqlite` |
| Legacy import (once, copy) | `soundslop.sqlite`, `%APPDATA%/SoundSlop/*` |

## Contracts

- Internal: `CURRENT_SCHEMA_VERSION = 1`; `schema_migrations(version,
  applied_at)` ledger; `DatabaseVersionInfo { state, migration,
  appliedVersion? }`.
- `getDatabaseVersionInfo(sqlite?)` is a read-only probe: with no handle it
  reports `not-initialized`; with a handle it reports `ready` +
  `unversioned` (no ledger) or `versioned` + `appliedVersion`. It never
  initializes or migrates.
- SQLite's `PRAGMA user_version` is not used as an app version and is never
  read or written by this module. Do not relabel that internal cookie as a
  migration version.

## Failure behavior and limitations

- Probe failures (unreadable ledger, bad handle) report `unavailable` rather
  than throwing, so identity endpoints stay up when the DB is down.
- `ensureDesktopDatabaseInitialized` copies a legacy/project database only
  when the target does not exist; it never merges or overwrites.
- WAL files (`foleyard.sqlite-wal`/`-shm`) are normal operation artifacts,
  not corruption. Foreign-key enforcement is on: deleting referenced rows
  without clearing join rows fails instead of orphaning.
- No concurrent-writer or multi-process story beyond SQLite + WAL defaults;
  long scans hold the single in-process connection.

## Source map (real file paths)

- `src/lib/schema.ts` — Drizzle table declarations
- `src/lib/database/migrations.ts` — DDL, `CURRENT_SCHEMA_VERSION`,
  `getDatabaseVersionInfo`, `initializeDatabaseSchema`
- `src/lib/database/connection.ts` — pragmas, lazy `db`/`sqlite` proxies
- `src/lib/database-path.ts` — web/desktop/legacy path resolution
- `electron/main/database.cjs` — packaged desktop DB ensure/reset
- `src/lib/runtime-info.ts` — surfaces the version probe in snapshots

## Examples

Probe without side effects:

```ts
import { getDatabaseVersionInfo } from "@/lib/database/migrations";
getDatabaseVersionInfo(); // { state: "not-initialized", migration: "unversioned" }
getDatabaseVersionInfo(sqlite); // { state: "ready", migration: "versioned", appliedVersion: 1 }
```

Check the ledger directly:

```sql
SELECT version, applied_at FROM schema_migrations ORDER BY version DESC LIMIT 1;
```

## Related documentation

- `docs/settings.md` — what lives in the `settings` table
- `docs/runtime.md` — how the probe surfaces in `GET /api/runtime`
- `docs/architecture/application.md` — server adapters over repositories
- `docs/architecture/desktop.md` — packaged desktop database handling
