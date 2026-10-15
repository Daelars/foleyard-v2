# Search

> Feature status: shipped (with known defect B03 tracked as expected-to-fail)
> Contract: internal
> Owner: `src/app/api/files/route.ts` + `src/lib/database/files/reads.ts`
> Applies to: docs manifest ID (`search`); development checkout when unbuilt

## What it does

Searches the local Library index by filename substring with pagination
and filename/duration sort. Filename matching runs through an FTS5
trigram index maintained over the `files` table (#251), so search and
smart-collection counts do not scan the Library; there is no semantic or
vector search in this path.

## Responsibilities and boundaries

- Filename-substring search only. The FTS5 trigram index (`files_fts`,
  external content over `files`) answers matches case-insensitively;
  queries shorter than three characters, non-ASCII queries and databases
  without the index fall back to `LIKE` with wildcard escaping, so
  results are identical on both paths.
- No semantic ranking in this path (embeddings power the auto-tag
  find-similar command only) and no external search provider.
- The search endpoint doubles as the browse endpoint: favorites,
  Collection, tag, directory, and library-root filters compose with the
  query rather than living on a separate route.
- Every read shares one ownership predicate: files whose root is detached
  (#271) are excluded from search, browse, counts, favorites, Collection and
  tag reads until the root is re-added (`docs/adr/library-root-detachment.md`).
- Collection terminology throughout; smart Collections reuse the same
  substring predicate client-side (see `docs/collections.md`).

## Runtime behavior

`GET /api/files` accepts `q`, `favorites=true`, `collectionId`, `tagId`,
`directory`, `libraryRoot`, `atLibraryRoot=true`, `showRemoved=true`,
`sortKey=filename|duration`, `sortDir=asc|desc`, `limit` (1–`MAX_PAGE_SIZE`,
default `DEFAULT_PAGE_SIZE`), `offset` (default 0) and the opaque `cursor`
(see cursor pagination below); see `src/lib/api/pagination.ts` and
`src/app/api/files/route.ts`.
Reads build Drizzle filters in `src/lib/database/files/reads.ts`:
`removedAt IS NULL` unless `showRemoved`, plus `detached_at IS NULL`
unconditionally (a detached root's files are never browsable, #271),
favorite equality, library-root
equality (+ `directory IS NULL` when `atLibraryRoot`), tag membership via
`fileTags` subselect, directory normalization via
`normalizeDirectoryPath` (`yard-core` filter-service), and
`filenameSearch(sqlite, query)` from
`src/lib/database/filename-search.ts`: an FTS5 `MATCH` subquery when the
trigram index is usable, otherwise `filenameLike` from
`src/lib/database/sql-parameters.ts` with `LIKE` wildcard escaping.
Collection-branch queries join
`fileCollections` (`buildCollectionFilters`); the file-list branch uses
`buildFileFilters`. Sorting and limit/offset apply after filtering; the
route also returns the matching count (`getFileCount`) for pagination UI.

### Cursor pagination

The route fetches one probe row beyond `limit`, so `hasMore` is exact when
a page lands on the boundary, and returns an opaque `nextCursor` naming
the last row in the active ordering (filename and duration, both
directions, with deterministic `filename`/`id` tiebreakers). Infinite
scroll and sweeps pass `nextCursor` back as `cursor`; the server resumes
strictly after that row with no `OFFSET` scan, so repeated refetches cannot
duplicate or skip rows. A `cursor` takes precedence over `offset`, and an
invalid cursor or one from a different ordering is a 400 rather than a
silent restart. Plain `offset` still works for existing callers. The
extension library port (`createV2LibraryPorts().listPage`) uses the same
opaque cursor contract internally; see `src/lib/database/file-cursor.ts`.

## Contracts

- Internal GET query contract above; invalid `limit`/`offset` → 400,
  invalid `sortKey`/`sortDir` → 400 (`src/lib/api/errors.ts`
  `errorResponse`). `FileSearchQuery` type in `packages/yard-core`
  (`domain/search.ts` + file repository context).

## Failure behavior and limitations

- B03 (expected-to-fail, #137): the collection-branch count disagrees
  with the main file list — Collection-filtered counts are untrusted.
- No semantic matching: `q=horn` matches filenames containing "horn"
  only; metadata fields (codec, duration) and tag names are not
  substring-searched by `q`. A database without FTS5 keeps working on
  the LIKE path.
- Stale pagination can unlock a duplicate request (finding B11,
  expected-to-fail, #140): an old page response releases a newer
  request's lock in `use-library-files.ts`.

## Source map (real file paths)

- `src/app/api/files/route.ts` — query parsing, validation, GET/DELETE surface
- `src/lib/database/files/reads.ts` — Drizzle filters, collection vs file branches
- `src/lib/database/filename-search.ts` — FTS5-vs-LIKE predicate
- `src/lib/database/migrations.ts` — `files_fts` index, triggers, backfill
- `src/lib/database/sql-parameters.ts` — `filenameLike` escaping,
  `chunkArray`, `SQLITE_MAX_VARIABLES`
- `src/lib/database/files/context.ts` — repository context
- `src/lib/api/pagination.ts`, `src/lib/api/errors.ts`, `src/lib/api/body.ts` —
  paging helpers and error surface
- `packages/yard-core/src/domain/search.ts` — search domain language
- `packages/yard-core/src/services/search/filter-service.ts` — `normalizeDirectoryPath`
- `src/app/library/file-query.ts`, `src/app/library/use-library-files.ts` — client query

## Examples

The runnable-in-repository example `core/query-library` exercises a
library query against the checkout.

## Related documentation

- `docs/library.md` — browsing and removal over the same index
- `docs/collections.md` — Collection/tag filters and smart-query reuse
- `docs/development.md` — expected-failures ledger (B03, B11)
