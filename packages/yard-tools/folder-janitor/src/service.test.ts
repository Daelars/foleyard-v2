import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { PermissionChecker, YardExtensionContext } from "yard-core";

import { FolderJanitorService } from "./service";

let tempDir: string;

function createContext(): YardExtensionContext {
  const checker: PermissionChecker = {
    has: (permission) => permission === "library:read" || permission === "files:read",
    require: (permission) => {
      if (permission !== "library:read" && permission !== "files:read") {
        throw new Error(`Missing permission: ${permission}`);
      }
    },
    list: () => ["library:read", "files:read"],
  };

  return {
    services: { commands: { register: () => {} } } as unknown as YardExtensionContext["services"],
    selection: { fileIds: [] },
    permissions: checker,
  };
}

describe("FolderJanitorService", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "folder-janitor-test-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("reports duplicates, tiny files, weird formats, and empty folders", async () => {
    const first = path.join(tempDir, "Hit.wav");
    const second = path.join(tempDir, "dupe", "Hit.wav");
    const odd = path.join(tempDir, "Odd.xyz");
    const emptyFolder = path.join(tempDir, "empty");
    fs.mkdirSync(path.dirname(second), { recursive: true });
    fs.mkdirSync(emptyFolder);
    fs.writeFileSync(first, "x");
    fs.writeFileSync(second, "x");
    fs.writeFileSync(odd, "content");

    const service = new FolderJanitorService(createContext());
    const report = await service.scan({
      libraryRoots: [tempDir],
      files: [
        {
          id: "one",
          filename: "Hit.wav",
          path: first,
          format: "wav",
          fileSize: 1,
          duration: null,
        },
        {
          id: "two",
          filename: "Hit.wav",
          path: second,
          format: "wav",
          fileSize: 1,
          duration: null,
        },
        {
          id: "odd",
          filename: "Odd.xyz",
          path: odd,
          format: "xyz",
          fileSize: 7,
          duration: null,
        },
      ],
      tinyFileThresholdBytes: 2,
    });

    expect(report.issues.some((issue) => issue.kind === "duplicate")).toBe(true);
    expect(report.issues.some((issue) => issue.kind === "tiny-file")).toBe(true);
    expect(report.issues.some((issue) => issue.kind === "weird-format")).toBe(true);
    expect(report.issues.some((issue) => issue.kind === "empty-folder")).toBe(true);
  });
});
