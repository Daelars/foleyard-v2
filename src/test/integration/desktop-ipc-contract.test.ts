import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import rawRegistry from "../../../electron/main/ipc-channels.cjs";
import { checkDesktopCall, DESKTOP_CHANNELS, DESKTOP_CHANNEL_SPECS } from "@/lib/desktop-channels";

const registry = rawRegistry as {
  CHANNELS: Record<string, string>;
  CHANNEL_SPECS: Record<string, { kind: string; payload: string[] }>;
  validateIpcPayload: (channel: string, payload: unknown) => string | null;
};

const EXPECTED_CHANNELS = [
  "desktop:check-for-updates",
  "desktop:install-update",
  "desktop:simulate-update",
  "desktop:copy-file-path",
  "desktop:pick-folder",
  "desktop:reveal-in-explorer",
  "desktop:reveal-path",
  "desktop:open-file-externally",
  "desktop:window-minimize",
  "desktop:window-toggle-maximize",
  "desktop:window-close",
  "desktop:get-window-state",
  "desktop:start-drag-file",
  "desktop:update-available",
  "desktop:update-ready",
  "desktop:update-not-available",
  "desktop:update-error",
  "desktop:update-download-progress",
  "desktop:action-error",
  "desktop:window-state",
];

describe("desktop IPC contract", () => {
  it("declares the full channel inventory, frozen", () => {
    expect(Object.keys(registry.CHANNELS).sort()).toEqual([...EXPECTED_CHANNELS].sort());
    expect(Object.isFrozen(registry.CHANNELS)).toBe(true);
  });

  it("rejects unknown channels and short payloads", () => {
    expect(registry.validateIpcPayload("desktop:begin-drag", { fileIds: ["a"] })).toMatch(/unknown/);
    expect(registry.validateIpcPayload("desktop:start-drag-file", {})).toMatch(/fileIds/);
    expect(registry.validateIpcPayload("desktop:start-drag-file", { fileIds: ["a"] })).toBeNull();
    expect(registry.validateIpcPayload("desktop:update-available", {})).toMatch(/version/);
    expect(registry.validateIpcPayload("desktop:update-not-available", undefined)).toBeNull();
  });

  it("exposes the same table to the renderer wrapper", () => {
    expect(DESKTOP_CHANNELS).toEqual(registry.CHANNELS);
    expect(DESKTOP_CHANNEL_SPECS).toEqual(registry.CHANNEL_SPECS);
    expect(checkDesktopCall("desktop:begin-drag", {})).toMatch(/unknown/);
    expect(checkDesktopCall("desktop:reveal-path", "/lib/kick.wav")).toBeNull();
  });

  it("leaves no handwritten channel strings outside the registry", () => {
    const root = process.cwd();
    const suspects: string[] = [];
    const literal = /(?<!CHANNELS\[)["'](desktop:[a-z-]+)["']/g;
    for (const file of [
      "electron/main/ipc.cjs",
      "electron/preload.cjs",
      "electron/main/auto-updater.cjs",
      "electron/main/desktop-service.cjs",
      "electron/main/errors.cjs",
      "electron/main/window.cjs",
    ]) {
      const text = fs.readFileSync(path.join(root, file), "utf8");
      for (const match of text.matchAll(literal)) {
        suspects.push(`${file}: ${match[1]}`);
      }
    }
    expect(suspects).toEqual([]);
  });
});
