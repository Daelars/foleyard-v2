import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { getV2Events } from "./events";
import {
  getAppV2Host,
  getV2Registry,
  registerBundledV2Extensions,
  setV2ExtensionEnabled,
} from "./host";

const EXT = "lifecycle-ext";
const ENABLE_KEY = `v2:enablement:${EXT}`;

const definition = {
  id: EXT,
  name: "Lifecycle Ext",
  version: "1.0.0",
  apiVersion: 2 as const,
  description: "Lifecycle hook test extension.",
  permissions: [],
  commands: [
    { id: `${EXT}.on`, title: "On", description: "Enable hook.", scope: "global" as const },
    { id: `${EXT}.off`, title: "Off", description: "Disable hook.", scope: "global" as const },
  ],
  lifecycle: {
    onEnabled: { commandId: `${EXT}.on` },
    onDisabled: { commandId: `${EXT}.off` },
  },
};

// Area: #247. Declared lifecycle hooks run after persistence and before the
// contributions notification; failures are isolated and reported.

describe("v2 lifecycle hooks", () => {
  beforeEach(() => {
    stateRows.clear();
    const registry = getV2Registry();
    if (!registry.get(EXT)) registry.register(definition);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("runs onEnabled after persist and before notify", async () => {
    const order: string[] = [];
    getAppV2Host().registerHandler(EXT, `${EXT}.on`, () => {
      order.push("hook");
      expect(stateRows.get(ENABLE_KEY), "enablement is persisted before the hook").toBe(true);
      return immediateV2Result({ ok: true });
    });
    const unsubscribe = getV2Events().subscribe("contributions-changed", () => {
      order.push("notify");
    });

    await setV2ExtensionEnabled(EXT, true);
    unsubscribe();

    expect(order).toEqual(["hook", "notify"]);
  });

  it("isolates a failing hook and keeps the enablement change", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    getAppV2Host().registerHandler(EXT, `${EXT}.off`, () => {
      throw new Error("hook boom");
    });
    getAppV2Host().registerHandler(EXT, `${EXT}.on`, () => immediateV2Result({ ok: true }));

    await setV2ExtensionEnabled(EXT, true);
    await expect(setV2ExtensionEnabled(EXT, false)).resolves.toBeUndefined();

    expect(stateRows.get(ENABLE_KEY)).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("onDisabled"));
  });
});

describe("bundled registration isolation", () => {
  it("reports a malformed definition without aborting the others", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const registered: string[] = [];

    const failed = registerBundledV2Extensions([
      ["broken-ext", () => {
        throw new Error("malformed definition");
      }],
      ["healthy-ext", () => registered.push("healthy-ext")],
    ]);

    expect(failed).toEqual(["broken-ext"]);
    expect(registered).toEqual(["healthy-ext"]);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("broken-ext"),
      expect.anything(),
    );
    errorSpy.mockRestore();
  });
});
