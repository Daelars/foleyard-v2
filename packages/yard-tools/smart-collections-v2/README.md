# Smart Collections v2

Port of the Smart Collections tool onto the v2 extension engine (C3,
issue #178). Displayed as **Smart Collections v2**. Bundled internal
port, disabled by default, explicit enable/disable, own settings
namespace (`smart-collections-v2.*`), no auto-migration from v1. The v1
Smart Collections keeps its routes and behavior untouched.

Save any search as a live-updating Collection: files matching the query
appear automatically.

## Layout

- `src/definition.ts` — v2 definition: id `smart-collections-v2`, one
  command (`.save-search`, global scope), no settings, three
  contributions (palette, sidebar, settings). Permissions:
  `collections:read`, `collections:write`, `library:read` (matching
  v1). No `requiredCapabilities`: the app host exposes no capabilities.
- `src/handlers.ts` — the save-search handler. It serializes the query
  into the v1 filter shape (`{"q": query}`) and creates the Collection
  through the v2 collections op (E1 #176). No v1 imports, no repository
  access, and no filter evaluation — query validity is the app filter
  service's job.

## Run-mode contract

`save-search` settles immediately (`immediate` outcome). Creating a
smart Collection is a low-risk, reversible mutation (delete the
Collection to undo), so no plan/grant/job machinery is involved.

## Policies

- **Query validation, never a silent empty Collection.** The
  application collections adapter validates the query against the
  app-owned filter service (`extractSmartQuery`). An invalid query
  fails with a reason (`input-invalid`); the Collection is never
  created. The handler defers entirely to the port — it never guesses
  whether a query matches.
- **Filter shape.** The stored filter is JSON `{"q": <query>}`,
  identical to v1, so a v2-saved Collection reads the same as a v1 one
  through the shared filter service.
- **Input guards.** A blank name or blank query is rejected before the
  op is touched; the name is capped at 120 characters (the core op
  bound).
- **Persist before notify.** The op persists the Collection first and
  the adapter emits `contributions-changed` afterwards, so the sidebar
  re-reads and shows the new Collection.
- **Permissions first.** `collections:write` (plus `library:read`) is
  required; an unauthorized handler stays confined.

## Before/after parity

| v1 workflow | v2 behavior | Notes |
| --- | --- | --- |
| Save Search as Smart Collection | Same, via `save-search` | Input `{ name, query }`; stored filter `{"q": query}` (identical to v1) |
| Filter storage | Same JSON shape | Shared with v1 through the app filter service |
| Query validation | Explicit, with a reason | v1 stored any string; v2 rejects a query the search box would not accept, never a silent empty Collection |
| Invalid input | Rejected with a reason | Blank name/query rejected before the write |
| Permissions | `collections:read/write`, `library:read` | Matches v1; enforced first |
| Contributions | sidebar + settings (v1 surfaces) plus palette | Resolved through the generic v2 contribution points |
| Result shape | `{ collectionId, name, query }` | Validated against the command result schema |
| `collections.write` capability | Permission-only | Matches the make-pack-v2 precedent; the app host exposes no capabilities |

Explicitly unsupported: `update-search` as a command (v1 exposed only
`save-search` as a command too), advanced filter shapes beyond the
shared `{ q }` query, and silent v1→v2 migration (existing v1
Collections are untouched and still work through the shared filter
service).

## Use it

1. Settings → Extensions → **Smart Collections v2** → enable.
2. Approve the declared permissions.
3. Run a search, then Save Search (v2) from the sidebar or palette,
   name it, and confirm. The Collection appears and updates live.
