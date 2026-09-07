import {
  createDropRulesV2Definition,
  DROP_RULES_V2_ID,
  registerDropRulesV2Handlers,
} from "@foleyard/drop-rules-v2";

import { getV2Registry, getAppV2Host, registerV2Extension } from "./host";

/**
 * Drop Rules v2 production registration (Application context, D6 #181).
 *
 * Bundled internal port: registers the definition and handlers on the
 * process-wide app host exactly once. Registration never enables
 * (disabled by default) and never approves permissions (deny by
 * default). No auto-migration from v1: the v1 Drop Rules keeps its
 * routes and behavior untouched. Drop-scope commands run from the real
 * application drop menu; the drop payload arrives as command input and
 * every effect runs through the E1 #176 operation services.
 */

let registered = false;

export function ensureDropRulesV2Registered(): void {
  if (registered) return;
  registered = true;
  if (!getV2Registry().get(DROP_RULES_V2_ID)) {
    registerV2Extension(createDropRulesV2Definition());
  }
  registerDropRulesV2Handlers(getAppV2Host());
}
