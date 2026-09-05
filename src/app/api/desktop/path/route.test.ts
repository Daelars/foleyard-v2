import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ roots: [] as string[] }));

vi.mock("@/lib/db", () => ({ getLibraryRoots: () => mocks.roots }));

import { registerGrant } from "@/lib/filesystem-boundary";
import { POST } from "./route";

let temp: string;
let root: string;
let granted: string;
let outside: string;

beforeEach(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "foleyard-desktop-path-"));
  root = path.join(temp, "library");
  granted = path.join(temp, "chosen");
  outside = path.join(temp, "private");
  await Promise.all([root, granted, outside].map((p) => fs.mkdir(p)));
  mocks.roots = [root];
  await registerGrant(granted);
});

afterEach(async () => {
  await fs.rm(temp, { recursive: true, force: true });
});

const request = (candidatePath: string) =>
  new NextRequest("http://localhost/api/desktop/path", {
    method: "POST",
    body: JSON.stringify({ path: candidatePath }),
  });

describe("POST /api/desktop/path", () => {
  it("resolves a path inside the Library roots", async () => {
    const response = await POST(request(root));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { path: string };
    expect(body.path).toBe(await fs.realpath(root));
  });

  it("resolves a granted path outside the Library roots", async () => {
    const response = await POST(request(granted));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { path: string };
    expect(body.path).toBe(await fs.realpath(granted));
  });

  it("rejects a path outside the Library roots and grants", async () => {
    const response = await POST(request(outside));
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/outside the Library/i);
  });

  it("rejects traversal escapes and missing paths", async () => {
    expect((await POST(request(path.join(root, "..", "private")))).status).toBe(404);
    expect((await POST(request(path.join(temp, "missing")))).status).toBe(404);
    expect((await POST(request(""))).status).toBe(400);
  });
});
