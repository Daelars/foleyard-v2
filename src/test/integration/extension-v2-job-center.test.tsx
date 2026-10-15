// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { V2JobRecord } from "@yard-core";

import { V2JobCenter } from "@/components/extensions-v2/job-center";
import type { V2JobPersistenceState } from "@/lib/extensions-v2/runtime";

// Area: #281 durable v2 job center. The center is a renderer lifecycle
// over the durable server-side history (#314) and the bounded terminal
// results (#279). These tests drive the live component against a mocked
// job API and pin the acceptance criteria: reconnect lists the durable
// history, live progress updates while the job runs, cancellation is
// idempotent and only reported stopped once work has unwound, and
// success, failure, cancellation, interruption, and partial output are
// all distinguishable. Fetch is mocked; the component, hook, and view
// model are real.

const LIST_URL = "/api/extensions-v2/jobs?limit=50";

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

const durable: V2JobPersistenceState = {
  durable: true,
  pending: false,
  lastError: null,
  lastPersistedAt: "2026-10-15T10:00:00.000Z",
  lastAttemptAt: "2026-10-15T10:00:00.000Z",
  consecutiveFailures: 0,
};

type World = {
  jobs: V2JobRecord[];
  persistence: V2JobPersistenceState;
  listCalls: number;
  cancelCalls: string[];
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function installFetch(world: World, onPoll?: () => void) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = (init?.method ?? "GET").toUpperCase();

      if (method === "GET" && (url === LIST_URL || url === "/api/extensions-v2/jobs")) {
        world.listCalls += 1;
        return jsonResponse({
          ok: true,
          jobs: world.jobs,
          nextCursor: null,
          persistence: world.persistence,
        });
      }
      const cancelMatch = /\/api\/extensions-v2\/jobs\/([^/]+)\/cancel$/.exec(url);
      if (method === "POST" && cancelMatch) {
        const jobId = decodeURIComponent(cancelMatch[1]!);
        world.cancelCalls.push(jobId);
        const target = world.jobs.find((entry) => entry.jobId === jobId);
        if (target && (target.state === "running" || target.state === "queued")) {
          target.state = "cancellation-requested";
          target.cancellationRequestedAt = "2026-10-15T10:00:05.000Z";
        }
        return jsonResponse({ ok: true, job: target });
      }
      const getMatch = /\/api\/extensions-v2\/jobs\/([^/]+)$/.exec(url);
      if (method === "GET" && getMatch) {
        onPoll?.();
        return jsonResponse({ ok: true, job: world.jobs.find((entry) => entry.jobId === getMatch[1]) });
      }
      return jsonResponse({ ok: false, error: { code: "not-found", message: `unexpected ${method} ${url}` } }, 404);
    }),
  );
}

let world: World;

beforeEach(() => {
  world = { jobs: [], persistence: { ...durable }, listCalls: 0, cancelCalls: [] };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("v2 job center", () => {
  it("reconnects to the durable history and distinguishes every terminal outcome", async () => {
    world.jobs = [
      job({
        jobId: "vjob_success",
        extensionId: "make-pack-v2",
        state: "succeeded",
        result: { value: { copied: 2 } },
        partial: { succeeded: 2, failed: [], incomplete: false },
        outputs: ["/out/pack"],
      }),
      job({
        jobId: "vjob_failed",
        extensionId: "library-gatherer-v2",
        state: "failed",
        result: { diagnostic: { code: "handler-failed", message: "Disk full." } },
      }),
      job({
        jobId: "vjob_cancelled",
        extensionId: "folder-janitor-v2",
        state: "cancelled",
        cancellationRequestedAt: "2026-10-15T10:00:05.000Z",
        stoppedAt: "2026-10-15T10:00:08.000Z",
        result: {
          diagnostic: { code: "job-cancelled", message: "Cancellation was requested; the job stopped." },
        },
      }),
      job({
        jobId: "vjob_interrupted",
        extensionId: "auto-tag-v2",
        state: "interrupted",
        recovery: {
          status: "interrupted-by-restart",
          knownOutputs: ["/out/part"],
          cleanup: "The app restarted while this job was live.",
        },
        result: {
          diagnostic: { code: "job-interrupted", message: "The app restarted while this job was live." },
        },
      }),
      job({
        jobId: "vjob_partial",
        extensionId: "drop-rules-v2",
        state: "succeeded",
        result: { valueOmitted: true },
        partial: {
          succeeded: 3,
          failed: [{ id: "b", reason: "Missing from the index." }],
          incomplete: true,
          incompleteReason: "Stopped at the item budget.",
        },
      }),
      job({ jobId: "vjob_live", extensionId: "make-pack-v2", state: "running" }),
    ];
    installFetch(world);

    render(<V2JobCenter pollIntervalMs={20} />);

    await waitFor(() =>
      expect(screen.getAllByText("Succeeded").length).toBeGreaterThanOrEqual(2),
    );
    expect(world.listCalls).toBeGreaterThanOrEqual(1);

    // Four distinct terminal outcomes plus live work are all rendered.
    expect(screen.getByText("Failed")).toBeTruthy();
    expect(screen.getByText("Cancelled")).toBeTruthy();
    expect(screen.getByText("Interrupted")).toBeTruthy();
    expect(screen.getByText("Running")).toBeTruthy();

    // The declared result survives; failure, cancellation, and
    // interruption carry their bounded diagnostics.
    expect(screen.getByText(/\{"copied":2\}/)).toBeTruthy();
    expect(screen.getByText("Disk full.")).toBeTruthy();
    expect(screen.getAllByText(/Cancellation was requested/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/app restarted/).length).toBeGreaterThanOrEqual(1);

    // Partial output is explicit: counts, the per-item reason, and the
    // early-stop reason, plus an omitted-result notice.
    expect(screen.getByText(/3 succeeded/)).toBeTruthy();
    expect(screen.getByText(/Missing from the index\./)).toBeTruthy();
    expect(screen.getByText(/Stopped at the item budget\./)).toBeTruthy();
    expect(screen.getByText(/Result too large/)).toBeTruthy();
  });

  it("updates live progress while the job is running", async () => {
    // The history read always serves the live 0/10 record; only a status
    // poll can serve 5/10, so 5/10 on screen proves the poll was applied
    // rather than the first paint. The mock then holds the job at 5/10
    // until this test releases it: the poll interval is 20ms, so a mock
    // that advanced the job to terminal on its own clock would give the
    // intermediate render a lifetime shorter than one event-loop turn,
    // and `waitFor` yields one turn (the testing-library async wrapper)
    // before the caller reads the DOM again.
    let statusPolls = 0;
    let finish = false;
    world.jobs = [
      job({
        jobId: "vjob_progress",
        state: "running",
        progress: { completed: 0, total: 10, updatedAt: "2026-10-15T10:00:01.000Z" },
      }),
    ];
    installFetch(world, () => {
      statusPolls += 1;
      const target = world.jobs[0]!;
      target.progress = { completed: 5, total: 10, updatedAt: "t" };
      if (finish) {
        target.state = "succeeded";
        target.progress = { completed: 10, total: 10, updatedAt: "t" };
        target.result = { value: { message: "done" } };
      }
    });

    render(<V2JobCenter pollIntervalMs={20} />);

    await waitFor(() =>
      expect(screen.getByRole("progressbar", { name: "Job progress: vjob_progress" })).toBeTruthy(),
    );
    // Progress moves on a poll, not only on the first paint, and it stays
    // there because the job is still running in the mock.
    await waitFor(() => expect(screen.getByText("5/10")).toBeTruthy());
    expect(statusPolls).toBeGreaterThanOrEqual(1);
    expect(
      screen
        .getByRole("progressbar", { name: "Job progress: vjob_progress" })
        .getAttribute("aria-valuenow"),
    ).toBe("50");

    // A terminal poll stops the loop and renders the result.
    finish = true;
    await waitFor(() => expect(screen.getByText("Succeeded")).toBeTruthy());
    expect(screen.getByText(/\{"message":"done"\}/)).toBeTruthy();
  });

  it("cancels once and reports stopped only after the work unwinds", async () => {
    world.jobs = [job({ jobId: "vjob_cancel", state: "running" })];
    installFetch(world);

    render(<V2JobCenter pollIntervalMs={20} />);

    const cancel = await screen.findByRole("button", { name: "Cancel job vjob_cancel" });
    fireEvent.click(cancel);

    // The request is a cancellation-requested state, not a stop.
    await waitFor(() => expect(screen.getByText("Stopping")).toBeTruthy());
    expect(world.cancelCalls).toEqual(["vjob_cancel"]);
    // The cancel affordance is gone while it unwinds, so a second click
    // cannot be sent from the center.
    expect(screen.queryByRole("button", { name: "Cancel job vjob_cancel" })).toBeNull();

    // The runner unwinds; the next poll reports fully stopped.
    world.jobs[0]!.state = "cancelled";
    world.jobs[0]!.stoppedAt = "2026-10-15T10:00:09.000Z";
    world.jobs[0]!.result = {
      diagnostic: { code: "job-cancelled", message: "Cancellation was requested." },
    };
    await waitFor(() => expect(screen.getByText("Cancelled")).toBeTruthy());
    expect(screen.getByText("Stopped")).toBeTruthy();
  });

  it("surfaces a persistence failure so history is not silently missing", async () => {
    world.jobs = [job({ jobId: "vjob_durability", state: "succeeded", result: { value: {} } })];
    world.persistence = {
      ...durable,
      durable: false,
      pending: true,
      lastError: "settings table is read-only",
      consecutiveFailures: 1,
    };
    installFetch(world);

    render(<V2JobCenter pollIntervalMs={20} />);

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert.textContent).toContain("settings table is read-only"));
    expect(within(alert).getByText(/history/i)).toBeTruthy();
  });
});
