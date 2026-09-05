import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  roots: [] as string[],
  files: new Map<string, { id: string; filename: string; path: string; removedAt: string | null }>(),
}));

vi.mock("@/lib/db", () => ({
  getFileById: (id: string) => mocks.files.get(id),
  getLibraryRoots: () => mocks.roots,
}));

import { GET } from "./route";

let temp: string;
let root: string;
let inside: string;
let outside: string;

beforeEach(async () => {
  temp = await fs.mkdtemp(path.join(os.tmpdir(), "foleyard-desktop-file-"));
  root = path.join(temp, "library");
  await fs.mkdir(root);
  inside = path.join(root, "hit.wav");
  outside = path.join(temp, "private.wav");
  await Promise.all([inside, outside].map((p) => fs.writeFile(p, "audio")));
  mocks.roots = [root];
  mocks.files = new Map([
    ["inside", { id: "inside", filename: "hit.wav", path: inside, removedAt: null }],
    ["outside", { id: "outside", filename: "private.wav", path: outside, removedAt: null }],
    ["missing", { id: "missing", filename: "gone.wav", path: path.join(root, "gone.wav"), removedAt: null }],
    ["removed", { id: "removed", filename: "old.wav", path: inside, removedAt: "2026-01-01T00:00:00.000Z" }],
  ]);
});

afterEach(async () => {
  await fs.rm(temp, { recursive: true, force: true });
});

const request = (id?: string) =>
  new NextRequest(`http://localhost/api/desktop/file${id === undefined ? "" : `?id=${id}`}`);

describe("GET /api/desktop/file", () => {
  it("resolves an indexed file inside the Library roots", async () => {
    const response = await GET(request("inside"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { file: { path: string } };
    expect(body.file.path).toBe(await fs.realpath(inside));
  });

  it("rejects an indexed file outside the Library roots", async () => {
    const response = await GET(request("outside"));
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/outside the Library/i);
    expect(await fs.readFile(outside, "utf8")).toBe("audio");
  });

  it("reports a missing file on disk", async () => {
    const response = await GET(request("missing"));
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: string };
    expect(body.error).toMatch(/no longer exists/i);
  });

  it.each([["unknown"], ["removed"], [undefined]])("rejects %s without touching the disk", async (id) => {
    const response = await GET(request(id as string | undefined));
    expect(response.status).toBe(id === undefined ? 400 : 404);
  });
});
