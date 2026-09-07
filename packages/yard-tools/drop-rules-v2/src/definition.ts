import {
  V2_EXTENSION_API_VERSION,
  type ExtensionV2Definition,
  type ExtensionV2ValueSchema,
} from "yard-core";

/**
 * Drop Rules v2 reference definition (Yard Tools context, D6 #181).
 *
 * Control what happens when a sound leaves Foleyard: copy, rename, and
 * mark sounds as used. Bundled internal port: disabled by default, own
 * settings namespace (`drop-rules-v2.*`), no v1 imports, no
 * auto-migration.
 *
 * Drop-scope commands (`preview`, `apply`, `prepare-drag`) run from the
 * real application drop menu: the renderer validates an OS drop into a
 * drop context, and the drop payload (Library IDs + destination grant)
 * arrives as command input. `open-settings` is global and settles
 * immediately with the settings surface. No `requiredCapabilities`:
 * the app host exposes no capabilities.
 */

export const DROP_RULES_V2_ID = "drop-rules-v2";

export const DROP_RULES_V2_PREVIEW = "drop-rules-v2.preview";
export const DROP_RULES_V2_APPLY = "drop-rules-v2.apply";
export const DROP_RULES_V2_PREPARE_DRAG = "drop-rules-v2.prepare-drag";
export const DROP_RULES_V2_OPEN_SETTINGS = "drop-rules-v2.open-settings";

export const DROP_RULES_V2_SETTINGS = [
  "drop-rules-v2.copy-on-drop",
  "drop-rules-v2.rename-on-drop",
  "drop-rules-v2.rename-pattern",
  "drop-rules-v2.drag-out-folder",
  "drop-rules-v2.mark-used",
] as const;

function dropInputSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      fileIds: { kind: "string-array", minItems: 1 },
      destGrantId: { kind: "string", minLength: 1 },
      copyOnDrop: { kind: "boolean" },
      renameOnDrop: { kind: "boolean" },
      renamePattern: { kind: "string" },
      markUsed: { kind: "boolean" },
    },
    required: ["fileIds"],
  };
}

function previewResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      fileIds: { kind: "string-array" },
      outputNames: { kind: "string-array" },
      warnings: { kind: "string-array" },
      missing: { kind: "string-array" },
    },
    required: ["fileIds", "outputNames", "warnings", "missing"],
  };
}

function applyResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      copied: { kind: "number", integer: true, min: 0 },
      skipped: { kind: "string-array" },
      missing: { kind: "string-array" },
      failedFiles: { kind: "string-array" },
      failedReasons: { kind: "string-array" },
      usedReportWritten: { kind: "boolean" },
      warnings: { kind: "string-array" },
    },
    required: [
      "copied",
      "skipped",
      "missing",
      "failedFiles",
      "failedReasons",
      "usedReportWritten",
      "warnings",
    ],
  };
}

function prepareDragResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      fileId: { kind: "string" },
      outputName: { kind: "string" },
      dragPath: { kind: "string" },
      staged: { kind: "boolean" },
    },
    required: ["fileId", "outputName", "dragPath", "staged"],
  };
}

function openSettingsResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      settings: { kind: "string-array" },
    },
    required: ["settings"],
  };
}

export function createDropRulesV2Definition(): ExtensionV2Definition {
  const dropInput = dropInputSchema();
  return {
    id: DROP_RULES_V2_ID,
    name: "Drop Rules v2",
    version: "1.0.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description:
      "Control what happens when a sound leaves Foleyard: copy, rename, and mark sounds as used.",
    permissions: [
      "library:read",
      "files:read",
      "files:copy",
      "files:write",
      "drop:read",
      "drop:modify",
      "settings:read",
    ],
    commands: [
      {
        id: DROP_RULES_V2_PREVIEW,
        title: "Preview Drop Rules",
        description: "Preview the file actions that Drop Rules would perform.",
        scope: "drop",
        input: dropInput,
        result: previewResultSchema(),
        docsId: "commands",
      },
      {
        id: DROP_RULES_V2_APPLY,
        title: "Apply Drop Rules",
        description: "Copy and rename dropped sounds using the configured rules.",
        scope: "drop",
        input: dropInput,
        result: applyResultSchema(),
        docsId: "commands",
      },
      {
        id: DROP_RULES_V2_PREPARE_DRAG,
        title: "Prepare Drag",
        description: "Prepare one sound for drag-out using the configured rules.",
        scope: "drop",
        input: {
          kind: "object",
          properties: {
            fileId: { kind: "string", minLength: 1 },
            stagingGrantId: { kind: "string", minLength: 1 },
            copyOnDrop: { kind: "boolean" },
            renameOnDrop: { kind: "boolean" },
            renamePattern: { kind: "string" },
            markUsed: { kind: "boolean" },
          },
          required: ["fileId"],
        },
        result: prepareDragResultSchema(),
        docsId: "commands",
      },
      {
        id: DROP_RULES_V2_OPEN_SETTINGS,
        title: "Configure Drop Rules",
        description: "Open the Drop Rules settings.",
        scope: "global",
        result: openSettingsResultSchema(),
        docsId: "commands",
      },
    ],
    settings: [
      {
        id: "drop-rules-v2.copy-on-drop",
        label: "Copy on drop",
        description: "Drag a safe prepared copy instead of the source file.",
        type: "boolean",
        defaultValue: true,
      },
      {
        id: "drop-rules-v2.rename-on-drop",
        label: "Rename on drop",
        description: "Apply the rename pattern to files dragged out of Foleyard.",
        type: "boolean",
        defaultValue: true,
      },
      {
        id: "drop-rules-v2.rename-pattern",
        label: "Rename pattern",
        description: "Supports {name}, {index}, {ext}, {format}, {date}, and {time}.",
        type: "string",
        defaultValue: "{index}-{name}{ext}",
      },
      {
        id: "drop-rules-v2.drag-out-folder",
        label: "Prepared drag folder",
        description:
          "Display name for the staging grant used for renamed drag-out copies. Staging itself is grant-scoped, never a raw path.",
        type: "string",
        defaultValue: "",
      },
      {
        id: "drop-rules-v2.mark-used",
        label: "Mark used",
        description: "Write a small used-sounds report when sounds leave Foleyard.",
        type: "boolean",
        defaultValue: true,
      },
    ],
    contributions: [
      {
        id: "drop-rules-v2.palette-preview",
        type: "command-palette",
        commandId: DROP_RULES_V2_PREVIEW,
      },
      {
        id: "drop-rules-v2.palette-apply",
        type: "command-palette",
        commandId: DROP_RULES_V2_APPLY,
      },
      {
        id: "drop-rules-v2.palette-prepare-drag",
        type: "command-palette",
        commandId: DROP_RULES_V2_PREPARE_DRAG,
      },
      {
        id: "drop-rules-v2.palette-open-settings",
        type: "command-palette",
        commandId: DROP_RULES_V2_OPEN_SETTINGS,
      },
      {
        id: "drop-rules-v2.drop-preview",
        type: "drop-menu",
        commandId: DROP_RULES_V2_PREVIEW,
        title: "Preview Drop Rules (v2)",
      },
      {
        id: "drop-rules-v2.drop-apply",
        type: "drop-menu",
        commandId: DROP_RULES_V2_APPLY,
        title: "Apply Drop Rules (v2)",
      },
      {
        id: "drop-rules-v2.drop-prepare-drag",
        type: "drop-menu",
        commandId: DROP_RULES_V2_PREPARE_DRAG,
        title: "Prepare Drag (v2)",
      },
      {
        id: "drop-rules-v2.settings-open",
        type: "settings",
        commandId: DROP_RULES_V2_OPEN_SETTINGS,
        title: "Drop Rules v2",
      },
    ],
  };
}
