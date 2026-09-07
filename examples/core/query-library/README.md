# Query-library example

Disposable in-memory SQLite demo of the library query contracts (filter +
sort). Inserts 3 fixture rows, runs a filename `LIKE` query with ordering,
prints rows, and closes the database.

## Prerequisites

- `bun` (runs TypeScript natively).
- Native module: `better-sqlite3` must be installed (`bun install`).
  The native binding is required; without it this example cannot run.

## App-internal adapter dependency (explicit label)

This example uses **direct SQL** against a minimal `files` table rather than
importing the app-internal adapter `SqliteAudioFileRepository`
(`src/lib/database/file-repository.ts`, Drizzle + app schema). The SQL here
matches the app's query contracts (filename `LIKE` filter, `ORDER BY`
filename) without depending on app internals.

## Invocation

```bash
bun run example:query-library
# or directly
bun examples/core/query-library/run.ts
```

Note: on platforms where Bun cannot load the `better-sqlite3` native module
(Bun on Windows reports `ERR_DLOPEN_FAILED`), the same file runs under Node
22.6+ (which strips types natively):

```bash
node examples/core/query-library/run.ts
```

## Expected output

- Inserts 3 fixture rows (`kick.wav`, `snare.wav`, `kick-loop.wav`).
- `LIKE '%kick%'` ordered ascending returns `kick-loop.wav`, `kick.wav`.
- Full listing ordered descending returns `snare.wav`, `kick.wav`,
  `kick-loop.wav`.
- Prints both result sets; exits non-zero on any assertion mismatch.

## See also

- `docs/database.md` — SQLite storage, schema ownership, repositories.
- `docs/search.md` — search/filter query contracts.
- `docs/library.md` — library model this query reads from.
