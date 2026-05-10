import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PermissionChecker, YardExtensionContext, YardPermission } from "yard-core";

import { DropRulesService } from "./service";

let tempDir: string;

function createContext(permissions: YardPermission[]): YardExtensionContext {
  const granted = new Set<YardPermission>(permissions);
  const checker: PermissionChecker = {
    has: (permission) => granted.has(permission),
    require: (permission) => {
      if (!granted.has(permission)) {
        throw new Error(`Missing permission: ${permission}`);
      }
    },
    list: () => Array.from(granted),
  };

  return {
    services: { commands: { register: () => {} } } as unknown as YardExtensionContext["services"],
    selection: { fileIds: [] },
    permissions: checker,
  };
}

describe("DropRulesService", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "drop-rules-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("previews renamed drop actions without copying", () => {
    const filePath = path.join(tempDir, "Hit.wav");
    fs.writeFileSync(filePath, "sound");

    const service = new DropRulesService(
      createContext(["library:read", "files:read", "drop:read"]),
    );
    const result = service.preview({
      targetDirectory: path.join(tempDir, "project"),
      files: [{ id: "file-1", filename: "Hit.wav", path: filePath }],
      renamePattern: "{index}-{name}{ext}",
    });

    expect(result.actions[0].outputName).toBe("001-Hit.wav");
    expect(result.actions[0].copied).toBe(false);
  });

  it("applies drop rules by copying and writing a used report", async () => {
    const filePath = path.join(tempDir, "Door.wav");
    fs.writeFileSync(filePath, "sound");
    const targetDirectory = path.join(tempDir, "project");

    const service = new DropRulesService(
      createContext([
        "library:read",
        "files:read",
        "files:copy",
        "files:write",
        "drop:modify",
      ]),
    );
    const result = await service.apply({
      targetDirectory,
      files: [{ id: "file-1", filename: "Door.wav", path: filePath }],
      renamePattern: "{name}{ext}",
    });

    expect(fs.existsSync(path.join(targetDirectory, "Door.wav"))).toBe(true);
    expect(result.usedReportPath).not.toBeNull();
    expect(fs.existsSync(result.usedReportPath ?? "")).toBe(true);
  });

  it("prepares a renamed drag-out copy and records it as used", async () => {
    const filePath = path.join(tempDir, "Metal Hit.wav");
    fs.writeFileSync(filePath, "sound");
    const stagingDirectory = path.join(tempDir, "drag-out");

    const service = new DropRulesService(
      createContext([
        "library:read",
        "files:read",
        "files:copy",
        "files:write",
        "drop:modify",
      ]),
    );
    const result = await service.prepareDrag({
      stagingDirectory,
      file: {
        id: "file-1",
        filename: "Metal Hit.wav",
        path: filePath,
        format: "wav",
      },
      renamePattern: "{date}-{name}.{format}",
      renameOnDrop: true,
      copyOnDrop: true,
      markUsed: true,
    });

    expect(result.staged).toBe(true);
    expect(result.outputName).toMatch(/^\d{4}-\d{2}-\d{2}-Metal Hit\.wav$/);
    expect(fs.existsSync(result.dragPath)).toBe(true);
    expect(result.dragPath).not.toBe(filePath);
    expect(result.usedReportPath).not.toBeNull();
    expect(fs.existsSync(result.usedReportPath ?? "")).toBe(true);
  });

  it("drags the original file unchanged when copy, rename, and mark used are off", async () => {
    const filePath = path.join(tempDir, "Raw Hit.wav");
    fs.writeFileSync(filePath, "sound");
    const stagingDirectory = path.join(tempDir, "drag-out");

    const service = new DropRulesService(
      createContext([
        "library:read",
        "files:read",
        "files:copy",
        "files:write",
        "drop:modify",
      ]),
    );
    const result = await service.prepareDrag({
      stagingDirectory,
      file: {
        id: "file-1",
        filename: "Raw Hit.wav",
        path: filePath,
        format: "wav",
      },
      renameOnDrop: false,
      copyOnDrop: false,
      markUsed: false,
    });

    expect(result.staged).toBe(false);
    expect(result.dragPath).toBe(filePath);
    expect(result.outputName).toBe("Raw Hit.wav");
    expect(result.usedReportPath).toBeNull();
    expect(fs.existsSync(stagingDirectory)).toBe(false);
  });

  it("stages a renamed file even when copy on drop is off", async () => {
    const filePath = path.join(tempDir, "Source.wav");
    fs.writeFileSync(filePath, "sound");
    const stagingDirectory = path.join(tempDir, "drag-out");

    const service = new DropRulesService(
      createContext([
        "library:read",
        "files:read",
        "files:copy",
        "files:write",
        "drop:modify",
      ]),
    );
    const result = await service.prepareDrag({
      stagingDirectory,
      file: {
        id: "file-1",
        filename: "Source.wav",
        path: filePath,
        format: "wav",
      },
      renamePattern: "{name}-renamed{ext}",
      renameOnDrop: true,
      copyOnDrop: false,
      markUsed: false,
    });

    expect(result.staged).toBe(true);
    expect(result.outputName).toBe("Source-renamed.wav");
    expect(result.dragPath).toBe(path.join(stagingDirectory, "Source-renamed.wav"));
    expect(fs.existsSync(result.dragPath)).toBe(true);
  });
});
