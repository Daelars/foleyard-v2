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

function createHost(options?: { enabled?: boolean; permissions?: string[] }) {
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
  });
}

function createDropFile(root: string) {
  const filePath = path.join(root, "Hit.wav");
  fs.writeFileSync(filePath, "sound");
  return { id: "one", filename: "Hit.wav", path: filePath };
}

describe("Drop Rules commands", () => {
  it("uses the canonical command IDs", () => {
    expect(manifest.commands.map((command) => command.id)).toEqual([
      "drop-rules.open-settings",
      "drop-rules.preview",
      "drop-rules.apply",
      "drop-rules.prepare-drag",
    ]);
  });

  it("previews a drop through the host", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "drop-rules-command-"));
    tempDirectories.push(root);
    const filePath = path.join(root, "Hit.wav");
    fs.writeFileSync(filePath, "sound");

    await expect(
      createHost().execute({
        extensionId: "drop-rules",
        commandId: "drop-rules.preview",
        selection: { fileIds: ["one"] },
        input: {
          targetDirectory: path.join(root, "target"),
          files: [{ id: "one", filename: "Hit.wav", path: filePath }],
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      type: "value",
      value: { actions: [{ outputName: "001-Hit.wav" }] },
    });
  });

  it("returns a settings intent for the Extension card", async () => {
    await expect(
      createHost().execute({
        extensionId: "drop-rules",
        commandId: "drop-rules.open-settings",
      }),
    ).resolves.toMatchObject({
      ok: true,
      type: "ui-intent",
      intent: { type: "drop-rules.open-settings" },
    });
  });

  it("applies a drop through the host", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "drop-rules-command-"));
    tempDirectories.push(root);
    const file = createDropFile(root);
    const targetDirectory = path.join(root, "target");

    const outcome = await createHost().execute({
      extensionId: "drop-rules",
      commandId: "drop-rules.apply",
      selection: { fileIds: ["one"] },
      input: { targetDirectory, files: [file] },
    });

    expect(outcome).toMatchObject({
      ok: true,
      type: "value",
      value: { actions: [{ outputName: "001-Hit.wav", copied: true }] },
    });
    expect(fs.existsSync(path.join(targetDirectory, "001-Hit.wav"))).toBe(true);
  });

  it("reports an unregistered command lookup", async () => {
    await expect(
      createHost().execute({
        extensionId: "drop-rules",
        commandId: "drop-rules.missing",
      }),
    ).resolves.toMatchObject({ ok: false, reason: "command-not-found" });
  });

  it("returns typed validation when drop input is incomplete", async () => {
    await expect(
      createHost().execute({
        extensionId: "drop-rules",
        commandId: "drop-rules.preview",
        selection: { fileIds: ["one"] },
        input: {},
      }),
    ).resolves.toMatchObject({ ok: false, reason: "validation-failed" });
  });

  it("rejects preview without a selection", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "drop-rules-command-"));
    tempDirectories.push(root);

    await expect(
      createHost().execute({
        extensionId: "drop-rules",
        commandId: "drop-rules.preview",
        input: {
          targetDirectory: path.join(root, "target"),
          files: [createDropFile(root)],
        },
      }),
    ).resolves.toMatchObject({ ok: false, reason: "validation-failed" });
  });

  it("rejects commands when the extension is disabled", async () => {
    await expect(
      createHost({ enabled: false }).execute({
        extensionId: "drop-rules",
        commandId: "drop-rules.preview",
      }),
    ).resolves.toMatchObject({ ok: false, reason: "extension-disabled" });
  });

  it("reports permission failures through the host", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "drop-rules-command-"));
    tempDirectories.push(root);

    await expect(
      createHost({ permissions: [] }).execute({
        extensionId: "drop-rules",
        commandId: "drop-rules.preview",
        selection: { fileIds: ["one"] },
        input: {
          targetDirectory: path.join(root, "target"),
          files: [createDropFile(root)],
        },
      }),
    ).resolves.toMatchObject({ ok: false, reason: "permission-denied" });
  });
});
