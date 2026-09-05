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

function createDeleteContext(): YardExtensionContext {
  // Local containment stub: Yard Tools must not import Application modules
  // (@/lib/*). The production host supplies the real filesystem resolver
  // through the Extension context; tests stub the same seam locally.
  const resolveReadablePath = async (candidate: string) => {
    let resolved: string;
    try {
      resolved = await fs.promises.realpath(candidate);
    } catch {
      return null;
    }
    const root = await fs.promises.realpath(path.join(tempDir, "library"));
    const relative = path.relative(root, resolved);
    if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      return null;
    }
    return resolved;
  };
  return {
    services: { commands: { register: () => {} }, filesystem: { resolveReadablePath } } as unknown as YardExtensionContext["services"],
    selection: { fileIds: [] },
    permissions: {
      has: (permission) => permission === "files:delete",
      require: (permission) => {
        if (permission !== "files:delete") {
          throw new Error(`Missing permission: ${permission}`);
        }
      },
      list: () => ["files:delete"],
    },
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

  it("deletes an empty folder below a configured Library root", async () => {
    const root = path.join(tempDir, "library");
    const emptyFolder = path.join(root, "empty");
    fs.mkdirSync(emptyFolder, { recursive: true });

    const result = await new FolderJanitorService(createDeleteContext()).deleteFolders(
      [emptyFolder],
    );

    expect(result.results).toEqual([{ path: emptyFolder, ok: true }]);
    expect(fs.existsSync(emptyFolder)).toBe(false);
  });

  it("rejects folders outside configured Library roots", async () => {
    const root = path.join(tempDir, "library");
    const outside = path.join(tempDir, "outside");
    fs.mkdirSync(root);
    fs.mkdirSync(outside);

    const result = await new FolderJanitorService(createDeleteContext()).deleteFolders(
      [outside],
    );

    expect(result.results[0]).toMatchObject({ path: outside, ok: false });
    expect(fs.existsSync(outside)).toBe(true);
  });

  it("rejects folders that escape a root through a directory link", async () => {
    const root = path.join(tempDir, "library");
    const outside = path.join(tempDir, "outside");
    const link = path.join(root, "linked");
    fs.mkdirSync(root);
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");

    const result = await new FolderJanitorService(createDeleteContext()).deleteFolders(
      [link],
    );

    expect(result.results[0]).toMatchObject({ path: link, ok: false });
    expect(fs.existsSync(outside)).toBe(true);
  });

  it("rechecks that a folder is empty before deletion", async () => {
    const root = path.join(tempDir, "library");
    const folder = path.join(root, "changed");
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "new.txt"), "content");

    const result = await new FolderJanitorService(createDeleteContext()).deleteFolders(
      [folder],
    );

    expect(result.results[0]).toMatchObject({ path: folder, ok: false });
    expect(fs.existsSync(folder)).toBe(true);
  });
});
