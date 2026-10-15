import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTO_TAG_V2_ID } from "@foleyard/auto-tag-v2";

import { writePersistedEnabled } from "./enablement";
import {
  isV2ExtensionEnabled,
  setV2ExtensionEnabled,
} from "./host";

// Enablement and jobs are process-wide shared state (one realm), never
// per route bundle: enabling through one module instance must read back
// through another, or the execute route gates work the settings UI just
// approved. Persistence and v1 adoption live in enablement.ts and are
// mocked here; their own tests cover them.
vi.mock("./enablement", () => ({
  adoptRetiredV1Enablement: vi.fn(),
  listPersistedEnabled: () => [],
  writePersistedEnabled: vi.fn(),
  readPersistedEnabled: () => undefined,
  RETIRED_V1_TO_V2: {},
}));

describe("v2 host enablement", () => {
  afterEach(() => {
    setV2ExtensionEnabled(AUTO_TAG_V2_ID, false);
  });

  it("stays disabled by default and round-trips an explicit toggle", () => {
    setV2ExtensionEnabled(AUTO_TAG_V2_ID, false);
    expect(isV2ExtensionEnabled(AUTO_TAG_V2_ID)).toBe(false);
    setV2ExtensionEnabled(AUTO_TAG_V2_ID, true);
    expect(isV2ExtensionEnabled(AUTO_TAG_V2_ID)).toBe(true);
  });

  it("shares enablement, one host, and one job manager across separate module instances", async () => {
    // Separate imports simulate separate route bundles. Nothing here
    // reaches into a global key by name: the public accessors are the
    // contract, and the runtime guard is structural.
    vi.resetModules();
    const firstHost = await import("./host");
    const firstJobs = await import("./jobs");
    vi.resetModules();
    const secondHost = await import("./host");
    const secondJobs = await import("./jobs");

    try {
      expect(secondHost.getV2Registry()).toBe(firstHost.getV2Registry());
      expect(secondHost.getAppV2Host()).toBe(firstHost.getAppV2Host());
      expect(secondJobs.getV2JobManager()).toBe(firstJobs.getV2JobManager());

      await firstHost.setV2ExtensionEnabled(AUTO_TAG_V2_ID, true);
      expect(secondHost.isV2ExtensionEnabled(AUTO_TAG_V2_ID)).toBe(true);
    } finally {
      await secondHost.setV2ExtensionEnabled(AUTO_TAG_V2_ID, false);
      vi.resetModules();
    }
  });

  it("reports a failed enablement write instead of surfacing it as success", async () => {
    const write = vi.mocked(writePersistedEnabled);
    write.mockImplementation(() => {
      throw new Error("enablement write failed");
    });
    try {
      await expect(setV2ExtensionEnabled("enablement-write-fail", true)).rejects.toThrow(
        /enablement write failed/,
      );
      // A grant that could not be persisted is not enabled in memory.
      expect(isV2ExtensionEnabled("enablement-write-fail")).toBe(false);
    } finally {
      write.mockImplementation(() => {});
    }
  });
});
