import type { V2EventBus } from "@yard-core";

import { getV2Runtime } from "./runtime";

/**
 * Process-wide v2 event bus (Application context, R7).
 *
 * One bus per server process, shared by every settings/state/jobs
 * adapter and every plan route, so a request ending or a renderer
 * reload never strands subscriptions on a per-request instance. The bus
 * belongs to the one process-wide runtime (`runtime.ts`), so the
 * subscription a renderer adapter owns observes events emitted by any
 * route bundle. Only the typed contracts in `@yard-core` cross it
 * (`settings-changed`, `state-changed`, `approvals-changed`,
 * `job-transition`, `contributions-changed`); high-frequency renderer
 * state never does. Emission always follows persistence (see
 * `settings-state.ts`, `policy.ts`, `jobs.ts`), so subscribers recover
 * through rereads. No v1 extension modules are imported here.
 */

/** Process-wide bus; renderers subscribe and dispose on unmount/disable. */
export function getV2Events(): V2EventBus {
  return getV2Runtime().events;
}
