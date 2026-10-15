import { beforeEach, describe, expect, it, vi } from "vitest";

import { immediateV2Result, V2_EXTENSION_API_VERSION } from "@yard-core";

// Area: #266. A permission revoked while a handler is running must be
// observed at the handler's next permission check: the operation
// services re-check the live effective set instead of a snapshot frozen
// at preflight. Asserted through the real application host.

const stateRows = new Map<string, unknown>();

vi.mock("@/lib/extensions-v2/settings-state", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/lib/extensions-v2/settings-state")>();
  return {
    ...original,
    readV2SettingsRow: (key: string) => stateRows.get(key),
    writeV2SettingsRow: (key: string, value: unknown) => {
      stateRows.set(key, value);
    },
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
  batchMarkRemoved: () => {},
  batchUpsertFiles: () => {},
}));

import { getAppV2Host, getV2Registry, setV2ExtensionEnabled } from "./host";
import { revokeV2Approval, setV2Approval } from "./policy";

const PROBE = "revocation-probe";

describe("v2 running-work revocation", () => {
  beforeEach(() => {
    stateRows.clear();
    const registry = getV2Registry();
    if (!registry.get(PROBE)) {
      registry.register({
        id: PROBE,
        name: "Revocation Probe",
        version: "1.0.0",
        apiVersion: V2_EXTENSION_API_VERSION,
        description: "Proves running work rechecks a revoked permission.",
        permissions: ["library:read"],
        commands: [
          {
            id: `${PROBE}.read`,
            title: "Read",
            description: "Read once, revoke, read again.",
            scope: "global" as const,
          },
        ],
      });
    }
    getAppV2Host().registerHandler(PROBE, `${PROBE}.read`, (context) => {
      context.operations.library.getFile("a");
      revokeV2Approval(PROBE);
      context.operations.library.getFile("a");
      return immediateV2Result({ ok: true });
    });
    void setV2ExtensionEnabled(PROBE, true);
    setV2Approval(PROBE, ["library:read"]);
  });

  it("fails a running operation closed at its next permission check after revocation", async () => {
    const result = await getAppV2Host().execute({
      extensionId: PROBE,
      commandId: `${PROBE}.read`,
      selection: { fileIds: [] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("permission-denied");
      expect(result.message).toMatch(/"library:read"/);
    }
  });
});
