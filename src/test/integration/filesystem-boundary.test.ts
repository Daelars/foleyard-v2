import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createScratchLibrary, callRoute, type ScratchLibrary } from "@/test/fixtures";

// Area: filesystem grant boundary (#135). Replaces filesystem-access.test.ts
// and filesystem-boundary.test.ts — 21 tests that asserted the same matrix once
// per command via describe.each.
//
// Everything here is about one question: can an extension reach a path it was
// not granted? Findings E04 and E01 both live on this boundary.

const mocks = vi.hoisted(() => ({
  roots: [] as string[],
  files: new Map<
    string,
    {
      id: string;
      filename: string;
      path: string;
      format: string;
      fileSize: number;
      duration: null;
      removedAt: null;
    }
  >(),
  execute: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getLibraryRoots: () => mocks.roots,
  getFileById: (id: string) => mocks.files.get(id),
}));
vi.mock("@/lib/extensions/host", () => ({
  createAppExtensionHost: () => ({ execute: mocks.execute }),
}));
vi.mock("@/lib/extensions/make-pack-recent-store", () => ({
  getRecentMakePackFileIds: () => [],
}));
vi.mock("@/lib/extensions/sound-shelf-store", () => ({
  DbSoundShelfStore: class {
    getFileIds() {
      return [];
    }
  },
}));

import { resolveExistingPathWithinRoots } from "@/lib/filesystem-boundary";
import { POST as execute } from "@/app/api/extensions/execute/route";
// Relative, not aliased: vitest resolves bare "@yard-core" and "@foleyard/x" to
// each package's index barrel, and these are subpath modules the barrels do not
// re-export.
import { YardCommandRegistry } from "../../../packages/yard-core/src/extensions/extension-command-registry";
import { createYardExtensionContext } from "../../../packages/yard-core/src/extensions/extension-context";
import { registerCommands as registerDropCommands } from "../../../packages/yard-tools/drop-rules/src/commands";
import { permissions as dropPermissions } from "../../../packages/yard-tools/drop-rules/src/permissions";

let library: ScratchLibrary;
let root: string;
let destination: string;
let outside: string;
let grantToken: string;

beforeEach(async () => {
  library = createScratchLibrary("foleyard-boundary-");
  root = library.directory("library");
  destination = library.directory("output");
  outside = library.directory("private");
  library.writeFile("library/hit.wav");
  library.writeFile("private/hit.wav");

  mocks.roots = [root];
  mocks.files.clear();
  for (const [id, dir] of [
    ["inside", root],
    ["outside", outside],
  ] as const) {
    mocks.files.set(id, {
      id,
      filename: "hit.wav",
      path: path.join(dir, "hit.wav"),
      format: "wav",
      fileSize: 5,
      duration: null,
      removedAt: null,
    });
  }
  grantToken = (await library.grant("output")).grantToken;
  mocks.execute.mockReset().mockResolvedValue({
    ok: true,
    type: "value",
    value: { ok: true },
  });
});

afterEach(() => library.dispose());

const gather = (source: string, dest: string, token?: string) => ({
  extensionId: "library-gatherer",
  commandId: "library-gatherer.gather",
  input: { sourceDirectories: [source], destinationDirectory: dest },
  destinationGrant: token,
});

const preview = (source: string, dest: string, token?: string) => ({
  ...gather(source, dest, token),
  commandId: "library-gatherer.preview-gather",
});

const pack = (source: string, dest: string, token?: string) => {
  const fileId = source === root ? "inside" : "outside";
  return {
    extensionId: "make-pack",
    commandId: "make-pack.from-selection",
    selection: { fileIds: [fileId] },
    input: { fileIds: [fileId], destinationDirectory: dest },
    destinationGrant: token,
  };
};

async function post(body: unknown) {
  return callRoute<{ error: string }>(execute, {
    url: "http://localhost/api/extensions/execute",
    body,
  });
}

describe("filesystem grant boundary", () => {
  it("resolves inside a root and rejects traversal and link escapes", async () => {
    const file = path.join(root, "hit.wav");

    await expect(resolveExistingPathWithinRoots(file, [root])).resolves.toBe(
      fs.realpathSync(file),
    );

    // ../ out of the root
    await expect(
      resolveExistingPathWithinRoots(
        path.join(root, "..", "private", "hit.wav"),
        [root],
      ),
    ).resolves.toBeNull();

    // A directory link inside the root pointing out of it
    const link = path.join(root, "linked");
    fs.symlinkSync(
      outside,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
    await expect(
      resolveExistingPathWithinRoots(path.join(link, "hit.wav"), [root]),
    ).resolves.toBeNull();
  });

  it("accepts a Library source and a granted destination", async () => {
    const response = await post(gather(root, destination, grantToken));

    expect(response.status).toBe(200);
    expect(mocks.execute).toHaveBeenCalledOnce();
  });

  it("rejects a source outside the Library roots", async () => {
    const response = await post(gather(outside, destination, grantToken));

    expect(response.status).toBe(403);
    expect(response.body.error).toMatch(/Library roots/);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects a destination the grant does not cover", async () => {
    // No grant at all
    const ungranted = await post(gather(root, destination));
    expect(ungranted.status).toBe(403);
    expect(ungranted.body.error).toMatch(/granted directory.*folder picker/);

    // A real grant, but for a different directory
    const elsewhere = await post(gather(root, outside, grantToken));
    expect(elsewhere.status).toBe(403);
    expect(elsewhere.body.error).toMatch(/granted directory.*folder picker/);

    // Inside the granted directory by name, but escaping through a junction
    const link = path.join(destination, "linked");
    fs.symlinkSync(
      outside,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
    const viaLink = await post(gather(root, path.join(link, "new"), grantToken));
    expect(viaLink.status).toBe(403);
    expect(viaLink.body.error).toMatch(/granted directory/);

    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("accepts a new descendant inside the granted directory", async () => {
    const response = await post(
      gather(root, path.join(destination, "new", "pack"), grantToken),
    );

    expect(response.status).toBe(200);
  });

  it("applies the same boundary to every filesystem command shape", async () => {
    // One representative assertion per command shape: the boundary must not be
    // something a command opts into. Previously this was the whole matrix run
    // three times.
    for (const body of [gather, preview, pack]) {
      mocks.execute.mockClear();

      const denied = await post(body(outside, destination, grantToken));
      expect(denied.status, `${body.name} must reject an outside source`).toBe(
        403,
      );
      expect(mocks.execute).not.toHaveBeenCalled();

      const allowed = await post(body(root, destination, grantToken));
      expect(allowed.status, `${body.name} must accept a granted path`).toBe(
        200,
      );
    }
  });

  it.fails(
    "denies Drop Rules apply when the host resolves no writable path (E04)",
    async () => {
      const source = library.writeFile("library/drop.wav", "sample");
      const target = path.join(library.root, "ungranted");
      const commands = new YardCommandRegistry();
      const input = {
        targetDirectory: target,
        files: [{ id: "unindexed", path: source, filename: "drop.wav" }],
      };

      registerDropCommands(
        createYardExtensionContext({
          permissions: dropPermissions,
          input,
          selection: { fileIds: ["unindexed"] },
          services: {
            commands,
            filesystem: {
              resolveReadablePath: async () => null,
              resolveWritablePath: async () => null,
            },
          },
        }),
      );

      await commands.execute("drop-rules.apply", input);

      // The host denied every path, so nothing may have been written.
      expect(fs.existsSync(target)).toBe(false);
    },
  );

  it.fails(
    "denies a write service to a context holding no write grant (E01)",
    () => {
      let removed = false;
      const context = createYardExtensionContext({
        permissions: [],
        services: {
          commands: new YardCommandRegistry(),
          files: {
            markRemoved: () => {
              removed = true;
            },
          },
        },
      });

      // Permissions are declared, not enforced: the context hands
      // options.services through untouched, so an extension that simply omits
      // permissions.require still reaches a write-capable service.
      expect(() => context.services.files!.markRemoved(["a"])).toThrow();
      expect(removed).toBe(false);
    },
  );
});
