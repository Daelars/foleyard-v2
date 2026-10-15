import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { V2OutputConflictError } from "@yard-core";

import {
  copyV2FileExclusive,
  createV2OutputExclusive,
  removeV2FileIfVersion,
  statV2FileVersion,
  writeV2FileBytesExclusive,
} from "./output-files";

// Area: extension v2 output ownership (#267). The shared node primitives
// every v2 output goes through: exclusive creation (the create is the
// claim) and version-checked removal (a replacement is not ours).

let roots: string[] = [];

function scratch(): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-out-files-")));
  roots.push(dir);
  return dir;
}

beforeEach(() => {
  roots = [];
});
afterEach(() => {
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true });
  roots = [];
});

describe("createV2OutputExclusive", () => {
  it("claims a new entry and reports its version", async () => {
    const dir = scratch();
    const dest = path.join(dir, "fresh.txt");
    const { handle, version } = await createV2OutputExclusive(dest);
    await handle.close();
    expect(fs.existsSync(dest)).toBe(true);
    expect(version.device).not.toBe("");
    expect(version.fileId).not.toBe("");
  });

  it("refuses an existing entry without touching it", async () => {
    const dir = scratch();
    const dest = path.join(dir, "taken.txt");
    fs.writeFileSync(dest, "precious");
    await expect(createV2OutputExclusive(dest)).rejects.toBeInstanceOf(V2OutputConflictError);
    expect(fs.readFileSync(dest, "utf8")).toBe("precious");
  });
});

describe("exclusive copy and text writes", () => {
  it("creates the destination exclusively", async () => {
    const dir = scratch();
    const source = path.join(dir, "src.bin");
    const dest = path.join(dir, "copy.bin");
    fs.writeFileSync(source, "payload");
    const version = await copyV2FileExclusive(source, dest);
    expect(fs.readFileSync(dest, "utf8")).toBe("payload");
    expect(version).toEqual(await statV2FileVersion(dest));
  });

  it("refuses a pre-existing destination for copy and text", async () => {
    const dir = scratch();
    const source = path.join(dir, "src.bin");
    const dest = path.join(dir, "taken.bin");
    fs.writeFileSync(source, "payload");
    fs.writeFileSync(dest, "precious");

    await expect(copyV2FileExclusive(source, dest)).rejects.toBeInstanceOf(V2OutputConflictError);
    await expect(
      writeV2FileBytesExclusive(dest, new TextEncoder().encode("mine")),
    ).rejects.toBeInstanceOf(V2OutputConflictError);
    expect(fs.readFileSync(dest, "utf8")).toBe("precious");
  });

  it("removes only its own partial when the copy fails", async () => {
    const dir = scratch();
    const dest = path.join(dir, "partial.bin");
    await expect(copyV2FileExclusive(path.join(dir, "missing.bin"), dest)).rejects.toThrowError();
    expect(fs.existsSync(dest)).toBe(false);
  });
});

describe("version-checked removal", () => {
  it("removes the entry the version names", async () => {
    const dir = scratch();
    const dest = path.join(dir, "owned.txt");
    const version = await writeV2FileBytesExclusive(dest, new TextEncoder().encode("job output"));
    expect(await removeV2FileIfVersion(dest, version)).toBe(true);
    expect(fs.existsSync(dest)).toBe(false);
  });

  it("leaves a replacement at the same path alone", async () => {
    const dir = scratch();
    const dest = path.join(dir, "owned.txt");
    const version = await writeV2FileBytesExclusive(dest, new TextEncoder().encode("job output"));
    fs.rmSync(dest);
    fs.writeFileSync(dest, "third-party replacement");

    expect(await removeV2FileIfVersion(dest, version)).toBe(false);
    expect(fs.readFileSync(dest, "utf8")).toBe("third-party replacement");
  });

  it("reports nothing removal when the entry is already gone", async () => {
    const dir = scratch();
    const dest = path.join(dir, "gone.txt");
    const version = await writeV2FileBytesExclusive(dest, new TextEncoder().encode("job output"));
    fs.rmSync(dest);
    expect(await removeV2FileIfVersion(dest, version)).toBe(false);
    expect(await statV2FileVersion(dest)).toBeNull();
  });
});
