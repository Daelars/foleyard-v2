import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  getFileById: vi.fn(),
  getLibraryRoots: vi.fn(),
}));

vi.mock("@/lib/db", () => db);

import { GET } from "./route";

let tempDirectory: string;

beforeEach(() => {
  vi.resetAllMocks();
  tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-waveform-"));
});

afterEach(() => {
  fs.rmSync(tempDirectory, { recursive: true, force: true });
});

function request(query: string) {
  return new NextRequest(`http://localhost/api/waveform?${query}`);
}

describe("GET /api/waveform", () => {
  it("resolves a current Audio file id inside a Library root", async () => {
    const root = path.join(tempDirectory, "library");
    const filePath = path.join(root, "hit.mp3");
    fs.mkdirSync(root);
    fs.writeFileSync(filePath, "audio");
    db.getLibraryRoots.mockReturnValue([root]);
    db.getFileById.mockReturnValue({ id: "audio-1", path: filePath, removedAt: null });

    const response = await GET(request("id=audio-1&peaks=64"));

    expect(response.status).toBe(200);
    const body = (await response.json()) as { peaks: number[] };
    expect(body.peaks).toHaveLength(64);
  });

  it("rejects stale and removed Audio file records", async () => {
    const root = path.join(tempDirectory, "library");
    fs.mkdirSync(root);
    db.getLibraryRoots.mockReturnValue([root]);
    db.getFileById.mockReturnValue({
      id: "audio-1",
      path: path.join(root, "missing.wav"),
      removedAt: null,
    });
    expect((await GET(request("id=audio-1"))).status).toBe(404);

    db.getFileById.mockReturnValue({
      id: "audio-2",
      path: path.join(root, "removed.wav"),
      removedAt: "2026-01-01T00:00:00.000Z",
    });
    expect((await GET(request("id=audio-2"))).status).toBe(404);
  });

  it("rejects an indexed path outside the configured roots", async () => {
    const root = path.join(tempDirectory, "library");
    const outside = path.join(tempDirectory, "outside.mp3");
    fs.mkdirSync(root);
    fs.writeFileSync(outside, "audio");
    db.getLibraryRoots.mockReturnValue([root]);
    db.getFileById.mockReturnValue({ id: "audio-1", path: outside, removedAt: null });

    expect((await GET(request("id=audio-1"))).status).toBe(404);
  });
});
