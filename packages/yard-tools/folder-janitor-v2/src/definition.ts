import {
  V2_EXTENSION_API_VERSION,
  type ExtensionV2Definition,
  type ExtensionV2ValueSchema,
} from "yard-core";

import { DEFAULT_ALLOWED_FORMATS, DEFAULT_TINY_THRESHOLD_BYTES } from "./policy";

/**
 * Folder Janitor v2 reference definition (Yard Tools context, J4 #179).
 *
 * Find duplicate sounds, empty files, empty folders, tiny junk files,
 * unusual formats, and missing files, then clean up. Bundled internal
 * port: disabled by default, own settings namespace
 * (`folder-janitor-v2.*`), no v1 imports, no auto-migration.
 *
 * Every effect runs through the E1 #176 ops: scans read the index and
 * list folders (bounded, cancellable jobs); `remove-files` marks index
 * IDs removed (`library:write`); `delete-folders` is destructive and
 * runs through the prepare/review/apply plan contract — the empty
 * folder must still be contained in a Library root and still empty when
 * it is deleted (the op rechecks), and a client confirmed flag is never
 * sufficient.
 */

export const FOLDER_JANITOR_V2_ID = "folder-janitor-v2";

export const FOLDER_JANITOR_V2_SCAN_LIBRARY = "folder-janitor-v2.scan-library";
export const FOLDER_JANITOR_V2_SCAN_FOLDER = "folder-janitor-v2.scan-folder";
export const FOLDER_JANITOR_V2_REMOVE_FILES = "folder-janitor-v2.remove-files";
export const FOLDER_JANITOR_V2_DELETE_FOLDERS = "folder-janitor-v2.delete-folders";

function scanInputSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      tinyFileThresholdBytes: { kind: "number", integer: true, min: 0 },
      allowedFormats: { kind: "string" },
    },
  };
}

function scanResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      scannedFiles: { kind: "number", integer: true, min: 0 },
      scannedRoots: { kind: "string-array" },
      issueKinds: { kind: "string-array" },
      issuePaths: { kind: "string-array" },
      issueMessages: { kind: "string-array" },
      issueFileIds: { kind: "string-array" },
      truncated: { kind: "boolean" },
    },
    required: [
      "scannedFiles",
      "scannedRoots",
      "issueKinds",
      "issuePaths",
      "issueMessages",
      "issueFileIds",
      "truncated",
    ],
  };
}

function removeFilesResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      removed: { kind: "number", integer: true, min: 0 },
      marked: { kind: "string-array" },
      unknownIds: { kind: "string-array" },
    },
    required: ["removed", "marked", "unknownIds"],
  };
}

function deleteFoldersInputSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: { folders: { kind: "string-array", minItems: 1 } },
    required: ["folders"],
  };
}

function deleteFoldersResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      deleted: { kind: "number", integer: true, min: 0 },
      deletedPaths: { kind: "string-array" },
      failedPaths: { kind: "string-array" },
      failedReasons: { kind: "string-array" },
    },
    required: ["deleted", "deletedPaths", "failedPaths", "failedReasons"],
  };
}

export function createFolderJanitorV2Definition(): ExtensionV2Definition {
  const scanInput = scanInputSchema();
  const scanResult = scanResultSchema();
  return {
    id: FOLDER_JANITOR_V2_ID,
    name: "Folder Janitor v2",
    version: "1.0.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description:
      "Find duplicate sounds, empty files, empty folders, tiny junk files, unusual formats, and missing files, then clean up.",
    permissions: [
      "library:read",
      "library:write",
      "files:read",
      "files:delete",
      "settings:read",
      "settings:write",
    ],
    commands: [
      {
        id: FOLDER_JANITOR_V2_SCAN_LIBRARY,
        title: "Scan Library Mess",
        description: "Create a cleanup report for the whole sound library.",
        scope: "global",
        input: scanInput,
        result: scanResult,
        docsId: "commands",
      },
      {
        id: FOLDER_JANITOR_V2_SCAN_FOLDER,
        title: "Scan Folder Mess",
        description: "Create a cleanup report for one folder.",
        scope: "folder",
        input: scanInput,
        result: scanResult,
        docsId: "commands",
      },
      {
        id: FOLDER_JANITOR_V2_REMOVE_FILES,
        title: "Remove Files from Index",
        description: "Mark the selected sounds as removed from the Library index.",
        scope: "selection",
        requiresSelection: true,
        result: removeFilesResultSchema(),
        docsId: "commands",
      },
      {
        id: FOLDER_JANITOR_V2_DELETE_FOLDERS,
        title: "Delete Empty Folders",
        description: "Delete the supplied empty folders after review.",
        scope: "global",
        destructive: true,
        input: deleteFoldersInputSchema(),
        result: deleteFoldersResultSchema(),
        docsId: "commands",
      },
    ],
    settings: [
      {
        id: "folder-janitor-v2.tiny-file-threshold-bytes",
        label: "Tiny file threshold",
        description: "Files below this size are reported as junk candidates.",
        type: "number",
        defaultValue: DEFAULT_TINY_THRESHOLD_BYTES,
      },
      {
        id: "folder-janitor-v2.allowed-formats",
        label: "Allowed formats",
        description: "Comma-separated audio formats considered normal.",
        type: "string",
        defaultValue: DEFAULT_ALLOWED_FORMATS,
      },
    ],
    contributions: [
      {
        id: "folder-janitor-v2.palette-scan-library",
        type: "command-palette",
        commandId: FOLDER_JANITOR_V2_SCAN_LIBRARY,
      },
      {
        id: "folder-janitor-v2.folder-scan",
        type: "folder-context-menu",
        commandId: FOLDER_JANITOR_V2_SCAN_FOLDER,
        title: "Scan Folder Mess (v2)",
      },
      {
        id: "folder-janitor-v2.row-remove",
        type: "file-context-menu",
        commandId: FOLDER_JANITOR_V2_REMOVE_FILES,
        title: "Remove from Index (v2)",
      },
      {
        id: "folder-janitor-v2.bulk-remove",
        type: "selection-actions",
        commandId: FOLDER_JANITOR_V2_REMOVE_FILES,
        title: "Remove from Index (v2)",
      },
      {
        id: "folder-janitor-v2.settings-scan",
        type: "settings",
        commandId: FOLDER_JANITOR_V2_SCAN_LIBRARY,
        title: "Folder Janitor v2",
      },
    ],
  };
}
