import { describe, expect, it, vi } from "vitest";

// Area: #266. Enablement hydration is retryable. A transient storage
// failure must not permanently mark enablement as loaded, or an
// extension that was persisted as enabled reads as disabled forever.

const persisted = new Set<string>();
let listShouldFail = true;

vi.mock("./enablement", () => ({
  adoptRetiredV1Enablement: vi.fn(),
  listPersistedEnabled: () => {
    if (listShouldFail) throw new Error("enablement read failed");
    return [...persisted];
  },
  writePersistedEnabled: vi.fn(),
  readPersistedEnabled: () => undefined,
  RETIRED_V1_TO_V2: {},
}));

vi.mock("@/lib/db", () => ({
  getFiles: () => [],
  getFileById: () => null,
  getFilesByIds: () => [],
  getLibraryRoots: () => [],
  batchMarkRemoved: () => {},
  batchUpsertFiles: () => {},
}));

import { isV2ExtensionEnabled } from "./host";

describe("v2 enablement hydration", () => {
  it("retries hydration after a failed load instead of freezing enablement as loaded", () => {
    persisted.add("hydration-retry");
    // Storage is broken: nothing is enabled yet (disabled by default).
    expect(isV2ExtensionEnabled("hydration-retry")).toBe(false);
    // Storage recovers: the next read must retry the full hydration.
    listShouldFail = false;
    expect(isV2ExtensionEnabled("hydration-retry")).toBe(true);
  });
});
