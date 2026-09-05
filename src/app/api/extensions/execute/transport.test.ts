import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  roots: [] as string[],
  filesById: new Map<string, unknown>(),
  listedFiles: [] as Array<{
    id: string;
    filename: string;
    path: string;
    format: string;
    fileSize: number;
    duration: number | null;
  }>,
  allFiles: [] as Array<{
    id: string;
    filename: string;
    path: string;
    format: string;
    fileSize: number;
    duration: number | null;
    removedAt: string | null;
  }>,
  tags: new Map<string, Array<{ id: string; name: string }>>(),
  shelfFileIds: [] as string[],
  recentFileIds: [] as string[],
  setShelfFileIds: vi.fn(),
  execute: vi.fn(),
  getFilesArgs: [] as unknown[][],
  resolveReadablePath: vi.fn(),
  resolveWritablePath: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  getLibraryRoots: () => mocks.roots,
  getFileById: (id: string) => mocks.filesById.get(id) ?? null,
  getFiles: (...args: unknown[]) => {
    mocks.getFilesArgs.push(args);
    return mocks.listedFiles;
  },
  getAllFilesIncludingRemoved: () => mocks.allFiles,
  getTagsForFiles: () => mocks.tags,
}));

vi.mock("@/lib/filesystem-boundary", () => ({
  resolveReadablePath: (...args: unknown[]) =>
    mocks.resolveReadablePath(...args),
  resolveWritablePath: (...args: unknown[]) =>
    mocks.resolveWritablePath(...args),
}));

vi.mock("@/lib/extensions/host", () => ({
  createAppExtensionHost: () => ({ execute: mocks.execute }),
}));

vi.mock("@/lib/extensions/sound-shelf-store", () => ({
  DbSoundShelfStore: class {
    getFileIds() {
      return mocks.shelfFileIds;
    }
    setFileIds(fileIds: string[]) {
      mocks.setShelfFileIds(fileIds);
    }
  },
}));

vi.mock("@/lib/extensions/make-pack-recent-store", () => ({
  getRecentMakePackFileIds: () => mocks.recentFileIds,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new NextRequest("http://localhost/api/extensions/execute", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  mocks.roots = ["/library"];
  mocks.filesById.clear();
  mocks.listedFiles = [];
  mocks.allFiles = [];
  mocks.tags = new Map();
  mocks.shelfFileIds = [];
  mocks.recentFileIds = [];
  mocks.setShelfFileIds.mockReset();
  mocks.execute.mockReset();
  mocks.getFilesArgs = [];
  mocks.resolveReadablePath.mockReset();
  mocks.resolveWritablePath.mockReset();
  mocks.resolveReadablePath.mockImplementation(async (candidate: unknown) =>
    typeof candidate === "string" && candidate.startsWith("/library")
      ? candidate
      : null,
  );
  mocks.resolveWritablePath.mockImplementation(async (candidate: unknown) =>
    typeof candidate === "string" && candidate.startsWith("/granted")
      ? candidate
      : null,
  );
});

describe("POST /api/extensions/execute transport adapters", () => {
  it("resolves a folder scan to indexed files before executing", async () => {
    mocks.listedFiles = Array.from({ length: 5 }, (_, index) => ({
      id: String(index),
      filename: `${index}.wav`,
      path: `/library/${index}.wav`,
      format: "wav",
      fileSize: 10,
      duration: null,
    }));
    mocks.execute.mockResolvedValue({ ok: true, type: "value", value: { ok: true } });

    const response = await POST(
      request({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.scan-folder",
        input: { folderPath: "/library" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.execute.mock.calls[0][0].input.files).toHaveLength(5);
    expect(mocks.execute.mock.calls[0][0].input.libraryRoots).toEqual([
      "/library",
    ]);
  });

  it("rejects a folder scan outside the configured Library roots", async () => {
    const response = await POST(
      request({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.scan-folder",
        input: { folderPath: "/private" },
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("caps a folder scan listing so one huge directory cannot OOM the host", async () => {
    mocks.execute.mockResolvedValue({ ok: true, type: "value", value: { ok: true } });

    const response = await POST(
      request({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.scan-folder",
        input: { folderPath: "/library" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.getFilesArgs).toHaveLength(1);
    const options = mocks.getFilesArgs[0][0] as { limit: number };
    expect(options.limit).toBeGreaterThan(0);
    expect(options.limit).toBeLessThanOrEqual(5000);
  });

  it("returns 404 when a make-pack selection hydrates to no indexed files", async () => {
    const response = await POST(
      request({
        extensionId: "make-pack",
        commandId: "make-pack.from-selection",
        input: {
          destinationDirectory: "/granted/packs",
          fileIds: ["stale-1", "stale-2"],
        },
        destinationGrant: "grant-1",
      }),
    );

    expect(response.status).toBe(404);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects delete-folders paths outside the Library roots", async () => {
    const response = await POST(
      request({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.delete-folders",
        input: { paths: ["/private/evil"] },
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects delete-folders with non-string paths", async () => {
    const response = await POST(
      request({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.delete-folders",
        input: { paths: [42] },
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("degrades a malformed shelf list to empty items instead of throwing", async () => {
    mocks.execute.mockResolvedValue({
      ok: true,
      type: "value",
      value: 42,
    });

    const response = await POST(
      request({
        extensionId: "sound-shelf",
        commandId: "sound-shelf.list",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      value: { items: [] },
    });
  });

  it("maps a save-search query to a smart-collection filter", async () => {
    mocks.execute.mockResolvedValue({
      ok: true,
      type: "value",
      value: "smart-id",
    });

    const response = await POST(
      request({
        extensionId: "smart-collections",
        commandId: "smart-collections.save-search",
        input: { name: "Impacts", query: "impact" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.execute.mock.calls[0][0].input).toEqual({
      name: "Impacts",
      filter: { q: "impact" },
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      value: { success: true, id: "smart-id" },
    });
  });

  it("rejects a save-search without a query before executing", async () => {
    const response = await POST(
      request({
        extensionId: "smart-collections",
        commandId: "smart-collections.save-search",
        input: { name: "Impacts" },
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("adds the Library roots to delete-folders input", async () => {
    mocks.execute.mockResolvedValue({
      ok: true,
      type: "value",
      value: { results: [] },
    });

    const response = await POST(
      request({
        extensionId: "folder-janitor",
        commandId: "folder-janitor.delete-folders",
        input: { paths: ["/library/empty"] },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.execute.mock.calls[0][0].input).toEqual({
      paths: ["/library/empty"],
      libraryRoots: ["/library"],
    });
  });

  it("prepares a drag-out file from a file id", async () => {
    mocks.filesById.set("file-1", {
      id: "file-1",
      filename: "hit.wav",
      path: "/library/hit.wav",
      format: "wav",
      removedAt: null,
    });
    mocks.execute.mockResolvedValue({
      ok: true,
      type: "value",
      value: {
        dragPath: "/tmp/hit.wav",
        outputName: "hit.wav",
        originalPath: "/library/hit.wav",
        staged: true,
        usedReportPath: null,
      },
    });

    const response = await POST(
      request({
        extensionId: "drop-rules",
        commandId: "drop-rules.prepare-drag",
        selection: { fileIds: ["file-1"] },
        input: { fileId: "file-1" },
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.execute.mock.calls[0][0].input.file).toMatchObject({
      id: "file-1",
      path: "/library/hit.wav",
    });
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      value: {
        file: { id: "file-1", path: "/tmp/hit.wav", filename: "hit.wav" },
      },
    });
  });

  it("returns 404 when the drag-out file is not indexed", async () => {
    const response = await POST(
      request({
        extensionId: "drop-rules",
        commandId: "drop-rules.prepare-drag",
        selection: { fileIds: ["missing"] },
        input: { fileId: "missing" },
      }),
    );

    expect(response.status).toBe(404);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("hydrates make-pack file ids to readable files", async () => {
    mocks.shelfFileIds = ["file-1"];
    mocks.filesById.set("file-1", {
      id: "file-1",
      filename: "hit.wav",
      path: "/library/hit.wav",
      format: "wav",
      fileSize: 5,
      duration: null,
      removedAt: null,
    });
    mocks.execute.mockResolvedValue({
      ok: true,
      type: "value",
      value: { ok: true, fileCount: 1 },
    });

    const response = await POST(
      request({
        extensionId: "make-pack",
        commandId: "make-pack.from-shelf",
        input: {
          destinationDirectory: "/granted/packs",
          packName: "Shelf Pack",
          outputFormat: "folder",
        },
        destinationGrant: "grant-1",
      }),
    );

    expect(response.status).toBe(200);
    const hostInput = mocks.execute.mock.calls[0][0].input;
    expect(hostInput.files).toHaveLength(1);
    expect(hostInput.files[0]).toMatchObject({ id: "file-1" });
    expect(hostInput.destinationDirectory).toBe("/granted/packs");
  });

  it("resolves gather directories against the filesystem boundary", async () => {
    mocks.execute.mockResolvedValue({
      ok: true,
      type: "value",
      value: { ok: true, copied: 0, skipped: 0 },
    });

    const response = await POST(
      request({
        extensionId: "library-gatherer",
        commandId: "library-gatherer.gather",
        input: {
          sourceDirectories: ["/library/inbox"],
          destinationDirectory: "/granted/gathered",
        },
        destinationGrant: "grant-1",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.execute.mock.calls[0][0].input).toEqual({
      sourceDirectories: ["/library/inbox"],
      destinationDirectory: "/granted/gathered",
    });
  });

  it("rejects a gather destination outside the granted directory", async () => {
    const response = await POST(
      request({
        extensionId: "library-gatherer",
        commandId: "library-gatherer.gather",
        input: {
          sourceDirectories: ["/library/inbox"],
          destinationDirectory: "/elsewhere",
        },
        destinationGrant: "grant-1",
      }),
    );

    expect(response.status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("enriches the sound-shelf list to library items", async () => {
    mocks.execute.mockResolvedValue({
      ok: true,
      type: "value",
      value: ["file-1"],
    });
    mocks.filesById.set("file-1", {
      id: "file-1",
      filename: "hit.wav",
      path: "/library/hit.wav",
      directory: "",
      format: "wav",
      duration: null,
      fileSize: 5,
      mtimeMs: 1,
      isFavorite: false,
      removedAt: null,
    });
    mocks.tags.set("file-1", []);

    const response = await POST(
      request({
        extensionId: "sound-shelf",
        commandId: "sound-shelf.list",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      value: { items: [{ id: "file-1", filename: "hit.wav" }] },
    });
  });
});
