import {
  V2_EXTENSION_API_VERSION,
  type ExtensionV2Definition,
  type ExtensionV2ValueSchema,
} from "yard-core";

/**
 * Sound Shelf v2 reference definition (Yard Tools context, S2 #177).
 *
 * A short-term scratchpad of Library sounds — explicit add/remove/
 * clear/list, never favorites, never a smart Collection. Bundled
 * internal port: disabled by default, own settings namespace
 * (`sound-shelf-v2.*`), no v1 imports, no auto-migration from the v1
 * Sound Shelf record. Framework-free data plus handler registration in
 * `handlers.ts`; every privileged effect runs through the v2 shelf op
 * (E1 #176), which persists before notifying and repairs on read.
 */

export const SOUND_SHELF_V2_ID = "sound-shelf-v2";

export const SOUND_SHELF_V2_ADD = "sound-shelf-v2.add-selected";
export const SOUND_SHELF_V2_REMOVE = "sound-shelf-v2.remove-selected";
export const SOUND_SHELF_V2_CLEAR = "sound-shelf-v2.clear";
export const SOUND_SHELF_V2_LIST = "sound-shelf-v2.list";

/** add/remove/clear results: how many changed and how many remain. */
function mutationResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      added: { kind: "number", integer: true, min: 0 },
      removed: { kind: "number", integer: true, min: 0 },
      total: { kind: "number", integer: true, min: 0 },
    },
    required: ["added", "removed", "total"],
  };
}

/** list result: the repaired shelf plus any pruned (unindexed) ids. */
function listResultSchema(): ExtensionV2ValueSchema {
  return {
    kind: "object",
    properties: {
      ids: { kind: "string-array" },
      repaired: { kind: "string-array" },
      total: { kind: "number", integer: true, min: 0 },
    },
    required: ["ids", "repaired", "total"],
  };
}

export function createSoundShelfV2Definition(): ExtensionV2Definition {
  const mutation = mutationResultSchema();
  const list = listResultSchema();
  return {
    id: SOUND_SHELF_V2_ID,
    name: "Sound Shelf v2",
    version: "1.0.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description:
      "A temporary holding area for maybe sounds while searching. Not favorites, just a short-term scratchpad.",
    permissions: ["library:read"],
    commands: [
      {
        id: SOUND_SHELF_V2_ADD,
        title: "Add to Shelf",
        description: "Add the selected sounds to the Sound Shelf scratchpad.",
        scope: "selection",
        requiresSelection: true,
        result: mutation,
        docsId: "commands",
      },
      {
        id: SOUND_SHELF_V2_REMOVE,
        title: "Remove from Shelf",
        description: "Remove the selected sounds from the Sound Shelf scratchpad.",
        scope: "selection",
        requiresSelection: true,
        result: mutation,
        docsId: "commands",
      },
      {
        id: SOUND_SHELF_V2_CLEAR,
        title: "Clear Shelf",
        description: "Remove all sounds from the Sound Shelf scratchpad.",
        scope: "global",
        result: mutation,
        docsId: "commands",
      },
      {
        id: SOUND_SHELF_V2_LIST,
        title: "List Shelf",
        description:
          "List the sounds on the Sound Shelf scratchpad; entries that left the Library index are pruned.",
        scope: "global",
        result: list,
        docsId: "commands",
      },
    ],
    settings: [],
    contributions: [
      { id: "sound-shelf-v2.palette-add", type: "command-palette", commandId: SOUND_SHELF_V2_ADD },
      { id: "sound-shelf-v2.palette-remove", type: "command-palette", commandId: SOUND_SHELF_V2_REMOVE },
      { id: "sound-shelf-v2.palette-clear", type: "command-palette", commandId: SOUND_SHELF_V2_CLEAR },
      { id: "sound-shelf-v2.palette-list", type: "command-palette", commandId: SOUND_SHELF_V2_LIST },
      {
        id: "sound-shelf-v2.row-add",
        type: "file-context-menu",
        commandId: SOUND_SHELF_V2_ADD,
        title: "Add to Shelf (v2)",
      },
      {
        id: "sound-shelf-v2.row-remove",
        type: "file-context-menu",
        commandId: SOUND_SHELF_V2_REMOVE,
        title: "Remove from Shelf (v2)",
      },
      {
        id: "sound-shelf-v2.bulk-add",
        type: "selection-actions",
        commandId: SOUND_SHELF_V2_ADD,
        title: "Add to Shelf (v2)",
      },
      {
        id: "sound-shelf-v2.side-list",
        type: "sidebar",
        commandId: SOUND_SHELF_V2_LIST,
        title: "Sound Shelf (v2)",
      },
    ],
  };
}
