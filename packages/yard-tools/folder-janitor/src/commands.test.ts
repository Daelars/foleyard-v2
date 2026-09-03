import { describe, expect, it, vi } from "vitest";
import { YardExtensionHost, YardExtensionRegistry } from "yard-core";

import { registerCommands } from "./commands";
import { manifest } from "./manifest";

function createHost(options?: {
  enabled?: boolean;
  files?: { markRemoved: (fileIds: string[]) => void };
  permissions?: string[];
}) {
  const registry = new YardExtensionRegistry();
  registry.register({
    manifest: options?.permissions
      ? { ...manifest, permissions: options.permissions as typeof manifest.permissions }
      : manifest,
    registerCommands,
  });

  return new YardExtensionHost({
    registry,
    isEnabled: () => options?.enabled ?? true,
    getSettingValue: (_extensionId, _settingId, defaultValue) => defaultValue,
    services: options?.files ? { files: options.files } : undefined,
  });
}

describe("Folder Janitor commands", () => {
  it("returns a typed intent for a library scan opened from the UI", async () => {
    await expect(
      createHost().execute({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.scan-library",
      }),
    ).resolves.toMatchObject({
      ok: true,
      type: "ui-intent",
      intent: {
        type: "folder-janitor.open-scan",
        payload: { target: "library" },
      },
    });
  });

  it("returns a direct report when scan input is supplied", async () => {
    await expect(
      createHost().execute({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.scan-library",
        input: { files: [], libraryRoots: [] },
      }),
    ).resolves.toEqual({
      ok: true,
      type: "value",
      value: { ok: true, scannedFiles: 0, scannedRoots: [], issues: [] },
    });
  });

  it("requires a folder path for the folder intent", async () => {
    await expect(
      createHost().execute({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.scan-folder",
      }),
    ).resolves.toMatchObject({ ok: false, reason: "validation-failed" });
  });

  it("returns a typed folder intent when a folder path is selected", async () => {
    await expect(
      createHost().execute({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.scan-folder",
        selection: { folderPath: "C:/sounds/drums" },
      }),
    ).resolves.toMatchObject({
      ok: true,
      type: "ui-intent",
      intent: {
        type: "folder-janitor.open-scan",
        payload: { target: "folder", folderPath: "C:/sounds/drums" },
      },
    });
  });

  it("returns a direct report when folder scan input is supplied", async () => {
    await expect(
      createHost().execute({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.scan-folder",
        selection: { folderPath: "C:/sounds/drums" },
        input: { files: [], libraryRoots: [] },
      }),
    ).resolves.toEqual({
      ok: true,
      type: "value",
      value: { ok: true, scannedFiles: 0, scannedRoots: [], issues: [] },
    });
  });

  it("removes selected files through the host", async () => {
    const markRemoved = vi.fn();

    await expect(
      createHost({ files: { markRemoved } }).execute({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.remove-files",
        selection: { fileIds: ["one", "two"] },
      }),
    ).resolves.toEqual({
      ok: true,
      type: "value",
      value: { removed: 2 },
    });
    expect(markRemoved).toHaveBeenCalledWith(["one", "two"]);
  });

  it("rejects remove-files without a selection", async () => {
    await expect(
      createHost({ files: { markRemoved: vi.fn() } }).execute({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.remove-files",
      }),
    ).resolves.toMatchObject({ ok: false, reason: "validation-failed" });
  });

  it("requires folder paths for delete-folders", async () => {
    await expect(
      createHost().execute({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.delete-folders",
        input: {},
      }),
    ).resolves.toMatchObject({ ok: false, reason: "validation-failed" });
  });

  it("reports an unregistered command lookup", async () => {
    await expect(
      createHost().execute({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.missing",
      }),
    ).resolves.toMatchObject({ ok: false, reason: "command-not-found" });
  });

  it("rejects commands when the extension is disabled", async () => {
    await expect(
      createHost({ enabled: false }).execute({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.scan-library",
      }),
    ).resolves.toMatchObject({ ok: false, reason: "extension-disabled" });
  });

  it("reports permission failures through the host", async () => {
    await expect(
      createHost({ permissions: [] }).execute({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.scan-library",
        input: { files: [], libraryRoots: [] },
      }),
    ).resolves.toMatchObject({ ok: false, reason: "permission-denied" });
  });
});
