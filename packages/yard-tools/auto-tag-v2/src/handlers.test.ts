import { describe, expect, it } from "vitest";

import {
  createV2ExtendedOperations,
  createV2OperationServices,
  ExtensionV2Host,
  ExtensionV2Registry,
  validateV2Value,
  type ExtensionV2Definition,
  type IndexedAudioFile,
  type TagOrigin,
  type V2HostServices,
  type V2LibraryReadPorts,
  type V2TagPorts,
} from "yard-core";

import {
  AUTO_TAG_V2_ID,
  AUTO_TAG_V2_PREVIEW,
  AUTO_TAG_V2_TAG_FILES,
  createAutoTagV2Definition,
  registerAutoTagV2Handlers,
  type AutoTagV2PreviewResult,
  type AutoTagV2TagFilesResult,
} from "./index";

// Area: auto-tag v2 (#190). Handlers through the real host preflight with
// fixture library and tag ports: preview plans without writes, tag-files
// attaches every write marked deterministic, unknown IDs report as
// missing, permission denial stays confined, and job mode settles.

const FULL_PERMISSIONS = [
  "library:read",
  "files:read",
  "tags:read",
  "tags:write",
  "settings:read",
];

function record(id: string, filename: string): IndexedAudioFile {
  return {
    id,
    path: `/lib/${filename}`,
    filename,
    libraryRoot: "/lib",
    directory: null,
    format: "wav",
    duration: 2,
    sampleRate: 44100,
    bitDepth: 16,
    channels: 2,
    fileSize: 4,
    isFavorite: false,
    removedAt: null,
    lastScannedAt: "2026-09-06T00:00:00.000Z",
    mtimeMs: 1,
  };
}

type Attachment = { fileId: string; tagId: string; origin: TagOrigin | undefined };

type World = {
  host: ExtensionV2Host;
  attachments: Attachment[];
  created: string[];
  tagsByName: Map<string, string>;
  progress: { calls: number };
  definition: ExtensionV2Definition;
};

function world(overrides?: { granted?: string[] }): World {
  const definition = createAutoTagV2Definition();
  const registry = new ExtensionV2Registry();
  registry.register(definition);
  const granted = overrides?.granted ?? FULL_PERMISSIONS;
  const files = [
    record("f1", "thunder-close_take01.wav"),
    record("f2", "rain-gutter_drip_metal.wav"),
    record("f3", "paper-bag_crumple_fast.wav"),
  ];
  const byId = new Map(files.map((file) => [file.id, file]));
  const library: V2LibraryReadPorts = {
    getFileById: (id) => byId.get(id) ?? null,
    getFilesByIds: (ids) => ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
    listPage: () => ({ files, nextCursor: null }),
  };
  const tagsByName = new Map<string, string>();
  const attachments: Attachment[] = [];
  const created: string[] = [];
  let seq = 0;
  const tagPorts: V2TagPorts = {
    list: () => [...tagsByName.entries()].map(([name, id]) => ({ id, name })),
    tagsForFile: (fileId) =>
      attachments
        .filter((entry) => entry.fileId === fileId)
        .flatMap((entry) => {
          const name = [...tagsByName.entries()].find(([, id]) => id === entry.tagId)?.[0];
          return name ? [{ id: entry.tagId, name }] : [];
        }),
    create: (name) => {
      const id = `t${(seq += 1)}`;
      tagsByName.set(name, id);
      created.push(name);
      return id;
    },
    attach: (fileId, tagId, origin) => {
      attachments.push({ fileId, tagId, origin });
    },
    detach: () => {},
  };
  const progress = { calls: 0 };  const services: V2HostServices = {
    registry,
    isEnabled: () => true,
    capabilities: {},
    grantedPermissions: () => [...granted],
    ports: library,
    authorizeGrant: () => ({ ok: true }),
    createOperations: (binding) => ({
      ...createV2OperationServices({
        ...binding,
        grants: { authorize: () => ({ ok: false, message: "no grants" }) } as never,
        library,
        files: {
          readFileBytes: async () => new Uint8Array(),
          copyFile: async () => {},
          writeFileBytes: async () => {},
          deleteFile: async () => {},
          exists: async () => false,
          libraryRoots: () => ["/lib"],
          pathIo: () => ({
            realpath: async (p: string) => p,
            lstat: async () => ({ exists: true, isLink: false }),
          }),
        },
        archive: { createZipArchive: async () => ({ bytesWritten: 0 }) },
        settings: { readRaw: () => undefined, writeRaw: () => {} },
        extensionState: { readAll: () => ({}), writeAll: () => {} },
        jobs: binding.reporter
          ? {
              reportProgress: (completed: number, total: number) => {
                progress.calls += 1;
                binding.reporter!.reportProgress(completed, total);
              },
              throwIfCancelled: () => {
                binding.reporter!.throwIfCancelled();
              },
            }
          : undefined,
      }),
      ...createV2ExtendedOperations({
        extensionId: binding.extensionId,
        effectivePermissions: binding.effectivePermissions,
        library,
        tags: tagPorts,
      }),
    }),
  };
  const host = new ExtensionV2Host(services);
  registerAutoTagV2Handlers(host);
  return {
    host,
    attachments,
    created,
    tagsByName,
    progress,
    definition,
  };
}

function immediateValue<T>(result: unknown): T {
  expect(result).toMatchObject({ ok: true });
  const outcome = (result as { outcome: { kind: string; value: unknown } }).outcome;
  expect(outcome.kind).toBe("immediate");
  return outcome.value as T;
}

describe("auto-tag-v2 preview", () => {
  it("plans tags with no side effects", async () => {
    const w = world();
    const result = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_PREVIEW,
      input: { fileIds: ["f1", "f2", "f3"] },
      selection: { fileIds: ["f1", "f2", "f3"] },
    });
    const value = immediateValue<AutoTagV2PreviewResult>(result);
    expect(value.planned).toEqual([
      "thunder-close_take01.wav -> thunder, weather",
      "rain-gutter_drip_metal.wav -> rain, weather",
    ]);
    expect(value.untaggedFileIds).toEqual(["f3"]);
    expect(value.taggedCount).toBe(2);
    expect(value.missing).toEqual([]);
    expect(value.candidates).toContain("paper");
    // Preview writes nothing: no tags created, nothing attached.
    expect(w.created).toEqual([]);
    expect(w.attachments).toEqual([]);
    const command = w.definition.commands.find((entry) => entry.id === AUTO_TAG_V2_PREVIEW)!;
    expect(validateV2Value(command.result!, value, "result")).toBeNull();
  });

  it("reports unknown IDs instead of failing silently", async () => {
    const w = world();
    const result = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_PREVIEW,
      input: { fileIds: ["f1", "gone"] },
      selection: { fileIds: ["f1", "gone"] },
    });
    const value = immediateValue<AutoTagV2PreviewResult>(result);
    expect(value.missing).toEqual(["gone"]);
    expect(value.taggedCount).toBe(1);
  });

  it("rejects empty and over-bound batches with a reason", async () => {
    const w = world();
    const empty = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_PREVIEW,
      input: { fileIds: [] },
      selection: { fileIds: [] },
    });
    expect((empty as { ok: boolean }).ok).toBe(false);
    const ids = Array.from({ length: 501 }, (_, index) => `f${index}`);
    const over = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_PREVIEW,
      input: { fileIds: ids },
      selection: { fileIds: ids },
    });
    expect((over as { ok: boolean }).ok).toBe(false);
  });
});

describe("auto-tag-v2 tag-files", () => {
  it("attaches every write marked deterministic", async () => {
    const w = world();
    const result = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_TAG_FILES,
      input: { fileIds: ["f1", "f2", "f3"] },
      selection: { fileIds: ["f1", "f2", "f3"] },
    });
    const value = immediateValue<AutoTagV2TagFilesResult>(result);
    expect(value.tagged).toBe(2);
    expect(value.attached).toBe(4);
    expect(value.skipped).toEqual(["paper-bag_crumple_fast.wav"]);
    expect(value.missing).toEqual([]);
    expect(value.failedFiles).toEqual([]);
    // Shared tags are created once; every attachment is deterministic.
    expect(w.created.sort()).toEqual(["rain", "thunder", "weather"]);
    expect(w.attachments.every((entry) => entry.origin === "deterministic")).toBe(true);
    const command = w.definition.commands.find((entry) => entry.id === AUTO_TAG_V2_TAG_FILES)!;
    expect(validateV2Value(command.result!, value, "result")).toBeNull();
  });

  it("denies execution when tags:write is not approved", async () => {
    const w = world({ granted: ["library:read", "files:read", "tags:read", "settings:read"] });
    const result = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_TAG_FILES,
      input: { fileIds: ["f1"] },
      selection: { fileIds: ["f1"] },
    });
    expect((result as { ok: boolean }).ok).toBe(false);
    expect(w.attachments).toEqual([]);
  });

  it("settles the batch as a job with progress", async () => {
    const w = world();
    const submitted = await w.host.submitJob({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_TAG_FILES,
      input: { fileIds: ["f1", "f2"] },
      selection: { fileIds: ["f1", "f2"] },
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok || submitted.outcome.kind !== "job") {
      throw new Error("expected a job outcome");
    }
    const settled = await w.host.jobs.waitFor(submitted.outcome.jobId);
    expect(settled.state).toBe("succeeded");
    const value = settled.value as AutoTagV2TagFilesResult;
    expect(value.tagged).toBe(2);
    expect(value.attached).toBe(4);
    expect(w.progress.calls).toBeGreaterThan(0);
  });
});
