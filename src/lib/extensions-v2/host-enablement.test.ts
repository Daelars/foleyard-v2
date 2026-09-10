import { afterEach, describe, expect, it, vi } from "vitest";

import { AUTO_TAG_V2_ID } from "@foleyard/auto-tag-v2";

import {
  isV2ExtensionEnabled,
  setV2ExtensionEnabled,
} from "./host";

const ENABLED_KEY = "__foleyardV2Enabled";

// The enabled set is process-wide shared state (one realm), never per
// route bundle: enabling through one module instance must read back
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

  it("shares enablement and one job manager across fresh module instances in one process", async () => {
    delete (globalThis as Record<string, unknown>)[ENABLED_KEY];
    delete (globalThis as Record<string, unknown>).__foleyardV2JobManager;
    vi.resetModules();
    const firstHost = await import("./host");
    const secondHost = await import("./host");
    const firstJobs = await import("./jobs");
    const secondJobs = await import("./jobs");
    try {
      firstHost.setV2ExtensionEnabled(AUTO_TAG_V2_ID, true);
      expect(secondHost.isV2ExtensionEnabled(AUTO_TAG_V2_ID)).toBe(true);
      expect(secondJobs.getV2JobManager()).toBe(firstJobs.getV2JobManager());
    } finally {
      secondHost.setV2ExtensionEnabled(AUTO_TAG_V2_ID, false);
      vi.resetModules();
    }
  });
});
