import {
  AUTO_TAG_V2_ID,
  createAutoTagV2Definition,
  registerAutoTagV2Handlers,
} from "@foleyard/auto-tag-v2";

import { getV2Registry, getAppV2Host, registerV2Extension } from "./host";

/**
 * Auto Tag v2 production registration (Application context, #190).
 *
 * Bundled internal port: registers the definition and handlers on the
 * process-wide app host exactly once. Registration never enables
 * (disabled by default) and never approves permissions (deny by
 * default). Deterministic filename rules only in this slice; semantic
 * tagging arrives in #195 through the same job path.
 */

let registered = false;

export function ensureAutoTagV2Registered(): void {
  if (registered) return;
  registered = true;
  if (!getV2Registry().get(AUTO_TAG_V2_ID)) {
    registerV2Extension(createAutoTagV2Definition());
  }
  registerAutoTagV2Handlers(getAppV2Host());
}
