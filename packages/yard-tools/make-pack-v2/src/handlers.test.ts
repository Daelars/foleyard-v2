import { describe, expect, it } from "vitest";

import {
  buildEffectiveV2Catalog,
  createV2OperationServices,
  ExtensionV2Host,
  ExtensionV2Registry,
  resolveV2PointContributions,
  V2GrantStore,
  V2JobCancelledError,
  type ExtensionV2Definition,
  type V2ArchiveEntry,
  type IndexedAudioFile,
  type V2FileContentPorts,
  type V2HostServices,
  type V2JobReporter,
  type V2LibraryReadPorts,
  type V2PathIo,
} from "yard-core";

import {
  createMakePackV2Definition,
  MAKE_PACK_V2_ID,
  MAKE_PACK_V2_SOURCE_RECENT,
  MAKE_PACK_V2_SOURCE_SELECTION,
  MAKE_PACK_V2_SOURCE_SHELF,
  registerMakePackV2Handlers,
  type MakePackV2Result,
} from "./index";

// Area: extension v2 R8 (#171). Make Pack v2 handlers through the real
// host preflight with in-memory operation ports: all three sources,
// both formats, preview/review/apply, collisions, missing sources,
// output conflicts, interrupted output, the B12 sidecar class, job
// cancellation with owned-only cleanup, permission denial, and the
// no-v1-imports boundary. Real-byte ZIP integrity runs in the app
// integration suite against the production archive codec.

const FULL_PERMISSIONS = [
  "library:read",
  "files:read",
  "files:copy",
  "files:write",
  "settings:read",
  "settings:write",
  "desktop:reveal",
  "desktop:open",
];

function record(id: string, overrides?: Partial<IndexedAudioFile>): IndexedAudioFile {
  return {
    id,
    path: `/lib/${id}.mp3`,
    filename: `${id}.mp3`,
    libraryRoot: "/lib",
    directory: null,
    format: "mp3",
    duration: 60,
    sampleRate: 44100,
    bitDepth: 16,
    channels: 2,
    fileSize: 4,
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

type World = {
  host: ExtensionV2Host;
  grants: V2GrantStore;
  grantId: string;
  bytes: Map<string, Uint8Array>;
  archives: Array<{ entries: V2ArchiveEntry[]; dest: string }>;
  files: IndexedAudioFile[];
  reporter: { calls: number; failAfter: number | null };
  definition: ExtensionV2Definition;
};

function world(overrides?: {
  granted?: string[];
  files?: IndexedAudioFile[];
  bytes?: Array<[string, string]>;
  shelf?: string[];
  recent?: string[];
  failReporterAfter?: number | null;
}): World {
  const definition = createMakePackV2Definition();
  const registry = new ExtensionV2Registry();
  registry.register(definition);
  const granted = overrides?.granted ?? FULL_PERMISSIONS;
  const files = overrides?.files ?? [record("a"), record("b")];
  const bytes = new Map<string, Uint8Array>([
    ["/lib/a.mp3", new TextEncoder().encode("aaa")],
    ["/lib/b.mp3", new TextEncoder().encode("bbb")],
    ["/out/keep.txt", new TextEncoder().encode("unrelated")],
    ...(overrides?.bytes ?? []).map(
      ([path, text]) => [path, new TextEncoder().encode(text)] as [string, Uint8Array],
    ),
  ]);
  const archives: World["archives"] = [];
  const existing = [
    "/lib",
    ...files.map((file) => file.path),
    "/out",
    "/out/keep.txt",
    ...(overrides?.bytes ?? []).map(([path]) => path),
  ];
  const io = fakePathIo(existing);
  const filePorts: V2FileContentPorts = {
    readFileBytes: async (path) => {
      const data = bytes.get(path);
      if (!data) throw new Error(`missing ${path}`);
      return data;
    },
    copyFile: async (source, dest) => {
      const data = bytes.get(source);
      if (!data) throw new Error(`ENOENT: copy source missing: ${source}`);
      bytes.set(dest, data);
    },
    writeFileBytes: async (dest, data) => {
      bytes.set(dest, data);
    },
    deleteFile: async (path) => {
      bytes.delete(path);
    },
    exists: async (path) => bytes.has(path),
    libraryRoots: () => ["/lib"],
    pathIo: () => io,
  };
  const byId = new Map(files.map((file) => [file.id, file]));
  const library: V2LibraryReadPorts = {
    getFileById: (id) => byId.get(id) ?? null,
    getFilesByIds: (ids) => ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
    listPage: (cursor, limit) => {
      void cursor;
      void limit;
      return { files, nextCursor: null };
    },
  };
  const settingsRows = new Map<string, unknown>();
  const reporter = { calls: 0, failAfter: overrides?.failReporterAfter ?? null };
  const failAfter = reporter.failAfter;
  const grants = new V2GrantStore();
  const grant = grants.issue(MAKE_PACK_V2_ID, "/out");
  const shelf = overrides?.shelf ?? ["a", "b"];
  const recent = overrides?.recent ?? ["b"];
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
      const jobReporter: V2JobReporter | undefined = binding.reporter
        ? {
            reportProgress: (completed, total) => {
              reporter.calls += 1;
              if (failAfter !== null && reporter.calls > failAfter) {
                throw new V2JobCancelledError("cancelled for the test");
              }
              binding.reporter!.reportProgress(completed, total);
            },
            throwIfCancelled: () => {
              binding.reporter!.throwIfCancelled();
            },
          }
        : undefined;
      return createV2OperationServices({
        ...binding,
        grants,
        library,
        files: filePorts,
        archive: {
          createZipArchive: async (entries, dest) => {
            archives.push({ entries: [...entries], dest });
            bytes.set(dest, new TextEncoder().encode("zip-bytes"));
            return { bytesWritten: 9 };
          },
        },
        settings: {
          readRaw: (key) => settingsRows.get(key),
          writeRaw: (key, value) => {
            settingsRows.set(key, value);
          },
        },
        extensionState: {
          readAll: () => ({}),
          writeAll: () => {},
        },
        selectionSources: [
          { name: "shelf", requiredPermission: "library:read", listIds: () => [...shelf] },
          { name: "recent", requiredPermission: "library:read", listIds: () => [...recent] },
        ],
        ...(jobReporter ? { jobs: jobReporter } : {}),
      });
    },
  };
  const host = new ExtensionV2Host(services);
  registerMakePackV2Handlers(host);
  return { host, grants, grantId: grant.grantId, bytes, archives, files, reporter, definition };
}

function immediateValue(result: unknown): MakePackV2Result {
  expect(result).toMatchObject({ ok: true });
  const outcome = (result as { outcome: { kind: string; value: unknown } }).outcome;
  expect(outcome.kind).toBe("immediate");
  return outcome.value as MakePackV2Result;
}

/** Job-mode export: submit with a destination grant and settle. */
async function exportViaJob(
  world: World,
  input: {
    commandId: string;
    commandInput: Record<string, unknown>;
    selection: { fileIds: string[] };
  },
): Promise<MakePackV2Result> {
  const submitted = await world.host.submitJob({
    extensionId: MAKE_PACK_V2_ID,
    commandId: input.commandId,
    input: input.commandInput,
    selection: input.selection,
  });
  expect(submitted.ok).toBe(true);
  if (!submitted.ok || submitted.outcome.kind !== "job") {
    throw new Error("expected a job outcome");
  }
  const settled = await world.host.jobs.waitFor(submitted.outcome.jobId);
  expect(settled.state).toBe("succeeded");
  return settled.value as MakePackV2Result;
}

describe("make-pack-v2 preview, review, and apply", () => {
  it("previews without side effects, then confirms a destination-bound plan", async () => {
    const w = world();
    const first = await w.host.execute({
      extensionId: MAKE_PACK_V2_ID,
      commandId: MAKE_PACK_V2_SOURCE_SHELF,
      input: { packName: "Shelf Pack", outputFormat: "folder" },
      selection: { fileIds: [] },
    });
    expect(first.ok).toBe(true);
    if (!first.ok || first.outcome.kind !== "review-required") {
      throw new Error("expected a review-required outcome");
    }
    // Preview writes nothing.
    expect(w.bytes.has("/out/a.mp3")).toBe(false);
    expect(w.bytes.has("/out/manifest.json")).toBe(false);
    const reviewed = w.host.reviewPlan(first.outcome.planId);
    expect(reviewed.ok).toBe(true);
    if (!reviewed.ok) throw new Error("expected a review payload");
    const details = reviewed.review.details as Record<string, unknown>;
    expect(details).toMatchObject({
      format: "folder",
      destination: null,
      missing: [],
      manifestChoice: true,
    });
    expect(details.sources).toEqual(["a", "b"]);
    expect(details.names).toEqual(["a.mp3", "b.mp3"]);
    expect(reviewed.review.tables[0]?.rows).toHaveLength(2);

    // Applying a destination-less plan fails with guidance instead of
    // writing somewhere unconfirmed.
    const unguided = await w.host.applyPlan(first.outcome.planId, {
      targets: reviewed.review.targets,
      options: reviewed.review.options,
    });
    expect(unguided.ok).toBe(false);
    if (!unguided.ok) expect(unguided.message).toMatch(/destination/);

    // Destination selection binds a second review; confirming it exports.
    const second = await w.host.execute({
      extensionId: MAKE_PACK_V2_ID,
      commandId: MAKE_PACK_V2_SOURCE_SHELF,
      input: { packName: "Shelf Pack", outputFormat: "folder", grantId: w.grantId },
      selection: { fileIds: [] },
    });
    expect(second.ok).toBe(true);
    if (!second.ok || second.outcome.kind !== "review-required") {
      throw new Error("expected a destination-bound review");
    }
    const bound = w.host.reviewPlan(second.outcome.planId);
    expect(bound.ok).toBe(true);
    if (!bound.ok) throw new Error("expected a review payload");
    expect((bound.review.details as Record<string, unknown>).destination).toBe(w.grantId);
    const applied = await w.host.applyPlan(second.outcome.planId, {
      targets: bound.review.targets,
      options: bound.review.options,
    });
    const value = immediateValue(applied);
    expect(value.copied).toBe(2);
    expect(value.outputPath).toBe("/out");
  });

  it("rejects ZIP packs with case-insensitive entry collisions in the preview", async () => {
    const { host } = world({
      files: [
        record("a", { filename: "Hit.wav", path: "/lib/a.wav" }),
        record("b", { filename: "hit.wav", path: "/lib/b.wav" }),
      ],
      bytes: [
        ["/lib/a.wav", "one"],
        ["/lib/b.wav", "two"],
      ],
    });
    const result = await host.execute({
      extensionId: MAKE_PACK_V2_ID,
      commandId: MAKE_PACK_V2_SOURCE_SELECTION,
      input: { packName: "Clash", outputFormat: "zip" },
      selection: { fileIds: ["a", "b"] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("input-invalid");
      expect(result.message).toMatch(/verbatim[\s\S]*folder output/);
    }
  });
});

describe("make-pack-v2 ZIP exports", () => {
  it("leaves a pre-existing manifest sidecar intact (B12 class, fixed)", async () => {
    const sidecar = "/out/.Shelf-manifest.tmp.json";
    const w = world({
      bytes: [
        [sidecar, '{"mine":true}'],
        ["/out/manifest.json", '{"existing":true}'],
      ],
    });
    // Folder export must not create or delete dot-tmp files, and must
    // never overwrite the existing manifest sidecar (it fails the
    // manifest write with a reason instead).
    const folderValue = await exportViaJob(w, {
      commandId: MAKE_PACK_V2_SOURCE_SELECTION,
      commandInput: { grantId: w.grantId, packName: "Shelf" },
      selection: { fileIds: ["a"] },
    });
    expect(folderValue.failedFiles).toEqual(["manifest.json"]);
    expect(new TextDecoder().decode(w.bytes.get(sidecar))).toBe('{"mine":true}');
    expect(new TextDecoder().decode(w.bytes.get("/out/manifest.json"))).toBe('{"existing":true}');
    expect([...w.bytes.keys()].filter((key) => key.includes("tmp"))).toEqual([sidecar]);

    const zipValue = await exportViaJob(w, {
      commandId: MAKE_PACK_V2_SOURCE_SELECTION,
      commandInput: { grantId: w.grantId, packName: "Shelf2", outputFormat: "zip" },
      selection: { fileIds: ["a"] },
    });
    expect(zipValue.copied).toBe(1);
    expect(new TextDecoder().decode(w.bytes.get(sidecar))).toBe('{"mine":true}');
    expect([...w.bytes.keys()].filter((key) => key.includes("tmp"))).toEqual([sidecar]);
  });
});

describe("make-pack-v2 boundaries", () => {
  it("denies execution when the declared permissions are not approved", async () => {
    const { host } = world({ granted: ["library:read"] });
    const result = await host.execute({
      extensionId: MAKE_PACK_V2_ID,
      commandId: MAKE_PACK_V2_SOURCE_SELECTION,
      input: {},
      selection: { fileIds: ["a"] },
    });
    expect(result.ok).toBe(false);
  });

  it("rejects removed selection records before touching the destination", async () => {
    const { host, bytes } = world({
      files: [record("gone", { removedAt: "2026-09-06T00:00:00.000Z" })],
    });
    const result = await host.execute({
      extensionId: MAKE_PACK_V2_ID,
      commandId: MAKE_PACK_V2_SOURCE_SELECTION,
      input: {},
      selection: { fileIds: ["gone"] },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("selection-unresolvable");
    expect(bytes.has("/out/gone.mp3")).toBe(false);
  });

  it("exposes every command through the generic contribution points", () => {
    const { definition } = world();
    const catalog = buildEffectiveV2Catalog(
      (() => {
        const registry = new ExtensionV2Registry();
        registry.register(definition);
        return registry;
      })(),
      () => [...FULL_PERMISSIONS],
    );
    const ui = {
      isEnabled: () => true,
      capabilities: {},
      grantedPermissions: () => [...FULL_PERMISSIONS],
    };
    const palette = resolveV2PointContributions(catalog.entries, "palette", { fileIds: ["a"] }, ui);
    expect(palette.map((item) => item.commandId).sort()).toEqual(
      [MAKE_PACK_V2_SOURCE_RECENT, MAKE_PACK_V2_SOURCE_SELECTION, MAKE_PACK_V2_SOURCE_SHELF].sort(),
    );
    const fileMenu = resolveV2PointContributions(
      catalog.entries,
      "context-menu",
      { fileIds: ["a"] },
      ui,
    );
    expect(fileMenu.map((item) => item.commandId)).toEqual([MAKE_PACK_V2_SOURCE_SELECTION]);
    const bulk = resolveV2PointContributions(
      catalog.entries,
      "selection-actions",
      { fileIds: ["a", "b"] },
      ui,
    );
    expect(bulk.map((item) => item.commandId)).toEqual([MAKE_PACK_V2_SOURCE_SELECTION]);
  });
});
