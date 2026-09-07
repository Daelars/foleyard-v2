import {
  V2_EXTENSION_API_VERSION,
  type ExtensionV2Definition,
  type ExtensionV2ValueSchema,
} from "yard-core";

/**
 * Library Gatherer v2 reference definition (Yard Tools context, G5 #180).
 *
 * Pull sounds from scattered folders, drives, packs, and project
 * folders into one main Foleyard library. Bundled internal port:
 * disabled by default, own settings namespace (`library-gatherer-v2.*`),
 * no v1 imports, no auto-migration.
 *
 * Sources are readable source grants (E1 #176). `preview-gather` lists
 * them and plans output names with no side effects. `gather` copies
 * each file into a writable destination grant through the source-copy
 * op (never overwrites) and inserts index records via library
 * mutations, as a job with progress and cancellation.
 */

export const LIBRARY_GATHERER_V2_ID = "library-gatherer-v2";

export const LIBRARY_GATHERER_V2_PREVIEW = "library-gatherer-v2.preview-gather";
export const LIBRARY_GATHERER_V2_GATHER = "library-gatherer-v2.gather";

function gatherInputSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      sourceGrantIds: { kind: "string-array", minItems: 1 },
      destGrantId: { kind: "string", minLength: 1 },
      preserveFolderNames: { kind: "boolean" },
      skipDuplicates: { kind: "boolean" },
    },
    required: ["sourceGrantIds"],
  };
}

function previewResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      candidates: { kind: "number", integer: true, min: 0 },
      sourcePaths: { kind: "string-array" },
      outputNames: { kind: "string-array" },
      sizes: { kind: "string-array" },
      truncated: { kind: "boolean" },
    },
    required: ["candidates", "sourcePaths", "outputNames", "sizes", "truncated"],
  };
}

function gatherResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      copied: { kind: "number", integer: true, min: 0 },
      inserted: { kind: "number", integer: true, min: 0 },
      skipped: { kind: "number", integer: true, min: 0 },
      copiedPaths: { kind: "string-array" },
      skippedSources: { kind: "string-array" },
      skippedReasons: { kind: "string-array" },
      failedSources: { kind: "string-array" },
      failedReasons: { kind: "string-array" },
    },
    required: [
      "copied",
      "inserted",
      "skipped",
      "copiedPaths",
      "skippedSources",
      "skippedReasons",
      "failedSources",
      "failedReasons",
    ],
  };
}

export function createLibraryGathererV2Definition(): ExtensionV2Definition {
  const input = gatherInputSchema();
  return {
    id: LIBRARY_GATHERER_V2_ID,
    name: "Library Gatherer v2",
    version: "1.0.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description:
      "Pull sounds from scattered folders, drives, packs, and project folders into one main Foleyard library.",
    permissions: [
      "library:read",
      "library:write",
      "files:read",
      "files:copy",
      "settings:read",
      "settings:write",
    ],
    commands: [
      {
        id: LIBRARY_GATHERER_V2_PREVIEW,
        title: "Preview Library Gather",
        description: "Preview sounds that would be gathered into the main library.",
        scope: "global",
        input,
        result: previewResultSchema(),
        docsId: "commands",
      },
      {
        id: LIBRARY_GATHERER_V2_GATHER,
        title: "Gather Library",
        description: "Copy sounds from multiple folders into one library folder.",
        scope: "global",
        input,
        result: gatherResultSchema(),
        docsId: "commands",
      },
    ],
    settings: [
      {
        id: "library-gatherer-v2.preserve-folder-names",
        label: "Preserve folder names",
        description: "Prefix gathered sounds with their source folder name.",
        type: "boolean",
        defaultValue: true,
      },
      {
        id: "library-gatherer-v2.skip-duplicates",
        label: "Skip duplicates",
        description:
          "Skip files whose name already exists in the destination instead of failing the gather.",
        type: "boolean",
        defaultValue: true,
      },
    ],
    contributions: [
      {
        id: "library-gatherer-v2.palette-preview",
        type: "command-palette",
        commandId: LIBRARY_GATHERER_V2_PREVIEW,
      },
      {
        id: "library-gatherer-v2.palette-gather",
        type: "command-palette",
        commandId: LIBRARY_GATHERER_V2_GATHER,
      },
      {
        id: "library-gatherer-v2.settings-gather",
        type: "settings",
        commandId: LIBRARY_GATHERER_V2_GATHER,
        title: "Library Gatherer v2",
      },
    ],
  };
}
