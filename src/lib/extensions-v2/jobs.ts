import { eq } from "drizzle-orm";

import {
  createV2OperationServices,
  V2JobManager,
  type V2JobReporter,
  type V2JobSnapshot,
  type V2OperationServices,
} from "@yard-core";
import { db } from "@/lib/database/connection";
import { settings } from "@/lib/schema";

import { createV2ArchivePorts } from "./archive";
import { createV2FileContentPorts, getV2GrantStore } from "./filesystem";
import { getV2Events } from "./events";
import { createV2LibraryPorts } from "./library-ports";
import { getV2Runtime } from "./runtime";
import { createV2ExtensionStatePorts, createV2SettingsPorts } from "./settings-state";

/**
 * Application v2 job wiring (Application context, R4).
 *
 * One `V2JobManager` per server process, owned by the one process-wide
 * v2 runtime (`runtime.ts`) and shared by the host and every job route,
 * so polling, reconnects, and renderer reloads always read the same
 * ownership. No v1 extension modules are imported here.
 *
 * Persistence reuses database infrastructure without a migration: the
 * manager's serializable snapshot (ownership metadata and owned output
 * paths, never grant tokens) is stored as one row in the existing
 * `settings` table, retaining the newest 50 records (R7 retention;
 * older in-memory history to 100 ages out). Every transition persists; a boot load restores
 * history and marks abandoned live jobs interrupted. Destination
 * grants live only in the runtime's in-memory grant storage, so a
 * restart expires usable access while reviewable history survives.
 */

const SNAPSHOT_KEY = "v2:jobs:snapshot";

/**
 * The manager belongs to the process-wide runtime, not module state —
 * same split as before, one key instead of two. Next compiles each
 * route into its own bundle, so a plain module-level manager forks per
 * route subtree: submit runs the job in one copy while polling reads
 * another, which restores the snapshot and reports the live job
 * `interrupted`. One realm means one manager; every bundle submits and
 * polls the same ownership. Restarts still behave as before: memory
 * goes away, history restores from the snapshot, abandoned live jobs
 * interrupt.
 */

/**
 * Progress persistence is coalesced (#258): state transitions and terminal
 * records persist immediately; progress-only ticks persist at most once per
 * interval. The typed `job-transition` event still fires only on a state
 * change, never for progress.
 */
export const JOB_PROGRESS_PERSIST_INTERVAL_MS = 2000;

export function createV2JobTransitionHandler(deps: {
  persist: () => void;
  emitTransition: (record: { jobId: string; extensionId: string; state: string }) => void;
  now?: () => number;
  intervalMs?: number;
}): (record: { jobId: string; extensionId: string; state: string }) => void {
  const now = deps.now ?? (() => Date.now());
  const intervalMs = deps.intervalMs ?? JOB_PROGRESS_PERSIST_INTERVAL_MS;
  const lastState = new Map<string, string>();
  let lastPersistedAt = 0;
  return (record) => {
    const stateChanged = lastState.get(record.jobId) !== record.state;
    const terminal =
      record.state === "succeeded" ||
      record.state === "failed" ||
      record.state === "cancelled" ||
      record.state === "interrupted";
    const currentTime = now();
    if (stateChanged || terminal || currentTime - lastPersistedAt >= intervalMs) {
      deps.persist();
      lastPersistedAt = currentTime;
    }
    if (stateChanged) {
      lastState.set(record.jobId, record.state);
      deps.emitTransition(record);
    }
  };
}

export function getV2JobManager(): V2JobManager {
  const runtime = getV2Runtime();
  if (runtime.jobs) return runtime.jobs;
  const lastEmittedState = runtime.lastEmittedJobState;
  const onTransition = createV2JobTransitionHandler({
    persist: persistV2JobSnapshot,
    emitTransition: (record) => {
      if (lastEmittedState.get(record.jobId) === record.state) return;
      lastEmittedState.set(record.jobId, record.state);
      getV2Events().emit("job-transition", record.extensionId, {
        jobId: record.jobId,
        jobState: record.state,
      });
    },
  });
  runtime.jobs = new V2JobManager({ onTransition });
  return runtime.jobs;
}

/** Narrow operation services for one job, bound to its reporter and grants. */
export function buildV2JobOperations(binding: {
  extensionId: string;
  invocationId: string;
  effectivePermissions: string[];
  reporter: V2JobReporter;
}): V2OperationServices {
  return createV2OperationServices({
    ...binding,
    grants: getV2GrantStore(),
    library: createV2LibraryPorts(),
    files: createV2FileContentPorts(),
    archive: createV2ArchivePorts(),
    settings: createV2SettingsPorts(),
    extensionState: createV2ExtensionStatePorts(),
    selectionSources: [],
    jobs: binding.reporter,
  });
}

function persistV2JobSnapshot(): void {
  try {
    const snapshot = getV2JobManager().snapshot();
    const serialized = JSON.stringify(snapshot);
    const updatedAt = new Date().toISOString();
    db.insert(settings)
      .values({ key: SNAPSHOT_KEY, value: serialized, updatedAt })
      .onConflictDoUpdate({ target: settings.key, set: { value: serialized, updatedAt } })
      .run();
  } catch {
    // Job history is diagnostic: a persistence failure must never fail
    // the job transition itself. The next transition retries.
  }
}

/**
 * Restore persisted job history once per process boot. Live jobs from
 * the previous run become `interrupted` with known outputs and a
 * recovery note; filesystem effects never replay. Grants issued before
 * the restart are already gone with the previous process's memory.
 */
export function ensureV2JobsRestored(): { restored: number; interrupted: number } {
  const runtime = getV2Runtime();
  if (runtime.jobsRestored) {
    const current = getV2JobManager().listJobs(null, 1);
    return { restored: current.jobs.length, interrupted: 0 };
  }
  runtime.jobsRestored = true;
  try {
    const row = db.select().from(settings).where(eq(settings.key, SNAPSHOT_KEY)).get();
    if (!row?.value) return { restored: 0, interrupted: 0 };
    const snapshot = JSON.parse(row.value) as V2JobSnapshot;
    const { restored, interrupted } = getV2JobManager().restoreSnapshot(snapshot);
    persistV2JobSnapshot();
    return { restored, interrupted };
  } catch {
    return { restored: 0, interrupted: 0 };
  }
}
