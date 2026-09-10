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
export const AUTO_TAG_V2_COVERAGE_HISTORY = "auto-tag-v2.coverage-history";
export const AUTO_TAG_V2_RECORD_COVERAGE = "auto-tag-v2.record-coverage";
export const AUTO_TAG_V2_COVERAGE_SUMMARY = "auto-tag-v2.coverage-summary";
export const AUTO_TAG_V2_LIST_ORIGINS = "auto-tag-v2.list-origins";
export const AUTO_TAG_V2_LATEST_ARRIVALS = "auto-tag-v2.latest-arrivals";
export const AUTO_TAG_V2_REMOVE_BY_ORIGIN = "auto-tag-v2.remove-by-origin";
export const AUTO_TAG_V2_RENAME_TAG = "auto-tag-v2.rename-tag";
export const AUTO_TAG_V2_MERGE_TAG = "auto-tag-v2.merge-tag";

function fileIdsInput(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      fileIds: { kind: "string-array", minItems: 1 },
    },
    required: ["fileIds"],
  };
}

function arrivalFileIdsInput(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      fileIds: { kind: "string-array", minItems: 1 },
      batchId: { kind: "string", minLength: 1 },
      scanStartedAt: { kind: "string", minLength: 1 },
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
      entries: { kind: "string-array" },
      truncated: { kind: "boolean" },
      totalFiles: { kind: "number", integer: true, min: 0 },
    },
    required: ["words", "lines", "entries", "truncated", "totalFiles"],
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
      matches: { kind: "string-array" },
      unavailable: { kind: "boolean" },
      reason: { kind: "string" },
    },
    required: ["targetFileId", "targetFilename", "similarFileIds", "similarFilenames", "matches", "unavailable"],
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

function coverageHistoryResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      entries: { kind: "string-array" },
    },
    required: ["entries"],
  };
}

function recordCoverageResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      recorded: { kind: "boolean" },
      entriesCount: { kind: "number", integer: true, min: 0 },
    },
    required: ["recorded", "entriesCount"],
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
        input: arrivalFileIdsInput(),
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
            candidateId: { kind: "string", minLength: 1 },
            useForFutureFilenames: { kind: "boolean" },
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
        input: arrivalFileIdsInput(),
        result: tagSemanticResultSchema(),
        docsId: "commands",
      },
      {
        id: AUTO_TAG_V2_COVERAGE_HISTORY,
        title: "Coverage history",
        description: "Read recorded coverage snapshots, oldest first.",
        scope: "global",
        input: { kind: "object", properties: {} },
        result: coverageHistoryResultSchema(),
        docsId: "commands",
      },
      {
        id: AUTO_TAG_V2_RECORD_COVERAGE,
        title: "Record coverage",
        description: "Append a coverage snapshot for trend charts.",
        scope: "global",
        input: {
          kind: "object",
          properties: {
            tagged: { kind: "number", integer: true, min: 0 },
            total: { kind: "number", integer: true, min: 0 },
            tags: { kind: "string-array" },
          },
          required: ["tagged", "total", "tags"],
        },
        result: recordCoverageResultSchema(),
        docsId: "commands",
      },
      {
        id: AUTO_TAG_V2_COVERAGE_SUMMARY,
        title: "Coverage summary",
        description: "Aggregate full-Library tag coverage and return a bounded selected-tag page.",
        scope: "global",
        input: {
          kind: "object",
          properties: {
            tag: { kind: "string" },
            cursor: { kind: "string" },
            limit: { kind: "number", integer: true, min: 1, max: 100 },
          },
        },
        result: {
          kind: "object",
          properties: { summary: { kind: "string" } },
          required: ["summary"],
        },
        docsId: "commands",
      },
      {
        id: AUTO_TAG_V2_LIST_ORIGINS,
        title: "List tag origins",
        description: "List a bounded page of files with attachment origins and full-Library origin counts.",
        scope: "global",
        input: {
          kind: "object",
          properties: {
            origin: { kind: "enum", values: ["all", "manual", "deterministic", "semantic_ai"] },
            cursor: { kind: "string" },
            limit: { kind: "number", integer: true, min: 1, max: 100 },
          },
        },
        result: {
          kind: "object",
          properties: {
            summary: { kind: "string" },
            entries: { kind: "string-array" },
            nextCursor: { kind: "string" },
          },
          required: ["summary", "entries", "nextCursor"],
        },
        docsId: "commands",
      },
      {
        id: AUTO_TAG_V2_LATEST_ARRIVALS,
        title: "Latest Auto Tag arrivals",
        description: "Read the most recently completed Auto Tag arrival job and its recorded rules.",
        scope: "global",
        input: { kind: "object", properties: {} },
        result: {
          kind: "object",
          properties: { hasData: { kind: "boolean" }, batch: { kind: "string" }, lastRun: { kind: "string" } },
          required: ["hasData", "batch", "lastRun"],
        },
        docsId: "commands",
      },
      {
        id: AUTO_TAG_V2_REMOVE_BY_ORIGIN,
        title: "Remove automatic tags",
        description: "Remove deterministic or semantic AI attachments without touching manual tags.",
        scope: "global",
        destructive: true,
        input: {
          kind: "object",
          properties: {
            origin: { kind: "enum", values: ["deterministic", "semantic_ai"] },
            confirm: { kind: "boolean" },
          },
          required: ["origin", "confirm"],
        },
        result: {
          kind: "object",
          properties: { origin: { kind: "string" }, removed: { kind: "number", integer: true, min: 0 } },
          required: ["origin", "removed"],
        },
        docsId: "commands",
      },
      {
        id: AUTO_TAG_V2_RENAME_TAG,
        title: "Rename tag with alias",
        description: "Rename a canonical tag and preserve its old normalized name as an alias.",
        scope: "global",
        input: {
          kind: "object",
          properties: { tagId: { kind: "string", minLength: 1 }, name: { kind: "string", minLength: 1 } },
          required: ["tagId", "name"],
        },
        result: { kind: "object", properties: { renamed: { kind: "boolean" } }, required: ["renamed"] },
        docsId: "commands",
      },
      {
        id: AUTO_TAG_V2_MERGE_TAG,
        title: "Merge tags",
        description: "Move attachments into one canonical tag while preserving manual precedence and aliases.",
        scope: "global",
        destructive: true,
        input: {
          kind: "object",
          properties: {
            sourceTagId: { kind: "string", minLength: 1 },
            targetTagId: { kind: "string", minLength: 1 },
            confirm: { kind: "boolean" },
          },
          required: ["sourceTagId", "targetTagId", "confirm"],
        },
        result: { kind: "object", properties: { moved: { kind: "number", integer: true, min: 0 } }, required: ["moved"] },
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
      {
        id: "auto-tag-v2.side-status",
        type: "sidebar",
        commandId: AUTO_TAG_V2_CLAP_STATUS,
        title: "Model status",
      },
      {
        id: "auto-tag-v2.side-candidates",
        type: "sidebar",
        commandId: AUTO_TAG_V2_LIST_CANDIDATES,
        title: "Review candidates",
      },
    ],
  };
}
