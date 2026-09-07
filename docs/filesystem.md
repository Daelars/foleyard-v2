# Filesystem

> Feature status: shipped (Drop Rules grant bypass fix shipped)
> Contract: internal
> Owner: `src/lib/filesystem-boundary.ts`
> Applies to: docs manifest ID (`filesystem`); development checkout when unbuilt

## What it does

Confines every filesystem touch to configured Library roots (reads) and
explicit session grants (writes): root resolution, readable/writable path
checks, destination grant scoping, permanent deletion, and drag-staging
rules. The design authority is `docs/adr/filesystem-access.md`.

## Responsibilities and boundaries

- Library reads resolve canonical paths under Library roots via
  `resolveExistingPathWithinRoots` (realpath both sides, `path.relative`
  containment, junction escapes rejected).
- Extension/tool output paths resolve against session grants
  (`registerGrant` → opaque token; `resolveWritablePath` walks existing
  ancestors before appending new segments). Grants expire on restart.
- The folder-grant endpoint additionally authenticates the desktop process
  with a startup-shared secret; the app otherwise keeps its
  unauthenticated loopback-server trust model. Checks are not atomic
  against another local process swapping directories between validation
  and use.
- No external storage providers or public SDK: all paths are local.

## Runtime behavior

Readable: `resolveReadablePath` (alias of `resolveExistingPathWithinRoots`)
gates `/api/audio`, `/api/waveform`, and permanent-delete prechecks
against `getLibraryRoots()`. Writable: `resolveWritablePath(candidate,
grantToken)` rejects unknown tokens, then resolves every existing
ancestor before accepting new output segments. `POST /api/desktop/grants`
issues grants via the desktop picker; Gatherer and Make Pack destinations
must present the token. Drop Rules stages drag copies in owned directories
under its configured staging directory and removes owned stages older
than 24 h (user directories and directory links excluded). Desktop reveal
uses server grants. Permanent deletion (`deleteFiles` with
`permanent: true`) unlinks without the recycle bin and requires an indexed
file inside a Library root; Janitor folder deletion rechecks containment
and emptiness immediately before removing the folder.

## v2 grants and operation services beside it

v2 reuses the same grant shape through its own storage
(`src/lib/extensions-v2/filesystem.ts`, `V2GrantStore` in core):
`POST /api/extensions-v2/grants` bridges a renderer-picked folder
into a per-extension grant ID; handlers consume the ID, never the
token. Readable Library roots and writable destination grants stay
distinct; missing, expired, or foreign grants deny. Operation
services authorize the actual call, including derived output and
temporary paths, and job-owned cleanup removes only the current
job's resources. The B12 manifest-sidecar class is fixed in v2 by
construction (the manifest travels as an in-memory archive entry,
never a predictable dot-tmp file); the expected-to-fail entry below
still describes the v1 path only.

## Contracts

- Internal: `resolveExistingPathWithinRoots`, `resolveReadablePath`,
  `registerGrant`, `resolveWritablePath` in
  `src/lib/filesystem-boundary.ts`. Grant tokens are opaque, single-app,
  in-memory session secrets — not persisted, not shareable across restarts.

## Failure behavior and limitations

- Destructive outcomes: permanent delete unlinks files without the
  recycle bin — unrecoverable except from backup. Soft removal
  (`removedAt`) is the default; only explicit permanent delete unlinks.
- Drop Rules "apply now" requires a grant (bypass fixed): a write with no
  writable path is rejected via `resolveDropRuleCommand` (finding E04
  tracked the defect class, #135; transport-level fix shipped, direct-service
  E04 case remains expected-to-fail).
- Host-enforced service permissions shipped (`guardHostServices` in
  `extension-host.ts`): unpermitted `files.markRemoved`/collection/tag/
  favorite mutations and `resolveWritablePath` deny with permission-denied
  even when the extension omits `require()` (transport E01 fixed and removed
  from the ledger). Direct-service E01 reachability without the host
  (finding E01, #135) remains expected-to-fail; bundled code is trusted and
  not sandboxed against direct Node imports.
- Export can delete a manifest sidecar (finding B12, expected-to-fail, #136).
- Time-of-check/time-of-use: validation and use are separate steps; a
  hostile local process can replace directories between them.

## Source map (real file paths)

- `src/lib/filesystem-boundary.ts` — grants, readable/writable resolution
- `src/lib/files/delete-files.ts` — soft removal + permanent unlink
- `src/app/api/desktop/grants/route.ts` — grant issuance
- `src/app/api/desktop/file/route.ts`, `src/app/api/desktop/path/route.ts` —
  desktop file/path surface
- `src/app/api/directories/route.ts` — directory browsing
- `src/lib/directory-navigation.ts` — navigation helpers
- `packages/yard-tools/drop-rules/` — Drop Rules staging + apply-now grant flow
- `packages/yard-tools/folder-janitor/` — Janitor deletion rechecks
- `packages/yard-tools/library-gatherer/`, `packages/yard-tools/make-pack/` —
  grant-scoped destinations
- `docs/adr/filesystem-access.md` — design authority for this guide

## Examples

The runnable-in-repository examples are `extensions/selected-ids`,
`core/query-library`, and `extensions-v2/minimal`. Grant flows are
otherwise exercised through the desktop picker and the routes above
in a development checkout.

## Related documentation

- `docs/adr/filesystem-access.md` — ADR this guide implements
- `docs/library.md` — roots and removal semantics
- `docs/scanning.md` — root validation and discovery
- `docs/development.md` — expected-failures ledger (E04, E01, B12 classes)
