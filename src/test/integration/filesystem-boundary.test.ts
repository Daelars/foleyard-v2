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
  getFilesByIds: (ids: string[]) => ids.map((id) => mocks.files.get(id)).filter((file) => file !== undefined),
}));
vi.mock("@/lib/extensions/host", () => ({
  createAppExtensionHost: () => ({ execute: mocks.execute }),
}));

import { resolveExistingPathWithinRoots } from "@/lib/filesystem-boundary";
import { POST as execute } from "@/app/api/extensions/execute/route";
// Relative, not aliased: vitest resolves bare "@yard-core" and "@foleyard/x" to
// each package's index barrel, and these are subpath modules the barrels do not
// re-export.
import { YardCommandRegistry } from "../../../packages/yard-core/src/extensions/extension-command-registry";
import { createYardExtensionContext } from "../../../packages/yard-core/src/extensions/extension-context";

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
      // Same canonicalization call the implementation uses: sync and async
      // realpath disagree on short-name tmpdirs on some Windows runners.
      await fs.promises.realpath(file),
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