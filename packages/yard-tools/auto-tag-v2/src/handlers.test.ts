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
  type V2AnalysisPorts,
  type V2EmbeddingPorts,
  type V2LibraryReadPorts,
  type V2TagPorts,
} from "yard-core";

import {
  AUTO_TAG_V2_CLAP_STATUS,
  AUTO_TAG_V2_COVERAGE_HISTORY,
  AUTO_TAG_V2_DISMISS_CANDIDATE,
  AUTO_TAG_V2_DOWNLOAD_MODEL,
  AUTO_TAG_V2_FIND_SIMILAR,
  AUTO_TAG_V2_ID,
  AUTO_TAG_V2_LIST_CANDIDATES,
  AUTO_TAG_V2_PREVIEW,
  AUTO_TAG_V2_PROMOTE_CANDIDATE,
  AUTO_TAG_V2_RECORD_COVERAGE,
  AUTO_TAG_V2_TAG_FILES,
  AUTO_TAG_V2_TAG_SEMANTIC,
  createAutoTagV2Definition,
  registerAutoTagV2Handlers,
  type AutoTagV2ClapStatusResult,
  type AutoTagV2CoverageHistoryResult,
  type AutoTagV2DismissCandidateResult,
  type AutoTagV2DownloadModelResult,
  type AutoTagV2FindSimilarResult,
  type AutoTagV2ListCandidatesResult,
  type AutoTagV2PreviewResult,
  type AutoTagV2PromoteCandidateResult,
  type AutoTagV2RecordCoverageResult,
  type AutoTagV2TagFilesResult,
  type AutoTagV2TagSemanticResult,
  type CoverageSnapshot,
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
  "embeddings:read",
  "embeddings:write",
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

type Attachment = {
  fileId: string;
  tagId: string;
  origin: TagOrigin | undefined;
  confidence?: number | null;
};

type World = {
  host: ExtensionV2Host;
  attachments: Attachment[];
  created: string[];
  tagsByName: Map<string, string>;
  vectors: Map<string, { dim: number; vec: Uint8Array }>;
  progress: { calls: number };
  definition: ExtensionV2Definition;
};

function world(overrides?: {
  granted?: string[];
  backendAvailable?: boolean;
  seedTags?: string[];
}): World {
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
    listPage: (cursor) => {
      const start = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
      const slice = files.slice(start, start + 2);
      return { files: slice, nextCursor: start + 2 < files.length ? String(start + 2) : null };
    },
  };
  const tagsByName = new Map<string, string>();
  const attachments: Attachment[] = [];
  const created: string[] = [];
  const stateStore = new Map<string, unknown>();
  const vectors = new Map<string, { dim: number; vec: Uint8Array }>();
  const modelState = {
    modelId: "Xenova/clap-htsat-unfused",
    state: "ready" as "ready" | "not-downloaded" | "downloading",
    downloadedBytes: 400,
    totalBytes: 400,
    backendAvailable: true,
  };
  let tagSeq = 0;
  for (const name of overrides?.seedTags ?? []) {
    tagSeq += 1;
    tagsByName.set(name, `t${tagSeq}`);
  }
  if (overrides?.backendAvailable === false) {
    modelState.backendAvailable = false;
  }
  // Fake inference: thunder-like audio loves thunder, rain-like loves rain,
  // and the third file loves nothing (both cosines negative).
  const audioVecs: Record<string, number[]> = {
    f1: [1, 0],
    f2: [0, 1],
    f3: [-1, -1],
  };
  const textVecs: Record<string, number[]> = {
    "This is a sound of thunder": [1, 0],
    "This is a sound of rain": [0, 1],
  };
  const vkey = (fileId: string, model: string) => `${model}:${fileId}`;
  const embeddingPorts: V2EmbeddingPorts = {
    upsert: (fileId, model, dim, vec) => {
      vectors.set(vkey(fileId, model), { dim, vec });
    },
    get: (fileId, model) => vectors.get(vkey(fileId, model)) ?? null,
    listIds: (model) =>
      [...vectors.keys()]
        .filter((entry) => entry.startsWith(`${model}:`))
        .map((entry) => entry.slice(model.length + 1)),
    removeFile: (fileId) => {
      for (const entry of [...vectors.keys()]) {
        if (entry.endsWith(`:${fileId}`)) vectors.delete(entry);
      }
    },
  };
  let seq = tagsByName.size;
  const tagPorts: V2TagPorts = {
    list: () => [...tagsByName.entries()].map(([name, id]) => ({ id, name })),    tagsForFile: (fileId) =>
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
    attach: (fileId, tagId, origin, confidence) => {
      attachments.push({ fileId, tagId, origin, confidence });
    },
    detach: () => {},
  };
  const analysisPorts: V2AnalysisPorts = {
    modelStatus: () => ({ ...modelState }),
    downloadModel: async () => ({ bytes: modelState.totalBytes }),
    embedAudio: async (fileId) => {
      const vec = audioVecs[fileId] ?? [0, 0];
      return { dim: vec.length, vec };
    },
    embedTexts: async (texts) => texts.map((text) => textVecs[text] ?? [0, 0]),
    backendAvailable: () => modelState.backendAvailable,
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
        extensionState: {
          readAll: () => Object.fromEntries(stateStore),
          writeAll: (_extensionId, state) => {
            stateStore.clear();
            for (const [key, value] of Object.entries(state)) stateStore.set(key, value);
          },
        },
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
        embeddings: embeddingPorts,
        analysis: analysisPorts,
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
    vectors,
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

describe("auto-tag-v2 candidates", () => {
  async function listCandidates(w: World) {
    const result = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_LIST_CANDIDATES,
      input: {},
      selection: { fileIds: [] },
    });
    return immediateValue<AutoTagV2ListCandidatesResult>(result);
  }

  it("lists uncovered words with examples and writes nothing", async () => {
    const w = world();
    const value = await listCandidates(w);
    expect(value.words).toContain("paper");
    expect(value.words).not.toContain("thunder");
    expect(value.lines.some((line) => line.startsWith("paper —"))).toBe(true);
    expect(value.truncated).toBe(false);
    expect(value.totalFiles).toBe(3);
    // The queue never creates tags: listing twice changes nothing.
    expect(w.created).toEqual([]);
    expect(w.attachments).toEqual([]);
    const command = w.definition.commands.find(
      (entry) => entry.id === AUTO_TAG_V2_LIST_CANDIDATES,
    )!;
    expect(validateV2Value(command.result!, value, "result")).toBeNull();
  });

  it("dismissed words stay out of later listings", async () => {
    const w = world();
    const dismissed = immediateValue<AutoTagV2DismissCandidateResult>(
      await w.host.execute({
        extensionId: AUTO_TAG_V2_ID,
        commandId: AUTO_TAG_V2_DISMISS_CANDIDATE,
        input: { word: "paper" },
        selection: { fileIds: [] },
      }),
    );
    expect(dismissed.word).toBe("paper");
    expect(dismissed.dismissedCount).toBe(1);
    expect((await listCandidates(w)).words).not.toContain("paper");
  });

  it("promoting creates the tag once and attaches manual", async () => {
    const w = world();
    await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_DISMISS_CANDIDATE,
      input: { word: "paper" },
      selection: { fileIds: [] },
    });
    const result = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_PROMOTE_CANDIDATE,
      input: { word: " paper " },
      selection: { fileIds: [] },
    });
    const value = immediateValue<AutoTagV2PromoteCandidateResult>(result);
    expect(value.tag).toBe("paper");
    expect(value.attached).toBe(1);
    expect(value.missing).toEqual([]);
    expect(w.created).toEqual(["paper"]);
    expect(w.attachments).toEqual([
      { fileId: "f3", tagId: w.tagsByName.get("paper"), origin: "manual", confidence: null },
    ]);
    // Promoting overrides the earlier dismiss.
    expect((await listCandidates(w)).words).not.toContain("paper");
    const command = w.definition.commands.find(
      (entry) => entry.id === AUTO_TAG_V2_PROMOTE_CANDIDATE,
    )!;
    expect(validateV2Value(command.result!, value, "result")).toBeNull();
  });

  it("promoting explicit IDs attaches only those and reports missing", async () => {
    const w = world();
    const value = immediateValue<AutoTagV2PromoteCandidateResult>(
      await w.host.execute({
        extensionId: AUTO_TAG_V2_ID,
        commandId: AUTO_TAG_V2_PROMOTE_CANDIDATE,
        input: { word: "paper", fileIds: ["f3", "gone"] },
        selection: { fileIds: ["f3"] },
      }),
    );
    expect(value.attached).toBe(1);
    expect(value.missing).toEqual(["gone"]);
    expect(w.attachments.map((entry) => entry.fileId)).toEqual(["f3"]);
  });

  it("rejects unusable words with a reason", async () => {
    const w = world();
    const result = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_PROMOTE_CANDIDATE,
      input: { word: "ab" },
      selection: { fileIds: [] },
    });
    expect((result as { ok: boolean }).ok).toBe(false);
    expect(w.created).toEqual([]);
  });
});

function stubVec(values: number[]): Uint8Array {
  const buffer = new ArrayBuffer(values.length * 4);
  const view = new DataView(buffer);
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return new Uint8Array(buffer);
}

describe("auto-tag-v2 find-similar", () => {
  function seeded(): World {
    const w = world();
    w.vectors.set("audio-stub-v1:f1", { dim: 2, vec: stubVec([1, 0]) });
    w.vectors.set("audio-stub-v1:f2", { dim: 2, vec: stubVec([0.9, 0.1]) });
    w.vectors.set("audio-stub-v1:f3", { dim: 2, vec: stubVec([0, 1]) });
    return w;
  }

  it("ranks seeded vectors closest first", async () => {
    const w = seeded();
    const result = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_FIND_SIMILAR,
      input: {},
      selection: { fileIds: ["f1"] },
    });
    const value = immediateValue<AutoTagV2FindSimilarResult>(result);
    expect(value.targetFileId).toBe("f1");
    expect(value.targetFilename).toBe("thunder-close_take01.wav");
    expect(value.similarFileIds).toEqual(["f2", "f3"]);
    expect(value.similarFilenames).toEqual([
      "rain-gutter_drip_metal.wav",
      "paper-bag_crumple_fast.wav",
    ]);
    expect(value.reason).toBeUndefined();
    const command = w.definition.commands.find(
      (entry) => entry.id === AUTO_TAG_V2_FIND_SIMILAR,
    )!;
    expect(validateV2Value(command.result!, value, "result")).toBeNull();
  });

  it("reports unavailable instead of failing with no vectors", async () => {
    const w = world();
    const result = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_FIND_SIMILAR,
      input: {},
      selection: { fileIds: ["f1"] },
    });
    const value = immediateValue<AutoTagV2FindSimilarResult>(result);
    expect(value.similarFileIds).toEqual([]);
    expect(value.reason).toMatch(/No embeddings/);
  });

  it("fails unknown targets with a reason", async () => {
    const w = seeded();
    const result = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_FIND_SIMILAR,
      input: { fileId: "gone" },
      selection: { fileIds: [] },
    });
    expect((result as { ok: boolean }).ok).toBe(false);
  });

  it("denies execution when embeddings:read is not approved", async () => {
    const w = world({
      granted: ["library:read", "files:read", "tags:read", "tags:write", "settings:read"],
    });
    const result = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_FIND_SIMILAR,
      input: { fileId: "f1" },
      selection: { fileIds: ["f1"] },
    });
    expect((result as { ok: boolean }).ok).toBe(false);
  });

  it("declares the row menu contribution", () => {
    const w = world();
    expect(
      w.definition.contributions?.filter((entry) => entry.type === "file-context-menu"),
    ).toEqual([
      {
        id: "auto-tag-v2.row-similar",
        type: "file-context-menu",
        commandId: AUTO_TAG_V2_FIND_SIMILAR,
        title: "Find similar",
      },
    ]);
  });

  it("declares sidebar contributions for status and candidates", () => {
    const w = world();
    expect(
      w.definition.contributions?.filter((entry) => entry.type === "sidebar"),
    ).toEqual([
      {
        id: "auto-tag-v2.side-status",
        type: "sidebar",
        commandId: AUTO_TAG_V2_CLAP_STATUS,
        title: "Model status",
      },
      {
        id: "auto-tag-v2.side-candidates",
        type: "sidebar",
        commandId: AUTO_TAG_V2_LIST_CANDIDATES,
        title: "Review candidates",
      },
    ]);
  });
});

describe("auto-tag-v2 clap", () => {
  it("reports model status without downloading", async () => {
    const w = world();
    const result = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_CLAP_STATUS,
      input: {},
      selection: { fileIds: [] },
    });
    const value = immediateValue<AutoTagV2ClapStatusResult>(result);
    expect(value.modelId).toBe("Xenova/clap-htsat-unfused");
    expect(value.state).toBe("ready");
    expect(value.backendAvailable).toBe(true);
    const command = w.definition.commands.find(
      (entry) => entry.id === AUTO_TAG_V2_CLAP_STATUS,
    )!;
    expect(validateV2Value(command.result!, value, "result")).toBeNull();
  });

  it("requires explicit confirmation naming the size before downloading", async () => {
    const w = world();
    const refused = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_DOWNLOAD_MODEL,
      input: { confirm: false },
      selection: { fileIds: [] },
    });
    expect((refused as { ok: boolean }).ok).toBe(false);

    const result = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_DOWNLOAD_MODEL,
      input: { confirm: true },
      selection: { fileIds: [] },
    });
    const value = immediateValue<AutoTagV2DownloadModelResult>(result);
    expect(value.modelId).toBe("Xenova/clap-htsat-unfused");
    expect(value.bytes).toBe(400);
  });

  it("attaches semantic tags with confidence over approved vocabulary", async () => {
    const w = world({ seedTags: ["thunder", "rain"] });
    const result = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_TAG_SEMANTIC,
      input: { fileIds: ["f1", "f2", "f3"] },
      selection: { fileIds: ["f1", "f2", "f3"] },
    });
    const value = immediateValue<AutoTagV2TagSemanticResult>(result);
    expect(value.tagged).toBe(2);
    expect(value.attached).toBe(2);
    expect(value.skipped).toEqual(["paper-bag_crumple_fast.wav"]);
    expect(value.missing).toEqual([]);
    // Nothing invented: no new tags created, every write semantic with confidence.
    expect(w.created).toEqual([]);
    expect(w.attachments).toEqual([
      { fileId: "f1", tagId: "t1", origin: "semantic_ai", confidence: 1 },
      { fileId: "f2", tagId: "t2", origin: "semantic_ai", confidence: 1 },
    ]);
    // Vectors land in the store for find-similar.
    expect(w.vectors.has("Xenova/clap-htsat-unfused:f1")).toBe(true);
    const command = w.definition.commands.find(
      (entry) => entry.id === AUTO_TAG_V2_TAG_SEMANTIC,
    )!;
    expect(validateV2Value(command.result!, value, "result")).toBeNull();
  });

  it("refuses without a backend and without approved tags", async () => {
    const noBackend = world({ backendAvailable: false, seedTags: ["thunder"] });
    const refused = await noBackend.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_TAG_SEMANTIC,
      input: { fileIds: ["f1"] },
      selection: { fileIds: ["f1"] },
    });
    expect((refused as { ok: boolean }).ok).toBe(false);
    expect(noBackend.attachments).toEqual([]);

    const noVocab = world();
    const empty = await noVocab.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_TAG_SEMANTIC,
      input: { fileIds: ["f1"] },
      selection: { fileIds: ["f1"] },
    });
    expect((empty as { ok: boolean }).ok).toBe(false);
    expect(noVocab.attachments).toEqual([]);
  });
});

describe("auto-tag-v2 coverage history", () => {
  async function record(
    w: World,
    tagged: number,
    total: number,
    tags: string[],
  ): Promise<AutoTagV2RecordCoverageResult> {
    const result = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_RECORD_COVERAGE,
      input: { tagged, total, tags },
      selection: { fileIds: [] },
    });
    return immediateValue<AutoTagV2RecordCoverageResult>(result);
  }

  async function history(w: World): Promise<CoverageSnapshot[]> {
    const result = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_COVERAGE_HISTORY,
      input: {},
      selection: { fileIds: [] },
    });
    const value = immediateValue<AutoTagV2CoverageHistoryResult>(result);
    return value.entries.map((entry) => JSON.parse(entry) as CoverageSnapshot);
  }

  it("records snapshots and reads them back oldest first", async () => {
    const w = world();
    expect(await history(w)).toEqual([]);
    const recorded = await record(w, 2, 3, ["thunder:2", "rain:1", "bogus", "zero:-1"]);
    expect(recorded.recorded).toBe(true);
    expect(recorded.entriesCount).toBe(1);
    expect(await history(w)).toEqual([
      {
        at: expect.any(String),
        tagged: 2,
        total: 3,
        tags: { thunder: 2, rain: 1 },
      },
    ]);
  });

  it("caps history at thirty snapshots", async () => {
    const w = world();
    for (let index = 0; index < 32; index += 1) {
      await record(w, index, 32, []);
    }
    const entries = await history(w);
    expect(entries).toHaveLength(30);
    expect(entries[0]!.tagged).toBe(2);
    expect(entries[29]!.tagged).toBe(31);
  });
});
