import {
  V2_EXTENSION_API_VERSION,
  type ExtensionV2Definition,
  type ExtensionV2ValueSchema,
} from "yard-core";

/**
 * Make Pack v2 reference definition (Yard Tools context, R8).
 *
 * Bundled internal example: disabled by default, explicit
 * enable/disable through the generic v2 routes, own settings
 * namespace (`make-pack-v2.*`), no auto-migration from v1.
 * Framework-free data plus handler registration in `handlers.ts`;
 * privileged effects run only through v2 operation services.
 */

export const MAKE_PACK_V2_ID = "make-pack-v2";

export const MAKE_PACK_V2_SOURCE_SELECTION = "make-pack-v2.from-selection";
export const MAKE_PACK_V2_SOURCE_SHELF = "make-pack-v2.from-shelf";
export const MAKE_PACK_V2_SOURCE_RECENT = "make-pack-v2.from-recent";

export type MakePackV2Source = "selection" | "shelf" | "recent";
export type MakePackV2Format = "folder" | "zip";

/** Command input: every field optional; settings supply the defaults. */
export function makePackV2InputSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      packName: { kind: "string", maxLength: 80 },
      outputFormat: { kind: "enum", values: ["folder", "zip"] },
      includeManifest: { kind: "boolean" },
      grantId: { kind: "string", minLength: 1 },
    },
  };
}

/**
 * Command result: counts, per-file reasons, and a capability-aware
 * reveal hint. Keys must match `handlers.ts` exactly — the host
 * validates immediate values against this schema.
 */
export function makePackV2ResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      packName: { kind: "string" },
      outputFormat: { kind: "enum", values: ["folder", "zip"] },
      outputPath: { kind: "string" },
      copied: { kind: "number", integer: true, min: 0 },
      skipped: { kind: "string-array" },
      missing: { kind: "string-array" },
      failedFiles: { kind: "string-array" },
      failedReasons: { kind: "string-array" },
      manifestIncluded: { kind: "boolean" },
      revealCapability: { kind: "string" },
    },
    required: [
      "packName",
      "outputFormat",
      "outputPath",
      "copied",
      "skipped",
      "missing",
      "failedFiles",
      "failedReasons",
      "manifestIncluded",
      "revealCapability",
    ],
  };
}

export function createMakePackV2Definition(): ExtensionV2Definition {
  const input = makePackV2InputSchema();
  const result = makePackV2ResultSchema();
  return {
    id: MAKE_PACK_V2_ID,
    name: "Make Pack v2",
    version: "1.0.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description:
      "Turn selected sounds, Sound Shelf items, or recently previewed sounds into a clean folder or ZIP pack.",
    permissions: [
      "library:read",
      "files:read",
      "files:copy",
      "files:write",
      "settings:read",
      "settings:write",
      "desktop:reveal",
      "desktop:open",
    ],
    commands: [
      {
        id: MAKE_PACK_V2_SOURCE_SELECTION,
        title: "Make Pack v2 from Selection",
        description: "Create a pack from the selected sounds.",
        scope: "selection",
        requiresSelection: true,
        input,
        result,
        docsId: "commands",
      },
      {
        id: MAKE_PACK_V2_SOURCE_SHELF,
        title: "Make Pack v2 from Shelf",
        description: "Create a pack from Sound Shelf items.",
        scope: "global",
        input,
        result,
        docsId: "commands",
      },
      {
        id: MAKE_PACK_V2_SOURCE_RECENT,
        title: "Make Pack v2 from Recent Sounds",
        description: "Create a pack from recently previewed sounds.",
        scope: "global",
        input,
        result,
        docsId: "commands",
      },
    ],
    settings: [
      {
        id: "make-pack-v2.pack-name",
        label: "Pack name",
        description:
          "Default pack name. Blank falls back to a per-source default.",
        type: "string",
        defaultValue: "",
      },
      {
        id: "make-pack-v2.default-format",
        label: "Default output format",
        description: "Create packs as a folder or a ZIP archive.",
        type: "enum",
        defaultValue: "folder",
        options: [
          { label: "Folder", value: "folder" },
          { label: "Zip", value: "zip" },
        ],
      },
      {
        id: "make-pack-v2.include-manifest",
        label: "Include manifest",
        description: "Write a manifest.json file with source file metadata.",
        type: "boolean",
        defaultValue: true,
      },
    ],
    contributions: [
      { id: "make-pack-v2.palette-selection", type: "command-palette", commandId: MAKE_PACK_V2_SOURCE_SELECTION },
      { id: "make-pack-v2.palette-shelf", type: "command-palette", commandId: MAKE_PACK_V2_SOURCE_SHELF },
      { id: "make-pack-v2.palette-recent", type: "command-palette", commandId: MAKE_PACK_V2_SOURCE_RECENT },
      {
        id: "make-pack-v2.row-pack",
        type: "file-context-menu",
        commandId: MAKE_PACK_V2_SOURCE_SELECTION,
        title: "Make Pack v2 from Selection",
      },
      {
        id: "make-pack-v2.bulk-pack",
        type: "selection-actions",
        commandId: MAKE_PACK_V2_SOURCE_SELECTION,
        title: "Make Pack v2",
      },
      {
        id: "make-pack-v2.side-shelf",
        type: "sidebar",
        commandId: MAKE_PACK_V2_SOURCE_SHELF,
        title: "Pack Shelf (v2)",
      },
      {
        id: "make-pack-v2.pack-settings",
        type: "settings",
        commandId: MAKE_PACK_V2_SOURCE_SELECTION,
        title: "Make Pack v2 settings",
      },
    ],
  };
}
