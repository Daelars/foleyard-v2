import { describe, expect, it } from "vitest";

import {
  createGreeterFixtureDefinition,
  encodeV2Result,
  ExtensionV2Host,
  ExtensionV2Registry,
  immediateV2Result,
  MAX_V2_JOB_WAITERS_PER_JOB,
  MAX_V2_PENDING_PLANS_PER_EXTENSION,
  MAX_V2_PENDING_PLANS_TOTAL,
  MAX_V2_PLAN_PREVIEW_BYTES,
  MAX_V2_QUEUED_JOBS_PER_EXTENSION,
  MAX_V2_QUEUED_JOBS_TOTAL,
  V2_EXTENSION_API_VERSION,
  V2_FAILURE_STATUS,
  V2_PLAN_STALE_TTL_MS,
  V2JobManager,
  V2PlanManager,
  type ExtensionV2Definition,
  type V2HostServices,
  type V2LibraryPorts,
  type V2PlanPrepareSpec,
} from "./index";
import { audioFile, libraryPorts } from "./test-helpers";

// Area: extension v2 #299. Waiting work — pending plans, queued jobs,
// parked waiters, and stored previews — honours a documented bound
// before expensive work begins: coalesce an identical plan/job, expire
// stale plans by TTL and report the count, then reject past a hard cap
// that names the limit. Nothing is silently dropped or evicted to make
// room. Stress cases flood the plan and job paths.

const PLAN_COMMAND = "flood-ext.cmd";

function emptyLibraryPorts(): V2LibraryPorts {
  return {
    getFileById: () => null,
    getFilesByIds: () => [],
    collectionExists: () => true,
  };
}

function floodDefinition(id = "flood-ext"): ExtensionV2Definition {
  return {
    id,
    name: id,
    version: "1.0.0",
    apiVersion: V2_EXTENSION_API_VERSION,
    description: `${id} flood fixture.`,
    permissions: [],
    commands: [
      {
        id: `${id}.cmd`,
        title: "Flood command",
        description: "Prepares one reviewed plan per distinct option.",
        scope: "global",
        input: {
          kind: "object",
          properties: { n: { kind: "number" } },
          required: ["n"],
        },
      },
    ],
  };
}

function floodRegistry(ids: string[] = ["flood-ext"]): ExtensionV2Registry {
  const registry = new ExtensionV2Registry();
  for (const id of ids) registry.register(floodDefinition(id));
  return registry;
}

function planBinding(extensionId = "flood-ext", invocationId = "vinv_1") {
  return {
    extensionId,
    invocationId,
    commandId: `${extensionId}.cmd`,
    effectivePermissions: [],
    capabilities: [],
  };
}

function planSpec(n: number): V2PlanPrepareSpec {
  return {
    targets: { fileIds: [] },
    options: { n },
    preview: {
      summary: `Plan ${n}`,
      tables: [],
      notices: [],
      reversibility: "reversible-app-change",
      reversibilityNote: "No effects.",
    },
  };
}

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function failureCode(error: unknown): string | undefined {
  return (error as { failureCode?: string }).failureCode;
}

function expectLimit(operation: () => unknown, code: string, message: RegExp): void {
  try {
    operation();
    throw new Error(`expected ${code}`);
  } catch (error) {
    expect(failureCode(error)).toBe(code);
    expect((error as Error).message).toMatch(message);
  }
}

describe("v2 pending-plan bounds (#299)", () => {
  it("coalesces an identical pending plan instead of queueing a duplicate", () => {
    const manager = new V2PlanManager(floodRegistry());
    const first = manager.prepare(planBinding("flood-ext", "vinv_first"), planSpec(7));
    const second = manager.prepare(planBinding("flood-ext", "vinv_second"), planSpec(7));

    // Same work, same result: one record, the existing plan ID.
    expect(second.planId).toBe(first.planId);
    expect(manager.pendingCount()).toBe(1);
    expect(manager.sweep()).toEqual({ expired: 0, dropped: 0 });
  });

  it("does not coalesce different options, and rejects past the per-extension cap", () => {
    const manager = new V2PlanManager(floodRegistry());
    for (let index = 0; index < MAX_V2_PENDING_PLANS_PER_EXTENSION; index += 1) {
      manager.prepare(planBinding("flood-ext", `vinv_${index}`), planSpec(index));
    }
    expect(manager.pendingCount()).toBe(MAX_V2_PENDING_PLANS_PER_EXTENSION);

    expectLimit(
      () => manager.prepare(planBinding("flood-ext", "vinv_overflow"), planSpec(999)),
      "plan-limit",
      new RegExp(String(MAX_V2_PENDING_PLANS_PER_EXTENSION)),
    );
    // A rejection never silently drops the excess or evicts pending work.
    expect(manager.pendingCount()).toBe(MAX_V2_PENDING_PLANS_PER_EXTENSION);
  });

  it("rejects past the process-wide cap across extensions", () => {
    const manager = new V2PlanManager(floodRegistry(["e-0", "e-1", "e-2"]));
    const perExtension = Math.floor(MAX_V2_PENDING_PLANS_TOTAL / 2);
    for (const id of ["e-0", "e-1"]) {
      for (let index = 0; index < perExtension; index += 1) {
        manager.prepare(planBinding(id, `vinv_${id}_${index}`), planSpec(index));
      }
    }
    expect(manager.pendingCount()).toBe(MAX_V2_PENDING_PLANS_TOTAL);

    expectLimit(
      () => manager.prepare(planBinding("e-2", "vinv_overflow"), planSpec(1)),
      "plan-limit",
      new RegExp(String(MAX_V2_PENDING_PLANS_TOTAL)),
    );
  });

  it("expires stale plans by TTL and reports the count instead of vanishing them", () => {
    const registry = floodRegistry();
    let nowMs = Date.parse("2026-10-15T00:00:00.000Z");
    const manager = new V2PlanManager(registry, {
      clock: () => new Date(nowMs).toISOString(),
      nowMs: () => nowMs,
    });
    const stale = manager.prepare(planBinding("flood-ext", "vinv_stale"), planSpec(1));
    const consumed = manager.prepare(planBinding("flood-ext", "vinv_consumed"), planSpec(2));
    manager.markConsumed(consumed.planId);

    // Past the stale-record TTL: the pending plan expires, the terminal
    // record is dropped, and both are reported.
    nowMs += V2_PLAN_STALE_TTL_MS + 60_000;
    const counts = manager.sweep();
    expect(counts.expired).toBe(1);
    expect(counts.dropped).toBe(1);
    expect(manager.lastSweep()).toEqual(counts);
    expect(manager.pendingCount()).toBe(0);
    expect(manager.peek(stale.planId)).toBeNull();
    // The sweep frees capacity rather than rejecting real work.
    expect(() =>
      manager.prepare(planBinding("flood-ext", "vinv_new"), planSpec(3)),
    ).not.toThrow();
  });

  it("rejects an oversized stored preview before the plan is created", () => {
    const manager = new V2PlanManager(floodRegistry());
    const base = planSpec(1);
    const oversized: V2PlanPrepareSpec = {
      ...base,
      preview: {
        ...base.preview,
        details: { blob: "x".repeat(MAX_V2_PLAN_PREVIEW_BYTES + 1) },
      },
    };
    expectLimit(
      () => manager.prepare(planBinding(), oversized),
      "input-invalid",
      /preview/i,
    );
    expect(manager.pendingCount()).toBe(0);
  });

  it("survives a plan flood: duplicates coalesce, distinct work stops at the cap", () => {
    const manager = new V2PlanManager(floodRegistry());
    // 500 identical previews collapse to one pending plan.
    for (let index = 0; index < 500; index += 1) {
      manager.prepare(planBinding("flood-ext", `vinv_dup_${index}`), planSpec(0));
    }
    expect(manager.pendingCount()).toBe(1);

    let accepted = 0;
    let rejected = 0;
    for (let index = 0; index < 200; index += 1) {
      try {
        manager.prepare(planBinding("flood-ext", `vinv_${index}`), planSpec(index + 1));
        accepted += 1;
      } catch (error) {
        expect(failureCode(error)).toBe("plan-limit");
        rejected += 1;
      }
    }
    expect(accepted).toBe(MAX_V2_PENDING_PLANS_PER_EXTENSION - 1);
    expect(rejected).toBe(200 - accepted);
    expect(manager.pendingCount()).toBe(MAX_V2_PENDING_PLANS_PER_EXTENSION);
  });

  it("maps plan-limit to 429 over the execution path", async () => {
    const registry = floodRegistry();
    const host = new ExtensionV2Host({
      registry,
      isEnabled: () => true,
      capabilities: new Set<string>(),
      grantedPermissions: () => [],
      ports: emptyLibraryPorts(),
    });
    host.registerHandler("flood-ext", PLAN_COMMAND, (context) => {
      const { n } = context.invocation.input as { n: number };
      const prepared = context.operations.plans.prepare(planSpec(n));
      return immediateV2Result({ planId: prepared.planId });
    });

    for (let index = 0; index < MAX_V2_PENDING_PLANS_PER_EXTENSION; index += 1) {
      const executed = await host.execute({
        extensionId: "flood-ext",
        commandId: PLAN_COMMAND,
        input: { n: index },
      });
      expect(executed.ok).toBe(true);
    }

    const overflow = await host.execute({
      extensionId: "flood-ext",
      commandId: PLAN_COMMAND,
      input: { n: 10_000 },
    });
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) {
      expect(overflow.code).toBe("plan-limit");
      expect(overflow.message).toMatch(new RegExp(String(MAX_V2_PENDING_PLANS_PER_EXTENSION)));
      expect(encodeV2Result(overflow).status).toBe(429);
    }
    expect(V2_FAILURE_STATUS["plan-limit"]).toBe(429);
  });
});

describe("v2 job-queue bounds (#299)", () => {
  function emptyHost(jobManager: V2JobManager) {
    const registry = new ExtensionV2Registry();
    registry.register(createGreeterFixtureDefinition());
    const services: V2HostServices = {
      registry,
      isEnabled: () => true,
      capabilities: new Set<string>(),
      grantedPermissions: () => ["library:read"],
      ports: libraryPorts([audioFile("a")]),
      jobManager,
    };
    return new ExtensionV2Host(services);
  }

  it("accepts exactly the per-extension queued bound, then rejects by name", () => {
    const release = deferred();
    const manager = new V2JobManager({ maxConcurrent: 1 });
    manager.submit({
      extensionId: "ext",
      commandId: "cmd",
      invocationId: "vinv_running",
      run: async () => {
        await release.promise;
        return {};
      },
    });
    const queued: string[] = [];
    for (let index = 0; index < MAX_V2_QUEUED_JOBS_PER_EXTENSION; index += 1) {
      const submitted = manager.submit({
        extensionId: "ext",
        commandId: "cmd",
        invocationId: `vinv_${index}`,
        run: async () => ({}),
      });
      queued.push(submitted.record.jobId);
    }
    for (const id of queued) expect(manager.getJob(id)?.state).toBe("queued");

    expectLimit(
      () =>
        manager.submit({
          extensionId: "ext",
          commandId: "cmd",
          invocationId: "vinv_overflow",
          run: async () => ({}),
        }),
      "job-limit",
      new RegExp(String(MAX_V2_QUEUED_JOBS_PER_EXTENSION)),
    );
    // Nothing was silently dropped to make room.
    for (const id of queued) expect(manager.getJob(id)?.state).toBe("queued");
    release.resolve();
  });

  it("rejects past the process-wide queued cap across extensions", () => {
    const release = deferred();
    const manager = new V2JobManager({ maxConcurrent: 1 });
    manager.submit({
      extensionId: "blocker",
      commandId: "cmd",
      invocationId: "vinv_blocker",
      run: async () => {
        await release.promise;
        return {};
      },
    });
    const extensions = MAX_V2_QUEUED_JOBS_TOTAL / MAX_V2_QUEUED_JOBS_PER_EXTENSION;
    for (let e = 0; e < extensions; e += 1) {
      for (let index = 0; index < MAX_V2_QUEUED_JOBS_PER_EXTENSION; index += 1) {
        manager.submit({
          extensionId: `ext-${e}`,
          commandId: "cmd",
          invocationId: `vinv_${e}_${index}`,
          run: async () => ({}),
        });
      }
    }

    expectLimit(
      () =>
        manager.submit({
          extensionId: "ext-overflow",
          commandId: "cmd",
          invocationId: "vinv_overflow",
          run: async () => ({}),
        }),
      "job-limit",
      new RegExp(String(MAX_V2_QUEUED_JOBS_TOTAL)),
    );
    release.resolve();
  });

  it("bounds the waiters parked on one job", async () => {
    const release = deferred();
    const manager = new V2JobManager({ maxConcurrent: 1 });
    const submitted = manager.submit({
      extensionId: "ext",
      commandId: "cmd",
      invocationId: "vinv_wait",
      run: async () => {
        await release.promise;
        return {};
      },
    });
    const parked: Array<Promise<unknown>> = [];
    for (let index = 0; index < MAX_V2_JOB_WAITERS_PER_JOB; index += 1) {
      parked.push(manager.waitFor(submitted.record.jobId));
    }
    await expect(manager.waitFor(submitted.record.jobId)).rejects.toThrow(/waiter/i);
    release.resolve();
    await Promise.all(parked);
  });

  it("survives a job flood without loss, and maps job-limit to 429", async () => {
    const release = deferred();
    const manager = new V2JobManager({ maxConcurrent: 1 });
    const host = emptyHost(manager);
    host.registerHandler("fixture-greeter", "fixture-greeter.greet", async () => {
      await release.promise;
      return immediateV2Result({ message: "done" });
    });

    const accepted: string[] = [];
    let rejected = 0;
    for (let index = 0; index < 200; index += 1) {
      const submitted = await host.submitJob({
        extensionId: "fixture-greeter",
        commandId: "fixture-greeter.greet",
        input: { name: "Ada" },
        selection: { fileIds: ["a"] },
      });
      if (submitted.ok && submitted.outcome.kind === "job") {
        accepted.push(submitted.outcome.jobId);
      } else if (!submitted.ok) {
        rejected += 1;
        expect(submitted.code).toBe("job-limit");
        expect(submitted.message).toMatch(
          new RegExp(String(MAX_V2_QUEUED_JOBS_PER_EXTENSION)),
        );
        expect(encodeV2Result(submitted).status).toBe(429);
      }
    }
    expect(rejected).toBeGreaterThan(0);
    // One running plus the queued bound; no work was silently dropped.
    expect(accepted).toHaveLength(MAX_V2_QUEUED_JOBS_PER_EXTENSION + 1);
    expect(manager.getJob(accepted[0]!)?.state).toBe("running");
    for (const id of accepted.slice(1)) {
      expect(manager.getJob(id)?.state).toBe("queued");
    }
    expect(V2_FAILURE_STATUS["job-limit"]).toBe(429);
    release.resolve();
  });

  it("still coalesces identical jobs by idempotency key under the cap", () => {
    const manager = new V2JobManager({ maxConcurrent: 1 });
    const spec = {
      extensionId: "ext",
      commandId: "cmd",
      invocationId: "vinv_1",
      idempotencyKey: "same-work",
      run: async () => ({}),
    };
    const first = manager.submit(spec);
    const second = manager.submit({ ...spec, invocationId: "vinv_2" });
    expect(second.duplicate).toBe(true);
    expect(second.record.jobId).toBe(first.record.jobId);
  });
});
