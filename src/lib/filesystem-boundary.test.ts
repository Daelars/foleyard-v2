import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveExistingPathWithinRoots } from "./filesystem-boundary";

let tempDirectory: string;

beforeEach(() => {
  tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-boundary-"));
});

afterEach(() => {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

describe("resolveExistingPathWithinRoots", () => {
  it("returns the canonical path for a file inside a root", async () => {
    const root = path.join(tempDirectory, "library");
    const file = path.join(root, "folder", "hit.wav");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "audio");

    await expect(resolveExistingPathWithinRoots(file, [root])).resolves.toBe(
      fs.realpathSync(file),
    );
  });

  it("rejects traversal outside a root", async () => {
    const root = path.join(tempDirectory, "library");
    const outside = path.join(tempDirectory, "private.txt");
    fs.mkdirSync(root);
    fs.writeFileSync(outside, "private");

    await expect(
      resolveExistingPathWithinRoots(path.join(root, "..", "private.txt"), [root]),
    ).resolves.toBeNull();
  });

  it("rejects a canonical path that escapes through a directory link", async () => {
    const root = path.join(tempDirectory, "library");
    const outside = path.join(tempDirectory, "outside");
    const link = path.join(root, "linked");
    fs.mkdirSync(root);
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, "secret.wav"), "private");
    fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");

    await expect(
      resolveExistingPathWithinRoots(path.join(link, "secret.wav"), [root]),
    ).resolves.toBeNull();
  });
});
