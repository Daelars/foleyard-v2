import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  createV2ExtendedOperations,
  createV2OperationServices,
  ExtensionV2Host,
  ExtensionV2Registry,
  V2GrantStore,
  V2JobCancelledError,
  V2SourceGrantStore,
  validateV2Value,
  type ExtensionV2Definition,
  type IndexedAudioFile,
  type V2DirectoryEntry,
  type V2FileContentPorts,
  type V2FolderScanPorts,
  type V2HostServices,
  type V2JobReporter,
  type V2LibraryMutationPorts,
  type V2LibraryReadPorts,
  type V2PathIo,
} from "yard-core";

import {
  createLibraryGathererV2Definition,
  LIBRARY_GATHERER_V2_GATHER,
  LIBRARY_GATHERER_V2_ID,
  LIBRARY_GATHERER_V2_PREVIEW,
  registerLibraryGathererV2Handlers,
  type LibraryGathererV2GatherResult,
  type LibraryGathererV2PreviewResult,
} from "./index";

// Area: extension v2 G5 (#180). Library Gatherer v2 handlers through the
// real host: source-grant walk + audio filter (preview), source→dest
// copy with never-overwrite (skip vs fail per skip-duplicates), index
// insert, job cancellation with owned-only cleanup, permission denial,
// and the no-v1-imports boundary.

const FULL = [
  "library:read",
  "library:write",
  "files:read",
  "files:copy",
  "settings:read",
  "settings:write",
];

function fakePathIo(existing: Set<string>): V2PathIo {
  return {
    realpath: async (candidate) => {
      if (!existing.has(candidate)) {
        throw Object.assign(new Error(`ENOENT: ${candidate}`), { code: "ENOENT" });
      }
      return candidate;
    },
    lstat: async (candidate) => ({ exists: existing.has(candidate), isLink: false }),
  };
}

function entry(name: string, path: string, kind: "file" | "directory"): V2DirectoryEntry {
  return { name, path, kind, size: kind === "file" ? 64 : null };
}

type World = {
  host: ExtensionV2Host;
  bytes: Map<string, Uint8Array>;
  inserted: Array<{ path: string; filename: string }>;
  sourceGrantId: string;
  destGrantId: string;
  definition: ExtensionV2Definition;
};

function world(overrides?: {
  granted?: string[];
  destSeed?: string[];
  failReporterAfter?: number | null;
}): World {
  const definition = createLibraryGathererV2Definition();
  const registry = new ExtensionV2Registry();
  registry.register(definition);
  const granted = overrides?.granted ?? FULL;

  const bytes = new Map<string, Uint8Array>([
    ["/media/inbox/kick.wav", new TextEncoder().encode("kick")],
    ["/media/inbox/sub/snare.wav", new TextEncoder().encode("snare")],
    ["/media/inbox/notes.txt", new TextEncoder().encode("notes")],
    ...(overrides?.destSeed ?? []).map(
      (path) => [path, new TextEncoder().encode("existing")] as [string, Uint8Array],
    ),
  ]);
  const existing = new Set<string>([
    "/media",
    "/media/inbox",
    "/media/inbox/sub",
    "/lib",
    ...bytes.keys(),
  ]);

  const tree = new Map<string, V2DirectoryEntry[]>([
    [
      "/media/inbox",
      [
        entry("kick.wav", "/media/inbox/kick.wav", "file"),
        entry("notes.txt", "/media/inbox/notes.txt", "file"),
        entry("sub", "/media/inbox/sub", "directory"),
      ],
    ],
    ["/media/inbox/sub", [entry("snare.wav", "/media/inbox/sub/snare.wav", "file")]],
  ]);

  const files: IndexedAudioFile[] = [];
  const library: V2LibraryReadPorts = {
    getFileById: () => null,
    getFilesByIds: () => [],
    listPage: () => ({ files, nextCursor: null }),
  };

  const filePorts: V2FileContentPorts = {
    readFileBytes: async (path) => bytes.get(path) ?? new Uint8Array(),
    copyFile: async (source, dest) => {
      const data = bytes.get(source);
      if (!data) throw new Error(`ENOENT: copy source missing: ${source}`);
      bytes.set(dest, data);
      existing.add(dest);
    },
    writeFileBytes: async (dest, data) => {
      bytes.set(dest, data);
      existing.add(dest);
    },
    deleteFile: async (path) => {
      bytes.delete(path);
      existing.delete(path);
    },
    exists: async (path) => bytes.has(path),
    libraryRoots: () => ["/lib"],
    pathIo: () => fakePathIo(existing),
  };

  const folderPorts: V2FolderScanPorts = {
    libraryRoots: () => ["/lib"],
    pathIo: () => fakePathIo(existing),
    listDirectory: async (canonical) => {
      const found = tree.get(canonical);
      if (!found) throw Object.assign(new Error(`ENOENT: ${canonical}`), { code: "ENOENT" });
      return found.map((item) => ({ ...item }));
    },
    removeEmptyDirectory: async () => {},
  };

  const inserted: Array<{ path: string; filename: string }> = [];
  const mutationPorts: V2LibraryMutationPorts = {
    markRemovedByPaths: () => {},
    insertRecords: (records) => {
      for (const record of records) inserted.push({ path: record.path, filename: record.filename });
    },
  };

  const grants = new V2GrantStore();
  const destGrant = grants.issue(LIBRARY_GATHERER_V2_ID, "/lib");
  const sources = new V2SourceGrantStore();
  const sourceGrant = sources.issue(LIBRARY_GATHERER_V2_ID, "/media/inbox");

  const failAfter = overrides?.failReporterAfter ?? null;
  let reporterCalls = 0;

  const services: V2HostServices = {
    registry,
    isEnabled: () => true,
    capabilities: {},
    grantedPermissions: () => [...granted],
    ports: library,
    authorizeGrant: (grantId, extensionId) => {
      const authorized = grants.authorize(grantId, extensionId);
      return authorized.ok ? { ok: true } : { ok: false, message: authorized.message };
    },
    createOperations: (binding) => {
      const reporter: V2JobReporter | undefined = binding.reporter
        ? {
            reportProgress: (completed, total) => {
              reporterCalls += 1;
              if (failAfter !== null && reporterCalls > failAfter) {
                throw new V2JobCancelledError("cancelled for the test");
              }
              binding.reporter!.reportProgress(completed, total);
            },
            throwIfCancelled: () => binding.reporter!.throwIfCancelled(),
          }
        : undefined;
      return {
        ...createV2OperationServices({
          ...binding,
          grants,
          sources,
          library,
          files: filePorts,
          archive: { createZipArchive: async () => ({ bytesWritten: 0 }) },
          settings: { readRaw: () => undefined, writeRaw: () => {} },
          extensionState: { readAll: () => ({}), writeAll: () => {} },
          settingsDeclarations: definition.settings,
          ...(reporter ? { jobs: reporter } : {}),
        }),
        ...createV2ExtendedOperations({
          extensionId: binding.extensionId,
          effectivePermissions: binding.effectivePermissions,
          library,
          mutations: mutationPorts,
          folders: folderPorts,
          sources,
        }),
      };
    },
  };
  const host = new ExtensionV2Host(services);
  registerLibraryGathererV2Handlers(host);
  return {
    host,
    bytes,
    inserted,
    sourceGrantId: sourceGrant.grantId,
    destGrantId: destGrant.grantId,
    definition,
  };
}

function immediateValue<T>(result: unknown): T {
  expect(result).toMatchObject({ ok: true });
  const outcome = (result as { outcome: { kind: string; value: unknown } }).outcome;
  expect(outcome.kind).toBe("immediate");
  return outcome.value as T;
}

describe("library-gatherer-v2 preview-gather", () => {
  it("lists audio files under the source grant and plans output names", async () => {
    const w = world();
    const result = await w.host.execute({
      extensionId: LIBRARY_GATHERER_V2_ID,
      commandId: LIBRARY_GATHERER_V2_PREVIEW,
      input: { sourceGrantIds: [w.sourceGrantId], preserveFolderNames: true },
      selection: {},
    });
    const value = immediateValue<LibraryGathererV2PreviewResult>(result);
    expect(value.candidates).toBe(2);
    expect(value.outputNames.sort()).toEqual(["inbox - kick.wav", "inbox - snare.wav"]);
    expect(value.sourcePaths).not.toContain("/media/inbox/notes.txt");
    expect(value.truncated).toBe(false);
    const command = w.definition.commands.find((c) => c.id === LIBRARY_GATHERER_V2_PREVIEW)!;
    expect(validateV2Value(command.result!, value, "result")).toBeNull();
  });
});

describe("library-gatherer-v2 gather", () => {
  it("copies audio into the destination and indexes it", async () => {
    const w = world();
    const submitted = await w.host.submitJob({
      extensionId: LIBRARY_GATHERER_V2_ID,
      commandId: LIBRARY_GATHERER_V2_GATHER,
      input: { sourceGrantIds: [w.sourceGrantId], destGrantId: w.destGrantId, preserveFolderNames: false },
      selection: {},
    });
    if (!submitted.ok || submitted.outcome.kind !== "job") throw new Error("expected a job");
    const settled = await w.host.jobs.waitFor(submitted.outcome.jobId);
    expect(settled.state).toBe("succeeded");
    const value = settled.value as LibraryGathererV2GatherResult;
    expect(value.copied).toBe(2);
    expect(value.inserted).toBe(2);
    expect(w.bytes.has("/lib/kick.wav")).toBe(true);
    expect(w.bytes.has("/lib/snare.wav")).toBe(true);
    expect(w.inserted.map((r) => r.filename).sort()).toEqual(["kick.wav", "snare.wav"]);
  });

  it("skips a name that already exists in the destination when skip-duplicates is on", async () => {
    const w = world({ destSeed: ["/lib/kick.wav"] });
    const submitted = await w.host.submitJob({
      extensionId: LIBRARY_GATHERER_V2_ID,
      commandId: LIBRARY_GATHERER_V2_GATHER,
      input: {
        sourceGrantIds: [w.sourceGrantId],
        destGrantId: w.destGrantId,
        preserveFolderNames: false,
        skipDuplicates: true,
      },
      selection: {},
    });
    if (!submitted.ok || submitted.outcome.kind !== "job") throw new Error("expected a job");
    const settled = await w.host.jobs.waitFor(submitted.outcome.jobId);
    const value = settled.value as LibraryGathererV2GatherResult;
    expect(value.skipped).toBe(1);
    expect(value.skippedSources).toEqual(["/media/inbox/kick.wav"]);
    expect(value.copied).toBe(1);
    // The pre-existing file is never overwritten.
    expect(new TextDecoder().decode(w.bytes.get("/lib/kick.wav"))).toBe("existing");
  });

  it("fails a conflict with a reason when skip-duplicates is off, never overwriting", async () => {
    const w = world({ destSeed: ["/lib/kick.wav"] });
    const submitted = await w.host.submitJob({
      extensionId: LIBRARY_GATHERER_V2_ID,
      commandId: LIBRARY_GATHERER_V2_GATHER,
      input: {
        sourceGrantIds: [w.sourceGrantId],
        destGrantId: w.destGrantId,
        preserveFolderNames: false,
        skipDuplicates: false,
      },
      selection: {},
    });
    if (!submitted.ok || submitted.outcome.kind !== "job") throw new Error("expected a job");
    const settled = await w.host.jobs.waitFor(submitted.outcome.jobId);
    const value = settled.value as LibraryGathererV2GatherResult;
    expect(value.failedSources).toContain("/media/inbox/kick.wav");
    expect(value.failedReasons.some((r) => /already exists/i.test(r))).toBe(true);
    expect(new TextDecoder().decode(w.bytes.get("/lib/kick.wav"))).toBe("existing");
  });

  it("removes job-owned copies on cancellation and settles cancelled", async () => {
    const w = world({ failReporterAfter: 0 });
    const submitted = await w.host.submitJob({
      extensionId: LIBRARY_GATHERER_V2_ID,
      commandId: LIBRARY_GATHERER_V2_GATHER,
      input: { sourceGrantIds: [w.sourceGrantId], destGrantId: w.destGrantId, preserveFolderNames: false },
      selection: {},
    });
    if (!submitted.ok || submitted.outcome.kind !== "job") throw new Error("expected a job");
    const settled = await w.host.jobs.waitFor(submitted.outcome.jobId);
    expect(settled.state).toBe("cancelled");
    expect(w.bytes.has("/lib/kick.wav")).toBe(false);
    expect(w.bytes.has("/lib/snare.wav")).toBe(false);
  });

  it("requires a destination grant", async () => {
    const w = world();
    const result = await w.host.execute({
      extensionId: LIBRARY_GATHERER_V2_ID,
      commandId: LIBRARY_GATHERER_V2_GATHER,
      input: { sourceGrantIds: [w.sourceGrantId] },
      selection: {},
    });
    expect(result.ok).toBe(false);
  });

  it("denies gather without files:copy", async () => {
    const w = world({ granted: ["library:read", "library:write", "files:read", "settings:read"] });
    const result = await w.host.execute({
      extensionId: LIBRARY_GATHERER_V2_ID,
      commandId: LIBRARY_GATHERER_V2_GATHER,
      input: { sourceGrantIds: [w.sourceGrantId], destGrantId: w.destGrantId },
      selection: {},
    });
    expect(result.ok).toBe(false);
  });
});

describe("library-gatherer-v2 boundaries", () => {
  it("never imports v1 extension modules", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const sources = ["definition.ts", "policy.ts", "handlers.ts", "index.ts"].map((file) =>
      readFileSync(join(here, file), "utf8"),
    );
    for (const text of sources) {
      expect(text).not.toMatch(/@foleyard\/library-gatherer"/);
      expect(text).not.toMatch(/from\s+["'][^"']*extensions\//);
      expect(text).not.toMatch(/node:fs/);
      const specifiers = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
      for (const specifier of specifiers) {
        expect(specifier === "yard-core" || specifier?.startsWith("./")).toBe(true);
      }
    }
  });
});
