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

describe("Library Gatherer commands", () => {
  it("opens the gather flow when invoked without transport input", async () => {
    await expect(
      createHost().execute({
        extensionId: "library-gatherer",
        commandId: "library-gatherer.gather",
      }),
    ).resolves.toMatchObject({
      ok: true,
      type: "ui-intent",
      intent: { type: "library-gatherer.open" },
    });
  });

  it("previews through the host", async () => {
    await expect(
      createHost().execute({
        extensionId: "library-gatherer",
        commandId: "library-gatherer.preview-gather",
        input: {
          sourceDirectories: ["missing-source"],
          destinationDirectory: "destination",
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      type: "value",
      value: { ok: true, copied: 0, skipped: 1 },
    });
  });

  it("returns typed validation when transport input is incomplete", async () => {
    await expect(
      createHost().execute({
        extensionId: "library-gatherer",
        commandId: "library-gatherer.preview-gather",
        input: {},
      }),
    ).resolves.toMatchObject({ ok: false, reason: "validation-failed" });
  });

  it("gathers through the host", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gather-command-"));
    tempDirectories.push(root);
    const destination = path.join(root, "destination");

    await expect(
      createHost().execute({
        extensionId: "library-gatherer",
        commandId: "library-gatherer.gather",
        input: {
          sourceDirectories: ["missing-source"],
          destinationDirectory: destination,
        },
      }),
    ).resolves.toMatchObject({
      ok: true,
      type: "value",
      value: { ok: true, copied: 0, skipped: 1 },
    });
  });

  it("reports an unregistered command lookup", async () => {
    await expect(
      createHost().execute({
        extensionId: "library-gatherer",
        commandId: "library-gatherer.missing",
      }),
    ).resolves.toMatchObject({ ok: false, reason: "command-not-found" });
  });

  it("rejects commands when the extension is disabled", async () => {
    await expect(
      createHost({ enabled: false }).execute({
        extensionId: "library-gatherer",
        commandId: "library-gatherer.gather",
      }),
    ).resolves.toMatchObject({ ok: false, reason: "extension-disabled" });
  });

  it("reports permission failures through the host", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "gather-command-"));
    tempDirectories.push(root);

    await expect(
      createHost({ permissions: [] }).execute({
        extensionId: "library-gatherer",
        commandId: "library-gatherer.preview-gather",
        input: {
          sourceDirectories: ["missing-source"],
          destinationDirectory: path.join(root, "destination"),
        },
      }),
    ).resolves.toMatchObject({ ok: false, reason: "permission-denied" });
  });
});
