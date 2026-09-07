import {
  V2_EXTENSION_API_VERSION,
  type ExtensionV2Definition,
  type ExtensionV2ValueSchema,
} from "yard-core";

/**
 * Auto Tag v2 definition (Yard Tools context, #190).
 *
 * Deterministic filename-rule tagging, nothing more in this slice: the
 * seed rules tag new arrivals, every write lands marked deterministic,
 * and preview plans without side effects. Disabled by default with
 * explicit enable and permission approval like every other v2 port.
 * No settings of its own: on/off is the extension enabled flag, and
 * the vocabulary grows through the candidate queue (#191), not options.
 */

export const AUTO_TAG_V2_ID = "auto-tag-v2";

export const AUTO_TAG_V2_TAG_FILES = "auto-tag-v2.tag-files";
export const AUTO_TAG_V2_PREVIEW = "auto-tag-v2.preview";

function fileIdsInput(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      fileIds: { kind: "string-array", minItems: 1 },
    },
    required: ["fileIds"],
  };
}

function previewResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      planned: { kind: "string-array" },
      untaggedFileIds: { kind: "string-array" },
      candidates: { kind: "string-array" },
      missing: { kind: "string-array" },
      taggedCount: { kind: "number", integer: true, min: 0 },
    },
    required: ["planned", "untaggedFileIds", "candidates", "missing", "taggedCount"],
  };
}

function tagFilesResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      tagged: { kind: "number", integer: true, min: 0 },
      attached: { kind: "number", integer: true, min: 0 },
      skipped: { kind: "string-array" },
      missing: { kind: "string-array" },
      failedFiles: { kind: "string-array" },
      failedReasons: { kind: "string-array" },
    },
    required: ["tagged", "attached", "skipped", "missing", "failedFiles", "failedReasons"],
  };
}

export function createAutoTagV2Definition(): ExtensionV2Definition {
  return {
    id: AUTO_TAG_V2_ID,
    name: "Auto Tag v2",
    version: "1.0.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description:
      "Tag new arrivals with deterministic filename rules. Preview plans first, tag in the background, every write marked deterministic.",
    permissions: [
      "library:read",
      "files:read",
      "tags:read",
      "tags:write",
      "settings:read",
    ],
    commands: [
      {
        id: AUTO_TAG_V2_TAG_FILES,
        title: "Auto-tag files",
        description: "Tag the given sounds with the filename rules.",
        scope: "global",
        input: fileIdsInput(),
        result: tagFilesResultSchema(),
        docsId: "commands",
      },
      {
        id: AUTO_TAG_V2_PREVIEW,
        title: "Preview auto-tag",
        description: "Show what the filename rules would tag, without writing anything.",
        scope: "global",
        input: fileIdsInput(),
        result: previewResultSchema(),
        docsId: "commands",
      },
    ],
    contributions: [
      {
        id: "auto-tag-v2.palette-tag-files",
        type: "command-palette",
        commandId: AUTO_TAG_V2_TAG_FILES,
      },
      {
        id: "auto-tag-v2.palette-preview",
        type: "command-palette",
        commandId: AUTO_TAG_V2_PREVIEW,
      },
    ],
  };
}
