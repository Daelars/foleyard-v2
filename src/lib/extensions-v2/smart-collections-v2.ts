import {
  createSmartCollectionsV2Definition,
  registerSmartCollectionsV2Handlers,
  SMART_COLLECTIONS_V2_ID,
} from "@foleyard/smart-collections-v2";

import { getV2Registry, getAppV2Host, registerV2Extension } from "./host";

/**
 * Smart Collections v2 production registration (Application context,
 * C3 #178).
 *
 * Bundled internal port: registers the definition and handlers on the
 * process-wide app host exactly once. Registration never enables
 * (disabled by default) and never approves permissions (deny by
 * default). No auto-migration from v1: the v1 Smart Collections keeps
 * its own routes and behavior untouched. The save-search write runs
 * through the v2 collections op, whose adapter validates the query
 * against the app-owned filter service.
 */

let registered = false;

export function ensureSmartCollectionsV2Registered(): void {
  if (registered) return;
  registered = true;
  if (!getV2Registry().get(SMART_COLLECTIONS_V2_ID)) {
    registerV2Extension(createSmartCollectionsV2Definition());
  }
  registerSmartCollectionsV2Handlers(getAppV2Host());
}
