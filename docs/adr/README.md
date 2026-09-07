# Architecture Decision Records

System-wide decisions live here. Context-specific decisions live under `<context>/docs/adr/`.

## Index

- [Filesystem access](filesystem-access.md) — Library-root and grant-scoped file authorization boundary.
- [Extension v2 coexistence](extension-v2-coexistence.md) — v2 ships beside v1; no facade, no silent routing.
- [Extension v2 dependency direction](extension-v2-dependency-direction.md) — allowed direction and CI import enforcement.
- [Extension v2 permissions and trust](extension-v2-permissions-trust.md) — deny-by-default, grant handling, no isolation claim.
- [Extension v2 jobs, recovery, and state versions](extension-v2-jobs-recovery.md) — host-owned jobs, restart, namespaced settings/state.
