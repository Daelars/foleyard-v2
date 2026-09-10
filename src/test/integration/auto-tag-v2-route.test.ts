import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { callRoute } from "@/test/fixtures";

const stateRows = new Map<string, unknown>();

vi.mock("@/lib/extensions-v2/settings-state", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/extensions-v2/settings-state")>();
  return {
    ...original,
    readV2SettingsRow: (key: string) => stateRows.get(key),
    writeV2SettingsRow: (key: string, value: unknown) => stateRows.set(key, value),
    deleteV2SettingsRow: (key: string) => {
      stateRows.delete(key);
    },
    listV2SettingsKeys: (prefix: string) => [...stateRows.keys()].filter((key) => key.startsWith(prefix)),
    createV2ExtensionStatePorts: () => ({
      readAll: (extensionId: string) =>
        (stateRows.get(`v2state:${extensionId}`) as Record<string, unknown> | undefined) ?? {},
      writeAll: (extensionId: string, state: Record<string, unknown>) => {
        stateRows.set(`v2state:${extensionId}`, state);
      },
    }),
  };
});

import { POST } from "@/app/api/extensions-v2/execute/route";
import { AUTO_TAG_V2_ID } from "@foleyard/auto-tag-v2";
import { getV2Registry, setV2ExtensionEnabled } from "@/lib/extensions-v2/host";
import { revokeV2Approval, setV2Approval } from "@/lib/extensions-v2/policy";

describe("Auto Tag v2 production execution route", () => {
  beforeEach(() => {
    stateRows.clear();
    setV2ExtensionEnabled(AUTO_TAG_V2_ID, true);
    setV2Approval(AUTO_TAG_V2_ID, getV2Registry().get(AUTO_TAG_V2_ID)!.permissions);
  });

  afterEach(() => {
    revokeV2Approval(AUTO_TAG_V2_ID);
    setV2ExtensionEnabled(AUTO_TAG_V2_ID, false);
  });

  it("executes a handler registered on the process-wide production host", async () => {
    const response = await callRoute(POST, {
      url: "http://localhost/api/extensions-v2/execute",
      body: {
        extensionId: AUTO_TAG_V2_ID,
        commandId: "auto-tag-v2.coverage-history",
        input: {},
        selection: { fileIds: [] },
      },
    });

    expect(response).toMatchObject({
      status: 200,
      body: {
        ok: true,
        outcome: {
          kind: "immediate",
          value: { entries: [] },
        },
      },
    });
  });

  it("denies execution while the tool is disabled by default", async () => {
    setV2ExtensionEnabled(AUTO_TAG_V2_ID, false);
    const response = await callRoute(POST, {
      url: "http://localhost/api/extensions-v2/execute",
      body: {
        extensionId: AUTO_TAG_V2_ID,
        commandId: "auto-tag-v2.coverage-history",
        input: {},
        selection: { fileIds: [] },
      },
    });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({
      ok: false,
      error: { code: "extension-disabled" },
    });
  });
});
