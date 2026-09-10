# Promote the Variant I surface to the root workspace

The workspace surface was rebuilt component-for-component with the Variant I
component library (`src/components/variant-i/`) and verified against the
previous app with real library data, a live desktop session, and
fixed-viewport visual evidence (the coverage record is archived in the
`Daelars/foleyard-archive` checkout).
The rebuilt surface now serves `/` from `src/app/(variant-i)/page.tsx`, with
route-local presentation adapters in `src/app/(variant-i)/components/` and
the library stylesheet owned by `src/components/variant-i/styles.css`.

The previous workspace and its component tree were deleted after the
comparison window; the promoted surface is the only product surface.

Consequences:

- Variant I is the canonical component language. New work targets the root
  surface and the library.
- Theme lint and the component rules apply to the promoted files.
- The component-library prototype remains as a reference specimen under
  `src/app/prototype/**`, dev-only and excluded from packaged builds.
