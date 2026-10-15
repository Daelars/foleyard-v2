import { describe, expect, it } from "vitest";

import {
  createV2ExtendedOperations,
  createV2OperationServices,
  ExtensionV2Host,
  ExtensionV2Registry,
  V2GrantStore,
  validateV2Value,
  type ExtensionV2Definition,
  type IndexedAudioFile,
  type V2DirectoryEntry,
  type V2FolderScanPorts,
  type V2HostServices,
  type V2LibraryMutationPorts,
  type V2LibraryReadPorts,
  type V2PathIo,
} from "yard-core";

import {
  createFolderJanitorV2Definition,
  FOLDER_JANITOR_V2_DELETE_FOLDERS,
  FOLDER_JANITOR_V2_ID,
  FOLDER_JANITOR_V2_REMOVE_FILES,
  FOLDER_JANITOR_V2_SCAN_LIBRARY,
  MAX_SCAN_ISSUE_DETAILS,
  MAX_SCAN_RECORDS,
  normalizePath,
  registerFolderJanitorV2Handlers,
  type FolderJanitorV2DeleteResult,
  type FolderJanitorV2RemoveResult,
  type FolderJanitorV2ScanResult,
} from "./index";

// Area: extension v2 J4 (#179). Folder Janitor v2 handlers through the
// real host: index-derived issues + empty-folder + missing-file from
// the bounded folder walk, remove-files via the mutation op, and the
// destructive delete-folders plan contract (review gate, revalidated
// deletion, non-empty refusal), plus permission denial and the
// no-v1-imports boundary.

const FULL = [
  "library:read",
  "library:write",
  "files:read",
  "files:delete",
  "settings:read",
  "settings:write",
];

function record(id: string, overrides?: Partial<IndexedAudioFile>): IndexedAudioFile {
  return {
    id,
    path: `/lib/${id}.wav`,
    filename: `${id}.wav`,
    libraryRoot: "/lib",
    directory: null,
    format: "wav",
    duration: 60,
    sampleRate: 44100,
    bitDepth: 16,
    channels: 2,
    fileSize: 2048,
    isFavorite: false,
    removedAt: null,
    lastScannedAt: "2026-09-06T00:00:00.000Z",
    mtimeMs: 1,
    ...overrides,
  };
}

function fakePathIo(existing: string[]): V2PathIo {
  const known = new Set(existing);
  return {
    realpath: async (candidate) => {
      if (!known.has(candidate)) {
        throw Object.assign(new Error(`ENOENT: ${candidate}`), { code: "ENOENT" });
      }
      return candidate;
    },
    lstat: async (candidate) => ({ exists: known.has(candidate), isLink: false }),
  };
}

const FILES: IndexedAudioFile[] = [
  record("a"),
  record("tiny", { path: "/lib/tiny.wav", filename: "tiny.wav", fileSize: 100 }),
  record("zero", { path: "/lib/zero.wav", filename: "zero.wav", fileSize: 0 }),
  record("weird", { path: "/lib/w.xyz", filename: "w.xyz", format: "xyz" }),
  record("dupe1", { path: "/lib/dupe.wav", filename: "dupe.wav" }),
  record("dupe2", { path: "/lib/sub/dupe.wav", filename: "dupe.wav", directory: "/lib/sub" }),
  record("gone", { path: "/lib/gone.wav", filename: "gone.wav" }),
];

function dirEntry(name: string, path: string, kind: "file" | "directory"): V2DirectoryEntry {
  return { name, path, kind, size: kind === "file" ? 2048 : null };
}

type World = {
  host: ExtensionV2Host;
  removed: string[];
  markedRemoved: string[];
  definition: ExtensionV2Definition;
};

type WorldOptions = {
  granted?: string[];
  /** Index records the scan pages over. Defaults to `FILES`. */
  files?: IndexedAudioFile[];
  /** Folder tree keyed by canonical path. Defaults to the `/lib` fixture. */
  tree?: Map<string, V2DirectoryEntry[]>;
  /** Canonical paths the fake path IO can resolve. Defaults to the fixture paths. */
  knownPaths?: string[];
  /** Awaited before each directory listing; lets a test hold a scan mid-walk. */
  beforeListDirectory?: (canonical: string) => Promise<void> | void;
};

const DEFAULT_TREE = new Map<string, V2DirectoryEntry[]>([
  [
    "/lib",
    [
      dirEntry("a.wav", "/lib/a.wav", "file"),
      dirEntry("tiny.wav", "/lib/tiny.wav", "file"),
      dirEntry("zero.wav", "/lib/zero.wav", "file"),
      dirEntry("w.xyz", "/lib/w.xyz", "file"),
      dirEntry("dupe.wav", "/lib/dupe.wav", "file"),
      dirEntry("empty", "/lib/empty", "directory"),
      dirEntry("sub", "/lib/sub", "directory"),
    ],
  ],
  ["/lib/empty", []],
  ["/lib/sub", [dirEntry("dupe.wav", "/lib/sub/dupe.wav", "file")]],
]);

function defaultTree(): Map<string, V2DirectoryEntry[]> {
  return new Map(
    [...DEFAULT_TREE.entries()].map(([path, entries]) => [path, entries.map((entry) => ({ ...entry }))]),
  );
}

const DEFAULT_KNOWN_PATHS = [
  "/lib",
  "/lib/empty",
  "/lib/sub",
  "/lib/a.wav",
  "/lib/tiny.wav",
  "/lib/zero.wav",
  "/lib/w.xyz",
  "/lib/dupe.wav",
  "/lib/sub/dupe.wav",
];

function world(overrides?: WorldOptions): World {
  const definition = createFolderJanitorV2Definition();
  const registry = new ExtensionV2Registry();
  registry.register(definition);
  const granted = overrides?.granted ?? FULL;
  const files = overrides?.files ?? FILES;
  const byId = new Map(files.map((file) => [file.id, file]));
  const library: V2LibraryReadPorts = {
    getFileById: (id) => byId.get(id) ?? null,
    getFilesByIds: (ids) => ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
    listPage: (cursor, limit) => {
      const start = cursor ? Number.parseInt(cursor, 10) : 0;
      const size = Math.max(1, Math.min(limit ?? 500, 500));
      const page = files.slice(start, start + size);
      const next = start + page.length;
      return { files: page, nextCursor: next < files.length ? String(next) : null };
    },
  };
  const tree = overrides?.tree ?? defaultTree();
  const removed: string[] = [];
  const knownPaths = overrides?.knownPaths ?? DEFAULT_KNOWN_PATHS;
  const folderPorts: V2FolderScanPorts = {
    libraryRoots: () => ["/lib"],
    pathIo: () => fakePathIo(knownPaths),
    listDirectory: async (canonical) => {
      await overrides?.beforeListDirectory?.(canonical);
      const entries = tree.get(canonical);
      if (!entries) throw Object.assign(new Error(`ENOENT: ${canonical}`), { code: "ENOENT" });
      return entries.map((entry) => ({ ...entry }));
    },
    removeEmptyDirectory: async (canonical) => {
      removed.push(canonical);
      tree.delete(canonical);
    },
  };
  const markedRemoved: string[] = [];
  const mutationPorts: V2LibraryMutationPorts = {
    markRemovedByPaths: (paths) => {
      markedRemoved.push(...paths);
    },
    insertRecords: () => {},
  };
  const services: V2HostServices = {
    registry,
    isEnabled: () => true,
    capabilities: {},
    grantedPermissions: () => [...granted],
    ports: library,
    authorizeGrant: () => ({ ok: true }),
    createOperations: (binding) => ({
      ...createV2OperationServices({
        ...binding,
        grants: new V2GrantStore(),
        library,
        ...(binding.reporter ? { jobs: binding.reporter } : {}),
        files: {
          readFileBytes: async () => new Uint8Array(),
          copyFile: async () => ({ device: "memory", fileId: "unused" }),
          writeFileBytes: async () => ({ device: "memory", fileId: "unused" }),
          deleteFileIfVersion: async () => ({ removed: false }),
          libraryRoots: () => ["/lib"],
          pathIo: () => fakePathIo(knownPaths),
        },
        archive: { createZipArchive: async () => ({ bytesWritten: 0, version: { device: "memory", fileId: "unused" } }) },
        settings: { readRaw: () => undefined, writeRaw: () => {} },
        extensionState: { readAll: () => ({}), writeAll: () => {} },
        settingsDeclarations: definition.settings,
      }),
      ...createV2ExtendedOperations({
        extensionId: binding.extensionId,
        effectivePermissions: binding.effectivePermissions,
        library,
        mutations: mutationPorts,
        folders: folderPorts,
      }),
    }),
  };
  const host = new ExtensionV2Host(services);
  registerFolderJanitorV2Handlers(host);
  return { host, removed, markedRemoved, definition };
}

function immediateValue<T>(result: unknown): T {
  expect(result).toMatchObject({ ok: true });
  const outcome = (result as { outcome: { kind: string; value: unknown } }).outcome;
  expect(outcome.kind).toBe("immediate");
  return outcome.value as T;
}

describe("folder-janitor-v2 scan-library", () => {
  it("reports index-derived issues, empty folders, and missing files", async () => {
    const w = world();
    const result = await w.host.execute({
      extensionId: FOLDER_JANITOR_V2_ID,
      commandId: FOLDER_JANITOR_V2_SCAN_LIBRARY,
      input: {},
      selection: {},
    });
    const value = immediateValue<FolderJanitorV2ScanResult>(result);
    expect(value.scannedFiles).toBe(FILES.length);
    expect(value.scannedRoots).toEqual(["/lib"]);
    const byKind = new Map<string, string[]>();
    value.issueKinds.forEach((kind, index) => {
      const list = byKind.get(kind) ?? [];
      list.push(value.issueFileIds[index]!);
      byKind.set(kind, list);
    });
    expect(byKind.get("broken")).toEqual(["zero"]);
    expect(byKind.get("tiny-file")).toEqual(["tiny"]);
    expect(byKind.get("weird-format")).toEqual(["weird"]);
    expect(byKind.get("duplicate")?.[0]).toBe("dupe1,dupe2");
    expect(value.issueKinds).toContain("empty-folder");
    expect(byKind.get("missing-file")).toEqual(["gone"]);
    expect(value.truncated).toBe(false);
    const command = w.definition.commands.find((c) => c.id === FOLDER_JANITOR_V2_SCAN_LIBRARY)!;
    expect(validateV2Value(command.result!, value, "result")).toBeNull();
  });

  it("denies the scan without files:read", async () => {
    const w = world({ granted: ["library:read", "settings:read"] });
    const result = await w.host.execute({
      extensionId: FOLDER_JANITOR_V2_ID,
      commandId: FOLDER_JANITOR_V2_SCAN_LIBRARY,
      input: {},
      selection: {},
    });
    expect(result.ok).toBe(false);
  });
});

describe("folder-janitor-v2 remove-files", () => {
  it("marks selected sounds removed from the index", async () => {
    const w = world();
    const result = await w.host.execute({
      extensionId: FOLDER_JANITOR_V2_ID,
      commandId: FOLDER_JANITOR_V2_REMOVE_FILES,
      input: {},
      selection: { fileIds: ["a", "tiny"] },
    });
    const value = immediateValue<FolderJanitorV2RemoveResult>(result);
    expect(value.removed).toBe(2);
    expect(value.marked.sort()).toEqual(["a", "tiny"]);
    expect(w.markedRemoved.sort()).toEqual(["/lib/a.wav", "/lib/tiny.wav"]);
  });
});

describe("folder-janitor-v2 delete-folders plan contract", () => {
  it("previews a review plan, then deletes only after review", async () => {
    const w = world();
    const first = await w.host.execute({
      extensionId: FOLDER_JANITOR_V2_ID,
      commandId: FOLDER_JANITOR_V2_DELETE_FOLDERS,
      input: { folders: ["/lib/empty"] },
      selection: {},
    });
    expect(first.ok).toBe(true);
    if (!first.ok || first.outcome.kind !== "review-required") {
      throw new Error("expected a review-required outcome");
    }
    expect(w.removed).toEqual([]);
    const reviewed = w.host.reviewPlan(first.outcome.planId);
    expect(reviewed.ok).toBe(true);
    if (!reviewed.ok) throw new Error("expected review payload");
    expect(reviewed.review.destructive).toBe(true);
    const applied = await w.host.applyPlan(first.outcome.planId, {
      targets: reviewed.review.targets,
      options: reviewed.review.options,
    });
    const value = immediateValue<FolderJanitorV2DeleteResult>(applied);
    expect(value.deleted).toBe(1);
    expect(value.deletedPaths).toEqual(["/lib/empty"]);
    expect(w.removed).toEqual(["/lib/empty"]);
  });

  it("rejects an unreviewed destructive apply", async () => {
    const w = world();
    const first = await w.host.execute({
      extensionId: FOLDER_JANITOR_V2_ID,
      commandId: FOLDER_JANITOR_V2_DELETE_FOLDERS,
      input: { folders: ["/lib/empty"] },
      selection: {},
    });
    if (!first.ok || first.outcome.kind !== "review-required") {
      throw new Error("expected a review-required outcome");
    }
    const applied = await w.host.applyPlan(first.outcome.planId, {
      targets: { fileIds: [] },
      options: { folders: ["/lib/empty"] },
    });
    expect(applied.ok).toBe(false);
    if (!applied.ok) expect(applied.code).toBe("review-required");
    expect(w.removed).toEqual([]);
  });

  it("fails a non-empty folder with a reason instead of deleting it", async () => {
    const w = world();
    const first = await w.host.execute({
      extensionId: FOLDER_JANITOR_V2_ID,
      commandId: FOLDER_JANITOR_V2_DELETE_FOLDERS,
      input: { folders: ["/lib/sub"] },
      selection: {},
    });
    if (!first.ok || first.outcome.kind !== "review-required") {
      throw new Error("expected a review-required outcome");
    }
    const reviewed = w.host.reviewPlan(first.outcome.planId);
    if (!reviewed.ok) throw new Error("expected review payload");
    const applied = await w.host.applyPlan(first.outcome.planId, {
      targets: reviewed.review.targets,
      options: reviewed.review.options,
    });
    const value = immediateValue<FolderJanitorV2DeleteResult>(applied);
    expect(value.deleted).toBe(0);
    expect(value.failedPaths).toEqual(["/lib/sub"]);
    expect(value.failedReasons[0]).toMatch(/no longer empty|only empty/i);
    expect(w.removed).toEqual([]);
  });
});

async function prepareDelete(
  w: World,
  folders: string[],
): Promise<{ planId: string; review: import("yard-core").V2PlanReview }> {
  const first = await w.host.execute({
    extensionId: FOLDER_JANITOR_V2_ID,
    commandId: FOLDER_JANITOR_V2_DELETE_FOLDERS,
    input: { folders },
    selection: {},
  });
  if (!first.ok || first.outcome.kind !== "review-required") {
    throw new Error(`expected a review-required outcome, got ${JSON.stringify(first)}`);
  }
  const reviewed = w.host.reviewPlan(first.outcome.planId);
  if (!reviewed.ok) throw new Error("expected review payload");
  return { planId: first.outcome.planId, review: reviewed.review };
}

// #285 — scans are honest about their reviewed scope and truncation, and
// the reviewed deletion is exact and never partially applied.
describe("folder-janitor-v2 honest scan reporting", () => {
  it("qualifies a scan as truncated when a folder cannot be listed", async () => {
    const tree = new Map<string, V2DirectoryEntry[]>([
      [
        "/lib",
        [dirEntry("a.wav", "/lib/a.wav", "file"), dirEntry("ghost", "/lib/ghost", "directory")],
      ],
    ]);
    const w = world({ tree, knownPaths: ["/lib", "/lib/a.wav", "/lib/ghost"] });
    const value = immediateValue<FolderJanitorV2ScanResult>(
      await w.host.execute({
        extensionId: FOLDER_JANITOR_V2_ID,
        commandId: FOLDER_JANITOR_V2_SCAN_LIBRARY,
        input: {},
        selection: {},
      }),
    );
    expect(value.truncated).toBe(true);
    expect(value.truncationReasons.length).toBeGreaterThan(0);
    expect(value.truncationReasons.join(" ")).toMatch(/ghost/i);
    // A partial walk never invents "missing" reports.
    expect(value.issueKinds).not.toContain("missing-file");
  });

  it("qualifies a scan as truncated at the record cap", async () => {
    const many = Array.from({ length: MAX_SCAN_RECORDS + 1 }, (_, index) =>
      record(`f${index}`, { path: `/lib/f${index}.wav`, filename: `f${index}.wav` }),
    );
    const w = world({ files: many, tree: new Map(), knownPaths: ["/lib"] });
    const value = immediateValue<FolderJanitorV2ScanResult>(
      await w.host.execute({
        extensionId: FOLDER_JANITOR_V2_ID,
        commandId: FOLDER_JANITOR_V2_SCAN_LIBRARY,
        input: {},
        selection: {},
      }),
    );
    expect(value.scannedFiles).toBe(MAX_SCAN_RECORDS);
    expect(value.truncated).toBe(true);
    expect(value.truncationReasons.join(" ")).toMatch(/cap/i);
    // The report total is accurate even though the record cap was hit.
    expect(value.issueTotal).toBe(0);
    expect(value.issueKinds).toHaveLength(0);
  });

  it("bounds the detail list but keeps the totals accurate", async () => {
    const many = Array.from({ length: MAX_SCAN_ISSUE_DETAILS + 5 }, (_, index) =>
      record(`b${index}`, { path: `/lib/b${index}.wav`, filename: `b${index}.wav`, fileSize: 0 }),
    );
    const w = world({ files: many, tree: new Map(), knownPaths: ["/lib"] });
    const value = immediateValue<FolderJanitorV2ScanResult>(
      await w.host.execute({
        extensionId: FOLDER_JANITOR_V2_ID,
        commandId: FOLDER_JANITOR_V2_SCAN_LIBRARY,
        input: {},
        selection: {},
      }),
    );
    expect(value.issueTotal).toBe(MAX_SCAN_ISSUE_DETAILS + 5);
    expect(value.issueKinds).toHaveLength(MAX_SCAN_ISSUE_DETAILS);
    expect(value.issueSummary).toContain(`broken=${MAX_SCAN_ISSUE_DETAILS + 5}`);
    const command = w.definition.commands.find(
      (entry) => entry.id === FOLDER_JANITOR_V2_SCAN_LIBRARY,
    )!;
    expect(validateV2Value(command.result!, value, "result")).toBeNull();
  });

  it("runs a scan as a cancellable job and settles cancelled", async () => {    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let listed = false;
    const tree = new Map<string, V2DirectoryEntry[]>([
      [
        "/lib",
        [dirEntry("a.wav", "/lib/a.wav", "file"), dirEntry("sub", "/lib/sub", "directory")],
      ],
      ["/lib/sub", []],
    ]);
    const w = world({
      tree,
      knownPaths: ["/lib", "/lib/a.wav", "/lib/sub"],
      beforeListDirectory: async () => {
        listed = true;
        await gate;
      },
    });
    const submitted = await w.host.submitJob({
      extensionId: FOLDER_JANITOR_V2_ID,
      commandId: FOLDER_JANITOR_V2_SCAN_LIBRARY,
      input: {},
      selection: {},
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok || submitted.outcome.kind !== "job") {
      throw new Error("expected a job outcome");
    }
    const jobId = submitted.outcome.jobId;
    for (let attempt = 0; attempt < 500 && !listed; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    expect(listed).toBe(true);
    const running = w.host.getJob(jobId);
    expect(running?.state).toBe("running");
    expect(running?.progress.completed).toBe(FILES.length);
    w.host.cancelJob(jobId);
    release();
    const settled = await w.host.jobs.waitFor(jobId);
    expect(settled.state).toBe("cancelled");
    expect(settled.partial.succeeded).toBe(0);
  });
});

describe("folder-janitor-v2 reviewed deletion is exact and recoverable", () => {
  // Empty, non-empty, and missing: one deletes, two fail with reasons.
  const FOLDERS = ["/lib/empty", "/lib/sub", "/lib/ghost"];

  it("deletes exactly the reviewed folders and accounts for every one", async () => {
    const w = world();
    const { planId, review } = await prepareDelete(w, FOLDERS);
    expect(review.destructive).toBe(true);
    expect((review.options as { folders: string[] }).folders).toEqual(FOLDERS);
    expect(w.removed).toEqual([]);

    const applied = await w.host.applyPlan(planId, {
      targets: review.targets,
      options: review.options,
    });
    const value = immediateValue<FolderJanitorV2DeleteResult>(applied);
    expect(value.reviewed).toBe(FOLDERS.length);
    expect(value.deletedPaths).toEqual(["/lib/empty"]);
    expect([...value.failedPaths].sort()).toEqual(["/lib/ghost", "/lib/sub"]);
    // Every reviewed folder is accounted for: nothing is silently dropped.
    expect(value.deleted + value.failedPaths.length).toBe(value.reviewed);
    const reviewedScope = new Set(FOLDERS.map(normalizePath));
    const accounted = new Set(
      [...value.deletedPaths, ...value.failedPaths].map(normalizePath),
    );
    expect(accounted).toEqual(reviewedScope);
    expect(w.removed).toEqual(["/lib/empty"]);
  });

  it("refuses an apply whose folders differ from the reviewed scope", async () => {
    const w = world();
    const { planId, review } = await prepareDelete(w, ["/lib/empty"]);
    const applied = await w.host.applyPlan(planId, {
      targets: review.targets,
      options: { folders: ["/lib/sub"] },
    });
    expect(applied.ok).toBe(false);
    if (!applied.ok) expect(applied.code).toBe("plan-altered");
    expect(w.removed).toEqual([]);
  });

  it("never applies the same reviewed deletion twice", async () => {
    const w = world();
    const { planId, review } = await prepareDelete(w, ["/lib/empty"]);
    const first = await w.host.applyPlan(planId, {
      targets: review.targets,
      options: review.options,
    });
    expect(immediateValue<FolderJanitorV2DeleteResult>(first).deleted).toBe(1);
    expect(w.removed).toEqual(["/lib/empty"]);

    const again = await w.host.applyPlan(planId, {
      targets: review.targets,
      options: review.options,
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.code).toBe("plan-consumed");
    expect(w.removed).toEqual(["/lib/empty"]);
  });
});
