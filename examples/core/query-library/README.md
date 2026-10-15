# Query-library example

Disposable in-memory SQLite demo of the library query contracts (filter +
sort). Inserts 3 fixture rows, runs a filename `LIKE` query with ordering,
prints rows, and closes the database.

## Prerequisites

- `node` 22.6+ (runs TypeScript by stripping types natively; this is the
  runtime declared for the example in `examples/manifest.json`).
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
node examples/core/query-library/run.ts
# or through the package.json script (runs the same Node entry point)
bun run example:query-library
```

This example loads the native `better-sqlite3` module, which Bun cannot
dlopen on Windows (`ERR_DLOPEN_FAILED`), so Node is the supported runtime
on the primary development platform. `node scripts/run-examples.cjs` and CI
read the runtime from `examples/manifest.json`, the single example
declaration.

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
