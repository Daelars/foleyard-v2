// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createGreeterFixtureDefinition,
  ExtensionV2Host,
  ExtensionV2Registry,
  immediateV2Result,
  type IndexedAudioFile,
  type V2HostServices,
  type V2LibraryPorts,
  type V2JobRecord,
} from "@yard-core";

import { callRoute } from "@/test/fixtures";
import { POST as postJobRoute } from "@/app/api/extensions-v2/jobs/route";
import { GET as listJobRoute } from "@/app/api/extensions-v2/jobs/route";
import { getV2JobManager } from "@/lib/extensions-v2/jobs";
import { getV2Runtime, type V2JobPersistenceState } from "@/lib/extensions-v2/runtime";

// Area: #314. Server-side durability for v2 job submission and history.
// A duplicate submission whose response was lost returns the existing
// job (even across a restart); a reused key with a changed payload is
// rejected; and a persistence failure is surfaced and retried instead of
// silently dropping history. The routes, the shared runtime, the job
// manager, and the host execution path are real; only the settings table
// is substituted so a write failure can be induced deterministically.

const settings = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  failWrites: false,
}));

vi.mock("@/lib/extensions-v2/settings-state", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/extensions-v2/settings-state")>();
  return {
    ...original,
    readV2SettingsRow: (key: string) => settings.rows.get(key),
    writeV2SettingsRow: (key: string, value: unknown) => {
      if (settings.failWrites) throw new Error("settings table is read-only");
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
const SNAPSHOT_KEY = "v2:jobs:snapshot";

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

/** A real host bound to the process-wide job manager so persistence runs. */
function buildHost(): ExtensionV2Host {
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
  host.registerHandler(EXTENSION_ID, COMMAND_ID, () => immediateV2Result({ message: "ok" }));
  return host;
}

function freshPersistence(): V2JobPersistenceState {
  return {
    durable: true,
    pending: false,
    lastError: null,
    lastPersistedAt: null,
    lastAttemptAt: null,
    consecutiveFailures: 0,
  };
}

/** Drop the in-memory manager and rebuild the host, as a restart would. */
function restartServer(): void {
  const runtime = getV2Runtime();
  runtime.jobs = null;
  runtime.jobsRestored = false;
  runtime.host = buildHost();
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
  settings.failWrites = false;
  const runtime = getV2Runtime();
  saved = {
    host: runtime.host,
    jobs: runtime.jobs,
    jobsRestored: runtime.jobsRestored,
    persistence: { ...runtime.jobPersistence },
  };
  runtime.host = null;
  runtime.jobs = null;
  runtime.jobsRestored = false;
  runtime.jobPersistence = freshPersistence();
  runtime.jobPersistenceTimer = null;
  runtime.host = buildHost();
});

afterEach(() => {
  const runtime = getV2Runtime();
  runtime.host = saved.host as typeof runtime.host;
  runtime.jobs = saved.jobs as typeof runtime.jobs;
  runtime.jobsRestored = saved.jobsRestored;
  runtime.jobPersistence = saved.persistence;
  runtime.jobPersistenceTimer = null;
});

function submitBody(input: unknown, key: string) {
  return {
    extensionId: EXTENSION_ID,
    commandId: COMMAND_ID,
    input,
    selection: { fileIds: ["a"] },
    idempotencyKey: key,
  };
}

async function submit(input: unknown, key: string) {
  return callRoute<{
    ok: boolean;
    outcome?: { jobId: string; duplicate?: boolean };
    error?: { code: string };
    persistence?: V2JobPersistenceState;
  }>(postJobRoute, { url: JOBS_URL, body: submitBody(input, key) });
}

async function list() {
  return callRoute<{
    ok: boolean;
    jobs: V2JobRecord[];
    nextCursor: string | null;
    persistence?: V2JobPersistenceState;
  }>(listJobRoute, { method: "GET", url: JOBS_URL });
}

describe("v2 job submission durability", () => {
  it("returns the existing job for a resubmission after a dropped response and a restart", async () => {
    const first = await submit({ name: "Ada" }, "export-1");
    expect(first.status).toBe(202);
    const jobId = first.body.outcome!.jobId;
    await getV2JobManager().waitFor(jobId);

    // The response never reached the client; the server restarted before
    // the client's retry. The retry must resolve to the same job.
    restartServer();
    const retry = await submit({ name: "Ada" }, "export-1");
    expect(retry.status).toBe(202);
    expect(retry.body.outcome).toMatchObject({ jobId, duplicate: true });

    const history = await list();
    expect(history.body.jobs).toHaveLength(1);
    expect(history.body.jobs[0]?.jobId).toBe(jobId);
  });

  it("rejects a reused key with a changed payload, in-process and after a restart", async () => {
    const first = await submit({ name: "Ada" }, "export-2");
    expect(first.status).toBe(202);

    const conflict = await submit({ name: "Grace" }, "export-2");
    expect(conflict.status).toBe(409);
    expect(conflict.body.error?.code).toBe("idempotency-conflict");

    const same = await submit({ name: "Ada" }, "export-2");
    expect(same.status).toBe(202);
    expect(same.body.outcome?.duplicate).toBe(true);

    restartServer();
    const conflictAfterRestart = await submit({ name: "Grace" }, "export-2");
    expect(conflictAfterRestart.status).toBe(409);
    expect(conflictAfterRestart.body.error?.code).toBe("idempotency-conflict");
  });

  it("surfaces a persistence failure and retries it instead of dropping history", async () => {
    settings.failWrites = true;
    const submitted = await submit({ name: "Ada" }, "export-3");
    expect(submitted.status).toBe(202);
    expect(submitted.body.persistence?.durable).toBe(false);
    expect(submitted.body.persistence?.pending).toBe(true);
    expect(typeof submitted.body.persistence?.lastError).toBe("string");
    expect(settings.rows.has(SNAPSHOT_KEY)).toBe(false);

    // The next read retries the pending write; history is not lost.
    settings.failWrites = false;
    const recovered = await list();
    expect(recovered.status).toBe(200);
    expect(recovered.body.persistence?.durable).toBe(true);
    expect(recovered.body.persistence?.pending).toBe(false);
    expect(settings.rows.has(SNAPSHOT_KEY)).toBe(true);

    // Prove the retry was durable: restart and read back the history.
    restartServer();
    const afterRestart = await list();
    expect(afterRestart.body.jobs).toHaveLength(1);
  });
});
