import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createV2FolderOperations, V2_FOLDER_LIST_LIMIT } from "yard-core";

import { createV2FolderScanPorts } from "@/lib/extensions-v2/maintenance";

// Area: bounded folder listing (#315).
//
// A folder listing's advertised bound must hold before the filesystem
// work begins: the operation asks its port for one entry past the page it
// will show (enough to know the folder is oversized) and never the whole
// folder, so a large directory is neither materialized nor statted in
// full. An oversized folder is reported as `truncated` instead of a
// silent partial list.

const ENTRY_COUNT = V2_FOLDER_LIST_LIMIT * 3;

let root: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "folder-listing-bound-"));
  for (let index = 0; index < ENTRY_COUNT; index += 1) {
    fs.writeFileSync(path.join(root, `f-${String(index).padStart(5, "0")}.mp3`), "x");
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("bounded folder listing", () => {
  it("reads and stats no further than the bound on a large directory", async () => {
    // Count how many directory entries the adapter actually consumes and
    // how many files it stats: both are the expensive work the bound
    // exists to prevent.
    const read = { entries: 0 };
    const realOpendir = fs.promises.opendir.bind(fs.promises);
    vi.spyOn(fs.promises, "opendir").mockImplementation(async (target) => {
      const directory = await realOpendir(target as string);
      return new Proxy(directory, {
        get(handle, property, receiver) {
          if (property === Symbol.asyncIterator) {
            const iterate = (handle as unknown as AsyncIterable<fs.Dirent>)[
              Symbol.asyncIterator
            ].bind(handle);
            return async function* () {
              for await (const entry of { [Symbol.asyncIterator]: iterate }) {
                read.entries += 1;
                yield entry;
              }
            };
          }
          return Reflect.get(handle, property, receiver);
        },
      });
    });
    const statSpy = vi.spyOn(fs.promises, "stat");

    const ports = createV2FolderScanPorts({ libraryRoots: () => [root] });
    const operations = createV2FolderOperations({
      extensionId: "folder-janitor-v2",
      effectivePermissions: ["files:read"],
      folders: ports,
    });

    const page = await operations.listFolder({ path: root, limit: 10_000 });

    // The result holds one bounded page, flagged as truncated rather than
    // returned as a silent partial list.
    expect(page.entries).toHaveLength(V2_FOLDER_LIST_LIMIT);
    expect(page.truncated).toBe(true);
    // One entry past the page proves the folder is oversized; the whole
    // directory (three times the bound) is never read.
    expect(read.entries).toBeLessThanOrEqual(V2_FOLDER_LIST_LIMIT + 1);
    expect(read.entries).toBeLessThan(ENTRY_COUNT);
    // Only the returned entries are statted, never the folder.
    expect(statSpy.mock.calls.length).toBeLessThanOrEqual(V2_FOLDER_LIST_LIMIT + 1);
    expect(statSpy.mock.calls.length).toBeLessThan(ENTRY_COUNT);
  });

  it("reports a small directory as complete and sorted", async () => {
    const small = fs.mkdtempSync(path.join(os.tmpdir(), "folder-listing-small-"));
    try {
      fs.writeFileSync(path.join(small, "b.mp3"), "x");
      fs.writeFileSync(path.join(small, "a.mp3"), "x");
      const ports = createV2FolderScanPorts({ libraryRoots: () => [small] });
      const operations = createV2FolderOperations({
        extensionId: "folder-janitor-v2",
        effectivePermissions: ["files:read"],
        folders: ports,
      });

      const page = await operations.listFolder({ path: small });

      expect(page.entries.map((entry) => entry.name)).toEqual(["a.mp3", "b.mp3"]);
      expect(page.truncated).toBe(false);
    } finally {
      fs.rmSync(small, { recursive: true, force: true });
    }
  });
});
