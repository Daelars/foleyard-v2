import {
  createMakePackV2Definition,
  MAKE_PACK_V2_ID,
  registerMakePackV2Handlers,
} from "@foleyard/make-pack-v2";

import {
  getV2Registry,
  getAppV2Host,
  registerV2Extension,
} from "./host";

/**
 * Make Pack v2 production registration (Application context, R8).
 *
 * Bundled internal example: registers the definition and handlers on
 * the process-wide app host exactly once. Registration never enables
 * (disabled by default; explicit enable/disable through the generic
 * extensions PATCH route) and never approves permissions (deny by
 * default; explicit approval through the approvals route). No
 * auto-migration from v1: the v1 Make Pack keeps its own settings
 * namespace, routes, and behavior untouched.
 */

let registered = false;

export function ensureMakePackV2Registered(): void {
  if (registered) return;
  registered = true;
  if (!getV2Registry().get(MAKE_PACK_V2_ID)) {
    registerV2Extension(createMakePackV2Definition());
  }
  registerMakePackV2Handlers(getAppV2Host());
}
