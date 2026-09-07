import { describe, expect, it } from "vitest";

import {
  createV2FolderOperations,
  denyV2FolderOperations,
  V2_FOLDER_LIST_LIMIT,
  V2OperationError,
  V2SourceGrantStore,
  type V2DirectoryEntry,
  type V2FolderFactoryArgs,
  type V2FolderScanPorts,
} from "./index";
import { fakePathIo } from "./test-helpers";

// Area: extension v2 E1 (#176). Folder listing is bounded with cursor
// paging over Library roots or readable source grants; deletion
// removes one still-empty folder inside a Library root only, with
// containment rechecked at delete time.

function setup(overrides?: Partial<V2FolderFactoryArgs>) {
  const removed: string[] = [];
  const files = new Map<string, V2DirectoryEntry[]>([
    [
      "/lib",
      [
        { name: "empty", path: "/lib/empty", kind: "directory", size: null },
        { name: "full", path: "/lib/full", kind: "directory", size: null },
        { name: "a.mp3", path: "/lib/a.mp3", kind: "file", size: 10 },
      ],
    ],
    ["/lib/empty", []],
    [
      "/lib/full",
      [{ name: "b.mp3", path: "/lib/full/b.mp3", kind: "file", size: 20 }],
    ],
    [
      "/media/inbox",
      [{ name: "found.wav", path: "/media/inbox/found.wav", kind: "file", size: 30 }],
    ],
  ]);
  const existing = ["/lib", "/lib/empty", "/lib/full", "/lib/a.mp3", "/media/inbox"];
  const ports: V2FolderScanPorts = {
    libraryRoots: () => ["/lib"],
    pathIo: () => fakePathIo(existing),
    listDirectory: async (canonicalPath) => {
      const entries = files.get(canonicalPath);
      if (!entries) throw new Error(`ENOENT: ${canonicalPath}`);
      return entries.map((entry) => ({ ...entry }));
    },
    removeEmptyDirectory: async (canonicalPath) => {
      removed.push(canonicalPath);
    },
  };
  const sources = new V2SourceGrantStore(() => "2026-09-06T00:00:00.000Z");
  const operations = createV2FolderOperations({
    extensionId: "folder-janitor-v2",
    effectivePermissions: ["files:read", "files:delete"],
    folders: ports,
    sources,
    now: "2026-09-06T00:00:00.000Z",
    ...overrides,
  });
  return { operations, removed, sources };
}

describe("v2 folder permission confinement", () => {
  it("denies listing without files:read and deletion without files:delete", async () => {
    const readOnly = setup({ effectivePermissions: ["files:read"] }).operations;
    await expect(readOnly.deleteEmptyFolder({ path: "/lib/empty" })).rejects.toThrowError(
      /"files:delete"/,
    );
    const deleteOnly = setup({ effectivePermissions: ["files:delete"] }).operations;
    await expect(deleteOnly.listFolder({ path: "/lib" })).rejects.toThrowError(/"files:read"/);
  });

  it("denies closed hosts without folder ports", async () => {
    const denied = denyV2FolderOperations("folder-janitor-v2");
    await expect(denied.listFolder({ path: "/lib" })).rejects.toThrowError(/"files:read"/);
    await expect(denied.deleteEmptyFolder({ path: "/lib/empty" })).rejects.toThrowError(
      /"files:read"/,
    );
  });
});

describe("v2 listFolder", () => {
  it("lists a Library folder with stable paging", async () => {
    const { operations } = setup();
    const first = await operations.listFolder({ path: "/lib", limit: 2 });
    expect(first.root).toBe("/lib");
    expect(first.total).toBe(3);
    expect(first.entries.map((entry) => entry.name)).toEqual(["a.mp3", "empty"]);
    expect(first.nextCursor).toBe(2);
    const second = await operations.listFolder({ path: "/lib", limit: 2, cursor: first.nextCursor! });
    expect(second.entries.map((entry) => entry.name)).toEqual(["full"]);
    expect(second.nextCursor).toBeNull();
  });

  it("bounds each page to the folder-list limit", async () => {
    const names = Array.from({ length: V2_FOLDER_LIST_LIMIT + 50 }, (_, index) => `f-${index}.mp3`);
    const ports: V2FolderScanPorts = {
      libraryRoots: () => ["/lib"],
      pathIo: () => fakePathIo(["/lib", "/lib/big"]),
      listDirectory: async () =>
        names.map((name) => ({ name, path: `/lib/big/${name}`, kind: "file" as const, size: 1 })),
      removeEmptyDirectory: async () => {},
    };
    const operations = createV2FolderOperations({
      extensionId: "folder-janitor-v2",
      effectivePermissions: ["files:read"],
      folders: ports,
    });
    const page = await operations.listFolder({ path: "/lib/big", limit: 10_000 });
    expect(page.entries).toHaveLength(V2_FOLDER_LIST_LIMIT);
    expect(page.total).toBe(V2_FOLDER_LIST_LIMIT + 50);
    expect(page.nextCursor).toBe(V2_FOLDER_LIST_LIMIT);
  });

  it("denies folders outside the Library roots", async () => {
    const { operations } = setup();
    await expect(operations.listFolder({ path: "/media/inbox" })).rejects.toThrowError(
      /not readable/,
    );
  });

  it("lists granted source folders and denies foreign or expired grants", async () => {
    const { operations, sources } = setup();
    const grant = sources.issue("folder-janitor-v2", "/media/inbox");
    const listed = await operations.listFolder({ grantId: grant.grantId });
    expect(listed.root).toBe("/media/inbox");
    expect(listed.entries.map((entry) => entry.name)).toEqual(["found.wav"]);

    const foreign = sources.issue("library-gatherer-v2", "/media/inbox");
    await expect(operations.listFolder({ grantId: foreign.grantId })).rejects.toThrowError(
      /another extension/,
    );
    await expect(operations.listFolder({ grantId: "missing" })).rejects.toThrowError(
      /unknown or was revoked/,
    );
    const expiring = sources.issue("folder-janitor-v2", "/media/inbox", {
      expiresAt: "2026-09-06T01:00:00.000Z",
    });
    const late = createV2FolderOperations({
      extensionId: "folder-janitor-v2",
      effectivePermissions: ["files:read"],
      folders: {
        libraryRoots: () => ["/lib"],
        pathIo: () => fakePathIo(["/lib", "/media/inbox"]),
        listDirectory: async () => [],
        removeEmptyDirectory: async () => {},
      },
      sources,
      now: "2026-09-06T02:00:00.000Z",
    });
    await expect(late.listFolder({ grantId: expiring.grantId })).rejects.toThrowError(/expired/);
  });

  it("rejects empty input and missing folders with reasons", async () => {
    const { operations } = setup();
    await expect(operations.listFolder({})).rejects.toThrowError(/path or a readable source grant/);
    await expect(operations.listFolder({ path: "  " })).rejects.toThrowError(/non-empty string/);
    await expect(operations.listFolder({ path: "/lib/missing" })).rejects.toThrowError(
      /not readable|cannot be listed/,
    );
  });
});

describe("v2 deleteEmptyFolder", () => {
  it("removes a still-empty folder inside a Library root", async () => {
    const { operations, removed } = setup();
    const result = await operations.deleteEmptyFolder({ path: "/lib/empty" });
    expect(result).toEqual({ removed: "/lib/empty" });
    expect(removed).toEqual(["/lib/empty"]);
  });

  it("refuses non-empty folders, roots, and outside paths", async () => {
    const { operations, removed } = setup();
    await expect(deleteOp(operations, "/lib/full")).rejects.toThrowError(/no longer empty/);
    await expect(deleteOp(operations, "/lib")).rejects.toThrowError(/never deleted/);
    await expect(deleteOp(operations, "/media/inbox")).rejects.toThrowError(/not readable/);
    await expect(deleteOp(operations, "/lib/../../evil")).rejects.toThrowError(
      /not readable|escapes/,
    );
    expect(removed).toEqual([]);
  });

  it("reports removal failures instead of succeeding vacuously", async () => {
    const ports: V2FolderScanPorts = {
      libraryRoots: () => ["/lib"],
      pathIo: () => fakePathIo(["/lib", "/lib/empty"]),
      listDirectory: async () => [],
      removeEmptyDirectory: async () => {
        throw new Error("EBUSY: resource busy");
      },
    };
    const operations = createV2FolderOperations({
      extensionId: "folder-janitor-v2",
      effectivePermissions: ["files:delete"],
      folders: ports,
    });
    await expect(operations.deleteEmptyFolder({ path: "/lib/empty" })).rejects.toThrowError(
      V2OperationError,
    );
  });
});

function deleteOp(operations: ReturnType<typeof createV2FolderOperations>, path: string) {
  return operations.deleteEmptyFolder({ path });
}
