# Search

> Feature status: shipped (with known defect B03 tracked as expected-to-fail)
> Contract: internal
> Owner: `src/app/api/files/route.ts` + `src/lib/database/files/reads.ts`
> Applies to: docs manifest ID (`search`); development checkout when unbuilt

## What it does

Searches the local Library index by filename substring with pagination
and filename/duration sort. All reads go through Drizzle; there is no
full-text index and no semantic/vector search.

## Responsibilities and boundaries

- Filename-substring search only (`LIKE` with escaping). No FTS table,
  no trigram index, no semantic ranking, no external search provider.
- The search endpoint doubles as the browse endpoint: favorites,
  Collection, tag, directory, and library-root filters compose with the
  query rather than living on a separate route.
- Collection terminology throughout; smart Collections reuse the same
  substring predicate client-side (see `docs/collections.md`).

## Runtime behavior

`GET /api/files` accepts `q`, `favorites=true`, `collectionId`, `tagId`,
`directory`, `libraryRoot`, `atLibraryRoot=true`, `showRemoved=true`,
`sortKey=filename|duration`, `sortDir=asc|desc`, `limit` (1–`MAX_PAGE_SIZE`,
default `DEFAULT_PAGE_SIZE`), `offset` (default 0); see
`src/lib/api/pagination.ts` and `src/app/api/files/route.ts`.
Reads build Drizzle filters in `src/lib/database/files/reads.ts`:
`removedAt IS NULL` unless `showRemoved`, favorite equality, library-root
equality (+ `directory IS NULL` when `atLibraryRoot`), tag membership via
`fileTags` subselect, directory normalization via
`normalizeDirectoryPath` (`yard-core` filter-service), and
`filenameLike(query)` from `src/lib/database/sql-parameters.ts` with
`LIKE` wildcard escaping. Collection-branch queries join
`fileCollections` (`buildCollectionFilters`); the file-list branch uses
`buildFileFilters`. Sorting and limit/offset apply after filtering; the
route also returns the matching count (`getFileCount`) for pagination UI.

## Contracts

- Internal GET query contract above; invalid `limit`/`offset` → 400,
  invalid `sortKey`/`sortDir` → 400 (`src/lib/api/errors.ts`
  `errorResponse`). `FileSearchQuery` type in `packages/yard-core`
  (`domain/search.ts` + file repository context).

## Failure behavior and limitations

- B03 (expected-to-fail, #137): the collection-branch count disagrees
  with the main file list — Collection-filtered counts are untrusted.
- No FTS or semantic matching: `q=horn` matches filenames containing
  "horn" only; metadata fields (codec, duration) and tag names are not
  substring-searched by `q`.
- Stale pagination can unlock a duplicate request (finding B11,
  expected-to-fail, #140): an old page response releases a newer
  request's lock in `use-library-files.ts`.

## Source map (real file paths)

- `src/app/api/files/route.ts` — query parsing, validation, GET/DELETE surface
- `src/lib/database/files/reads.ts` — Drizzle filters, collection vs file branches
- `src/lib/database/sql-parameters.ts` — `filenameLike` escaping,
  `chunkArray`, `SQLITE_MAX_VARIABLES`
- `src/lib/database/files/context.ts` — repository context
- `src/lib/api/pagination.ts`, `src/lib/api/errors.ts`, `src/lib/api/body.ts` —
  paging helpers and error surface
- `packages/yard-core/src/domain/search.ts` — search domain language
- `packages/yard-core/src/services/search/filter-service.ts` — `normalizeDirectoryPath`
- `src/app/library/file-query.ts`, `src/app/library/use-library-files.ts` — client query

## Examples

There is no `examples/` directory in this repo. The runnable-in-repository
example `core/query-library` exercises a library query against the checkout.

## Related documentation

- `docs/library.md` — browsing and removal over the same index
- `docs/collections.md` — Collection/tag filters and smart-query reuse
- `docs/development.md` — expected-failures ledger (B03, B11)
