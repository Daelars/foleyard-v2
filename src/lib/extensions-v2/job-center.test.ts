import { afterEach, describe, expect, it, vi } from "vitest";

import type { V2JobRecord } from "@yard-core";

import {
  isV2JobLive,
  isV2JobTerminal,
  listV2Jobs,
  mergeV2JobCenterJobs,
  v2JobCenterCancellation,
  v2JobCenterOutcome,
  v2JobCenterPartial,
  v2JobCenterPhase,
  v2JobCenterProgress,
} from "./job-center";

// Area: #281 durable v2 job center. The center is a renderer view over
// the durable server-side history #314 persisted and the safe results
// #279 exposed. These are the pure selectors the component renders from:
// live vs terminal, progress, cancellation requested vs stopped, the five
// distinguishable outcomes, and partial output. Plus the reconnect read
// (list the durable history) that re-attaches after a reload.

function job(overrides: Partial<V2JobRecord> = {}): V2JobRecord {
  return {
    jobId: "vjob_1",
    invocationId: "vinv_1",
    extensionId: "make-pack-v2",
    commandId: "make-pack-v2.source-selection",
    state: "running",
    createdAt: "2026-10-15T10:00:00.000Z",
    startedAt: "2026-10-15T10:00:01.000Z",
    progress: { completed: 0, total: null, updatedAt: "2026-10-15T10:00:01.000Z" },
    partial: { succeeded: 0, failed: [], incomplete: false },
    outputs: [],
    ...overrides,
  };
}

describe("v2 job center lifecycle selectors", () => {
  it("separates live from terminal jobs and names the stopping phase", () => {
    expect(isV2JobLive(job({ state: "queued" }))).toBe(true);
    expect(isV2JobLive(job({ state: "running" }))).toBe(true);
    expect(isV2JobLive(job({ state: "cancellation-requested" }))).toBe(true);
    expect(isV2JobLive(job({ state: "succeeded" }))).toBe(false);

    expect(isV2JobTerminal(job({ state: "succeeded" }))).toBe(true);
    expect(isV2JobTerminal(job({ state: "failed" }))).toBe(true);
    expect(isV2JobTerminal(job({ state: "cancelled" }))).toBe(true);
    expect(isV2JobTerminal(job({ state: "interrupted" }))).toBe(true);
    expect(isV2JobTerminal(job({ state: "running" }))).toBe(false);

    expect(v2JobCenterPhase(job({ state: "cancellation-requested" }))).toBe("stopping");
    expect(v2JobCenterPhase(job({ state: "queued" }))).toBe("queued");
    expect(v2JobCenterPhase(job({ state: "failed" }))).toBe("failed");
  });

  it("derives progress percent and a bounded label", () => {
    expect(
      v2JobCenterProgress(job({ progress: { completed: 3, total: 10, updatedAt: "t" } })),
    ).toEqual({ completed: 3, total: 10, percent: 30, label: "3/10" });
    // Unknown total: no fabricated percentage, just a count.
    expect(
      v2JobCenterProgress(job({ progress: { completed: 4, total: null, updatedAt: "t" } })),
    ).toEqual({ completed: 4, total: null, percent: null, label: "4 done" });
    expect(
      v2JobCenterProgress(job({ progress: { completed: 0, total: null, updatedAt: "t" } })),
    ).toMatchObject({ percent: null, label: "Waiting for first report" });
  });

  it("distinguishes a requested cancellation from fully stopped work", () => {
    const requested = job({
      state: "cancellation-requested",
      cancellationRequestedAt: "2026-10-15T10:00:05.000Z",
    });
    expect(v2JobCenterCancellation(requested)).toBe("requested");
    // Not stopped while the runner is still live.
    expect(requested.stoppedAt).toBeUndefined();

    const stopped = job({
      state: "cancelled",
      cancellationRequestedAt: "2026-10-15T10:00:05.000Z",
      stoppedAt: "2026-10-15T10:00:08.000Z",
      finishedAt: "2026-10-15T10:00:08.000Z",
    });
    expect(v2JobCenterCancellation(stopped)).toBe("stopped");

    expect(v2JobCenterCancellation(job({ state: "running" }))).toBe("none");
    // A late-finishing runner that ignored the request still succeeded;
    // it did not stop via cancellation, so the cancellation phase is none.
    expect(
      v2JobCenterCancellation(
        job({ state: "succeeded", cancellationRequestedAt: "2026-10-15T10:00:05.000Z" }),
      ),
    ).toBe("none");
  });

  it("distinguishes success, failure, cancellation, interruption, and live work", () => {
    const succeeded = v2JobCenterOutcome(
      job({ state: "succeeded", result: { value: { copied: 2 } } }),
    );
    expect(succeeded.kind).toBe("succeeded");
    expect(succeeded.value).toEqual({ copied: 2 });
    expect(succeeded.valueOmitted).toBe(false);

    const omitted = v2JobCenterOutcome(
      job({ state: "succeeded", result: { valueOmitted: true } }),
    );
    expect(omitted.kind).toBe("succeeded");
    expect(omitted.value).toBeUndefined();
    expect(omitted.valueOmitted).toBe(true);

    const failed = v2JobCenterOutcome(
      job({
        state: "failed",
        result: { diagnostic: { code: "handler-failed", message: "Disk full." } },
      }),
    );
    expect(failed.kind).toBe("failed");
    expect(failed.diagnostic).toEqual({ code: "handler-failed", message: "Disk full." });

    const cancelled = v2JobCenterOutcome(
      job({
        state: "cancelled",
        result: {
          diagnostic: { code: "job-cancelled", message: "Cancellation was requested." },
        },
        stoppedAt: "2026-10-15T10:00:08.000Z",
      }),
    );
    expect(cancelled.kind).toBe("cancelled");
    expect(cancelled.diagnostic?.code).toBe("job-cancelled");

    const interrupted = v2JobCenterOutcome(
      job({
        state: "interrupted",
        result: {
          diagnostic: { code: "job-interrupted", message: "The app restarted." },
        },
        recovery: {
          status: "interrupted-by-restart",
          knownOutputs: ["/out/part.mp3"],
          cleanup: "Review owned outputs before retrying.",
        },
      }),
    );
    expect(interrupted.kind).toBe("interrupted");
    expect(interrupted.diagnostic?.code).toBe("job-interrupted");

    expect(v2JobCenterOutcome(job({ state: "running" })).kind).toBe("active");
    expect(v2JobCenterOutcome(job({ state: "queued" })).kind).toBe("active");
  });

  it("exposes partial output distinctly from a clean run", () => {
    const partial = v2JobCenterPartial(
      job({
        state: "succeeded",
        partial: {
          succeeded: 3,
          failed: [{ id: "b", reason: "Missing from the index." }],
          incomplete: true,
          incompleteReason: "Stopped at the item budget.",
        },
        outputs: ["/out/a.wav"],
      }),
    );
    expect(partial.succeeded).toBe(3);
    expect(partial.failed).toEqual([{ id: "b", reason: "Missing from the index." }]);
    expect(partial.incomplete).toBe(true);
    expect(partial.incompleteReason).toMatch(/budget/);
    expect(partial.hasOutput).toBe(true);

    const clean = v2JobCenterPartial(job({ state: "queued" }));
    expect(clean.hasOutput).toBe(false);
    expect(clean.incomplete).toBe(false);
  });

  it("merges reconnect reads by id with the freshest record and newest first", () => {
    const older = job({ jobId: "vjob_a", createdAt: "2026-10-15T09:00:00.000Z" });
    const olderSettled = job({
      jobId: "vjob_a",
      createdAt: "2026-10-15T09:00:00.000Z",
      state: "succeeded",
    });
    const newer = job({ jobId: "vjob_b", createdAt: "2026-10-15T10:00:00.000Z" });

    const merged = mergeV2JobCenterJobs([older], [olderSettled, newer]);
    expect(merged.map((entry) => entry.jobId)).toEqual(["vjob_b", "vjob_a"]);
    expect(merged[1]?.state).toBe("succeeded");
  });
});

describe("v2 job center durable history read", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads the durable history page with its persistence status", async () => {
    const persistence = {
      durable: true,
      pending: false,
      lastError: null,
      lastPersistedAt: "2026-10-15T10:00:00.000Z",
      lastAttemptAt: "2026-10-15T10:00:00.000Z",
      consecutiveFailures: 0,
    };
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          jobs: [job({ state: "succeeded" })],
          nextCursor: "1",
          persistence,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await listV2Jobs({ limit: 50 });
    expect(fetchMock).toHaveBeenCalledWith("/api/extensions-v2/jobs?limit=50");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.jobs).toHaveLength(1);
      expect(result.nextCursor).toBe("1");
      expect(result.persistence?.durable).toBe(true);
    }
  });

  it("surfaces a failed or unreachable history read instead of an empty list", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const offline = await listV2Jobs();
    expect(offline.ok).toBe(false);
    if (!offline.ok) expect(offline.code).toBe("network-error");

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, error: { message: "nope" } }), {
          status: 500,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    const failed = await listV2Jobs();
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.message).toContain("nope");
  });
});
