import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PermissionChecker, YardExtensionContext, YardPermission } from "yard-core";

import { LibraryGathererService } from "./service";

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

describe("LibraryGathererService", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "library-gatherer-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("previews audio files without copying", async () => {
    const source = path.join(tempDir, "downloads");
    const destination = path.join(tempDir, "library");
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, "Boom.wav"), "sound");
    fs.writeFileSync(path.join(source, "notes.txt"), "ignore");

    const service = new LibraryGathererService(
      createContext(["library:read", "files:read"]),
    );
    const result = await service.preview({
      sourceDirectories: [source],
      destinationDirectory: destination,
    });

    expect(result.copied).toBe(1);
    expect(fs.existsSync(result.files[0].outputPath)).toBe(false);
  });

  it("copies audio files and writes a gather report", async () => {
    const source = path.join(tempDir, "pack");
    const destination = path.join(tempDir, "library");
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, "Whoosh.wav"), "sound");

    const service = new LibraryGathererService(
      createContext([
        "library:read",
        "library:write",
        "files:read",
        "files:copy",
        "files:write",
      ]),
    );
    const result = await service.gather({
      sourceDirectories: [source],
      destinationDirectory: destination,
      preserveFolderNames: true,
    });

    expect(result.copied).toBe(1);
    expect(fs.existsSync(path.join(destination, "pack", "Whoosh.wav"))).toBe(true);
    expect(fs.existsSync(result.reportPath)).toBe(true);
  });
});
