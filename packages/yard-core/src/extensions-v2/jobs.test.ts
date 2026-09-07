import { describe, expect, it } from "vitest";

import type { IndexedAudioFile } from "../domain/audio-file";
import {
  assertNoV2Secrets,
  createGreeterFixtureDefinition,
  createV2OperationServices,
  ExtensionV2Host,
  ExtensionV2Registry,
  handleV2HttpJobCancel,
  handleV2HttpJobGet,
  handleV2HttpJobList,
  handleV2HttpJobSubmit,
  immediateV2Result,
  isV2JobCancellation,
  jobV2Result,
  reviewV2Result,
  sanitizeV2IdempotencyKey,
  MAX_V2_JOB_SNAPSHOT_RETAINED,
  V2GrantStore,
  V2JobCancelledError,
  V2JobManager,
  V2OperationError,
  type V2CommandHandler,
  type V2FileContentPorts,
  type V2HostServices,
  type V2JobRecord,
  type V2LibraryReadPorts,
} from "./index";
import { audioFile, fakePathIo, libraryPorts } from "./test-helpers";

// Area: extension v2 R4 (#168). Host-owned job lifecycle: bounded
// concurrency, timestamps, progress, partial outcomes, cooperative
// cancellation, idempotent invocation keys, restart interruption,
// disable/disposal, polling transport, and 5000+ bounded iteration.

function tickClock() {
  let step = 0;
  return () => {
    step += 1;
    return `2026-09-06T00:00:00.${String(step).padStart(3, "0")}Z`;
  };
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function record(id: string, path = `/lib/${id}.mp3`): IndexedAudioFile {
  return audioFile(id, { path, filename: `${id}.mp3` });
}

function pagedLibrary(files: IndexedAudioFile[]): V2LibraryReadPorts {
  return {
    getFileById: (id) => files.find((file) => file.id === id) ?? null,
    getFilesByIds: (ids) => ids.flatMap((id) => files.filter((file) => file.id === id)),
    listPage: (cursor, limit) => {
      const offset = cursor ? Number.parseInt(cursor, 10) : 0;
      const page = files.slice(offset, offset + limit);
      const next = offset + page.length;
      return { files: page, nextCursor: next < files.length ? String(next) : null };
    },
  };
}

function hostServices(overrides?: Partial<V2HostServices>): V2HostServices {
  const registry = new ExtensionV2Registry();
  registry.register(createGreeterFixtureDefinition());
  return {
    registry,
    isEnabled: () => true,
    capabilities: new Set<string>(),
    grantedPermissions: () => ["library:read"],
    ports: libraryPorts([record("a"), record("b")]),
    ...overrides,
  };
}

function greetJobHost(next: V2HostServices, handler?: V2CommandHandler) {
  const host = new ExtensionV2Host(next);
  host.registerHandler(
    "fixture-greeter",
    "fixture-greeter.greet",
    handler ?? (() => immediateV2Result({ message: "done" })),
  );
  return host;
}

describe("V2JobManager lifecycle", () => {
  it("runs queued work with identifiers, timestamps, and bounded concurrency", async () => {
    const clock = tickClock();
    const manager = new V2JobManager({ clock, maxConcurrent: 2 });
    const gates: string[] = [];
    const first = deferred();
    const second = deferred();
    const submitted = [
      manager.submit({
        extensionId: "ext", commandId: "cmd", invocationId: "vinv_1",
        run: async () => { await first.promise; return { value: 1 }; },
      }),
      manager.submit({
        extensionId: "ext", commandId: "cmd", invocationId: "vinv_2",
        run: async () => { await second.promise; return { value: 2 }; },
      }),
      manager.submit({
        extensionId: "ext", commandId: "cmd", invocationId: "vinv_3",
        run: async () => { gates.push("third-ran"); return { value: 3 }; },
      }),
    ];
    expect(submitted[0].record.jobId.startsWith("vjob_")).toBe(true);
    expect(submitted[0].record.state).toBe("running");
    expect(submitted[1].record.state).toBe("running");
    expect(submitted[2].record.state).toBe("queued");

    first.resolve();
    const done = await manager.waitFor(submitted[0].record.jobId);
    expect(done.state).toBe("succeeded");
    expect(done.startedAt).toBeDefined();
    expect(done.finishedAt).toBeDefined();
    expect(done.stoppedAt).toBeDefined();
    expect(done.startedAt! >= done.createdAt).toBe(true);
    expect(done.finishedAt! >= done.startedAt!).toBe(true);

    second.resolve();
    await manager.waitFor(submitted[1].record.jobId);
    const third = await manager.waitFor(submitted[2].record.jobId);
    expect(third.state).toBe("succeeded");
    expect(gates).toEqual(["third-ran"]);
  });

  it("starts queued work FIFO with a concurrency bound of one", async () => {
    const manager = new V2JobManager({ clock: tickClock(), maxConcurrent: 1 });
    const order: string[] = [];
    const first = deferred();
    const a = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_a",
      run: async () => { await first.promise; order.push("a"); return {}; },
    });
    const b = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_b",
      run: async () => { order.push("b"); return {}; },
    });
    expect(manager.getJob(a.record.jobId)?.state).toBe("running");
    expect(manager.getJob(b.record.jobId)?.state).toBe("queued");
    first.resolve();
    await manager.waitFor(b.record.jobId);
    expect(order).toEqual(["a", "b"]);
  });

  it("records progress through the job-bound reporter", async () => {
    const manager = new V2JobManager({ clock: tickClock() });
    const gate = deferred();
    const submitted = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_1",
      run: async (context) => {
        context.reporter.reportProgress(2, 5);
        await gate.promise;
        context.reporter.reportProgress(5, 5);
        return { succeeded: 5 };
      },
    });
    await tick();
    expect(manager.getJob(submitted.record.jobId)?.progress).toMatchObject({
      completed: 2, total: 5,
    });
    gate.resolve();
    const done = await manager.waitFor(submitted.record.jobId);
    expect(done.progress).toMatchObject({ completed: 5, total: 5 });
    expect(done.partial.succeeded).toBe(5);
  });

  it("represents partial work explicitly on success and failure", async () => {
    const manager = new V2JobManager({ clock: tickClock() });
    const partial = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_p",
      run: async () => ({
        succeeded: 3,
        failed: [{ id: "gone", reason: "Missing from the Library index." }],
      }),
    });
    const done = await manager.waitFor(partial.record.jobId);
    expect(done.state).toBe("succeeded");
    expect(done.partial).toMatchObject({
      succeeded: 3,
      failed: [{ id: "gone", reason: "Missing from the Library index." }],
      incomplete: false,
    });

    const failed = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_f",
      run: async () => ({
        succeeded: 1,
        failed: [{ id: "bad", reason: "Unreadable source." }],
        error: { code: "handler-failed", message: "Export stopped after failures." },
      }),
    });
    const terminal = await manager.waitFor(failed.record.jobId);
    expect(terminal.state).toBe("failed");
    expect(terminal.error).toMatchObject({ code: "handler-failed" });
    expect(terminal.partial.succeeded).toBe(1);
  });

  it("reports an explicit incomplete outcome when the runner stops early", async () => {
    const manager = new V2JobManager({ clock: tickClock() });
    const submitted = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_i",
      run: async () => ({
        succeeded: 1000,
        incomplete: true,
        incompleteReason: "Stopped at the 1000-item budget; narrow the selection and rerun.",
      }),
    });
    const done = await manager.waitFor(submitted.record.jobId);
    expect(done.state).toBe("succeeded");
    expect(done.partial.incomplete).toBe(true);
    expect(done.partial.incompleteReason).toMatch(/1000-item budget/);
  });

  it("maps runner failures to typed v2 codes without a v1 fallback", async () => {
    const manager = new V2JobManager({ clock: tickClock() });
    const denied = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_d",
      run: async () => {
        throw new V2OperationError("permission-denied", "No grant.");
      },
    });
    expect((await manager.waitFor(denied.record.jobId)).error).toMatchObject({
      code: "permission-denied",
    });
    const crashed = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_c",
      run: async () => { throw new Error("boom"); },
    });
    expect((await manager.waitFor(crashed.record.jobId)).error).toMatchObject({
      code: "handler-failed",
    });
  });
});

describe("v2 cooperative cancellation", () => {
  it("holds cancellation-requested until the runner stops writing", async () => {
    const manager = new V2JobManager({ clock: tickClock() });
    const release = deferred();
    const writes: string[] = [];
    const submitted = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_1",
      run: async (context) => {
        await release.promise;
        writes.push("final-chunk");
        context.reporter.throwIfCancelled();
        return { succeeded: 1 };
      },
    });
    await tick();
    expect(manager.getJob(submitted.record.jobId)?.state).toBe("running");

    const cancelled = manager.requestCancel(submitted.record.jobId);
    expect(cancelled?.state).toBe("cancellation-requested");
    expect(cancelled?.cancellationRequestedAt).toBeDefined();
    // Still writing: no stop time, no terminal state.
    const mid = manager.getJob(submitted.record.jobId);
    expect(mid?.state).toBe("cancellation-requested");
    expect(mid?.stoppedAt).toBeUndefined();

    release.resolve();
    const done = await manager.waitFor(submitted.record.jobId);
    expect(writes).toEqual(["final-chunk"]);
    expect(done.state).toBe("cancelled");
    expect(done.stoppedAt).toBeDefined();
    expect(done.cancellationRequestedAt).toBeDefined();
    expect(done.cancellationRequestedAt! <= done.stoppedAt!).toBe(true);
  });

  it("cancels queued work immediately", async () => {
    const manager = new V2JobManager({ clock: tickClock(), maxConcurrent: 1 });
    const release = deferred();
    const first = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_1",
      run: async () => { await release.promise; return {}; },
    });
    const second = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_2",
      run: async () => ({ value: "unreachable" }),
    });
    const cancelled = manager.requestCancel(second.record.jobId);
    expect(cancelled?.state).toBe("cancelled");
    expect(cancelled?.stoppedAt).toBeDefined();
    release.resolve();
    await manager.waitFor(first.record.jobId);
    expect(manager.getJob(second.record.jobId)?.state).toBe("cancelled");
  });

  it("lets a late-finishing runner stand with the request time kept", async () => {
    const manager = new V2JobManager({ clock: tickClock() });
    const submitted = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_1",
      run: async () => ({ value: "finished-anyway" }),
    });
    manager.requestCancel(submitted.record.jobId);
    const done = await manager.waitFor(submitted.record.jobId);
    expect(done.state).toBe("succeeded");
    expect(done.cancellationRequestedAt).toBeDefined();
  });

  it("surfaces cancellation through operation services between ops", async () => {
    const manager = new V2JobManager({ clock: tickClock() });
    const release = deferred();
    const submitted = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_1",
      run: async (context) => {
        await release.promise;
        context.reporter.throwIfCancelled();
        return { value: "pending" };
      },
    });
    await tick();
    expect(manager.getJob(submitted.record.jobId)?.state).toBe("running");
    const reporter = manager.reporterFor(submitted.record.jobId);
    const grants = new V2GrantStore(() => "2026-09-06T00:00:00.000Z");
    const grant = grants.issue("ext", "/grant");
    const bytes = new Map<string, Uint8Array>([["/lib/a.mp3", new TextEncoder().encode("audio")]]);
    const io = fakePathIo(["/lib", "/lib/a.mp3", "/grant"]);
    const files: V2FileContentPorts = {
      readFileBytes: async (path) => bytes.get(path)!,
      copyFile: async (source, dest) => { bytes.set(dest, bytes.get(source)!); },
      writeFileBytes: async (dest, data) => { bytes.set(dest, data); },
      deleteFile: async (path) => { bytes.delete(path); },
      exists: async (path) => bytes.has(path),
      libraryRoots: () => ["/lib"],
      pathIo: () => io,
    };
    const services = createV2OperationServices({
      extensionId: "ext",
      invocationId: "vinv_1",
      effectivePermissions: ["library:read", "files:read", "files:copy"],
      grants,
      library: pagedLibrary([record("a")]),
      files,
      archive: { createZipArchive: async () => ({ bytesWritten: 0 }) },
      settings: { readRaw: () => undefined, writeRaw: () => {} },
      extensionState: { readAll: () => ({}), writeAll: () => {} },
      jobs: reporter,
    });
    expect(new TextDecoder().decode(await services.files.readFile("a"))).toBe("audio");
    manager.requestCancel(submitted.record.jobId);
    await expect(services.files.readFile("a")).rejects.toBeInstanceOf(V2JobCancelledError);
    await expect(services.files.copyToOutput("a", "copy.mp3", grant.grantId)).rejects.toSatisfy(
      isV2JobCancellation,
    );
    release.resolve();
    const terminal = await manager.waitFor(submitted.record.jobId);
    expect(terminal.state).toBe("cancelled");
  });
});

describe("v2 job idempotency", () => {
  it("never starts duplicate work for the same invocation key", async () => {
    const manager = new V2JobManager({ clock: tickClock() });
    let runs = 0;
    const spec = {
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_1", idempotencyKey: "export-1",
      run: async () => { runs += 1; return { value: runs }; },
    };
    const first = manager.submit(spec);
    const second = manager.submit({ ...spec, invocationId: "vinv_2" });
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(second.record.jobId).toBe(first.record.jobId);
    expect(second.record.invocationId).toBe("vinv_1");
    await manager.waitFor(first.record.jobId);
    // Terminal jobs still deduplicate while history retains them.
    const third = manager.submit({ ...spec, invocationId: "vinv_3" });
    expect(third.duplicate).toBe(true);
    expect(runs).toBe(1);
  });

  it("scopes keys by extension and command, and validates their shape", () => {
    expect(sanitizeV2IdempotencyKey(undefined)).toBeUndefined();
    expect(sanitizeV2IdempotencyKey("export-1:2026.09")).toBe("export-1:2026.09");
    expect(() => sanitizeV2IdempotencyKey("")).toThrow(/idempotencyKey/);
    expect(() => sanitizeV2IdempotencyKey("has space")).toThrow(/idempotencyKey/);
    expect(() => sanitizeV2IdempotencyKey("x".repeat(129))).toThrow(/idempotencyKey/);
    expect(() => sanitizeV2IdempotencyKey(42)).toThrow(/idempotencyKey/);
  });

  it("treats the same key for another extension as distinct work", async () => {
    const manager = new V2JobManager({ clock: tickClock() });
    const first = manager.submit({
      extensionId: "one", commandId: "cmd", invocationId: "vinv_1", idempotencyKey: "shared",
      run: async () => ({}),
    });
    const second = manager.submit({
      extensionId: "two", commandId: "cmd", invocationId: "vinv_2", idempotencyKey: "shared",
      run: async () => ({}),
    });
    expect(second.duplicate).toBe(false);
    expect(second.record.jobId).not.toBe(first.record.jobId);
    await manager.waitFor(first.record.jobId);
    await manager.waitFor(second.record.jobId);
  });

  it("forgets keys only when bounded history evicts them", async () => {
    const manager = new V2JobManager({ clock: tickClock(), maxHistory: 2 });
    const first = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_1", idempotencyKey: "k",
      run: async () => ({}),
    });
    await manager.waitFor(first.record.jobId);
    const b = manager.submit({ extensionId: "ext", commandId: "cmd", invocationId: "vinv_b", run: async () => ({}) });
    await manager.waitFor(b.record.jobId);
    const c = manager.submit({ extensionId: "ext", commandId: "cmd", invocationId: "vinv_c", run: async () => ({}) });
    await manager.waitFor(c.record.jobId);
    expect(manager.getJob(first.record.jobId)).toBeNull();
    const retry = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_2", idempotencyKey: "k",
      run: async () => ({}),
    });
    expect(retry.duplicate).toBe(false);
    await manager.waitFor(retry.record.jobId);
  });
});

describe("v2 job restart and reload", () => {
  it("marks abandoned jobs interrupted with known outputs and no replay", async () => {
    const manager = new V2JobManager({ clock: tickClock() });
    let runs = 0;
    const release = deferred();
    const live = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_live", idempotencyKey: "live",
      destination: { grantId: "vgrant_old", rootPath: "/grant" },
      run: async () => { runs += 1; await release.promise; return { outputs: ["/grant/part.mp3"] }; },
    });
    // Snapshot while the job is live but its runner has not yet run to
    // completion: the restarted manager must never replay it.
    const snapshot = manager.snapshot();
    const liveSnap = snapshot.jobs.find((job) => job.jobId === live.record.jobId)!;
    expect(liveSnap.state).toBe("running");
    liveSnap.outputs = ["/grant/part.mp3"];
    liveSnap.progress = { completed: 4, total: 10, updatedAt: liveSnap.createdAt };

    const restarted = new V2JobManager({ clock: tickClock() });
    const { restored, interrupted, ignored } = restarted.restoreSnapshot(snapshot);
    expect({ restored, interrupted, ignored }).toEqual({ restored: 1, interrupted: 1, ignored: 0 });
    const record = restarted.getJob(live.record.jobId)!;
    expect(record.state).toBe("interrupted");
    expect(record.recovery?.status).toBe("interrupted-by-restart");
    expect(record.recovery?.knownOutputs).toEqual(["/grant/part.mp3"]);
    expect(record.recovery?.cleanup).toMatch(/fresh invocation key/);
    expect(record.stoppedAt).toBeDefined();
    await tick();
    await tick();
    expect(restarted.getJob(live.record.jobId)?.state).toBe("interrupted");
    // The original manager still owns its runner exactly once; the
    // restored copy never replayed filesystem effects.
    release.resolve();
    await manager.waitFor(live.record.jobId);
    expect(runs).toBe(1);
    expect(restarted.getJob(live.record.jobId)?.state).toBe("interrupted");
  });

  it("keeps terminal history and ignores malformed entries", async () => {
    const manager = new V2JobManager({ clock: tickClock() });
    const done = manager.submit({ extensionId: "ext", commandId: "cmd", invocationId: "vinv_1", run: async () => ({ value: 1 }) });
    await manager.waitFor(done.record.jobId);
    const snapshot = manager.snapshot();
    const restarted = new V2JobManager({ clock: tickClock() });
    const result = restarted.restoreSnapshot({
      ...snapshot,
      jobs: [...snapshot.jobs, { nope: true }, null, { jobId: 42 }],
    });
    expect(result).toMatchObject({ restored: 1, interrupted: 0, ignored: 3 });
    expect(restarted.getJob(done.record.jobId)?.state).toBe("succeeded");
    expect(restarted.restoreSnapshot(null)).toEqual({ restored: 0, interrupted: 0, ignored: 0 });
  });

  it("retains only the newest records in persisted snapshots (R7 retention)", async () => {
    const manager = new V2JobManager({ clock: tickClock(), maxHistory: 100 });
    for (let index = 0; index < 60; index += 1) {
      const submitted = manager.submit({
        extensionId: "ext",
        commandId: "cmd",
        invocationId: `vinv_${index}`,
        idempotencyKey: `key-${index}`,
        run: async () => ({ value: index }),
      });
      await manager.waitFor(submitted.record.jobId);
    }
    const snapshot = manager.snapshot();
    expect(snapshot.jobs).toHaveLength(MAX_V2_JOB_SNAPSHOT_RETAINED);
    // Newest retained: the last submitted job survives the bound.
    expect(snapshot.jobs[snapshot.jobs.length - 1]?.invocationId).toBe("vinv_59");
    const restarted = new V2JobManager({ clock: tickClock() });
    const result = restarted.restoreSnapshot(snapshot);
    expect(result).toMatchObject({ restored: MAX_V2_JOB_SNAPSHOT_RETAINED, ignored: 0 });
  });

  it("persists ownership metadata without grant tokens", async () => {
    const manager = new V2JobManager({ clock: tickClock() });
    const done = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_1", idempotencyKey: "k",
      destination: { grantId: "vgrant_abc", rootPath: "/grant" },
      run: async () => ({ outputs: ["/grant/out.mp3"] }),
    });
    await manager.waitFor(done.record.jobId);
    const snapshot = manager.snapshot();
    assertNoV2Secrets(snapshot, "job snapshot");
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toMatch(/token/i);
    expect(serialized).not.toMatch(/secret/i);
    const entry = snapshot.jobs[0] as V2JobRecord & { value?: unknown };
    expect(entry.destination).toEqual({ grantId: "vgrant_abc", rootPath: "/grant" });
    expect(entry.value).toBeUndefined();
  });
});

describe("v2 disable and disposal", () => {
  it("rejects new work and cancels live jobs when the extension is disabled", async () => {
    let enabled = true;
    const manager = new V2JobManager({ clock: tickClock(), maxConcurrent: 1 });
    const host = greetJobHost(
      hostServices({ isEnabled: () => enabled, jobManager: manager }),
      () => immediateV2Result({ message: "done" }),
    );
    const release = deferred();
    let runs = 0;
    host.registerHandler("fixture-greeter", "fixture-greeter.greet", async (context) => {
      runs += 1;
      await release.promise;
      context.operations.jobs.throwIfCancelled();
      return immediateV2Result({ message: "done" });
    });
    const first = await host.submitJob({
      extensionId: "fixture-greeter", commandId: "fixture-greeter.greet",
      input: { name: "Ada" }, selection: { fileIds: ["a"] },
    });
    expect(first.ok).toBe(true);
    const second = await host.submitJob({
      extensionId: "fixture-greeter", commandId: "fixture-greeter.greet",
      input: { name: "Ada" }, selection: { fileIds: ["a"] },
    });
    expect(second.ok).toBe(true);

    enabled = false;
    const outcome = host.cancelExtensionJobs(
      "fixture-greeter",
      `Extension "Fixture Greeter" is disabled; enable it to run "Greet selection".`,
    );
    expect(outcome).toEqual({ queued: 1, running: 1 });

    const queuedId = second.ok && second.outcome.kind === "job" ? second.outcome.jobId : "";
    expect(manager.getJob(queuedId)?.state).toBe("cancelled");
    expect(manager.getJob(queuedId)?.error).toMatchObject({ code: "extension-disabled" });

    const runningId = first.ok && first.outcome.kind === "job" ? first.outcome.jobId : "";
    expect(manager.getJob(runningId)?.state).toBe("cancellation-requested");

    const rejected = await host.submitJob({
      extensionId: "fixture-greeter", commandId: "fixture-greeter.greet",
      input: { name: "Ada" }, selection: { fileIds: ["a"] },
    });
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.code).toBe("extension-disabled");

    release.resolve();
    const running = await manager.waitFor(runningId);
    expect(running.state).toBe("cancelled");
    expect(runs).toBe(1);
  });

  it("disposes job-owned incomplete output while unrelated files survive", async () => {
    const manager = new V2JobManager({ clock: tickClock() });
    const grants = new V2GrantStore(() => "2026-09-06T00:00:00.000Z");
    const grant = grants.issue("ext", "/grant");
    const bytes = new Map<string, Uint8Array>([
      ["/lib/a.mp3", new TextEncoder().encode("audio")],
      ["/grant/unrelated.txt", new TextEncoder().encode("keep me")],
    ]);
    const io = fakePathIo(["/lib", "/lib/a.mp3", "/grant", "/grant/unrelated.txt"]);
    const files: V2FileContentPorts = {
      readFileBytes: async (path) => bytes.get(path)!,
      copyFile: async (source, dest) => { bytes.set(dest, bytes.get(source)!); },
      writeFileBytes: async (dest, data) => { bytes.set(dest, data); },
      deleteFile: async (path) => { bytes.delete(path); },
      exists: async (path) => bytes.has(path),
      libraryRoots: () => ["/lib"],
      pathIo: () => io,
    };
    const release = deferred();
    const submitted = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_1",
      run: async (context) => {
        const services = createV2OperationServices({
          extensionId: "ext",
          invocationId: "vinv_1",
          effectivePermissions: ["library:read", "files:read", "files:copy", "files:write"],
          grants,
          library: pagedLibrary([record("a")]),
          files,
          archive: { createZipArchive: async () => ({ bytesWritten: 0 }) },
          settings: { readRaw: () => undefined, writeRaw: () => {} },
          extensionState: { readAll: () => ({}), writeAll: () => {} },
          jobs: context.reporter,
        });
        await services.files.copyToOutput("a", "partial.mp3", grant.grantId);
        await release.promise;
        context.reporter.throwIfCancelled();
        return { outputs: services.workspace.ownedPaths() };
      },
    });
    await tick();
    manager.requestCancel(submitted.record.jobId);
    release.resolve();
    const done = await manager.waitFor(submitted.record.jobId);
    expect(done.state).toBe("cancelled");
    // The runner disposes its owned incomplete output after owned work settles.
    expect(bytes.has("/grant/partial.mp3")).toBe(true);
    expect(bytes.has("/grant/unrelated.txt")).toBe(true);
  });
});

describe("ExtensionV2Host.submitJob", () => {
  it("shares the execution preflight with direct invocation", async () => {
    const host = greetJobHost(hostServices(), () => immediateV2Result({ message: "hi" }));
    const unknown = await host.submitJob({
      extensionId: "fixture-greeter", commandId: "fixture-greeter.missing",
      input: { name: "Ada" }, selection: { fileIds: ["a"] },
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) expect(unknown.code).toBe("command-unknown");

    const disabled = greetJobHost(hostServices({ isEnabled: () => false }));
    const denied = await disabled.submitJob({
      extensionId: "fixture-greeter", commandId: "fixture-greeter.greet",
      input: { name: "Ada" }, selection: { fileIds: ["a"] },
    });
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.code).toBe("extension-disabled");

    const badKey = await host.submitJob({
      extensionId: "fixture-greeter", commandId: "fixture-greeter.greet",
      input: { name: "Ada" }, selection: { fileIds: ["a"] }, idempotencyKey: "not a key!",
    });
    expect(badKey.ok).toBe(false);
    if (!badKey.ok) expect(badKey.code).toBe("input-invalid");
  });

  it("runs the handler with job-bound progress and completes the value", async () => {
    const host = greetJobHost(hostServices(), (context) => {
      context.operations.jobs.reportProgress(1, 1);
      return immediateV2Result({ message: "job-done" });
    });
    const submitted = await host.submitJob({
      extensionId: "fixture-greeter", commandId: "fixture-greeter.greet",
      input: { name: "Ada" }, selection: { fileIds: ["a"] }, idempotencyKey: "job-1",
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok || submitted.outcome.kind !== "job") throw new Error("expected job outcome");
    expect(submitted.outcome.jobId.startsWith("vjob_")).toBe(true);
    const done = await host.jobs.waitFor(submitted.outcome.jobId);
    expect(done.state).toBe("succeeded");
    expect(done.progress).toMatchObject({ completed: 1, total: 1 });
    expect(done.value).toEqual({ message: "job-done" });

    const duplicate = await host.submitJob({
      extensionId: "fixture-greeter", commandId: "fixture-greeter.greet",
      input: { name: "Ada" }, selection: { fileIds: ["a"] }, idempotencyKey: "job-1",
    });
    expect(duplicate.ok).toBe(true);
    if (duplicate.ok && duplicate.outcome.kind === "job") {
      expect(duplicate.outcome.duplicate).toBe(true);
      expect(duplicate.outcome.jobId).toBe(submitted.outcome.jobId);
    } else {
      throw new Error("expected duplicate job outcome");
    }
  });

  it("rejects review and job returns inside job mode, and maps operation errors", async () => {
    const reviewed = greetJobHost(hostServices(), () =>
      reviewV2Result("plan-1", "Confirm", "2026-09-07T00:00:00.000Z"),
    );
    const review = await reviewed.submitJob({
      extensionId: "fixture-greeter", commandId: "fixture-greeter.greet",
      input: { name: "Ada" }, selection: { fileIds: ["a"] },
    });
    expect(review.ok).toBe(true);
    if (review.ok && review.outcome.kind === "job") {
      expect((await reviewed.jobs.waitFor(review.outcome.jobId)).error).toMatchObject({
        code: "result-invalid",
      });
    }

    const nested = greetJobHost(hostServices(), () => jobV2Result("job-x", "queued"));
    const nestedSubmit = await nested.submitJob({
      extensionId: "fixture-greeter", commandId: "fixture-greeter.greet",
      input: { name: "Ada" }, selection: { fileIds: ["a"] },
    });
    expect(nestedSubmit.ok).toBe(true);
    if (nestedSubmit.ok && nestedSubmit.outcome.kind === "job") {
      expect((await nested.jobs.waitFor(nestedSubmit.outcome.jobId)).error).toMatchObject({
        code: "result-invalid",
      });
    }

    const denied = greetJobHost(hostServices({ grantedPermissions: () => ["library:read"] }), async (context) => {
      // Preflight passes on library:read, but the file read needs
      // files:read, so the operation service denies inside the job.
      await context.operations.files.readFile("a");
      return immediateV2Result({ message: "unreachable" });
    });
    const deniedSubmit = await denied.submitJob({
      extensionId: "fixture-greeter", commandId: "fixture-greeter.greet",
      input: { name: "Ada" }, selection: { fileIds: ["a"] },
    });
    expect(deniedSubmit.ok).toBe(true);
    if (deniedSubmit.ok && deniedSubmit.outcome.kind === "job") {
      expect((await denied.jobs.waitFor(deniedSubmit.outcome.jobId)).error).toMatchObject({
        code: "permission-denied",
      });
    }
  });

  it("fails cancelled runners through cooperative observation", async () => {
    const release = deferred();
    const host = greetJobHost(hostServices(), async (context) => {
      await release.promise;
      context.operations.jobs.throwIfCancelled();
      return immediateV2Result({ message: "unreachable" });
    });
    const submitted = await host.submitJob({
      extensionId: "fixture-greeter", commandId: "fixture-greeter.greet",
      input: { name: "Ada" }, selection: { fileIds: ["a"] },
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok || submitted.outcome.kind !== "job") throw new Error("expected job");
    await tick();
    expect(host.cancelJob(submitted.outcome.jobId)?.state).toBe("cancellation-requested");
    release.resolve();
    expect((await host.jobs.waitFor(submitted.outcome.jobId)).state).toBe("cancelled");
  });
});

describe("v2 job polling transport", () => {
  function submittedHost() {
    const host = greetJobHost(hostServices(), () => immediateV2Result({ message: "hi" }));
    return host;
  }

  it("accepts submits with 202 and reports duplicates without new work", async () => {
    const host = submittedHost();
    const first = await handleV2HttpJobSubmit(host, {
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: ["a"] },
      idempotencyKey: "http-export-1",
    });
    expect(first.status).toBe(202);
    const firstJob = (first.body as { outcome: { jobId: string } }).outcome.jobId;
    const second = await handleV2HttpJobSubmit(host, {
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: ["a"] },
      idempotencyKey: "http-export-1",
    });
    expect(second.status).toBe(202);
    expect((second.body as { outcome: { jobId: string; duplicate?: boolean } }).outcome).toMatchObject({
      jobId: firstJob,
      duplicate: true,
    });
    const bad = await handleV2HttpJobSubmit(host, {
      extensionId: "fixture-greeter",
      commandId: "fixture-greeter.greet",
      input: { name: "Ada" },
      selection: { fileIds: ["a"] },
      idempotencyKey: "bad key!",
    });
    expect(bad.status).toBe(400);
  });

  it("polls status, lists bounded history, and cancels idempotently", async () => {
    const host = submittedHost();
    const submit = async (key: string) =>
      handleV2HttpJobSubmit(host, {
        extensionId: "fixture-greeter",
        commandId: "fixture-greeter.greet",
        input: { name: "Ada" },
        selection: { fileIds: ["a"] },
        idempotencyKey: key,
      });
    await submit("k-1");
    await submit("k-2");
    await submit("k-3");
    const ids = host.jobs.listJobs().jobs.map((job) => job.jobId);
    expect(ids).toHaveLength(3);

    const status = handleV2HttpJobGet(host.jobs, ids[0]!);
    expect(status.status).toBe(200);
    expect((status.body as { job: V2JobRecord }).job.jobId).toBe(ids[0]);

    expect(handleV2HttpJobGet(host.jobs, "vjob_missing").status).toBe(404);
    const missing = handleV2HttpJobGet(host.jobs, "vjob_missing");
    expect((missing.body as { error: { code: string } }).error.code).toBe("job-unknown");

    const page = handleV2HttpJobList(host.jobs, { limit: 2 });
    expect(page.status).toBe(200);
    const pageBody = page.body as { jobs: V2JobRecord[]; nextCursor: string | null };
    expect(pageBody.jobs).toHaveLength(2);
    expect(pageBody.nextCursor).not.toBeNull();
    const rest = handleV2HttpJobList(host.jobs, { cursor: pageBody.nextCursor, limit: 2 });
    expect((rest.body as { jobs: V2JobRecord[] }).jobs).toHaveLength(1);
    expect(handleV2HttpJobList(host.jobs, { limit: -1 }).status).toBe(400);

    // Terminal jobs cancel idempotently: same record, no state move.
    await host.jobs.waitFor(ids[0]!);
    const cancel = handleV2HttpJobCancel(host.jobs, ids[0]!);
    expect(cancel.status).toBe(200);
    expect((cancel.body as { job: V2JobRecord }).job.state).toBe("succeeded");
    expect(handleV2HttpJobCancel(host.jobs, "vjob_missing").status).toBe(404);
  });
});

describe("v2 job bounded Library iteration", () => {
  it("pages 5200 records through bounded iteration with progress", async () => {
    const files = Array.from({ length: 5200 }, (_, index) => record(`f-${index}`));
    const manager = new V2JobManager({ clock: tickClock() });
    let pages = 0;
    const submitted = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_bulk",
      run: async (context) => {
        const services = createV2OperationServices({
          extensionId: "ext",
          invocationId: "vinv_bulk",
          effectivePermissions: ["library:read"],
          grants: new V2GrantStore(() => "2026-09-06T00:00:00.000Z"),
          library: pagedLibrary(files),
          files: {
            readFileBytes: async () => new Uint8Array(),
            copyFile: async () => {},
            writeFileBytes: async () => {},
            deleteFile: async () => {},
            exists: async () => false,
            libraryRoots: () => [],
            pathIo: () => fakePathIo([]),
          },
          archive: { createZipArchive: async () => ({ bytesWritten: 0 }) },
          settings: { readRaw: () => undefined, writeRaw: () => {} },
          extensionState: { readAll: () => ({}), writeAll: () => {} },
          jobs: context.reporter,
        });
        let cursor: string | null = null;
        let total = 0;
        for (;;) {
          context.reporter.throwIfCancelled();
          const page = services.library.listPage(cursor, 500);
          expect(page.files.length).toBeLessThanOrEqual(500);
          total += page.files.length;
          pages += 1;
          context.reporter.reportProgress(total, files.length);
          if (!page.nextCursor) break;
          cursor = page.nextCursor;
          if (pages > 20) throw new Error("paging escaped its bound");
        }
        return { succeeded: total };
      },
    });
    const done = await manager.waitFor(submitted.record.jobId);
    expect(done.state).toBe("succeeded");
    expect(done.partial.succeeded).toBe(5200);
    expect(done.progress).toMatchObject({ completed: 5200, total: 5200 });
    expect(pages).toBe(11);
  });

  it("reports an incomplete scan explicitly instead of a misleading success", async () => {
    const files = Array.from({ length: 5200 }, (_, index) => record(`f-${index}`));
    const manager = new V2JobManager({ clock: tickClock() });
    const submitted = manager.submit({
      extensionId: "ext", commandId: "cmd", invocationId: "vinv_cap",
      run: async (context) => {
        const services = createV2OperationServices({
          extensionId: "ext",
          invocationId: "vinv_cap",
          effectivePermissions: ["library:read"],
          grants: new V2GrantStore(() => "2026-09-06T00:00:00.000Z"),
          library: pagedLibrary(files),
          files: {
            readFileBytes: async () => new Uint8Array(),
            copyFile: async () => {},
            writeFileBytes: async () => {},
            deleteFile: async () => {},
            exists: async () => false,
            libraryRoots: () => [],
            pathIo: () => fakePathIo([]),
          },
          archive: { createZipArchive: async () => ({ bytesWritten: 0 }) },
          settings: { readRaw: () => undefined, writeRaw: () => {} },
          extensionState: { readAll: () => ({}), writeAll: () => {} },
          jobs: context.reporter,
        });
        const first = services.library.listPage(null, 500);
        return {
          succeeded: first.files.length,
          incomplete: true,
          incompleteReason: `Read ${first.files.length} of ${files.length} records within the probe budget; rerun with a narrower selection.`,
        };
      },
    });
    const done = await manager.waitFor(submitted.record.jobId);
    expect(done.state).toBe("succeeded");
    expect(done.partial.incomplete).toBe(true);
    expect(done.partial.incompleteReason).toMatch(/probe budget/);
  });
});
