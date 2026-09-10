import fs from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createScratchLibrary, type ScratchLibrary } from "@/test/fixtures";

import { resolveExistingPathWithinRoots } from "@/lib/filesystem-boundary";

// Area: filesystem grant boundary. Path authorization is the pure boundary
// rule shared by server adapters: canonicalize, require containment inside a
// Library root, reject traversal and links that escape.
//
// The v1 execute-route cases and the E01 v1 permission-context guard were
// removed with the v1 extension system; the v2 boundary lives in
// packages/yard-core/src/extensions-v2/filesystem.ts and its tests.

let library: ScratchLibrary;
let root: string;
let outside: string;

beforeEach(() => {
  library = createScratchLibrary("foleyard-boundary-");
  root = library.directory("library");
  outside = library.directory("private");
  library.writeFile("library/hit.wav");
  library.writeFile("private/hit.wav");
});

afterEach(() => library.dispose());

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
});
