## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues for `Daelars/foleyard-v2`. See `docs/agents/issue-tracker.md`.

### Triage labels

The repo uses the default Matt Pocock triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This repo uses a multi-context layout for the app, desktop runtime, core, and tools. See `docs/agents/domain.md`.

## Documentation and runtime facts

Start with `docs/index.md` for current documentation and `CONTEXT-MAP.md`
for domain owners. Follow the existing context/ADR rules in
`docs/agents/domain.md` before changing a subsystem.

Read the relevant guide and follow its source map:

- Library/indexing: `docs/library.md` and `docs/scanning.md`.
- Search and saved criteria: `docs/search.md` and `docs/collections.md`.
- Metadata: `docs/metadata.md`; playback/waveforms: `docs/playback.md`.
- Database and migrations: `docs/database.md`.
- Filesystem operations: `docs/filesystem.md` and
  `docs/adr/filesystem-access.md`.
- Electron/IPC: `docs/architecture/desktop.md`.
- Application/HTTP boundaries: `docs/architecture/application.md`.
- Core contracts: `docs/architecture/yard-core.md`.
- Bundled extensions: `docs/extensions.md` and
  `docs/architecture/extensions.md`.
- Commands/events/settings: `docs/commands.md`, `docs/events.md`,
  and `docs/settings.md`.
- Runtime identity, capability availability and installed docs:
  `docs/runtime.md`.
- Setup, tests and release: `docs/development.md` and `RELEASE.md`.

Runnable examples live in `examples/`; their READMEs state prerequisites
and commands. Prototype routes and dated audit handoffs describe experiments
or historical findings, not the installed product's supported behavior.

For questions about a running installation, inspect runtime information and
the matching documentation manifest as described in `docs/runtime.md`.
Do not infer installed capabilities from this checkout's package version,
manifest declarations or proposed documents. Report unavailable runtime
information as unknown. Source code wins when documentation disagrees;
record the contradiction before relying on that document.
