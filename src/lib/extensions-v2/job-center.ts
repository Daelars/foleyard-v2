import type { V2JobPartialFailure, V2JobRecord } from "@yard-core";

import type { V2JobPersistenceState } from "./runtime";

/**
 * Durable v2 job center — renderer view model (Application context, #281).
 *
 * The job center is a renderer lifecycle over the durable server-side
 * history #314 persists and the bounded terminal results #279 exposes.
 * It owns no job state of its own: every value here is derived from a
 * `V2JobRecord` returned by the job API, so closing a dialog, reloading
 * the renderer, or reopening the application never loses a job — the
 * center re-attaches by reading the history again.
 *
 * Framework-free: records in, plain values out. The hook
 * (`use-v2-job-center`) and the component (`job-center.tsx`) render
 * these; keeping the classification pure is what lets the lifecycle
 * edges (requested vs stopped cancellation, partial output, the five
 * terminal outcomes) be tested without a DOM or a network.
 */

/** Live states the center keeps polling. Everything else is terminal. */
export const V2_JOB_CENTER_LIVE_STATES = [
  "queued",
  "running",
  "cancellation-requested",
] as const;

export type V2JobCenterPhase =
  | "queued"
  | "running"
  | "stopping"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";

export type V2JobCenterOutcomeKind =
  | "active"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "interrupted";

export type V2JobCenterDiagnostic = { code: string; message: string };

export type V2JobCenterOutcome = {
  kind: V2JobCenterOutcomeKind;
  /** Short human label for the phase the job settled in. */
  label: string;
  /** Bounded, schema-shaped terminal value, when one survived. */
  value?: unknown;
  /** True when a declared result existed but was dropped as oversized. */
  valueOmitted: boolean;
  /** Bounded, redacted diagnostic for a failed, cancelled, or interrupted job. */
  diagnostic?: V2JobCenterDiagnostic;
};

export type V2JobCenterProgress = {
  completed: number;
  total: number | null;
  /** Integer percentage, or null when the total is not knowable. */
  percent: number | null;
  label: string;
};

export type V2JobCenterCancellation = "none" | "requested" | "stopped";

export type V2JobCenterPartial = {
  succeeded: number;
  failed: V2JobPartialFailure[];
  incomplete: boolean;
  incompleteReason?: string;
  /** True when there is any partial output worth surfacing. */
  hasOutput: boolean;
};

export function isV2JobLive(job: V2JobRecord): boolean {
  return (V2_JOB_CENTER_LIVE_STATES as readonly string[]).includes(job.state);
}

export function isV2JobTerminal(job: V2JobRecord): boolean {
  return !isV2JobLive(job);
}

/**
 * The phase the center renders. `cancellation-requested` is the only
 * live state that reads differently from its raw name: to a person the
 * job is *stopping*, not merely "cancellation requested".
 */
export function v2JobCenterPhase(job: V2JobRecord): V2JobCenterPhase {
  if (job.state === "cancellation-requested") return "stopping";
  return job.state;
}

export function v2JobCenterProgress(job: V2JobRecord): V2JobCenterProgress {
  const { completed, total } = job.progress;
  const percent =
    total !== null && total > 0
      ? Math.max(0, Math.min(100, Math.round((completed / total) * 100)))
      : null;
  const label =
    total !== null ? `${completed}/${total}` : completed > 0 ? `${completed} done` : "Waiting for first report";
  return { completed, total, percent, label };
}

/**
 * Whether cancellation is untouched, requested-but-still-unwinding, or
 * fully stopped. "Stopped" is only the terminal `cancelled` state with a
 * recorded stop time; a live job that has merely been asked to cancel is
 * never rendered as stopped, because it may still be writing.
 */
export function v2JobCenterCancellation(job: V2JobRecord): V2JobCenterCancellation {
  if (job.state === "cancelled" && job.stoppedAt) return "stopped";
  if (job.state === "cancellation-requested") return "requested";
  return "none";
}

/**
 * Classify the terminal outcome. Success, failure, cancellation, and
 * interruption are distinct kinds; live work is `active`. Partial output
 * is reported separately by `v2JobCenterPartial`, so a succeeded job
 * that ran incompletely is still distinguishable from a clean success.
 */
export function v2JobCenterOutcome(job: V2JobRecord): V2JobCenterOutcome {
  const diagnostic = job.result?.diagnostic
    ? { code: job.result.diagnostic.code, message: job.result.diagnostic.message }
    : undefined;
  switch (job.state) {
    case "succeeded":
      return {
        kind: "succeeded",
        label: "Succeeded",
        ...(job.result?.value !== undefined ? { value: job.result.value } : {}),
        valueOmitted: job.result?.valueOmitted === true,
      };
    case "failed":
      return {
        kind: "failed",
        label: "Failed",
        valueOmitted: false,
        ...(diagnostic
          ? { diagnostic }
          : job.error
            ? { diagnostic: { code: job.error.code, message: job.error.message } }
            : {}),
      };
    case "cancelled":
      return { kind: "cancelled", label: "Cancelled", valueOmitted: false, ...(diagnostic ? { diagnostic } : {}) };
    case "interrupted":
      return {
        kind: "interrupted",
        label: "Interrupted",
        valueOmitted: false,
        ...(diagnostic
          ? { diagnostic }
          : job.recovery
            ? { diagnostic: { code: "job-interrupted", message: job.recovery.cleanup } }
            : {}),
      };
    default:
      return {
        kind: "active",
        label: job.state === "queued" ? "Queued" : job.state === "cancellation-requested" ? "Stopping" : "Running",
        valueOmitted: false,
      };
  }
}

export function v2JobCenterPartial(job: V2JobRecord): V2JobCenterPartial {
  const failed = job.partial.failed;
  return {
    succeeded: job.partial.succeeded,
    failed,
    incomplete: job.partial.incomplete,
    ...(job.partial.incompleteReason !== undefined
      ? { incompleteReason: job.partial.incompleteReason }
      : {}),
    hasOutput:
      job.partial.succeeded > 0 ||
      failed.length > 0 ||
      job.outputs.length > 0 ||
      job.partial.incomplete,
  };
}

/**
 * Merge a reconnect read (or a single polled record) into the current
 * list. Incoming records win by job id, so a fresher polled state
 * replaces the stale one; order is newest first, matching the history
 * route. A job that has aged out of the page stays until the next full
 * refresh replaces the whole list.
 */
export function mergeV2JobCenterJobs(
  current: readonly V2JobRecord[],
  incoming: readonly V2JobRecord[],
): V2JobRecord[] {
  const byId = new Map<string, V2JobRecord>();
  for (const record of current) byId.set(record.jobId, record);
  for (const record of incoming) byId.set(record.jobId, record);
  return [...byId.values()].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );
}

export type V2JobCenterListResult =
  | {
      ok: true;
      jobs: V2JobRecord[];
      nextCursor: string | null;
      persistence?: V2JobPersistenceState;
    }
  | { ok: false; code: string; message: string };

/**
 * Read one page of the durable job history. This is the reconnect: the
 * renderer keeps no ownership, so after a reload (or the whole
 * application reopening) it lists the server's history and re-attaches
 * to whatever is still live or already terminal.
 */
export async function listV2Jobs(
  options: { cursor?: string | null; limit?: number } = {},
): Promise<V2JobCenterListResult> {
  const params = new URLSearchParams();
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.limit !== undefined) params.set("limit", String(options.limit));
  const query = params.toString();
  const url = `/api/extensions-v2/jobs${query ? `?${query}` : ""}`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    return {
      ok: false,
      code: "network-error",
      message: `Job history request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  let body: unknown;
  try {
    body = (await response.json()) as unknown;
  } catch {
    return { ok: false, code: "network-error", message: "Job history response was not JSON." };
  }
  const typed = (typeof body === "object" && body !== null ? body : {}) as {
    ok?: boolean;
    jobs?: unknown;
    nextCursor?: unknown;
    persistence?: V2JobPersistenceState;
    error?: { code?: string; message?: string };
  };
  if (!response.ok || typed.ok !== true || !Array.isArray(typed.jobs)) {
    return {
      ok: false,
      code: typed.error?.code ?? "request-failed",
      message: typed.error?.message ?? `Job history request failed with ${response.status}.`,
    };
  }
  return {
    ok: true,
    jobs: typed.jobs as V2JobRecord[],
    nextCursor: typeof typed.nextCursor === "string" ? typed.nextCursor : null,
    ...(typed.persistence ? { persistence: typed.persistence } : {}),
  };
}
