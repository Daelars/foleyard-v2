# Promote the Variant I surface to the root workspace

The workspace surface was rebuilt component-for-component with the Variant I
component library (`src/components/variant-i/`) and verified against the
previous app with real library data, a live desktop session, and
fixed-viewport visual evidence (see `docs/variant-i-app-v3-coverage.md`).
The rebuilt surface now serves `/` from `src/app/(variant-i)/page.tsx`, with
route-local presentation adapters in `src/app/(variant-i)/components/` and
the library stylesheet owned by `src/components/variant-i/styles.css`.

The previous workspace is parked under the prototype gate at
`/prototype/legacy-app` (`src/app/prototype/legacy-app/page.tsx`) for one
comparison window. It remains dev-only, resolves to not-found in packaged
builds, and is deleted with the rest of the retired component tree. The
prototype gate and packaging exclusions are unchanged.

Consequences:

- Variant I is the canonical component language. New work targets the root
  surface and the library; fixes are not double-landed on the parked page.
- Theme lint and the component rules now apply to the promoted files.
- The retired page and the old component tree remain compilable until their
  deletion ticket, so the comparison route keeps rendering during the
  window.
- Component-library and variant-i-library prototypes remain as reference
  specimens until the retirement cleanup.
