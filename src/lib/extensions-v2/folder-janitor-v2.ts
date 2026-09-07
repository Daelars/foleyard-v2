import {
  createFolderJanitorV2Definition,
  FOLDER_JANITOR_V2_ID,
  registerFolderJanitorV2Handlers,
} from "@foleyard/folder-janitor-v2";

import { getV2Registry, getAppV2Host, registerV2Extension } from "./host";

/**
 * Folder Janitor v2 production registration (Application context, J4
 * #179).
 *
 * Bundled internal port: registers the definition and handlers on the
 * process-wide app host exactly once. Registration never enables
 * (disabled by default) and never approves permissions (deny by
 * default). No auto-migration from v1: the v1 Folder Janitor keeps its
 * routes and behavior untouched. Scans read the index and list folders
 * through the E1 #176 ops; destructive deletes run through the
 * prepare/review/apply plan contract.
 */

let registered = false;

export function ensureFolderJanitorV2Registered(): void {
  if (registered) return;
  registered = true;
  if (!getV2Registry().get(FOLDER_JANITOR_V2_ID)) {
    registerV2Extension(createFolderJanitorV2Definition());
  }
  registerFolderJanitorV2Handlers(getAppV2Host());
}
