# Extension v2 permissions and trust

Date: 2026-09-06. Status: accepted. Context: implementation prompt, R3.

## Decision

Permissions are explicit and deny-by-default. Effective permissions are the intersection of the extension's declarations and an explicit application policy or persisted approval, and the same set drives the operation context and the catalog. Permissions are never inferred from method names, and requested permissions are never auto-granted.

Read permissions are enforced alongside mutations. The authorized operation is the actual operation, including derived output and temporary paths. Library roots (readable) and destination grants (writable) stay distinct. Missing, expired, foreign, or insufficient grants are denied. Grant tokens and desktop secrets never appear in definitions, logs, exports, or persisted state.

## Consequences

- Filesystem ADR protections (canonical path, traversal, junction/symlink, existing-ancestor, root containment) apply to v2 operation services. Validation-to-use races are documented honestly, not claimed away.
- Output creation and cleanup touch only resources the current job owns.
- Build rules plus guarded services cover trusted bundled code only. Future isolation of untrusted code needs its own ADR and tests.
