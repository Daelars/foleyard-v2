# Extension v2 coexistence with v1

Date: 2026-09-06. Status: **superseded** (2026-09-10).

Superseded by the v1 retirement: the v1 packages, routes, commands,
settings and events were deleted (PRs #220–#222), and the retirement
record in `docs/extensions-v2-migration.md` now owns the semantics. The
decision below is kept as history and no longer describes the product.

## Decision

v2 ships beside v1. The six packages under `packages/yard-tools/*` keep their v1 contracts, routes, settings formats, and UI behavior unchanged. v2 gets new modules, new routes, and new UI adapters. No v2 module imports v1 extension contexts, registries, handlers, transport adapters, UI-intent dispatchers, or extension services. No compatibility facade runs v1 handlers as v2.

## Consequences

- `make-pack-v2` is a separate bundled internal example (`make-pack-v2`, displayed Make Pack v2), disabled by default, with its own settings namespace. It does not replace Make Pack and does not migrate v1 settings.
- Additive application integration only. A shared facility that needs a behavioral change is isolated and its existing callers tested. v1 commands are never silently routed through v2.
- Development fixtures register through the same production adapters and never enter production catalogs or packaged builds.
- A future v1 replacement needs its own compatibility and rollback plan; this ADR does not authorize it.
