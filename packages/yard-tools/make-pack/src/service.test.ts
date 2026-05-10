import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PermissionChecker, YardExtensionContext } from "yard-core";

import { MakePackService } from "./service";
import type { MakePackFile } from "./types";

let tempDir: string;

function createMockContext(): YardExtensionContext {
  const granted = new Set([
    "library:read",
    "files:read",
    "files:copy",
    "files:write",
  ]);
  const permissions: PermissionChecker = {
    has: (permission) => granted.has(permission),
    require: (permission) => {
      if (!granted.has(permission)) {
        throw new Error(`Missing permission: ${permission}`);
      }
    },
    list: () => Array.from(granted) as ReturnType<PermissionChecker["list"]>,
  };

  return {
    services: {
      commands: {
        register: () => {},
      },
    } as unknown as YardExtensionContext["services"],
    selection: {
      fileIds: [],
    },
    permissions,
  } as YardExtensionContext;
}

function makeFile(name: string, content: string): MakePackFile {
  const filePath = path.join(tempDir, name);
  fs.writeFileSync(filePath, content);
  return {
    id: name,
    filename: name,
    path: filePath,
    duration: null,
    format: path.extname(name).slice(1),
    fileSize: content.length,
  };
}

describe("MakePackService", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "make-pack-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates a clean folder pack with a manifest", async () => {
    const service = new MakePackService(createMockContext());
    const outputDir = path.join(tempDir, "out");
    const file = makeFile("hit.wav", "sound");

    const result = await service.createPack({
      source: "selection",
      files: [file],
      destinationDirectory: outputDir,
      packName: "Project Hits",
      outputFormat: "folder",
    });

    expect(result.fileCount).toBe(1);
    expect(fs.existsSync(path.join(result.outputPath, "hit.wav"))).toBe(true);
    expect(fs.existsSync(path.join(result.outputPath, "manifest.json"))).toBe(true);
  });

  it("dedupes duplicate filenames", async () => {
    const service = new MakePackService(createMockContext());
    const first = makeFile("same.wav", "one");
    const secondPath = path.join(tempDir, "nested-same.wav");
    fs.writeFileSync(secondPath, "two");
    const second = {
      ...first,
      id: "second",
      path: secondPath,
    };

    const result = await service.createPack({
      source: "shelf",
      files: [first, second],
      destinationDirectory: path.join(tempDir, "out"),
      packName: "Duplicates",
    });

    expect(result.items.map((item) => item.outputName)).toEqual([
      "same.wav",
      "same 2.wav",
    ]);
  });

  it("creates a zip pack", async () => {
    const service = new MakePackService(createMockContext());
    const file = makeFile("whoosh.wav", "zip-data");

    const result = await service.createPack({
      source: "recent",
      files: [file],
      destinationDirectory: path.join(tempDir, "out"),
      packName: "Recent",
      outputFormat: "zip",
    });

    expect(result.outputPath.endsWith(".zip")).toBe(true);
    expect(fs.statSync(result.outputPath).size).toBeGreaterThan(0);
  });
});
