import {
  ExtensionV2Registry,
  V2EventBus,
  V2GrantStore,
  V2PermissionApprovals,
  V2PlanManager,
  V2SourceGrantStore,
  type ExtensionV2Host,
  type V2JobManager,
} from "@yard-core";

/**
 * The one process-owned v2 extension runtime (Application context).
 *
 * Next compiles every route into its own bundle, so plain module state
 * forks per route subtree even though the process is one realm. Before
 * this module the runtime was split: the registry, the composed host,
 * the plan manager, the event bus, and both grant stores were module
 * variables (one copy per bundle), while enablement, approvals, and the
 * job manager lived under separate `globalThis` keys. The pieces did
 * not know about each other — a plan prepared by the execute bundle was
 * unknown to the plan bundle, a grant issued by the grants bundle never
 * authorized execution, and an event emitted on the server was
 * invisible to the subscription that owned it.
 *
 * One object now owns registration, host execution, plans, grants,
 * jobs, enablement, approvals, and events, and is created once per
 * process. Every module reads its slice through `getV2Runtime()`; no
 * module keeps a second copy.
 *
 * The guard is structural, not `instanceof`: a re-evaluated module
 * (tests simulate bundles with `vi.resetModules()`) must still
 * recognize the existing runtime and never build a competing one.
 */

export type V2DestinationGrants = {
  store: V2GrantStore;
  /** Opaque picker token → grant ID; never persisted, cleared on restart. */
  tokens: Map<string, string>;
};

export type V2SourceGrants = {
  store: V2SourceGrantStore;
  tokens: Map<string, string>;
};

export type V2Runtime = {
  /** Structural brand so the process guard survives module re-evaluation. */
  readonly kind: "foleyard-v2-runtime";
  /** Registration: the definitions every bundle serves. */
  registry: ExtensionV2Registry;
  /** Review plans: prepared by execution, read and applied by the plan routes. */
  plans: V2PlanManager;
  /**
   * Host execution: handlers, the shared preflight, and operations.
   * Created lazily by `host.ts` because composing it needs application
   * ports (database, filesystem).
   */
  host: ExtensionV2Host | null;
  /** Jobs: created lazily by `jobs.ts` because persistence needs the database. */
  jobs: V2JobManager | null;
  jobsRestored: boolean;
  lastEmittedJobState: Map<string, string>;
  /** Enablement: opt-in, disabled by default, hydrated once per process. */
  enabled: Set<string>;
  enablementLoaded: boolean;
  /** Approvals: deny by default, hydrated once per process. */
  approvals: V2PermissionApprovals;
  approvalsLoaded: boolean;
  /** Grants: destination (write) and source (read) access. */
  destinationGrants: V2DestinationGrants;
  sourceGrants: V2SourceGrants;
  /** Host-owned events: the bus every adapter and renderer subscription shares. */
  events: V2EventBus;
};

const RUNTIME_KEY = Symbol.for("foleyard.v2.runtime");

/** Assemble a runtime. Exported so tests can build an isolated instance. */
export function createV2Runtime(): V2Runtime {
  const registry = new ExtensionV2Registry();
  return {
    kind: "foleyard-v2-runtime",
    registry,
    plans: new V2PlanManager(registry),
    host: null,
    jobs: null,
    jobsRestored: false,
    lastEmittedJobState: new Map(),
    enabled: new Set(),
    enablementLoaded: false,
    approvals: new V2PermissionApprovals(),
    approvalsLoaded: false,
    destinationGrants: { store: new V2GrantStore(), tokens: new Map() },
    sourceGrants: { store: new V2SourceGrantStore(), tokens: new Map() },
    events: new V2EventBus(),
  };
}

function isV2Runtime(value: unknown): value is V2Runtime {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { kind?: unknown }).kind === "foleyard-v2-runtime" &&
    typeof (value as { registry?: { get?: unknown } }).registry?.get === "function"
  );
}

/**
 * The process-wide runtime. Idempotent: repeated imports, and imports
 * from separate route bundles, all observe the same object.
 */
export function getV2Runtime(): V2Runtime {
  const scope = globalThis as unknown as Record<symbol, unknown>;
  const existing = scope[RUNTIME_KEY];
  if (isV2Runtime(existing)) return existing;
  const created = createV2Runtime();
  scope[RUNTIME_KEY] = created;
  return created;
}
