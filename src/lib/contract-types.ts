/**
 * Internal contract vocabulary shared by the runtime catalogs
 * (`src/lib/capabilities.ts`, `src/lib/events.ts`). The version 1
 * extension vocabulary that previously owned these aliases was removed
 * with the v1 engine.
 */

export type FeatureStatus = "shipped" | "experimental" | "proposed";

export type ContractStanding =
  | "internal"
  | "public-experimental"
  | "public-stable";
