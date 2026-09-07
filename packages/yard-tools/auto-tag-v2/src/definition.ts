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
export const AUTO_TAG_V2_LIST_CANDIDATES = "auto-tag-v2.list-candidates";
export const AUTO_TAG_V2_PROMOTE_CANDIDATE = "auto-tag-v2.promote-candidate";
export const AUTO_TAG_V2_DISMISS_CANDIDATE = "auto-tag-v2.dismiss-candidate";
export const AUTO_TAG_V2_FIND_SIMILAR = "auto-tag-v2.find-similar";
export const AUTO_TAG_V2_CLAP_STATUS = "auto-tag-v2.clap-status";
export const AUTO_TAG_V2_DOWNLOAD_MODEL = "auto-tag-v2.download-model";
export const AUTO_TAG_V2_TAG_SEMANTIC = "auto-tag-v2.tag-semantic";

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

function listCandidatesResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      words: { kind: "string-array" },
      lines: { kind: "string-array" },
      truncated: { kind: "boolean" },
      totalFiles: { kind: "number", integer: true, min: 0 },
    },
    required: ["words", "lines", "truncated", "totalFiles"],
  };
}

function promoteCandidateResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      tag: { kind: "string" },
      tagId: { kind: "string" },
      attached: { kind: "number", integer: true, min: 0 },
      missing: { kind: "string-array" },
    },
    required: ["tag", "tagId", "attached", "missing"],
  };
}

function dismissCandidateResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      word: { kind: "string" },
      dismissedCount: { kind: "number", integer: true, min: 0 },
    },
    required: ["word", "dismissedCount"],
  };
}

function findSimilarResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      targetFileId: { kind: "string" },
      targetFilename: { kind: "string" },
      similarFileIds: { kind: "string-array" },
      similarFilenames: { kind: "string-array" },
      reason: { kind: "string" },
    },
    required: ["targetFileId", "targetFilename", "similarFileIds", "similarFilenames"],
  };
}

function clapStatusResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      modelId: { kind: "string" },
      state: { kind: "enum", values: ["ready", "not-downloaded", "downloading"] },
      downloadedBytes: { kind: "number", integer: true, min: 0 },
      totalBytes: { kind: "number", integer: true, min: 0 },
      backendAvailable: { kind: "boolean" },
    },
    required: ["modelId", "state", "downloadedBytes", "totalBytes", "backendAvailable"],
  };
}

function downloadModelResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      modelId: { kind: "string" },
      bytes: { kind: "number", integer: true, min: 0 },
    },
    required: ["modelId", "bytes"],
  };
}

function tagSemanticResultSchema(): ExtensionV2ValueSchema {
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
      "embeddings:read",
      "embeddings:write",
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
      {
        id: AUTO_TAG_V2_LIST_CANDIDATES,
        title: "List tag candidates",
        description: "List uncovered words across the library with example files. Nothing is created.",
        scope: "global",
        input: {
          kind: "object",
          properties: {
            limit: { kind: "number", integer: true, min: 1 },
          },
        },
        result: listCandidatesResultSchema(),
        docsId: "commands",
      },
      {
        id: AUTO_TAG_V2_PROMOTE_CANDIDATE,
        title: "Promote tag candidate",
        description: "Turn an uncovered word into a real tag and attach it to the matching sounds.",
        scope: "global",
        input: {
          kind: "object",
          properties: {
            word: { kind: "string", minLength: 1 },
            fileIds: { kind: "string-array" },
          },
          required: ["word"],
        },
        result: promoteCandidateResultSchema(),
        docsId: "commands",
      },
      {
        id: AUTO_TAG_V2_DISMISS_CANDIDATE,
        title: "Dismiss tag candidate",
        description: "Remove an uncovered word from the candidate queue.",
        scope: "global",
        input: {
          kind: "object",
          properties: {
            word: { kind: "string", minLength: 1 },
          },
          required: ["word"],
        },
        result: dismissCandidateResultSchema(),
        docsId: "commands",
      },
      {
        id: AUTO_TAG_V2_FIND_SIMILAR,
        title: "Find similar",
        description: "List the sounds closest to one sound by stored embeddings.",
        scope: "selection",
        requiresSelection: true,
        input: {
          kind: "object",
          properties: {
            fileId: { kind: "string", minLength: 1 },
            topN: { kind: "number", integer: true, min: 1 },
          },
        },
        result: findSimilarResultSchema(),
        docsId: "commands",
      },
      {
        id: AUTO_TAG_V2_CLAP_STATUS,
        title: "CLAP model status",
        description: "Show whether the tagging model is downloaded and ready.",
        scope: "global",
        input: { kind: "object", properties: {} },
        result: clapStatusResultSchema(),
        docsId: "commands",
      },
      {
        id: AUTO_TAG_V2_DOWNLOAD_MODEL,
        title: "Download CLAP model",
        description: "Download the tagging model with progress. Requires explicit confirmation.",
        scope: "global",
        input: {
          kind: "object",
          properties: {
            confirm: { kind: "boolean" },
          },
          required: ["confirm"],
        },
        result: downloadModelResultSchema(),
        docsId: "commands",
      },
      {
        id: AUTO_TAG_V2_TAG_SEMANTIC,
        title: "Tag with CLAP",
        description: "Tag sounds with model suggestions over the approved vocabulary.",
        scope: "global",
        input: fileIdsInput(),
        result: tagSemanticResultSchema(),
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
      {
        id: "auto-tag-v2.palette-list-candidates",
        type: "command-palette",
        commandId: AUTO_TAG_V2_LIST_CANDIDATES,
      },
      {
        id: "auto-tag-v2.palette-promote-candidate",
        type: "command-palette",
        commandId: AUTO_TAG_V2_PROMOTE_CANDIDATE,
      },
      {
        id: "auto-tag-v2.palette-dismiss-candidate",
        type: "command-palette",
        commandId: AUTO_TAG_V2_DISMISS_CANDIDATE,
      },
      {
        id: "auto-tag-v2.row-similar",
        type: "file-context-menu",
        commandId: AUTO_TAG_V2_FIND_SIMILAR,
        title: "Find similar",
      },
      {
        id: "auto-tag-v2.palette-clap-status",
        type: "command-palette",
        commandId: AUTO_TAG_V2_CLAP_STATUS,
      },
      {
        id: "auto-tag-v2.palette-download-model",
        type: "command-palette",
        commandId: AUTO_TAG_V2_DOWNLOAD_MODEL,
      },
      {
        id: "auto-tag-v2.palette-tag-semantic",
        type: "command-palette",
        commandId: AUTO_TAG_V2_TAG_SEMANTIC,
      },
    ],
  };
}
