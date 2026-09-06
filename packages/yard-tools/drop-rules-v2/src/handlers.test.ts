import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  buildEffectiveV2Catalog,
  createV2OperationServices,
  ExtensionV2Host,
  ExtensionV2Registry,
  resolveV2PointContributions,
  validateV2Value,
  V2GrantStore,
  V2JobCancelledError,
  type ExtensionV2Definition,
  type IndexedAudioFile,
  type V2ArchiveEntry,
  type V2FileContentPorts,
  type V2HostServices,
  type V2JobReporter,
  type V2LibraryReadPorts,
  type V2PathIo,
} from "yard-core";

import {
  createDropRulesV2Definition,
  DROP_RULES_V2_APPLY,
  DROP_RULES_V2_ID,
  DROP_RULES_V2_OPEN_SETTINGS,
  DROP_RULES_V2_PREPARE_DRAG,
  DROP_RULES_V2_PREVIEW,
  registerDropRulesV2Handlers,
  type DropRulesV2ApplyResult,
  type DropRulesV2PrepareDragResult,
  type DropRulesV2PreviewResult,
} from "./index";

// Area: extension v2 D6 (#181). Drop Rules v2 handlers through the real
// host preflight with fixture file ports: preview plans names without
// side effects, apply copies through the destination grant with a
// review plan in direct mode and job-mode export, prepare-drag stages
// into the staging grant, permission denial stays confined, the
// drop-menu point resolves through the generic adapter, and no v1
// modules are imported.

const FULL_PERMISSIONS = [
  "library:read",
  "files:read",
  "files:copy",
  "files:write",
  "drop:read",
  "drop:modify",
  "settings:read",
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
  stagingGrantId: string;
  bytes: Map<string, Uint8Array>;
  files: IndexedAudioFile[];
  reporter: { calls: number; failAfter: number | null };
  definition: ExtensionV2Definition;
};

function world(overrides?: {
  granted?: string[];
  files?: IndexedAudioFile[];
  bytes?: Array<[string, string]>;
  failReporterAfter?: number | null;
}): World {
  const definition = createDropRulesV2Definition();
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
  const existing = [
    "/lib",
    ...files.map((file) => file.path),
    "/out",
    "/out/keep.txt",
    "/stage",
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
    listPage: () => ({ files, nextCursor: null }),
  };
  const settingsRows = new Map<string, unknown>();
  const reporter = { calls: 0, failAfter: overrides?.failReporterAfter ?? null };
  const failAfter = reporter.failAfter;
  const grants = new V2GrantStore();
  const grant = grants.issue(DROP_RULES_V2_ID, "/out");
  const staging = grants.issue(DROP_RULES_V2_ID, "/stage");
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
          createZipArchive: async (entries: V2ArchiveEntry[], dest: string) => {
            void entries;
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
        ...(jobReporter ? { jobs: jobReporter } : {}),
      });
    },
  };
  const host = new ExtensionV2Host(services);
  registerDropRulesV2Handlers(host);
  return {
    host,
    grants,
    grantId: grant.grantId,
    stagingGrantId: staging.grantId,
    bytes,
    files,
    reporter,
    definition,
  };
}

function immediateValue<T>(result: unknown): T {
  expect(result).toMatchObject({ ok: true });
  const outcome = (result as { outcome: { kind: string; value: unknown } }).outcome;
  expect(outcome.kind).toBe("immediate");
  return outcome.value as T;
}

function dropSelection(fileIds: string[]) {
  return { fileIds, dropFileCount: fileIds.length };
}

/** Job-mode apply: submit with a destination grant and settle. */
async function applyViaJob(
  w: World,
  commandInput: Record<string, unknown>,
  fileIds: string[],
): Promise<DropRulesV2ApplyResult> {
  const submitted = await w.host.submitJob({
    extensionId: DROP_RULES_V2_ID,
    commandId: DROP_RULES_V2_APPLY,
    input: commandInput,
    selection: dropSelection(fileIds),
  });
  expect(submitted.ok).toBe(true);
  if (!submitted.ok || submitted.outcome.kind !== "job") {
    throw new Error("expected a job outcome");
  }
  const settled = await w.host.jobs.waitFor(submitted.outcome.jobId);
  expect(settled.state).toBe("succeeded");
  return settled.value as DropRulesV2ApplyResult;
}

describe("drop-rules-v2 preview", () => {
  it("plans renamed names with no side effects", async () => {
    const w = world();
    const result = await w.host.execute({
      extensionId: DROP_RULES_V2_ID,
      commandId: DROP_RULES_V2_PREVIEW,
      input: { fileIds: ["a", "b"], destGrantId: w.grantId },
      selection: dropSelection(["a", "b"]),
    });
    const value = immediateValue<DropRulesV2PreviewResult>(result);
    expect(value.outputNames).toEqual(["001-a.mp3", "002-b.mp3"]);
    expect(value.fileIds).toEqual(["a", "b"]);
    expect(value.missing).toEqual([]);
    // Preview writes nothing: no copies, no used report.
    expect(w.bytes.has("/out/001-a.mp3")).toBe(false);
    expect(w.bytes.has("/out/foleyard-used.json")).toBe(false);
    const command = w.definition.commands.find((entry) => entry.id === DROP_RULES_V2_PREVIEW)!;
    expect(validateV2Value(command.result!, value, "result")).toBeNull();
  });

  it("reports unknown IDs instead of failing silently", async () => {
    const w = world();
    const result = await w.host.execute({
      extensionId: DROP_RULES_V2_ID,
      commandId: DROP_RULES_V2_PREVIEW,
      input: { fileIds: ["a", "gone"], destGrantId: w.grantId },
      selection: dropSelection(["a", "gone"]),
    });
    const value = immediateValue<DropRulesV2PreviewResult>(result);
    expect(value.missing).toEqual(["gone"]);
    expect(value.warnings).toHaveLength(1);
    expect(value.fileIds).toEqual(["a"]);
  });

  it("rejects drops over the bound with a reason", async () => {
    const w = world();
    const ids = Array.from({ length: 101 }, (_, index) => `f${index}`);
    const result = await w.host.execute({
      extensionId: DROP_RULES_V2_ID,
      commandId: DROP_RULES_V2_PREVIEW,
      input: { fileIds: ids, destGrantId: w.grantId },
      selection: { fileIds: [], dropFileCount: ids.length },
    });
    expect((result as { ok: boolean }).ok).toBe(false);
  });
});

describe("drop-rules-v2 apply", () => {
  it("previews a review plan in direct mode", async () => {
    const w = world();
    const result = await w.host.execute({
      extensionId: DROP_RULES_V2_ID,
      commandId: DROP_RULES_V2_APPLY,
      input: { fileIds: ["a", "b"], destGrantId: w.grantId },
      selection: dropSelection(["a", "b"]),
    });
    expect(result).toMatchObject({ ok: true });
    const outcome = (result as { outcome: { kind: string } }).outcome;
    expect(outcome.kind).toBe("review-required");
    expect(w.bytes.has("/out/001-a.mp3")).toBe(false);
  });

  it("copies through the destination grant with a used report in job mode", async () => {
    const w = world();
    const value = await applyViaJob(
      w,
      { fileIds: ["a", "b"], destGrantId: w.grantId },
      ["a", "b"],
    );
    expect(value.copied).toBe(2);
    expect(value.missing).toEqual([]);
    expect(value.failedFiles).toEqual([]);
    expect(value.usedReportWritten).toBe(true);
    expect(new TextDecoder().decode(w.bytes.get("/out/001-a.mp3"))).toBe("aaa");
    const report = JSON.parse(
      new TextDecoder().decode(w.bytes.get("/out/foleyard-used.json")!),
    ) as { files: Array<{ fileId: string }> };
    expect(report.files.map((file) => file.fileId).sort()).toEqual(["a", "b"]);
    expect(new TextDecoder().decode(w.bytes.get("/out/keep.txt"))).toBe("unrelated");
    const command = w.definition.commands.find((entry) => entry.id === DROP_RULES_V2_APPLY)!;
    expect(validateV2Value(command.result!, value, "result")).toBeNull();
  });

  it("fails colliding destination names without overwriting", async () => {
    const w = world({ bytes: [["/out/001-a.mp3", "ORIGINAL"]] });
    const value = await applyViaJob(
      w,
      { fileIds: ["a", "b"], destGrantId: w.grantId },
      ["a", "b"],
    );
    expect(value.copied).toBe(1);
    expect(value.failedFiles).toEqual(["a.mp3"]);
    expect(new TextDecoder().decode(w.bytes.get("/out/001-a.mp3"))).toBe("ORIGINAL");
  });

  it("requires a destination grant", async () => {
    const w = world();
    const submitted = await w.host.submitJob({
      extensionId: DROP_RULES_V2_ID,
      commandId: DROP_RULES_V2_APPLY,
      input: { fileIds: ["a"] },
      selection: dropSelection(["a"]),
    });
    if (submitted.ok && submitted.outcome.kind === "job") {
      const settled = await w.host.jobs.waitFor(submitted.outcome.jobId);
      expect(settled.state).toBe("failed");
    } else {
      expect(submitted.ok).toBe(false);
    }
  });
});

describe("drop-rules-v2 prepare-drag", () => {
  it("stages a renamed copy into the staging grant", async () => {
    const w = world();
    const result = await w.host.execute({
      extensionId: DROP_RULES_V2_ID,
      commandId: DROP_RULES_V2_PREPARE_DRAG,
      input: { fileId: "a", stagingGrantId: w.stagingGrantId },
      selection: dropSelection(["a"]),
    });
    const value = immediateValue<DropRulesV2PrepareDragResult>(result);
    expect(value.staged).toBe(true);
    expect(value.outputName).toBe("001-a.mp3");
    expect(value.dragPath).toBe("/stage/001-a.mp3");
    expect(new TextDecoder().decode(w.bytes.get("/stage/001-a.mp3"))).toBe("aaa");
    const command = w.definition.commands.find(
      (entry) => entry.id === DROP_RULES_V2_PREPARE_DRAG,
    )!;
    expect(validateV2Value(command.result!, value, "result")).toBeNull();
  });

  it("hands back the Library path unstaged when no copy or rename is needed", async () => {
    const w = world();
    const result = await w.host.execute({
      extensionId: DROP_RULES_V2_ID,
      commandId: DROP_RULES_V2_PREPARE_DRAG,
      input: { fileId: "a", stagingGrantId: w.stagingGrantId, copyOnDrop: false, renameOnDrop: false },
      selection: dropSelection(["a"]),
    });
    const value = immediateValue<DropRulesV2PrepareDragResult>(result);
    expect(value).toMatchObject({ staged: false, dragPath: "/lib/a.mp3", outputName: "a.mp3" });
  });

  it("opens settings with the five setting IDs", async () => {
    const w = world();
    const result = await w.host.execute({
      extensionId: DROP_RULES_V2_ID,
      commandId: DROP_RULES_V2_OPEN_SETTINGS,
      input: {},
      selection: {},
    });
    const value = immediateValue<{ settings: string[] }>(result);
    expect(value.settings).toEqual([
      "drop-rules-v2.copy-on-drop",
      "drop-rules-v2.rename-on-drop",
      "drop-rules-v2.rename-pattern",
      "drop-rules-v2.drag-out-folder",
      "drop-rules-v2.mark-used",
    ]);
  });
});

describe("drop-rules-v2 boundaries", () => {
  it("denies execution when drop:modify is not approved", async () => {
    const w = world({ granted: ["library:read", "files:read", "drop:read"] });
    const result = await w.host.execute({
      extensionId: DROP_RULES_V2_ID,
      commandId: DROP_RULES_V2_APPLY,
      input: { fileIds: ["a"], destGrantId: w.grantId },
      selection: dropSelection(["a"]),
    });
    expect((result as { ok: boolean }).ok).toBe(false);
    expect(w.bytes.has("/out/001-a.mp3")).toBe(false);
  });

  it("needs a validated drop context for drop-scope commands", async () => {
    const w = world();
    const result = await w.host.execute({
      extensionId: DROP_RULES_V2_ID,
      commandId: DROP_RULES_V2_PREVIEW,
      input: { fileIds: ["a"], destGrantId: w.grantId },
      selection: { fileIds: ["a"] },
    });
    expect((result as { ok: boolean }).ok).toBe(false);
  });

  it("resolves drop-menu offers through the generic adapter", () => {
    const registry = new ExtensionV2Registry();
    registry.register(createDropRulesV2Definition());
    const catalog = buildEffectiveV2Catalog(registry, () => [...FULL_PERMISSIONS]);
    const ui = {
      isEnabled: () => true,
      capabilities: {},
      grantedPermissions: () => [...FULL_PERMISSIONS],
    };
    const items = resolveV2PointContributions(
      catalog.entries,
      "drop-menu",
      { fileIds: [], dropFileCount: 2 },
      ui,
    );
    expect(items.map((item) => item.commandId).sort()).toEqual(
      [DROP_RULES_V2_PREVIEW, DROP_RULES_V2_APPLY, DROP_RULES_V2_PREPARE_DRAG].sort(),
    );
  });

  it("never imports v1 extension modules", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const sources = ["definition.ts", "policy.ts", "handlers.ts", "index.ts"].map((file) =>
      readFileSync(join(here, file), "utf8"),
    );
    for (const text of sources) {
      expect(text).not.toMatch(/@foleyard\/drop-rules"/);
      expect(text).not.toMatch(/from\s+["'][^"']*extensions\//);
      const specifiers = [...text.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
      for (const specifier of specifiers) {
        expect(specifier === "yard-core" || specifier?.startsWith("./")).toBe(true);
      }
    }
  });
});
