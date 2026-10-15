import { describe, expect, it, vi } from "vitest";

import { createV2Runtime, getV2Runtime } from "./runtime";

// Area: #264. The v2 runtime is one process-owned object. Repeated
// imports and separate route bundles must observe the same registry,
// host, plans, grants, jobs, enablement, approvals, and events — never a
// per-bundle copy. The guard is structural, so a re-evaluated module
// (below, via vi.resetModules) still recognizes the existing runtime
// instead of building a competing one. No test here reaches into a
// global key by name: the public accessors are the contract.

describe("process-wide v2 runtime", () => {
  it("returns one runtime across repeated imports in a process", async () => {
    vi.resetModules();
    const first = await import("./runtime");
    vi.resetModules();
    const second = await import("./runtime");

    expect(second.getV2Runtime()).toBe(first.getV2Runtime());
    // The picker-proof store rides the same runtime, so the desktop-grants
    // bundle that mints a proof and the grant bundle that spends it agree.
    expect(second.getV2Runtime().pickerProofs).toBe(first.getV2Runtime().pickerProofs);
  });

  it("shares one registry and one host across module instances", async () => {
    vi.resetModules();
    const firstHost = await import("./host");
    vi.resetModules();
    const secondHost = await import("./host");

    expect(secondHost.getV2Registry()).toBe(firstHost.getV2Registry());
    expect(secondHost.getAppV2Host()).toBe(firstHost.getAppV2Host());
    expect(secondHost.getAppV2Host().jobs).toBe(firstHost.getAppV2Host().jobs);
    expect(secondHost.getAppV2Host().plans).toBe(firstHost.getAppV2Host().plans);
  });

  it("shares one job manager, one events bus, and one grant store pair across module instances", async () => {
    vi.resetModules();
    const firstJobs = await import("./jobs");
    const firstEvents = await import("./events");
    const firstFilesystem = await import("./filesystem");
    const firstSources = await import("./source-grants");

    vi.resetModules();
    const secondJobs = await import("./jobs");
    const secondEvents = await import("./events");
    const secondFilesystem = await import("./filesystem");
    const secondSources = await import("./source-grants");

    expect(secondJobs.getV2JobManager()).toBe(firstJobs.getV2JobManager());
    expect(secondEvents.getV2Events()).toBe(firstEvents.getV2Events());
    expect(secondFilesystem.getV2GrantStore()).toBe(firstFilesystem.getV2GrantStore());
    expect(secondSources.getV2SourceGrantStore()).toBe(firstSources.getV2SourceGrantStore());
  });

  it("hides the runtime behind a structural guard, not instanceof", () => {
    // A re-evaluated runtime module defines a new V2Runtime-shaped class;
    // identity checks alone would rebuild the runtime and re-split state.
    const isolated = createV2Runtime();
    expect(isolated.kind).toBe("foleyard-v2-runtime");
    expect(isolated).not.toBe(getV2Runtime());
    expect(isolated.registry).not.toBe(getV2Runtime().registry);
  });

  it("registers the bundled extensions idempotently across route bundles", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      vi.resetModules();
      const firstHost = await import("./host");
      const firstIds = firstHost.getV2Registry().ids().sort();
      vi.resetModules();
      const secondHost = await import("./host");

      // The second bundle re-runs bundled registration against the one
      // registry: definitions already exist, so nothing is re-registered
      // (no duplicate-extension failure) and the handlers survive.
      expect(secondHost.getV2Registry().ids().sort()).toEqual(firstIds);
      expect(errorSpy).not.toHaveBeenCalled();
      expect(
        secondHost.getAppV2Host().hasHandler("make-pack-v2", "make-pack-v2.from-selection"),
      ).toBe(true);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
