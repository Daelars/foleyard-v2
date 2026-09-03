# Context map

## Contexts

- [Application](./src/CONTEXT.md): presents and coordinates the user's sound-library workspace
- [Desktop runtime](./electron/CONTEXT.md): supplies native operating-system capabilities
- [Yard Core](./packages/yard-core/CONTEXT.md): defines the stable sound-library language and behavior
- [Yard Tools](./packages/yard-tools/CONTEXT.md): defines optional workflow extensions

## Relationships

- **Application -> Yard Core**: the application uses core domain records and operations.
- **Application -> Desktop runtime**: the application requests native actions when running as the desktop app.
- **Application -> Yard Tools**: the application hosts optional extensions and presents their outcomes.
- **Yard Tools -> Yard Core**: extensions depend only on stable core contracts and constrained contexts.
