import { describe, expect, it } from "vitest";

import {
  ExtensionV2Host,
  ExtensionV2Registry,
  handleV2HttpJobCancel,
  handleV2HttpJobGet,
  immediateV2Result,
  V2JobManager,
  type V2HostServices,
  type V2JobRecord,
} from "./index";
import { libraryPorts } from "./test-helpers";

// Area: #281 durable job center. The renderer lifecycle is built on a
// server-side contract that must already hold: repeated cancellation of
// the same running job is idempotent (a second request neither moves the
// request time nor fabricates a stop), live work is never reported
// stopped while it still writes, and only the settled record carries the
// stop time the job center renders as "fully stopped". #314 made the
// history durable and #279 made the terminal result safe; this suite pins
// the lifecycle edges the center reconnects to.

function tickClock() {
  let step = 0;
  return () => {
    step += 1;
    return `2026-10-15T00:00:00.${String(step).padStart(3, "0")}Z`;
  };
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const library = libraryPorts([]);

function fixtureHost(manager: V2JobManager): ExtensionV2Host {
  const registry = new ExtensionV2Registry();
  registry.register({
    id: "fixture-lifecycle",
    name: "Lifecycle Fixture",
    version: "1.0.0",
    apiVersion: 2,
    description: "Exercise the durable job center lifecycle.",
    permissions: ["library:read"],
    commands: [
      { id: "fixture-lifecycle.run", title: "Run", description: "Run work.", scope: "global" },
    ],
  });
  const services: V2HostServices = {
    registry,
    isEnabled: () => true,
    capabilities: new Set<string>(),
    grantedPermissions: () => ["library:read"],
    ports: library,
    jobManager: manager,
  };
  const host = new ExtensionV2Host(services);
  host.registerHandler("fixture-lifecycle", "fixture-lifecycle.run", () =>
    immediateV2Result({ message: "ok" }),
  );
  return host;
}

describe("v2 job cancellation reporting (#281)", () => {
  it("keeps a repeated cancel request idempotent, preserving the first request time", async () => {
    const clock = tickClock();
    const manager = new V2JobManager({ clock });
    const release = deferred();
    const writes: string[] = [];
    const submitted = manager.submit({
      extensionId: "ext",
      commandId: "cmd",
      invocationId: "vinv_1",
      run: async (context) => {
        await release.promise;
        writes.push("final-chunk");
        context.reporter.throwIfCancelled();
        return { succeeded: 1 };
      },
    });
    await tick();
    expect(manager.getJob(submitted.record.jobId)?.state).toBe("running");

    const first = manager.requestCancel(submitted.record.jobId);
    expect(first?.state).toBe("cancellation-requested");
    expect(first?.cancellationRequestedAt).toBeDefined();
    expect(first?.stoppedAt).toBeUndefined();

    // A second request is a no-op: the original request time is the audit
    // point, and the job is still writing, so it is not yet stopped.
    const second = manager.requestCancel(submitted.record.jobId);
    expect(second?.state).toBe("cancellation-requested");
    expect(second?.cancellationRequestedAt).toBe(first?.cancellationRequestedAt);
    expect(second?.stoppedAt).toBeUndefined();

    release.resolve();
    const done = await manager.waitFor(submitted.record.jobId);
    expect(writes).toEqual(["final-chunk"]);
    expect(done.state).toBe("cancelled");
    expect(done.stoppedAt).toBeDefined();

    // Once fully stopped, another request returns the settled record and
    // does not move the stop time.
    const third = manager.requestCancel(submitted.record.jobId);
    expect(third?.state).toBe("cancelled");
    expect(third?.stoppedAt).toBe(done.stoppedAt);
  });

  it("reports stopped only after the runner unwinds through the HTTP route", async () => {
    const clock = tickClock();
    const manager = new V2JobManager({ clock });
    const host = fixtureHost(manager);
    const release = deferred();
    host.registerHandler("fixture-lifecycle", "fixture-lifecycle.run", async (context) => {
      await release.promise;
      context.operations.jobs.throwIfCancelled();
      return immediateV2Result({ message: "unreachable" });
    });

    const submitted = await host.submitJob({
      extensionId: "fixture-lifecycle",
      commandId: "fixture-lifecycle.run",
      input: {},
      selection: { fileIds: [] },
    });
    if (!submitted.ok || submitted.outcome.kind !== "job") throw new Error("expected a job");
    const jobId = submitted.outcome.jobId;
    await tick();

    const requested = handleV2HttpJobCancel(host.jobs, jobId);
    expect(requested.status).toBe(200);
    const requestedJob = (requested.body as { job: V2JobRecord }).job;
    expect(requestedJob.state).toBe("cancellation-requested");
    // Not stopped while the runner is still live.
    expect(requestedJob.stoppedAt).toBeUndefined();

    // Repeated request over the route is idempotent too.
    const repeated = handleV2HttpJobCancel(host.jobs, jobId);
    expect((repeated.body as { job: V2JobRecord }).job.cancellationRequestedAt).toBe(
      requestedJob.cancellationRequestedAt,
    );

    release.resolve();
    await host.jobs.waitFor(jobId);
    const polled = handleV2HttpJobGet(host.jobs, jobId);
    const stopped = (polled.body as { job: V2JobRecord }).job;
    expect(stopped.state).toBe("cancelled");
    expect(stopped.stoppedAt).toBeDefined();
    expect(stopped.cancellationRequestedAt! <= stopped.stoppedAt!).toBe(true);
  });
});
