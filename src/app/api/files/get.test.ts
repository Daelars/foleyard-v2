import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getFiles: vi.fn(),
  getTagsForFiles: vi.fn(),
  getFileCount: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getFiles: mocks.getFiles,
  getTagsForFiles: mocks.getTagsForFiles,
  getFileCount: mocks.getFileCount,
}));

import { GET } from "./route";

const request = (query: string) => new NextRequest(`http://localhost/api/files${query}`);

beforeEach(() => {
  mocks.getFiles.mockReturnValue([]);
  mocks.getTagsForFiles.mockReturnValue(new Map());
  mocks.getFileCount.mockReturnValue(0);
});

describe("files list sorting", () => {
  it("orders server-side by duration descending", async () => {
    const response = await GET(request("?sortKey=duration&sortDir=desc&limit=2&offset=2"));
    expect(response.status).toBe(200);
    expect(mocks.getFiles).toHaveBeenCalledWith(
      expect.objectContaining({ sortKey: "duration", sortDir: "desc", limit: 2, offset: 2 }),
    );
  });

  it("defaults to filename ascending", async () => {
    await GET(request(""));
    expect(mocks.getFiles).toHaveBeenCalledWith(
      expect.objectContaining({ sortKey: "filename", sortDir: "asc" }),
    );
  });

  it("rejects unknown sort keys and directions", async () => {
    expect((await GET(request("?sortKey=artist"))).status).toBe(400);
    expect((await GET(request("?sortDir=sideways"))).status).toBe(400);
  });
});
