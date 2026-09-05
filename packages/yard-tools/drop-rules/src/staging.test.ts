import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createDragStage } from "./staging";

it("evicts only expired owned stages, preserving recent stages and user files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "foleyard-stage-test-"));
  try {
    const old = await createDragStage(root);
    const recent = await createDragStage(root);
    const user = path.join(root, "user-sounds"); await fs.mkdir(user);
    const past = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await fs.utimes(old, past, past); await fs.utimes(user, past, past);
    const next = await createDragStage(root);
    await expect(fs.stat(old)).rejects.toMatchObject({ code: "ENOENT" });
    expect((await fs.stat(recent)).isDirectory()).toBe(true);
    expect((await fs.stat(user)).isDirectory()).toBe(true);
    expect((await fs.stat(next)).isDirectory()).toBe(true);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
