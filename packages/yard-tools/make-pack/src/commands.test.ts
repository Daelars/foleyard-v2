import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import { YardExtensionHost, YardExtensionRegistry } from "yard-core";

import { registerCommands } from "./commands";
import { manifest } from "./manifest";

const tempDirectories: string[] = [];

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createHost(options?: {
  enabled?: boolean;
  permissions?: string[];
  settings?: Record<string, unknown>;
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
    getSettingValue: (_extensionId, settingId, defaultValue) =>
      options?.settings?.[settingId] ?? defaultValue,
  });
}

function createSourceFile(root: string, filename = "Hit.wav") {
  const filePath = path.join(root, filename);
  fs.writeFileSync(filePath, "sound");
  return {
    id: "one",
    filename,
    path: filePath,
    duration: null,
    format: "wav",
    fileSize: 5,
  };
}

describe("Make Pack commands", () => {
  it.each([
    ["make-pack.from-selection", "selection", ["one"]],
    ["make-pack.from-shelf", "shelf", []],
    ["make-pack.from-recent", "recent", []],
  ])("opens the %s flow", async (commandId, source, fileIds) => {
    await expect(
      createHost().execute({
        extensionId: "make-pack",
        commandId,
        selection: { fileIds },
      }),
    ).resolves.toMatchObject({
      ok: true,
      type: "ui-intent",
      intent: {
        type: "make-pack.open",
        payload: { source, fileIds },
      },
    });
  });

  it("rejects a selection pack without selected files", async () => {
    await expect(
      createHost().execute({
        extensionId: "make-pack",
        commandId: "make-pack.from-selection",
      }),
    ).resolves.toMatchObject({ ok: false, reason: "validation-failed" });
  });

  it.each([
    ["make-pack.from-selection", ["one"]],
    ["make-pack.from-shelf", []],
    ["make-pack.from-recent", []],
  ])("creates a pack through the host for %s", async (commandId, fileIds) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "make-pack-command-"));
    tempDirectories.push(root);
    const file = createSourceFile(root);

    await expect(
      createHost().execute({
        extensionId: "make-pack",
        commandId,
        selection: { fileIds },
        input: {
          files: [file],
          destinationDirectory: path.join(root, "packs"),
          packName: "test-pack",
          outputFormat: "folder",
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      type: "value",
      value: { ok: true, packName: "test-pack", fileCount: 1 },
    });
  });

  it("rejects a shelf pack with no sounds", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "make-pack-command-"));
    tempDirectories.push(root);

    await expect(
      createHost().execute({
        extensionId: "make-pack",
        commandId: "make-pack.from-shelf",
        input: {
          files: [],
          destinationDirectory: path.join(root, "packs"),
        },
      }),
    ).resolves.toMatchObject({ ok: false, reason: "validation-failed" });
  });

  it("requires a destination directory", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "make-pack-command-"));
    tempDirectories.push(root);

    await expect(
      createHost().execute({
        extensionId: "make-pack",
        commandId: "make-pack.from-recent",
        input: { files: [createSourceFile(root)] },
      }),
    ).resolves.toMatchObject({ ok: false, reason: "validation-failed" });
  });

  it("reports an unregistered command lookup", async () => {
    await expect(
      createHost().execute({
        extensionId: "make-pack",
        commandId: "make-pack.missing",
      }),
    ).resolves.toMatchObject({ ok: false, reason: "command-not-found" });
  });

  it("rejects commands when the extension is disabled", async () => {
    await expect(
      createHost({ enabled: false }).execute({
        extensionId: "make-pack",
        commandId: "make-pack.from-recent",
      }),
    ).resolves.toMatchObject({ ok: false, reason: "extension-disabled" });
  });

  it("reports permission failures through the host", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "make-pack-command-"));
    tempDirectories.push(root);

    await expect(
      createHost({ permissions: [] }).execute({
        extensionId: "make-pack",
        commandId: "make-pack.from-shelf",
        input: {
          files: [createSourceFile(root)],
          destinationDirectory: path.join(root, "packs"),
        },
      }),
    ).resolves.toMatchObject({ ok: false, reason: "permission-denied" });
  });

  it("falls back to the host-resolved default format", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "make-pack-command-"));
    tempDirectories.push(root);

    await expect(
      createHost({ settings: { "default-format": "zip" } }).execute({
        extensionId: "make-pack",
        commandId: "make-pack.from-shelf",
        input: {
          files: [createSourceFile(root)],
          destinationDirectory: path.join(root, "packs"),
          packName: "format-pack",
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      type: "value",
      value: { ok: true, outputFormat: "zip" },
    });
  });

  it("uses the folder default format without an override", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "make-pack-command-"));
    tempDirectories.push(root);

    await expect(
      createHost().execute({
        extensionId: "make-pack",
        commandId: "make-pack.from-shelf",
        input: {
          files: [createSourceFile(root)],
          destinationDirectory: path.join(root, "packs"),
          packName: "format-pack",
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      type: "value",
      value: { ok: true, outputFormat: "folder" },
    });
  });
});
