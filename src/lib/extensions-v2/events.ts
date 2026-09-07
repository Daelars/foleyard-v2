import { V2EventBus } from "@yard-core";

/**
 * Process-wide v2 event bus (Application context, R7).
 *
 * One bus per server process, shared by every settings/state/jobs
 * adapter and every plan route, so a request ending or a renderer
 * reload never strands subscriptions on a per-request instance. Only
 * the typed contracts in `@yard-core` cross it (`settings-changed`,
 * `state-changed`, `approvals-changed`, `job-transition`,
 * `contributions-changed`); high-frequency renderer state never does.
 * Emission always follows persistence (see `settings-state.ts`,
 * `policy.ts`, `jobs.ts`), so subscribers recover through rereads.
 * No v1 extension modules are imported here.
 */

let bus: V2EventBus | null = null;

/** Process-wide bus; renderers subscribe and dispose on unmount/disable. */
export function getV2Events(): V2EventBus {
  if (!bus) bus = new V2EventBus();
  return bus;
}
