import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callRoute } from "@/test/fixtures";

const stateRows = new Map<string, unknown>();

vi.mock("@/lib/extensions-v2/settings-state", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/extensions-v2/settings-state")>();
  return {
    ...original,
    readV2SettingsRow: (key: string) => stateRows.get(key),
    writeV2SettingsRow: (key: string, value: unknown) => stateRows.set(key, value),
    deleteV2SettingsRow: (key: string) => {
      stateRows.delete(key);
    },
    listV2SettingsKeys: (prefix: string) =>
      [...stateRows.keys()].filter((key) => key.startsWith(prefix)),
  };
});

vi.mock("@/lib/db", () => ({
  getFiles: () => [],
  getFileById: () => null,
  getFilesByIds: () => [],
  getLibraryRoots: () => [],
}));

import { GET as availabilityGET } from "@/app/api/extensions-v2/availability/route";
import { POST as executePOST } from "@/app/api/extensions-v2/execute/route";
import { setV2ExtensionEnabled } from "@/lib/extensions-v2/host";
import { revokeV2Approval } from "@/lib/extensions-v2/policy";

const DROP_RULES = "drop-rules-v2";

// Area: #244. The derived capability set flows through the availability route
// and execution preflight: a desktop-only command is denied with a typed
// reason on a web host and passes the capability gate in desktop mode.
describe("v2 capability availability", () => {
  beforeEach(() => {
    stateRows.clear();
    setV2ExtensionEnabled(DROP_RULES, true);
  });

  afterEach(() => {
    revokeV2Approval(DROP_RULES);
    setV2ExtensionEnabled(DROP_RULES, false);
    vi.unstubAllEnvs();
  });

  it("denies a desktop-only command with a typed reason on a web host", async () => {
    const response = await callRoute<{
      available: boolean;
      code: string;
      reason: string;
    }>(availabilityGET, {
      url: "http://localhost/api/extensions-v2/availability?extensionId=drop-rules-v2&commandId=drop-rules-v2.prepare-drag&fileIds=a&dropFileCount=1",
    });
    expect(response.body.available).toBe(false);
    expect(response.body.code).toBe("capability-unavailable");
    expect(response.body.reason).toMatch(/desktop\.native/);
  });

  it("reports the same typed denial at execution preflight", async () => {
    const response = await callRoute<{ error: { code: string; message: string } }>(
      executePOST,
      {
        url: "http://localhost/api/extensions-v2/execute",
        body: {
          extensionId: DROP_RULES,
          commandId: "drop-rules-v2.prepare-drag",
          selection: { fileIds: ["a"], dropFileCount: 1 },
          input: { fileId: "a" },
        },
      },
    );
    expect(response.status, JSON.stringify(response.body)).toBe(400);
    expect(response.body.error.code).toBe("capability-unavailable");
    expect(response.body.error.message).toMatch(/desktop\.native/);
  });

  it("passes the capability gate in desktop mode and reaches permission denial", async () => {
    vi.stubEnv("FOLEYARD_DESKTOP", "1");
    const response = await callRoute<{ available: boolean; code: string }>(
      availabilityGET,
      {
        url: "http://localhost/api/extensions-v2/availability?extensionId=drop-rules-v2&commandId=drop-rules-v2.prepare-drag&fileIds=a&dropFileCount=1",
      },
    );
    expect(response.body.available).toBe(false);
    expect(response.body.code).toBe("permission-denied");
  });
});
