import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  getFileById: vi.fn(),
  getLibraryRoots: vi.fn(),
}));

vi.mock("@/lib/db", () => db);
vi.mock("@/lib/extensions/make-pack-recent-store", () => ({
  recordRecentMakePackFile: vi.fn(),
}));

import { GET } from "./route";

let tempDirectory: string;
let root: string;
let inside: string;
let outside: string;

beforeEach(async () => {
  vi.resetAllMocks();
  tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "foleyard-audio-"));
  root = path.join(tempDirectory, "library");
  await fs.mkdir(root);
  inside = path.join(root, "hit.mp3");
  outside = path.join(tempDirectory, "private.mp3");
  await Promise.all([inside, outside].map((p) => fs.writeFile(p, "audio")));
  db.getLibraryRoots.mockReturnValue([root]);
});

afterEach(async () => {
  await fs.rm(tempDirectory, { recursive: true, force: true });
});

const request = (query: string, headers?: Record<string, string>) =>
  new NextRequest(`http://localhost/api/audio?${query}`, { headers });

async function drain(response: Response) {
  await response.arrayBuffer().catch(() => undefined);
  return response;
}

describe("GET /api/audio", () => {
  it("streams an indexed file inside a Library root", async () => {
    db.getFileById.mockReturnValue({ id: "audio-1", path: inside, removedAt: null });
    const response = await drain(await GET(request("id=audio-1")));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("audio/mpeg");
  });

  it("supports byte ranges inside a Library root", async () => {
    db.getFileById.mockReturnValue({ id: "audio-1", path: inside, removedAt: null });
    const response = await drain(await GET(request("id=audio-1", { Range: "bytes=0-1" })));
    expect(response.status).toBe(206);
  });

  it("rejects an indexed path outside the configured roots", async () => {
    db.getFileById.mockReturnValue({ id: "audio-1", path: outside, removedAt: null });
    const response = await drain(await GET(request("id=audio-1")));
    expect(response.status).toBe(404);
    expect(await fs.readFile(outside, "utf8")).toBe("audio");
  });

  it("rejects missing, removed, and unidentified files", async () => {
    db.getFileById.mockReturnValue({ id: "audio-1", path: path.join(root, "gone.mp3"), removedAt: null });
    expect((await drain(await GET(request("id=audio-1")))).status).toBe(404);

    db.getFileById.mockReturnValue({ id: "audio-2", path: inside, removedAt: "2026-01-01T00:00:00.000Z" });
    expect((await drain(await GET(request("id=audio-2")))).status).toBe(404);

    db.getFileById.mockReturnValue(undefined);
    expect((await drain(await GET(request("id=audio-3")))).status).toBe(404);

    expect((await drain(await GET(request("")))).status).toBe(400);
  });
});
