import type { V2JobRecord } from "@yard-core";

/**
 * Polling status client for v2 jobs (Application context, R4).
 *
 * The transport is stateless polling, so reconnect and reload behavior
 * is just polling again: keep the job ID (URL, local state), re-GET it
 * after any interruption, and back off between attempts. Ownership
 * stays on the host; a request ending never strands it.
 */

export type V2JobPollResult =
  | { ok: true; job: V2JobRecord }
  | { ok: false; code: string; message: string };

const TERMINAL = new Set(["succeeded", "failed", "cancelled", "interrupted"]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Fetch one job's status once. */
export async function fetchV2JobStatus(jobId: string): Promise<V2JobPollResult> {
  let response: Response;
  try {
    response = await fetch(`/api/extensions-v2/jobs/${encodeURIComponent(jobId)}`);
  } catch (error) {
    return {
      ok: false,
      code: "network-error",
      message: `Job status request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  let body: unknown;
  try {
    body = (await response.json()) as unknown;
  } catch {
    return { ok: false, code: "network-error", message: "Job status response was not JSON." };
  }
  if (!response.ok || typeof body !== "object" || body === null) {
    const error = (body as { error?: { code?: string; message?: string } }).error;
    return {
      ok: false,
      code: error?.code ?? "request-failed",
      message: error?.message ?? `Job status request failed with ${response.status}.`,
    };
  }
  return { ok: true, job: (body as { job: V2JobRecord }).job };
}

/**
 * Poll until the job reaches a terminal state. Survives transient
 * fetch failures by retrying with linear backoff; callers survive a
 * full reload by calling again with the same job ID.
 */
export async function pollV2JobUntilSettled(
  jobId: string,
  options?: { intervalMs?: number; maxAttempts?: number; signal?: AbortSignal },
): Promise<V2JobPollResult> {
  const intervalMs = Math.max(100, options?.intervalMs ?? 1000);
  const maxAttempts = Math.max(1, options?.maxAttempts ?? 300);
  let last: V2JobPollResult = {
    ok: false,
    code: "poll-exhausted",
    message: "Polling ended before the job settled.",
  };
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (options?.signal?.aborted) return last;
    const current = await fetchV2JobStatus(jobId);
    last = current;
    if (current.ok && TERMINAL.has(current.job.state)) return current;
    if (!current.ok && current.code === "job-unknown") return current;
    await delay(current.ok ? intervalMs : intervalMs * 2);
  }
  return last;
}

/** Request cancellation for a job. Idempotent on terminal jobs. */
export async function requestV2JobCancel(jobId: string): Promise<V2JobPollResult> {
  let response: Response;
  try {
    response = await fetch(`/api/extensions-v2/jobs/${encodeURIComponent(jobId)}/cancel`, {
      method: "POST",
    });
  } catch (error) {
    return {
      ok: false,
      code: "network-error",
      message: `Cancel request failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  const body = (await response.json()) as
    | { ok: true; job: V2JobRecord }
    | { ok: false; error: { code: string; message: string } };
  if (!response.ok || !body.ok) {
    const error = (body as { error?: { code?: string; message?: string } }).error;
    return {
      ok: false,
      code: error?.code ?? "request-failed",
      message: error?.message ?? `Cancel request failed with ${response.status}.`,
    };
  }
  return { ok: true, job: (body as { ok: true; job: V2JobRecord }).job };
}
