> **Historical document — dated evidence, not current instructions.** See `docs/index.md` for current guides.

# Revisions review record

All work stays on `revisions`. Do not merge into main before user review.

The user chose #118 over conflicting #95: retain and split the dot-matrix engine.

Existing user edits to audit documents and prototype routes are preserved separately.

| Ticket | Work | Status |
| --- | --- | --- |
| #76 | [C1] Fix production build type errors | Already committed on baseline; typecheck, lint and unit suite verified; build pending |
| #77 | [L16] Fix lint error so eslint is green | Already committed on baseline; typecheck, lint and unit suite verified; build pending |
| #78 | [H10] Track architecture docs in git | Already committed on baseline; typecheck, lint and unit suite verified; build pending |
| #79 | [C2] Add CI workflow on push/PR | Already committed on baseline; typecheck, lint and unit suite verified; build pending |
| #80 | [Spec] Filesystem access boundary and grant flow (R4+H1) | Implementation in progress; boundary route tests pass |
| #81 | [Spec] Extract data layer from Library workspace view (R2) | Pending |
| #82 | [Spec] Data-driven extension registration (R1+M10) | Pending |
| #83 | [Spec] Single peak-generation pipeline (H8+M7+M8+M9) | Pending |
| #84 | [H5] Fix Janitor folder-scan truncation | Implemented; 501-file regression passes |
| #85 | [H3,H4,L10] Scan metadata reliability | Pending |
| #86 | [M6,M18] Honest errors from mutation routes | Pending |
| #87 | [M12] Postinstall integrity | Pending |
| #88 | [H2] Single SQLite connection | Pending |
| #89 | [H6] Janitor scan concurrency | Pending |
| #90 | [H7] Batch mutation endpoints | Pending |
| #91 | [H9,L11] Targeted refetch and smart-collection counts | Pending |
| #92 | [M1,M2,M15,M16,M17] Query-layer correctness | Pending |
| #93 | [M5,L13] Server-side sort and atomic library-root writes | Pending |
| #94 | [M3,M4,L15] File-table render fixes | Pending |
| #95 | [R3,L8] Collapse the dot-matrix engine | Superseded by user choice of #118 |
| #96 | [L1-L4] Dead-code deletion sweep | Pending |
| #97 | [M13] Prototype routes out of the build | Pending |
| #98 | [L5,L6,L7] Dependency and config cleanup | Pending |
| #99 | [M11,M14,L9] Electron main-process hardening | Pending |
| #100 | Extract shared API helpers and format module | Pending |
| #101 | Extract shared extension KV helper | Implemented and committed; automated checks pass |
| #102 | Merge yard-core extension vocabulary | Implemented and committed; automated checks pass |
| #103 | Move domain types to owners | Pending |
| #104 | Split audio-file repository by responsibility | Implemented and committed; automated checks pass |
| #105 | Split scan runner into phases | Pending |
| #106 | Extract API delete worker; simplify browse and registry | Pending |
| #107 | Extract library view, data, and selection hooks | Pending |
| #108 | Extract collections, tags, favorites, shelf, and bulk hooks | Pending |
| #109 | Extract remaining route hooks; thin home shell | Pending |
| #110 | Split settings shell, types, and library tab | Pending |
| #111 | Extract settings metadata tab | Pending |
| #112 | Extract extensions, appearance, and shortcuts tabs | Pending |
| #113 | Extract drop-rules settings panel | Pending |
| #114 | Split organize view into sections | Pending |
| #115 | Extract file-row menu, shelf toggle, and navigation helper | Pending |
| #116 | Split audio playback hook | Pending |
| #117 | Split extension dialogs into view plus hook | Pending |
| #118 | Split dot-matrix math from renderer | Implemented and committed; visual verification pending |
| #119 | Contract pass: merges, deletions, boundaries, verification | Pending |
