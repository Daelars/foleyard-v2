// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = new Map<string, unknown>();
const approvalsByExtension = new Map<string, readonly string[]>();

vi.mock("./settings-state", () => ({
  readV2SettingsRow: (key: string) => rows.get(key),
  writeV2SettingsRow: (key: string, value: unknown) => {
    rows.set(key, value);
  },
  deleteV2SettingsRow: (key: string) => {
    rows.delete(key);
  },
  listV2SettingsKeys: (prefix: string) => [...rows.keys()].filter((key) => key.startsWith(prefix)),
}));

vi.mock("./policy", () => ({
  setV2Approval: (extensionId: string, permissions: readonly string[]) => {
    approvalsByExtension.set(extensionId, permissions);
  },
}));

import {
  adoptRetiredV1Enablement,
  listPersistedEnabled,
  readPersistedEnabled,
  RETIRED_V1_TO_V2,
  writePersistedEnabled,
} from "./enablement";

// Area: v2 enablement persistence and v1 retirement adoption. Enablement
// must survive a reload (the pre-persistence set reset on every boot) and
// a retired v1 tool must hand its enablement and approvals to its v2 port
// exactly once, deleting the v1 row.

const PROBE_V1 = "probe-v1";
const PROBE_V2 = "probe-v2";
const DECLARED = ["library:read", "files:write"] as const;

function withProbePair(fn: () => void) {
  const original = { ...RETIRED_V1_TO_V2 };
  (RETIRED_V1_TO_V2 as Record<string, string>)[PROBE_V1] = PROBE_V2;
  try {
    fn();
  } finally {
    for (const key of Object.keys(RETIRED_V1_TO_V2)) delete (RETIRED_V1_TO_V2 as Record<string, string>)[key];
    Object.assign(RETIRED_V1_TO_V2, original);
  }
}

describe("persisted v2 enablement", () => {
  beforeEach(() => {
    rows.clear();
    approvalsByExtension.clear();
  });

  it("round-trips through the settings row", () => {
    expect(readPersistedEnabled("x")).toBeUndefined();
    writePersistedEnabled("x", true);
    expect(readPersistedEnabled("x")).toBe(true);
    expect(listPersistedEnabled()).toEqual(["x"]);
    writePersistedEnabled("x", false);
    expect(readPersistedEnabled("x")).toBe(false);
  });
});

describe("v1 retirement adoption", () => {
  beforeEach(() => {
    rows.clear();
    approvalsByExtension.clear();
  });

  it("adopts enablement and approvals from a retired v1 tool and deletes its row", () => {
    withProbePair(() => {
      rows.set("extension:probe-v1:enabled", "true");
      adoptRetiredV1Enablement(() => DECLARED);

      expect(readPersistedEnabled(PROBE_V2)).toBe(true);
      expect(rows.has("extension:probe-v1:enabled")).toBe(false);
      expect(approvalsByExtension.get(PROBE_V2)).toEqual(DECLARED);
    });
  });

  it("adopts disabled state without approving", () => {
    withProbePair(() => {
      rows.set("extension:probe-v1:enabled", "false");
      adoptRetiredV1Enablement(() => DECLARED);

      expect(readPersistedEnabled(PROBE_V2)).toBe(false);
      expect(rows.has("extension:probe-v1:enabled")).toBe(false);
      expect(approvalsByExtension.has(PROBE_V2)).toBe(false);
    });
  });

  it("never touches a v1 tool that is not retired", () => {
    rows.set("extension:other-v1:enabled", "true");
    adoptRetiredV1Enablement(() => DECLARED);
    expect(rows.has("extension:other-v1:enabled")).toBe(true);
    expect(readPersistedEnabled("other-v1-v2")).toBeUndefined();
  });

  it("does not override an existing v2 enablement but still deletes the v1 row", () => {
    withProbePair(() => {
      writePersistedEnabled(PROBE_V2, false);
      rows.set("extension:probe-v1:enabled", "true");
      adoptRetiredV1Enablement(() => DECLARED);

      expect(readPersistedEnabled(PROBE_V2)).toBe(false);
      expect(rows.has("extension:probe-v1:enabled")).toBe(false);
      expect(approvalsByExtension.has(PROBE_V2)).toBe(false);
    });
  });

  it("runs once: the deleted v1 row prevents a second adoption", () => {
    withProbePair(() => {
      rows.set("extension:probe-v1:enabled", "true");
      adoptRetiredV1Enablement(() => DECLARED);
      adoptRetiredV1Enablement(() => DECLARED);

      expect(readPersistedEnabled(PROBE_V2)).toBe(true);
      expect(approvalsByExtension.get(PROBE_V2)).toEqual(DECLARED);
    });
  });
});