// PROTOTYPE — throwaway. Snapshot of the real extension wiring, hardcoded so the
// diagram stays a pure client component (the real packages pull in node deps).
// Sources: packages/yard-core/src/extensions/*, packages/yard-tools/*/src/manifest.ts,
// src/lib/extensions/*, src/app/api/extensions/**.

export type Permission =
  | "library:read"
  | "library:write"
  | "files:read"
  | "files:write"
  | "files:copy"
  | "files:rename"
  | "files:delete"
  | "collections:read"
  | "collections:write"
  | "tags:read"
  | "tags:write"
  | "favorites:read"
  | "favorites:write"
  | "desktop:reveal"
  | "desktop:open"
  | "drop:read"
  | "drop:modify"
  | "settings:read"
  | "settings:write";

export type Surface =
  | "command-palette"
  | "context-menu"
  | "toolbar"
  | "sidebar"
  | "settings"
  | "drop-menu"
  | "selection-actions";

export type Scope =
  | "global"
  | "selection"
  | "folder"
  | "file"
  | "collection"
  | "drop";

export type Command = {
  id: string;
  title: string;
  scope: Scope;
  requiresSelection?: boolean;
  destructive?: boolean;
  /** UI intent type this command returns instead of a plain value, if any. */
  intent?: string;
};

export type Extension = {
  id: string;
  name: string;
  category: string;
  blurb: string;
  permissions: Permission[];
  surfaces: Surface[];
  commands: Command[];
  /** Dedicated API routes that bypass /execute because they carry input. */
  dedicatedRoutes: string[];
};

export const EXTENSIONS: Extension[] = [
  {
    id: "sound-shelf",
    name: "Sound Shelf",
    category: "utility",
    blurb: "Short-term scratchpad for maybe sounds while searching.",
    permissions: ["library:read"],
    surfaces: ["context-menu", "sidebar"],
    commands: [
      {
        id: "sound-shelf.add-selected",
        title: "Add to Shelf",
        scope: "selection",
        requiresSelection: true,
      },
      {
        id: "sound-shelf.remove-selected",
        title: "Remove from Shelf",
        scope: "selection",
        requiresSelection: true,
      },
      { id: "sound-shelf.clear", title: "Clear Shelf", scope: "global" },
      { id: "sound-shelf.list", title: "List Shelf", scope: "global" },
    ],
    dedicatedRoutes: [
      "GET  /api/extensions/sound-shelf",
      "POST /api/extensions/sound-shelf/add",
      "POST /api/extensions/sound-shelf/remove",
      "POST /api/extensions/sound-shelf/clear",
    ],
  },
  {
    id: "make-pack",
    name: "Make Pack",
    category: "export",
    blurb: "Turns selected, shelved, or recent sounds into a clean folder or zip.",
    permissions: ["library:read", "files:read", "files:copy", "files:write"],
    surfaces: ["context-menu", "sidebar", "selection-actions"],
    commands: [
      {
        id: "make-pack.from-selection",
        title: "Make Pack from Selection",
        scope: "selection",
        requiresSelection: true,
        intent: "make-pack.open",
      },
      {
        id: "make-pack.from-shelf",
        title: "Make Pack from Shelf",
        scope: "global",
        intent: "make-pack.open",
      },
      {
        id: "make-pack.from-recent",
        title: "Make Pack from Recent",
        scope: "global",
        intent: "make-pack.open",
      },
    ],
    dedicatedRoutes: ["POST /api/extensions/make-pack"],
  },
  {
    id: "drop-rules",
    name: "Drop Rules",
    category: "drop",
    blurb: "Controls what happens when a sound leaves Foleyard.",
    permissions: [
      "library:read",
      "files:read",
      "files:copy",
      "files:write",
      "drop:read",
      "drop:modify",
    ],
    surfaces: ["settings"],
    commands: [
      {
        id: "drop-rules.open-settings",
        title: "Configure Drop Rules",
        scope: "global",
        intent: "drop-rules.open-settings",
      },
      {
        id: "drop-rules.preview",
        title: "Preview Drop Rules",
        scope: "drop",
        requiresSelection: true,
      },
      {
        id: "drop-rules.apply",
        title: "Apply Drop Rules",
        scope: "drop",
        requiresSelection: true,
      },
      {
        id: "drop-rules.prepare-drag",
        title: "Prepare Drag",
        scope: "drop",
        requiresSelection: true,
      },
    ],
    dedicatedRoutes: ["POST /api/extensions/drop-rules/prepare-drag"],
  },
  {
    id: "folder-janitor",
    name: "Folder Janitor",
    category: "cleanup",
    blurb: "Finds duplicates, broken files, empty folders, and general mess.",
    permissions: ["library:read", "files:read", "files:write", "files:delete"],
    surfaces: ["settings"],
    commands: [
      {
        id: "folder-janitor.scan-library",
        title: "Scan Library Mess",
        scope: "global",
        intent: "folder-janitor.open-scan",
      },
      {
        id: "folder-janitor.scan-folder",
        title: "Scan Folder Mess",
        scope: "folder",
        intent: "folder-janitor.open-scan",
      },
      {
        id: "folder-janitor.remove-files",
        title: "Remove Files from Index",
        scope: "selection",
        requiresSelection: true,
      },
      {
        id: "folder-janitor.delete-folders",
        title: "Delete Empty Folders",
        scope: "global",
        destructive: true,
      },
    ],
    dedicatedRoutes: [
      "POST /api/extensions/folder-janitor/scan-library",
      "POST /api/extensions/folder-janitor/scan-folder",
      "POST /api/extensions/folder-janitor/remove-files",
      "POST /api/extensions/folder-janitor/delete-folders",
    ],
  },
  {
    id: "library-gatherer",
    name: "Library Gatherer",
    category: "utility",
    blurb: "Pulls sounds from scattered folders into one main library.",
    permissions: [
      "library:read",
      "library:write",
      "files:read",
      "files:copy",
      "files:write",
    ],
    surfaces: ["settings"],
    commands: [
      {
        id: "library-gatherer.preview-gather",
        title: "Preview Library Gather",
        scope: "global",
        intent: "library-gatherer.open",
      },
      { id: "library-gatherer.gather", title: "Gather Library", scope: "global" },
    ],
    dedicatedRoutes: [
      "POST /api/extensions/library-gatherer/preview",
      "POST /api/extensions/library-gatherer/gather",
    ],
  },
  {
    id: "smart-collections",
    name: "Smart Collections",
    category: "utility",
    blurb: "Saves any search as a live-updating collection.",
    permissions: ["collections:read", "collections:write", "library:read"],
    surfaces: ["sidebar", "settings"],
    commands: [
      {
        id: "smart-collections.save-search",
        title: "Save Search as Smart Collection",
        scope: "global",
      },
    ],
    dedicatedRoutes: ["POST /api/extensions/smart-collections/save-search"],
  },
];

/** Which context service a permission actually unlocks. */
export const PERMISSION_TO_SERVICE: Record<string, string> = {
  "library:read": "library",
  "library:write": "library",
  "files:read": "files",
  "files:write": "files",
  "files:copy": "files",
  "files:rename": "files",
  "files:delete": "files",
  "collections:read": "collections",
  "collections:write": "collections",
  "tags:read": "tags",
  "tags:write": "tags",
  "favorites:read": "favorites",
  "favorites:write": "favorites",
  "desktop:reveal": "desktop",
  "desktop:open": "desktop",
  "drop:read": "drop",
  "drop:modify": "drop",
  "settings:read": "settings",
  "settings:write": "settings",
};

export const SERVICES = [
  { id: "library", label: "LibraryService", note: "scan, index, folders" },
  {
    id: "files",
    label: "files.markRemoved",
    note: "the only file mutation on context",
  },
  { id: "collections", label: "CollectionService", note: "collections CRUD" },
  { id: "tags", label: "TagService", note: "tags CRUD" },
  { id: "favorites", label: "FavoriteService", note: "favorites CRUD" },
  { id: "settings", label: "settings.get", note: "manifest-declared settings only" },
  {
    id: "commands",
    label: "CommandRegistry",
    note: "always present — how handlers register",
  },
  { id: "events", label: "EventBus", note: "domain events" },
  { id: "drop", label: "(no context service)", note: "drop perms gate route-level work" },
];

export const ALL_PERMISSIONS: Permission[] = [
  "library:read",
  "library:write",
  "files:read",
  "files:write",
  "files:copy",
  "files:rename",
  "files:delete",
  "collections:read",
  "collections:write",
  "tags:read",
  "tags:write",
  "favorites:read",
  "favorites:write",
  "desktop:reveal",
  "desktop:open",
  "drop:read",
  "drop:modify",
  "settings:read",
  "settings:write",
];

export type Stage = {
  key: string;
  layer: "Client" | "HTTP" | "Host" | "Core" | "Extension";
  title: string;
  where: string;
  does: string;
  /** Failure reasons this stage can emit. */
  fails: string[];
};

export const PIPELINE: Stage[] = [
  {
    key: "surface",
    layer: "Client",
    title: "A surface fires a command",
    where: "src/app/page.tsx — executeHostedCommand()",
    does: "A context menu, sidebar button, or settings pane calls executeHostedCommand(extensionId, commandId, selection). The surface knows only two strings and the current selection.",
    fails: [],
  },
  {
    key: "route",
    layer: "HTTP",
    title: "POST /api/extensions/execute",
    where: "src/app/api/extensions/execute/route.ts",
    does: "Checks that extensionId and commandId are present, and rejects any request carrying input — commands that take input must use their own dedicated route.",
    fails: ["400 — missing ids", "400 — input must use its dedicated endpoint"],
  },
  {
    key: "host",
    layer: "Host",
    title: "createAppExtensionHost()",
    where: "src/lib/extensions/host.ts",
    does: "Registers all six extensions into the module-level registry (idempotent), then builds a YardExtensionHost wired to isEnabled, getSettingValue, and the composition root services.",
    fails: [],
  },
  {
    key: "lookup",
    layer: "Host",
    title: "Registry lookup + enabled check",
    where: "YardExtensionHost.execute()",
    does: "Finds the extension definition by id, then asks the DB-backed isEnabled() whether the user has it switched on.",
    fails: ["extension-not-found", "extension-disabled"],
  },
  {
    key: "context",
    layer: "Core",
    title: "Build the extension context",
    where: "extension-context.ts",
    does: "Creates a fresh per-call context: a scoped CommandRegistry, a settings.get() closed over the manifest defaults, the selection, and a PermissionChecker built from the manifest permissions.",
    fails: [],
  },
  {
    key: "register",
    layer: "Extension",
    title: "extension.registerCommands(context)",
    where: "packages/yard-tools/<ext>/src/commands.ts",
    does: "The extension registers handlers into the scoped registry. Handlers close over the context — the only channel through which an extension ever touches app internals.",
    fails: [],
  },
  {
    key: "validate",
    layer: "Host",
    title: "Scope + selection validation",
    where: "YardExtensionHost.execute()",
    does: "Confirms the command exists, that requiresSelection commands got fileIds, and that folder-scoped commands got a folderPath.",
    fails: ["command-not-found", "validation-failed"],
  },
  {
    key: "run",
    layer: "Extension",
    title: "Handler runs",
    where: "the extension handler",
    does: "Calls context.permissions.require(...) before each protected operation, then works through context.services. A missing permission throws YardPermissionError.",
    fails: ["permission-denied", "execution-failed"],
  },
  {
    key: "outcome",
    layer: "Host",
    title: "Outcome is classified",
    where: "isYardUiIntent(value)",
    does: "A returned { kind: 'yard-ui-intent' } object becomes outcome type 'ui-intent'; anything else becomes type 'value'. Thrown errors become a tagged failure reason.",
    fails: [],
  },
  {
    key: "interpret",
    layer: "Client",
    title: "The client interprets the intent",
    where: "src/lib/extensions/ui-intent.ts",
    does: "interpretExtensionUiIntent() maps the intent type onto a real UI action — open the Folder Janitor dialog, open Make Pack, open Settings. Unknown intents fall through to a toast.",
    fails: ["unhandled intent → toast"],
  },
];

export const FAILURE_REASONS = [
  "extension-not-found",
  "extension-disabled",
  "command-not-found",
  "validation-failed",
  "permission-denied",
  "execution-failed",
];

export const UI_INTENTS = [
  { type: "folder-janitor.open-scan", action: "openFolderJanitor(target)" },
  { type: "library-gatherer.open", action: "openLibraryGatherer()" },
  { type: "make-pack.open", action: "openMakePack(source, fileIds)" },
  { type: "drop-rules.open-settings", action: "openSettings()" },
];
