# Extension v2 dependency direction

Date: 2026-09-06. Status: accepted. Context: implementation prompt, R1-R3, R10.

## Decision

Allowed direction: extension package → v2 API (`yard-core` v2 surface) → v2 host → operation services → application repositories and desktop adapters. Framework and storage adapters sit outside the author-facing API.

Extensions must not depend on React, Next routes, Electron, database handles, application internals, raw filesystem/process/network access, privileged implementation modules, or any v1 extension module. The rule is enforced in CI by an import check over v2 package sources, including transitive runtime dependencies.

## Consequences

- Reuse stays on stable non-extension facilities: Yard Core domain records, Library repository contracts, database infrastructure, filesystem authorization, native picker/grant infrastructure, design-system components, pure utilities.
- Archive encoding and output I/O live behind the authorized application service; the reference extension never imports the v1 ZIP service.
- The check fails the build on violation. Trusted bundled code is still not a sandbox against hostile JavaScript; no isolation is claimed.
