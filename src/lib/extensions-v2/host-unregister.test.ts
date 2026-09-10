import { beforeEach, describe, expect, it, vi } from "vitest";

import { immediateV2Result } from "@yard-core";

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
  batchMarkRemoved: () => {},
  batchUpsertFiles: () => {},
}));

import { getV2JobManager } from "./jobs";
import {
  getAppV2Host,
  getV2Registry,
  registerV2Extension,
  setV2ExtensionEnabled,
  unregisterV2Extension,
} from "./host";

const EXT = "unregister-ext";
const COMMAND = `${EXT}.describe`;

const definition = {
  id: EXT,
  name: "Unregister Ext",
  version: "1.0.0",
  apiVersion: 2 as const,
  description: "Unregister test extension.",
  permissions: [],
  commands: [
    { id: COMMAND, title: "Describe", description: "Describe.", scope: "global" as const },
  ],
};

// Area: #248. Removing an extension removes its handlers and jobs; a
// re-registration cannot pick up stale handlers, and its commands are gone.

describe("unregisterV2Extension", () => {
  beforeEach(() => {
    stateRows.clear();
    if (!getV2Registry().get(EXT)) registerV2Extension(definition);
    getAppV2Host().registerHandler(EXT, COMMAND, () => immediateV2Result({ ok: true }));
    setV2ExtensionEnabled(EXT, true);
  });

  it("removes handlers, cancels jobs and executes as unknown afterwards", async () => {
    const cancelSpy = vi.spyOn(getV2JobManager(), "cancelExtensionJobs");
    const before = await getAppV2Host().execute({
      extensionId: EXT,
      commandId: COMMAND,
      selection: { fileIds: [] },
    });
    expect(before.ok).toBe(true);

    unregisterV2Extension(EXT);

    expect(getV2Registry().get(EXT)).toBeUndefined();
    expect(getAppV2Host().hasHandler(EXT, COMMAND)).toBe(false);
    expect(cancelSpy).toHaveBeenCalledWith(EXT, expect.stringContaining("unregistered"));
    expect((await getAppV2Host().execute({
      extensionId: EXT,
      commandId: COMMAND,
      selection: { fileIds: [] },
    })).ok).toBe(false);
    cancelSpy.mockRestore();
  });

  it("requires handlers again after re-registration", async () => {
    unregisterV2Extension(EXT);
    registerV2Extension(definition);
    setV2ExtensionEnabled(EXT, true);

    expect(getV2Registry().get(EXT)).toBeDefined();
    expect(getAppV2Host().hasHandler(EXT, COMMAND), "stale handler is gone").toBe(false);

    const result = await getAppV2Host().execute({
      extensionId: EXT,
      commandId: COMMAND,
      selection: { fileIds: [] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("handler-missing");
  });
});
