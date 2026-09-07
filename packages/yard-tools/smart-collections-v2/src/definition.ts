import {
  V2_EXTENSION_API_VERSION,
  type ExtensionV2Definition,
  type ExtensionV2ValueSchema,
} from "yard-core";

/**
 * Smart Collections v2 reference definition (Yard Tools context, C3 #178).
 *
 * Save any search as a live-updating Collection: files matching the
 * query appear automatically. Bundled internal port: disabled by
 * default, own settings namespace (`smart-collections-v2.*`), no v1
 * imports, no auto-migration. Framework-free data plus handler
 * registration in `handlers.ts`; the write runs through the v2
 * collections op (E1 #176), whose application adapter validates the
 * query against the app-owned filter service — an invalid query fails
 * with a reason, never a silent empty Collection.
 */

export const SMART_COLLECTIONS_V2_ID = "smart-collections-v2";

export const SMART_COLLECTIONS_V2_SAVE_SEARCH = "smart-collections-v2.save-search";

/** Longest accepted Collection name (mirrors the core op bound). */
export const SMART_COLLECTIONS_V2_MAX_NAME_LENGTH = 120;

/** Command input: a name and the search query to save. */
export function saveSearchInputSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      name: { kind: "string", minLength: 1, maxLength: SMART_COLLECTIONS_V2_MAX_NAME_LENGTH },
      query: { kind: "string", minLength: 1 },
    },
    required: ["name", "query"],
  };
}

export function saveSearchResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      collectionId: { kind: "string" },
      name: { kind: "string" },
      query: { kind: "string" },
    },
    required: ["collectionId", "name", "query"],
  };
}

export function createSmartCollectionsV2Definition(): ExtensionV2Definition {
  return {
    id: SMART_COLLECTIONS_V2_ID,
    name: "Smart Collections v2",
    version: "1.0.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description:
      "Save any search as a live-updating collection. Files matching the search criteria appear automatically.",
    permissions: ["collections:read", "collections:write", "library:read"],
    commands: [
      {
        id: SMART_COLLECTIONS_V2_SAVE_SEARCH,
        title: "Save Search as Smart Collection",
        description: "Save the current search query as a smart collection.",
        scope: "global",
        input: saveSearchInputSchema(),
        result: saveSearchResultSchema(),
        docsId: "commands",
      },
    ],
    settings: [],
    contributions: [
      {
        id: "smart-collections-v2.palette-save",
        type: "command-palette",
        commandId: SMART_COLLECTIONS_V2_SAVE_SEARCH,
      },
      {
        id: "smart-collections-v2.side-save",
        type: "sidebar",
        commandId: SMART_COLLECTIONS_V2_SAVE_SEARCH,
        title: "Save Search (v2)",
      },
      {
        id: "smart-collections-v2.settings-save",
        type: "settings",
        commandId: SMART_COLLECTIONS_V2_SAVE_SEARCH,
        title: "Smart Collections v2",
      },
    ],
  };
}
