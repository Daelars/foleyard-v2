// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import {
  createGreeterFixtureDefinition,
  ExtensionV2Host,
  ExtensionV2Registry,
  immediateV2Result,
  type IndexedAudioFile,
  type V2CommandHandler,
  type V2HostServices,
  type V2JobRecord,
  type V2LibraryPorts,
} from "@yard-core";

import { POST as postJobRoute } from "@/app/api/extensions-v2/jobs/route";
import { GET as listJobRoute } from "@/app/api/extensions-v2/jobs/route";
import { POST as cancelJobRoute } from "@/app/api/extensions-v2/jobs/[jobId]/cancel/route";
import {
  isV2JobLive,
  isV2JobTerminal,
  mergeV2JobCenterJobs,
  v2JobCenterOutcome,
  v2JobCenterPhase,
} from "@/lib/extensions-v2/job-center";
import { getV2JobManager } from "@/lib/extensions-v2/jobs";
import { getV2Runtime, type V2JobPersistenceState } from "@/lib/extensions-v2/runtime";
import { callRoute } from "@/test/fixtures";

// Area: #281 durable v2 job center. The center owns no job state, so its
// reconnect is a re-read of the durable server history: a renderer reload
// re-attaches to a still-running job, and reopening the application (a
// real restart, memory gone, snapshot restored) brings back the terminal
// jobs and marks the ones that were live interrupted. This drives the
// real job routes and the process-wide runtime, then feeds the served
// records through the center's own view model. Only the settings table is
// substituted so the restart is deterministic.

const settings = vi.hoisted(() => ({ rows: new Map<string, unknown>() }));

vi.mock("@/lib/extensions-v2/settings-state", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/extensions-v2/settings-state")>();
  return {
    ...original,
    readV2SettingsRow: (key: string) => settings.rows.get(key),
    writeV2SettingsRow: (key: string, value: unknown) => {
      settings.rows.set(key, value);
    },
    deleteV2SettingsRow: (key: string) => {
      settings.rows.delete(key);
    },
    listV2SettingsKeys: (prefix: string) =>
      [...settings.rows.keys()].filter((key) => key.startsWith(prefix)),
  };
});

const EXTENSION_ID = "fixture-greeter";
const COMMAND_ID = "fixture-greeter.greet";
const JOBS_URL = "http://localhost/api/extensions-v2/jobs";

function file(): IndexedAudioFile {
  return {
    id: "a",
    path: "/lib/a.mp3",
    filename: "a.mp3",
    libraryRoot: "/lib",
    directory: null,
    format: "mp3",
    duration: 60,
    sampleRate: 44100,
    bitDepth: 16,
    channels: 2,
    fileSize: 1,
    isFavorite: false,
    removedAt: null,
    lastScannedAt: "2026-09-06T00:00:00.000Z",
    mtimeMs: 1,
  };
}

const library: V2LibraryPorts = {
  getFileById: (id) => (id === "a" ? file() : null),
  getFilesByIds: (ids) => ids.filter((id) => id === "a").map(() => file()),
  collectionExists: () => true,
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function buildHost(
  handler: V2CommandHandler = () => immediateV2Result({ message: "ok" }),
): ExtensionV2Host {
  const registry = new ExtensionV2Registry();
  registry.register(createGreeterFixtureDefinition());
  const services: V2HostServices = {
    registry,
    isEnabled: () => true,
    capabilities: new Set<string>(),
    grantedPermissions: () => ["library:read"],
    ports: library,
    jobManager: getV2JobManager(),
  };
  const host = new ExtensionV2Host(services);
  host.registerHandler(EXTENSION_ID, COMMAND_ID, handler);
  return host;
}

type Saved = {
  host: unknown;
  jobs: unknown;
  jobsRestored: boolean;
  persistence: V2JobPersistenceState;
};

let saved: Saved;

beforeEach(() => {
  settings.rows.clear();
  const runtime = getV2Runtime();
  saved = {
    host: runtime.host,
    jobs: runtime.jobs,
    jobsRestored: runtime.jobsRestored,
    persistence: { ...runtime.jobPersistence },
  };
  runtime.host = buildHost();
  runtime.jobs = runtime.host.jobs;
  runtime.jobsRestored = true;
});

afterEach(() => {
  const runtime = getV2Runtime();
  runtime.host = saved.host as typeof runtime.host;
  runtime.jobs = saved.jobs as typeof runtime.jobs;
  runtime.jobsRestored = saved.jobsRestored;
  runtime.jobPersistence = saved.persistence;
  runtime.jobPersistenceTimer = null;
});

/** Drop the in-memory manager and rebuild the host, as reopening would. */
function reopen(handler?: Parameters<typeof buildHost>[0]): void {
  const runtime = getV2Runtime();
  runtime.jobs = null;
  runtime.jobsRestored = false;
  const host = buildHost(handler);
  runtime.host = host;
  runtime.jobs = host.jobs;
}

async function submit(input: unknown, key: string): Promise<string> {
  const response = await callRoute<{ ok: boolean; outcome?: { jobId: string } }>(postJobRoute, {
    url: JOBS_URL,
    body: {
      extensionId: EXTENSION_ID,
      commandId: COMMAND_ID,
      input,
      selection: { fileIds: ["a"] },
      idempotencyKey: key,
    },
  });
  expect(response.status).toBe(202);
  return response.body.outcome!.jobId;
}

/** The center's reconnect read: the durable history over the real route. */
async function readHistory(): Promise<V2JobRecord[]> {
  const response = await callRoute<{ ok: boolean; jobs: V2JobRecord[] }>(listJobRoute, {
    method: "GET",
    url: JOBS_URL,
  });
  expect(response.status).toBe(200);
  expect(response.body.ok).toBe(true);
  return response.body.jobs;
}

describe("v2 job center reconnect over the real job routes", () => {
  it("re-attaches to a still-running job after a renderer reload", async () => {
    const gate = deferred();
    reopen(async (context) => {
      await gate.promise;
      context.operations.jobs.throwIfCancelled();
      return immediateV2Result({ message: "done" });
    });

    const jobId = await submit({ name: "Ada" }, "reload-1");
    await tick();

    // Reload: read the history freshly and reconcile into a blank center.
    const jobs = mergeV2JobCenterJobs([], await readHistory());
    const job = jobs.find((entry) => entry.jobId === jobId)!;
    expect(job).toBeDefined();
    expect(isV2JobLive(job)).toBe(true);
    expect(v2JobCenterPhase(job)).toBe("running");
    expect(v2JobCenterOutcome(job).kind).toBe("active");

    gate.resolve();
    const settled = await getV2JobManager().waitFor(jobId);
    expect(settled.state).toBe("succeeded");
  });

  it("reconnects to terminal history, and shows live-at-restart work as interrupted, after reopening", async () => {
    const gate = deferred();

    // A job that reaches success before the restart.
    reopen();
    const doneId = await submit({ name: "Done" }, "reopen-done");
    await getV2JobManager().waitFor(doneId);
    expect(getV2JobManager().getJob(doneId)?.state).toBe("succeeded");

    // A job that is still running when the application closes.
    reopen(async (context) => {
      await gate.promise;
      context.operations.jobs.throwIfCancelled();
      return immediateV2Result({ message: "finished" });
    });
    const liveId = await submit({ name: "Live" }, "reopen-live");
    await tick();
    expect(getV2JobManager().getJob(liveId)?.state).toBe("running");

    // Reopen the application: memory is gone, the snapshot restores.
    reopen();

    const jobs = mergeV2JobCenterJobs([], await readHistory());
    const done = jobs.find((entry) => entry.jobId === doneId)!;
    const live = jobs.find((entry) => entry.jobId === liveId)!;

    expect(done.state).toBe("succeeded");
    expect(isV2JobTerminal(done)).toBe(true);
    expect(v2JobCenterOutcome(done).kind).toBe("succeeded");

    expect(live.state).toBe("interrupted");
    expect(isV2JobTerminal(live)).toBe(true);
    const interrupted = v2JobCenterOutcome(live);
    expect(interrupted.kind).toBe("interrupted");
    expect(interrupted.diagnostic?.code).toBe("job-interrupted");

    gate.resolve();
  });

  it("cancels idempotently and reports stopped only once the runner unwinds", async () => {
    const gate = deferred();
    reopen(async (context) => {
      await gate.promise;
      context.operations.jobs.throwIfCancelled();
      return immediateV2Result({ message: "unreachable" });
    });
    const jobId = await submit({ name: "Ada" }, "cancel-1");
    await tick();

    const cancel = () =>
      cancelJobRoute(new NextRequest(`${JOBS_URL}/${jobId}/cancel`, { method: "POST" }), {
        params: Promise.resolve({ jobId }),
      });
    const first = (await (await cancel()).json()) as { ok: boolean; job: V2JobRecord };
    expect(first.job.state).toBe("cancellation-requested");
    expect(first.job.stoppedAt).toBeUndefined();

    const second = (await (await cancel()).json()) as { ok: boolean; job: V2JobRecord };
    expect(second.job.cancellationRequestedAt).toBe(first.job.cancellationRequestedAt);

    gate.resolve();
    const stopped = await getV2JobManager().waitFor(jobId);
    expect(stopped.state).toBe("cancelled");
    expect(stopped.stoppedAt).toBeDefined();

    const jobs = mergeV2JobCenterJobs([], await readHistory());
    const job = jobs.find((entry) => entry.jobId === jobId)!;
    expect(v2JobCenterOutcome(job).kind).toBe("cancelled");
  });
});
