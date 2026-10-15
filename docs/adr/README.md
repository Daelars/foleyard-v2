# Architecture Decision Records

System-wide decisions live under `docs/adr/`; this repository keeps ADRs for
every context there.

## Index

- [Filesystem access](filesystem-access.md) — Library-root and grant-scoped file authorization boundary.
- [New surface promotion](new-surface-promotion.md) — the Variant I surface is the root workspace.
- [Extension v2 dependency direction](extension-v2-dependency-direction.md) — allowed direction and CI import enforcement.
- [Extension v2 permissions and trust](extension-v2-permissions-trust.md) — deny-by-default, grant handling, no isolation claim.
- [Extension v2 jobs, recovery, and state versions](extension-v2-jobs-recovery.md) — host-owned jobs, restart, namespaced settings/state.
- [Extension v2 waiting-work bounds](extension-v2-work-bounds.md) — coalesce, expire-by-TTL-then-report, reject past named caps for pending plans and job queues.
- [Extension v2 coexistence](extension-v2-coexistence.md) — superseded; v2 was built beside v1 before the retirement.
