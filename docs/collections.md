# Collections

> Feature status: shipped
> Contract: internal
> Owner: `src/lib/database/collection-repository.ts` + `src/app/library/use-collections.ts`
> Applies to: docs manifest ID (`collections`); development checkout when unbuilt

## What it does

Organizes Audio files into named Collections (regular with explicit
membership, smart with saved filter criteria), plus tags, favorites, and
the Sound Shelf — a bundled extension surface distinct from Collections.

## Responsibilities and boundaries

- Regular Collection: explicit `fileCollections` membership rows managed
  by the user. Smart Collection: a saved `{ q }` filter
  (`extractSmartQuery` in `src/lib/smart-collection-filter.ts`) evaluated
  at read time; conversion between them is unchunked and non-atomic
  (finding B09).
- Tags are named labels on files (`fileTags`); favorites are a boolean on
  the file row (`isFavorite`, toggled via `toggleFavorite`/`setFavorites`).
- Sound Shelf is a bundled yard-tools extension (`packages/yard-tools/sound-shelf/`,
  `src/lib/extensions/sound-shelf-store.ts`), not a Collection type: it
  stages working sets with its own store and events. Do not conflate them.
- Collection terminology throughout; "playlist" is avoided per domain language.

## Runtime behavior

`POST/GET /api/collections` and `GET /api/tags` serve the organization
surface (`src/app/api/collections/route.ts`, `src/app/api/tags/route.ts`).
Persistence lives in `src/lib/database/collection-repository.ts` and
`src/lib/database/tag-repository.ts`, implementing the `yard-core`
`CollectionRepository` / `TagRepository` contracts
(`packages/yard-core/src/repositories/*`, services in
`packages/yard-core/src/services/organization/*`). Client state is held in
`src/app/library/use-collections.ts` (Collections), `src/app/library/use-tags.ts`
(tags), `src/app/library/use-favorites.ts` (favorites),
`src/app/library/use-library-organization.ts` (combined organizing surface),
and `src/app/library/use-shelf.ts` (Sound Shelf). Smart counts are derived
in `src/app/library/smart-collection-counts.ts`; bulk operations in
`src/app/library/use-bulk-actions.ts`. The bundled smart-collections tool
(`packages/yard-tools/smart-collections/`) assists criteria workflows.

## Contracts

- Internal repository contracts: `CollectionRepository`, `TagRepository`,
  `FavoriteRepository` in `packages/yard-core/src/repositories/*`;
  organization services (`collection-service`, `tag-service`,
  `favorite-service`) in `packages/yard-core/src/services/organization/*`.
- Smart filter JSON: `{ q?: string }`; invalid JSON or blank `q` yields null
  (no filter). No public/stable API beyond the app routes.

## Failure behavior and limitations

- B03 (expected-to-fail, #137): collection-branch counts disagree with
  the file list — smart/Collection counts are untrusted.
- B09 (expected-to-fail, #137): smart conversion is unchunked and
  non-atomic — large conversions can partially apply.
- B02 (expected-to-fail, #136): distinct recordings can inherit tags.
- B04 (expected-to-fail, #140): a late tag failure can erase a newer edit.
- Deleting a Collection removes membership rows, never audio files (file
  deletion is a separate destructive path — see `docs/filesystem.md`).

## Source map (real file paths)

- `src/lib/database/collection-repository.ts` — Collection persistence
- `src/lib/database/tag-repository.ts` — tag persistence
- `src/app/api/collections/route.ts`, `src/app/api/tags/route.ts` — route surface
- `src/app/library/use-collections.ts`, `src/app/library/use-tags.ts`,
  `src/app/library/use-favorites.ts`, `src/app/library/use-library-organization.ts`,
  `src/app/library/use-bulk-actions.ts`, `src/app/library/smart-collection-counts.ts`,
  `src/app/library/use-shelf.ts` — client state
- `src/lib/smart-collection-filter.ts` — `extractSmartQuery`
- `packages/yard-core/src/repositories/collection-repository.ts`,
  `tag-repository.ts`, `favorite-repository.ts` — contracts
- `packages/yard-core/src/services/organization/*` — organization services
- `packages/yard-tools/sound-shelf/` — Sound Shelf bundled extension
- `src/lib/extensions/sound-shelf-store.ts`, `src/lib/extensions/sound-shelf-events.ts` —
  shelf store and events
- `packages/yard-tools/smart-collections/` — criteria workflow tool

## Examples

There is no `examples/` directory in this repo. The runnable-in-repository
example `extensions/selected-ids` passes selected file IDs to an extension
command against the checkout.

## Related documentation

- `docs/search.md` — predicates smart Collections reuse
- `docs/metadata.md` — Settings Metadata tab management
- `docs/library.md` — file identity underneath membership rows
- `docs/filesystem.md` — destructive file deletion vs Collection removal
