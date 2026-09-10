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

  it("shares enablement across fresh module instances in one process", async () => {
    delete (globalThis as Record<string, unknown>)[ENABLED_KEY];
    vi.resetModules();
    const first = await import("./host");
    const second = await import("./host");
    try {
      first.setV2ExtensionEnabled(AUTO_TAG_V2_ID, true);
      expect(second.isV2ExtensionEnabled(AUTO_TAG_V2_ID)).toBe(true);
    } finally {
      second.setV2ExtensionEnabled(AUTO_TAG_V2_ID, false);
      vi.resetModules();
    }
  });
});

describe("v2 job manager", () => {
  it("shares one manager across fresh module instances in one process", async () => {
    delete (globalThis as Record<string, unknown>).__foleyardV2JobManager;
    vi.resetModules();
    const first = await import("./jobs");
    const second = await import("./jobs");
    try {
      expect(second.getV2JobManager()).toBe(first.getV2JobManager());
    } finally {
      vi.resetModules();
    }
  });
});