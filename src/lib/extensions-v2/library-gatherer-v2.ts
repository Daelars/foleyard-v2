import {
  createLibraryGathererV2Definition,
  LIBRARY_GATHERER_V2_ID,
  registerLibraryGathererV2Handlers,
} from "@foleyard/library-gatherer-v2";

import { getV2Registry, getAppV2Host, registerV2Extension } from "./host";

/**
 * Library Gatherer v2 production registration (Application context, G5
 * #180).
 *
 * Bundled internal port: registers the definition and handlers on the
 * process-wide app host exactly once. Registration never enables
 * (disabled by default) and never approves permissions (deny by
 * default). No auto-migration from v1: the v1 Library Gatherer keeps
 * its routes and behavior untouched. Preview plans output names with
 * no side effects; gather copies through source grants and inserts
 * index records via the E1 #176 ops.
 */

let registered = false;

export function ensureLibraryGathererV2Registered(): void {
  if (registered) return;
  registered = true;
  if (!getV2Registry().get(LIBRARY_GATHERER_V2_ID)) {
    registerV2Extension(createLibraryGathererV2Definition());
  }
  registerLibraryGathererV2Handlers(getAppV2Host());
}
