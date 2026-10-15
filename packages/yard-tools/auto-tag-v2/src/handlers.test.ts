import { describe, expect, it } from "vitest";

import {
  createV2ExtendedOperations,
  createV2OperationServices,
  ExtensionV2Host,
  ExtensionV2Registry,
  MAX_V2_STATE_BYTES,
  V2WorkflowStateStore,
  validateV2Value,
  type ExtensionV2Definition,
  type IndexedAudioFile,
  type TagOrigin,
  type V2ExtensionStatePorts,
  type V2HostServices,
  type V2AnalysisPorts,
  type V2EmbeddingPorts,
  type V2LibraryReadPorts,
  type V2TagPorts,
} from "yard-core";

import {
  AUTO_TAG_V2_CLAP_STATUS,
  AUTO_TAG_V2_COVERAGE_HISTORY,
  AUTO_TAG_V2_COVERAGE_SUMMARY,
  AUTO_TAG_V2_DISMISS_CANDIDATE,
  AUTO_TAG_V2_DOWNLOAD_MODEL,
  AUTO_TAG_V2_FIND_SIMILAR,
  AUTO_TAG_V2_ID,
  AUTO_TAG_V2_LATEST_ARRIVALS,
  AUTO_TAG_V2_LIST_CANDIDATES,
  AUTO_TAG_V2_LIST_ORIGINS,
  AUTO_TAG_V2_PREVIEW,
  AUTO_TAG_V2_PROMOTE_CANDIDATE,
  AUTO_TAG_V2_RECORD_COVERAGE,
  AUTO_TAG_V2_REMOVE_BY_ORIGIN,
  AUTO_TAG_V2_TAG_FILES,
  AUTO_TAG_V2_TAG_SEMANTIC,
  MAX_ARRIVAL_FILES,
  MAX_CLASSIFICATION_STATE_BYTES,
  MAX_RETAINED_CLASSIFICATIONS,
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
import { MAX_QUEUE_FILES, MAX_RETAINED_CANDIDATES } from "./rules";

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
  attachBatches: Attachment[][];
  aggregateCalls: { coverage: number; memberPage: number };
  created: string[];
  tagsByName: Map<string, string>;
  vectors: Map<string, { dim: number; vec: Uint8Array }>;
  progress: { calls: number };
  scanCalls: { pages: number };
  /** Every fileId audio embedding was requested for, in order (#286). */
  embedCalls: string[];
  /** The raw per-extension state envelope the production store persists. */
  stateStore: Map<string, unknown>;
  definition: ExtensionV2Definition;
};

/** Serialized bytes of the persisted state `data` record, as the store measures it. */
function stateDataBytes(w: World): number {
  return JSON.stringify(w.stateStore.get("data") ?? {}).length;
}

function world(overrides?: {
  granted?: string[];
  backendAvailable?: boolean;
  seedTags?: string[];
  embedAudio?: (fileId: string) => Promise<{ dim: number; vec: number[] }>;
  files?: IndexedAudioFile[];
  aggregatePorts?: boolean;
  /** A fileId whose next tag commit throws once, to interrupt a batch (#286). */
  attachManyThrowsFor?: string;
  /** What `attachMany` returns, so a test can drive inserted/upgraded/ignored. */
  attachManyOutcome?: (entries: ReadonlyArray<{ fileId: string; tagId: string }>) => {
    inserted: number;
    upgraded: number;
    ignored: number;
  };
}): World {
  const definition = createAutoTagV2Definition();
  const registry = new ExtensionV2Registry();
  registry.register(definition);
  const granted = overrides?.granted ?? FULL_PERMISSIONS;
  const files = overrides?.files ?? [
    record("f1", "thunder-close_take01.wav"),
    record("f2", "rain-gutter_drip_metal.wav"),
    record("f3", "paper-bag_crumple_fast.wav"),
  ];
  const byId = new Map(files.map((file) => [file.id, file]));
  const scanCalls = { pages: 0 };
  const library: V2LibraryReadPorts = {
    getFileById: (id) => byId.get(id) ?? null,
    getFilesByIds: (ids) => ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
    listPage: (cursor) => {
      scanCalls.pages += 1;
      const start = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
      const slice = files.slice(start, start + 2);
      return { files: slice, nextCursor: start + 2 < files.length ? String(start + 2) : null };
    },
  };
  const tagsByName = new Map<string, string>();
  const attachments: Attachment[] = [];
  const attachBatches: Attachment[][] = [];
  const aggregateCalls = { coverage: 0, memberPage: 0 };
  const created: string[] = [];
  const stateStore = new Map<string, unknown>();
  const vectors = new Map<string, { dim: number; vec: Uint8Array }>();
  const embedCalls: string[] = [];
  // One interrupt per world: the first commit for the marked file throws, so a
  // test can abort a batch mid-commit and then rerun it (#286).
  let interrupted = false;
  const maybeInterrupt = (fileId: string): void => {
    if (!interrupted && overrides?.attachManyThrowsFor === fileId) {
      interrupted = true;
      throw new Error("tag commit interrupted");
    }
  };
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
      maybeInterrupt(fileId);
      attachments.push({ fileId, tagId, origin, confidence });
    },
    attachMany: (entries) => {
      for (const entry of entries) maybeInterrupt(entry.fileId);
      attachBatches.push(
        entries.map((entry) => ({
          fileId: entry.fileId,
          tagId: entry.tagId,
          origin: entry.origin,
          confidence: entry.confidence,
        })),
      );
      for (const entry of entries) {
        attachments.push({
          fileId: entry.fileId,
          tagId: entry.tagId,
          origin: entry.origin,
          confidence: entry.confidence,
        });
      }
      return overrides?.attachManyOutcome?.(entries);
    },
    detach: () => {},
    attachmentsForFiles: (fileIds) => attachments
      .filter((entry) => fileIds.includes(entry.fileId))
      .flatMap((entry) => {
        const name = [...tagsByName.entries()].find(([, id]) => id === entry.tagId)?.[0];
        return name ? [{ ...entry, tagName: name, origin: entry.origin ?? "manual", confidence: entry.confidence ?? null }] : [];
      }),
    detachByOrigin: (origin) => {
      let removed = 0;
      for (let index = attachments.length - 1; index >= 0; index -= 1) {
        if (attachments[index]?.origin === origin) { attachments.splice(index, 1); removed += 1; }
      }
      return removed;
    },
    resolveAlias: () => null,
    renamePreservingAlias: () => {},
    merge: () => ({ moved: 0 }),
    ...(overrides?.aggregatePorts
      ? {
          coverage: () => {
            aggregateCalls.coverage += 1;
            return {
              total: files.length,
              tagged: new Set(attachments.map((entry) => entry.fileId)).size,
              tags: { thunder: 2 },
              origins: { manual: 1, deterministic: 1, semantic_ai: 0 },
              allTags: [...tagsByName.keys()],
            };
          },
          memberPage: (input: { tag?: string; origin?: string; skip: number; limit: number }) => {
            aggregateCalls.memberPage += 1;
            return {
              members: [
                {
                  fileId: "f1",
                  filename: "thunder-close_take01.wav",
                  tags: [
                    {
                      id: "t1",
                      name: input.tag ?? "thunder",
                      origin: (input.origin as "manual") ?? "manual",
                      confidence: null,
                    },
                  ],
                },
              ].slice(input.skip, input.skip + input.limit),
              matched: 2,
            };
          },
        }
      : {}),
  };
  const analysisPorts: V2AnalysisPorts = {
    modelStatus: () => ({ ...modelState }),
    downloadModel: async () => ({ bytes: modelState.totalBytes }),
    embedAudio: async (fileId) => {
      embedCalls.push(fileId);
      if (overrides?.embedAudio) return overrides.embedAudio(fileId);
      const vec = audioVecs[fileId] ?? [0, 0];
      return { dim: vec.length, vec };
    },
    embedTexts: async (texts) => texts.map((text) => textVecs[text] ?? [0, 0]),
    backendAvailable: () => modelState.backendAvailable,
  };
  const progress = { calls: 0 };
  // One shared store per extension, the production shape (#264/#265): the
  // process-wide runtime hands the same store to every invocation, so
  // concurrent jobs serialize their read-modify-write instead of racing
  // separate store instances.
  const extensionState: V2ExtensionStatePorts = {
    readAll: () => Object.fromEntries(stateStore),
    writeAll: (_extensionId, state) => {
      stateStore.clear();
      for (const [key, value] of Object.entries(state)) stateStore.set(key, value);
    },
  };
  const workflowState = new V2WorkflowStateStore(AUTO_TAG_V2_ID, extensionState);
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
        workflowState,
        grants: { authorize: () => ({ ok: false, message: "no grants" }) } as never,
        library,
        files: {
          readFileBytes: async () => new Uint8Array(),
          copyFile: async () => ({ device: "memory", fileId: "unused" }),
          writeFileBytes: async () => ({ device: "memory", fileId: "unused" }),
          deleteFileIfVersion: async () => ({ removed: false }),
          libraryRoots: () => ["/lib"],
          pathIo: () => ({
            realpath: async (p: string) => p,
            lstat: async () => ({ exists: true, isLink: false }),
          }),
        },
        archive: { createZipArchive: async () => ({ bytesWritten: 0, version: { device: "memory", fileId: "unused" } }) },
        settings: { readRaw: () => undefined, writeRaw: () => {} },
        extensionState,
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
    attachBatches,
    aggregateCalls,
    created,
    tagsByName,
    vectors,
    progress,
    scanCalls,
    embedCalls,
    stateStore,
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
    expect(value.inserted).toBe(4);
    expect(value.upgraded).toBe(0);
    expect(value.ignored).toBe(0);
    expect(value.skipped).toEqual(["paper-bag_crumple_fast.wav"]);
    expect(value.missing).toEqual([]);
    expect(value.failedFiles).toEqual([]);
    // Shared tags are created once; every attachment is deterministic.
    expect(w.created.sort()).toEqual(["rain", "thunder", "weather"]);
    expect(w.attachments.every((entry) => entry.origin === "deterministic")).toBe(true);
    // #258: the whole job's rows land in one batched transaction.
    expect(w.attachBatches).toHaveLength(1);
    expect(w.attachBatches[0]).toHaveLength(4);
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
  it("records the last run and surfaces it with latest arrivals", async () => {
    const w = world();
    const tagged = immediateValue<AutoTagV2TagFilesResult>(await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_TAG_FILES,
      input: { fileIds: ["f1", "f2", "f3"] },
      selection: { fileIds: [] },
    }));
    expect(tagged.tagged).toBe(2);
    const arrivals = immediateValue<{ hasData: boolean; batch: string; lastRun: string }>(
      await w.host.execute({
        extensionId: AUTO_TAG_V2_ID,
        commandId: AUTO_TAG_V2_LATEST_ARRIVALS,
        input: {},
        selection: { fileIds: [] },
      }),
    );
    expect(arrivals.hasData).toBe(false);
    expect(JSON.parse(arrivals.lastRun)).toMatchObject({
      command: "tag-files",
      tagged: 2,
      attached: 4,
      skipped: 1,
      missing: 0,
      failed: 0,
    });
    const command = w.definition.commands.find(
      (entry) => entry.id === AUTO_TAG_V2_LATEST_ARRIVALS,
    )!;
    expect(validateV2Value(command.result!, arrivals, "result")).toBeNull();
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
    expect(value.lines.some((line) => line.startsWith("paper -"))).toBe(true);
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

  it("can persist a promoted filename token as a future deterministic rule", async () => {
    const w = world();
    await listCandidates(w);
    immediateValue<AutoTagV2PromoteCandidateResult>(await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_PROMOTE_CANDIDATE,
      input: { word: "paper", fileIds: ["f3"], useForFutureFilenames: true },
      selection: { fileIds: [] },
    }));
    await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_TAG_FILES,
      input: { fileIds: ["f3"] },
      selection: { fileIds: ["f3"] },
    });
    expect(w.attachments.some((entry) => entry.fileId === "f3" && entry.origin === "deterministic")).toBe(true);
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
    w.vectors.set("Xenova/clap-htsat-unfused:f1", { dim: 2, vec: stubVec([1, 0]) });
    w.vectors.set("Xenova/clap-htsat-unfused:f2", { dim: 2, vec: stubVec([0.9, 0.1]) });
    w.vectors.set("Xenova/clap-htsat-unfused:f3", { dim: 2, vec: stubVec([0, 1]) });
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
    expect(value.reason).toBe("Similarity unavailable until audio analysis completes.");
    expect(value.unavailable).toBe(true);
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

  it("declares the row menu and sidebar contributions", () => {
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
  it("cancels after analysis without committing a partial semantic batch", async () => {
    let calls = 0;
    let firstAnalyzed!: () => void;
    let releaseSecond!: () => void;
    const first = new Promise<void>((resolve) => { firstAnalyzed = resolve; });
    const second = new Promise<void>((resolve) => { releaseSecond = resolve; });
    const w = world({
      seedTags: ["thunder", "rain"],
      embedAudio: async (fileId) => {
        calls += 1;
        if (calls === 1) firstAnalyzed();
        if (calls === 2) await second;
        return { dim: 2, vec: fileId === "f1" ? [1, 0] : [0, 1] };
      },
    });
    const submitted = await w.host.submitJob({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_TAG_SEMANTIC,
      input: { fileIds: ["f1", "f2", "f3"] },
      selection: { fileIds: ["f1", "f2", "f3"] },
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok || submitted.outcome.kind !== "job") throw new Error("expected job");
    await first;
    w.host.cancelJob(submitted.outcome.jobId);
    releaseSecond();
    const settled = await w.host.jobs.waitFor(submitted.outcome.jobId);
    expect(settled.state).toBe("cancelled");
    expect(calls).toBeGreaterThan(0);
    expect(w.attachments).toEqual([]);
    expect(w.vectors.size).toBe(0);
  });
});

describe("auto-tag-v2 coverage history", () => {
  async function recordSnapshot(
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
    const recorded = await recordSnapshot(w, 2, 3, ["thunder:2", "rain:1", "bogus", "zero:-1"]);
    expect(recorded.recorded).toBe(true);
    expect(recorded.entriesCount).toBe(1);
    expect(await history(w)).toEqual([
      {
        at: expect.any(String),
        tagged: 0,
        total: 3,
        tags: {},
        invocationId: expect.any(String),
      },
    ]);
  });

  it("caps history at thirty snapshots", async () => {
    const w = world();
    for (let index = 0; index < 32; index += 1) {
      await recordSnapshot(w, index, 32, []);
    }
    const entries = await history(w);
    expect(entries).toHaveLength(30);
    expect(entries[0]!.tagged).toBe(0);
    expect(entries[29]!.tagged).toBe(0);
  });

  it("aggregates libraries larger than two thousand files", async () => {
    const files = Array.from({ length: 2_105 }, (_, index) => record(`large-${index}`, `sound-${index}.wav`));
    const w = world({ files });
    const value = immediateValue<{ summary: string }>(await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_COVERAGE_SUMMARY,
      input: {}, selection: { fileIds: [] },
    }));
    expect(JSON.parse(value.summary)).toMatchObject({ total: 2_105, tagged: 0 });
  });

  it("lists every tag name so the board can tell real tags from suggestions", async () => {
    const empty = world();
    const noTags = immediateValue<{ summary: string }>(await empty.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_COVERAGE_SUMMARY,
      input: {}, selection: { fileIds: [] },
    }));
    expect(JSON.parse(noTags.summary)).toMatchObject({ allTags: [] });
    const seeded = world({ seedTags: ["thunder", "rain"] });
    const someTags = immediateValue<{ summary: string }>(await seeded.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_COVERAGE_SUMMARY,
      input: {}, selection: { fileIds: [] },
    }));
    expect(JSON.parse(someTags.summary)).toMatchObject({ allTags: ["thunder", "rain"] });
  });

  it("counts mixed origins per file and never rolls back manual attachments", async () => {
    const w = world({ seedTags: ["thunder", "rain"] });
    w.attachments.push(
      { fileId: "f1", tagId: "t1", origin: "manual" },
      { fileId: "f1", tagId: "t2", origin: "deterministic" },
      { fileId: "f2", tagId: "t2", origin: "semantic_ai", confidence: 0.81 },
    );
    const origins = immediateValue<{ summary: string }>(await w.host.execute({
      extensionId: AUTO_TAG_V2_ID, commandId: AUTO_TAG_V2_LIST_ORIGINS,
      input: { origin: "all" }, selection: { fileIds: [] },
    }));
    expect(JSON.parse(origins.summary).origins).toEqual({ manual: 1, deterministic: 1, semantic_ai: 1 });
    const removed = immediateValue<{ removed: number }>(await w.host.execute({
      extensionId: AUTO_TAG_V2_ID, commandId: AUTO_TAG_V2_REMOVE_BY_ORIGIN,
      input: { origin: "deterministic", confirm: true }, selection: { fileIds: [] },
    }));
    expect(removed.removed).toBe(1);
    expect(w.attachments).toContainEqual(expect.objectContaining({ fileId: "f1", origin: "manual" }));
  });
});

describe("auto-tag-v2 one-pass scans (#229)", () => {
  const originCommand = { extensionId: AUTO_TAG_V2_ID, commandId: AUTO_TAG_V2_LIST_ORIGINS, selection: { fileIds: [] } };
  const coverageCommand = { extensionId: AUTO_TAG_V2_ID, commandId: AUTO_TAG_V2_COVERAGE_SUMMARY, selection: { fileIds: [] } };
  const candidatesCommand = { extensionId: AUTO_TAG_V2_ID, commandId: AUTO_TAG_V2_LIST_CANDIDATES, selection: { fileIds: [] } };

  it("list-origins walks the library once while paging entries", async () => {
    const w = world({ seedTags: ["thunder", "rain"] });
    w.attachments.push(
      { fileId: "f1", tagId: "t1", origin: "manual" },
      { fileId: "f2", tagId: "t2", origin: "deterministic" },
    );
    w.scanCalls.pages = 0;

    const value = immediateValue<{ summary: string; entries: string[]; nextCursor: string }>(
      await w.host.execute({ ...originCommand, input: { origin: "all", limit: 1 } }),
    );

    const summary = JSON.parse(value.summary) as { matching: number; origins: Record<string, number> };
    expect(summary.matching).toBe(3);
    expect(summary.origins).toEqual({ manual: 1, deterministic: 1, semantic_ai: 0 });
    expect(value.entries).toHaveLength(1);
    expect(value.nextCursor).toBe("1");
    expect(w.scanCalls.pages).toBe(2);
  });

  it("coverage-summary with a selected tag walks the library once", async () => {
    const w = world({ seedTags: ["thunder", "rain"] });
    w.attachments.push(
      { fileId: "f1", tagId: "t1", origin: "manual" },
      { fileId: "f2", tagId: "t2", origin: "deterministic" },
    );
    w.scanCalls.pages = 0;

    const value = immediateValue<{ summary: string }>(
      await w.host.execute({ ...coverageCommand, input: { tag: "thunder", limit: 1 } }),
    );

    const summary = JSON.parse(value.summary) as { total: number; tagged: number; members: string[]; nextCursor: string };
    expect(summary.total).toBe(3);
    expect(summary.tagged).toBe(2);
    expect(summary.members).toHaveLength(1);
    expect(summary.nextCursor).toBe("");
    expect(w.scanCalls.pages).toBe(2);
  });

  it("caps the candidate walk at MAX_QUEUE_FILES and shares one run", async () => {
    const files = Array.from({ length: 2_500 }, (_, index) => record(`large-${index}`, `sound-${index}.wav`));
    const w = world({ files });
    w.scanCalls.pages = 0;

    await Promise.all([
      w.host.execute({ ...candidatesCommand, input: {} }),
      w.host.execute({ ...candidatesCommand, input: {} }),
    ]);

    expect(w.scanCalls.pages).toBe(MAX_QUEUE_FILES / 2);
  });

  it("does not re-walk when the first walk found no candidates", async () => {
    const files = Array.from({ length: 6 }, (_, index) => record(`n-${index}`, `${index + 1}.wav`));
    const w = world({ files });
    w.scanCalls.pages = 0;

    await w.host.execute({ ...candidatesCommand, input: {} });
    expect(w.scanCalls.pages).toBe(3);
    await w.host.execute({ ...candidatesCommand, input: {} });
    expect(w.scanCalls.pages).toBe(3);
  });
});

describe("auto-tag-v2 SQL aggregates (#257)", () => {
  const coverageCommand = {
    extensionId: AUTO_TAG_V2_ID,
    commandId: AUTO_TAG_V2_COVERAGE_SUMMARY,
    selection: { fileIds: [] },
  };
  const originsCommand = {
    extensionId: AUTO_TAG_V2_ID,
    commandId: AUTO_TAG_V2_LIST_ORIGINS,
    selection: { fileIds: [] },
  };

  it("answers list-origins from the coverage ports without walking the library", async () => {
    const w = world({ aggregatePorts: true });
    w.scanCalls.pages = 0;

    const value = immediateValue<{ summary: string; entries: string[] }>(
      await w.host.execute({ ...originsCommand, input: { origin: "all", limit: 1 } }),
    );

    expect(w.scanCalls.pages).toBe(0);
    expect(w.aggregateCalls.coverage).toBe(1);
    expect(w.aggregateCalls.memberPage).toBe(1);
    const summary = JSON.parse(value.summary) as { total: number; matching: number };
    expect(summary.total).toBe(3);
    expect(summary.matching).toBe(2);
    expect(value.entries).toHaveLength(1);
  });

  it("answers the board summary from the coverage aggregate alone", async () => {
    const w = world({ aggregatePorts: true });
    w.scanCalls.pages = 0;

    const value = immediateValue<{ summary: string }>(
      await w.host.execute({ ...coverageCommand, input: {} }),
    );

    expect(w.scanCalls.pages).toBe(0);
    expect(w.aggregateCalls.coverage).toBe(1);
    expect(w.aggregateCalls.memberPage).toBe(0);
    const summary = JSON.parse(value.summary) as { total: number; members: string[] };
    expect(summary.total).toBe(3);
    expect(summary.members).toEqual([]);
  });
});

describe("auto-tag-v2 candidate scaling (#288)", () => {
  // A Library far larger than the retained queue: every file contributes two
  // distinct uncovered words, so the mined set is thousands of records, each
  // with a long label and example id.
  function largeLibrary(count: number): IndexedAudioFile[] {
    return Array.from({ length: count }, (_, index) =>
      record(
        `file-large-${index}-0123456789abcdef`,
        `token${index}abcdefghijklmnopqrstuvwxyz-session${index}take.wav`,
      ),
    );
  }

  it("keeps a large candidate set within the state budget and reports truncation", async () => {
    const w = world({ files: largeLibrary(2_000) });

    const result = await w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_LIST_CANDIDATES,
      input: { limit: 10 },
      selection: { fileIds: [] },
    });

    // The production workflow store must accept the write instead of
    // failing closed with input-invalid.
    expect((result as { ok: boolean }).ok).toBe(true);
    const value = immediateValue<AutoTagV2ListCandidatesResult>(result);

    // Retention is explicit and visible: the queue is capped, says so, and
    // never exceeds the advertised bound.
    expect(value.retained).toBe(MAX_RETAINED_CANDIDATES);
    expect(value.total).toBeGreaterThan(0);
    expect(value.total).toBeLessThanOrEqual(MAX_RETAINED_CANDIDATES);
    expect(value.words).toHaveLength(10);
    expect(value.truncated).toBe(true);

    // The whole persisted envelope stays inside the per-extension budget the
    // production store enforces.
    expect(stateDataBytes(w)).toBeLessThanOrEqual(MAX_V2_STATE_BYTES);

    // Listing pages the full retained queue with a stable cursor and never
    // re-mines: the walk is bounded to one pass.
    const pages = w.scanCalls.pages;
    const next = immediateValue<AutoTagV2ListCandidatesResult>(
      await w.host.execute({
        extensionId: AUTO_TAG_V2_ID,
        commandId: AUTO_TAG_V2_LIST_CANDIDATES,
        input: { cursor: value.nextCursor, limit: 10 },
        selection: { fileIds: [] },
      }),
    );
    expect(value.nextCursor).toBe("10");
    expect(next.words).toHaveLength(10);
    expect(next.total).toBe(value.total);
    expect(next.words).not.toEqual(value.words);
    expect(w.scanCalls.pages).toBe(pages);
  });

  it("records coverage once per completed scan, not once per job", async () => {
    const w = world();
    const input = { fileIds: ["f1", "f2"], scanStartedAt: "2026-10-15T00:00:00.000Z" };
    const command = {
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_TAG_FILES,
      input,
      selection: { fileIds: [] },
    };
    expect((await w.host.execute(command)).ok).toBe(true);
    expect((await w.host.execute(command)).ok).toBe(true);

    const history = immediateValue<AutoTagV2CoverageHistoryResult>(
      await w.host.execute({
        extensionId: AUTO_TAG_V2_ID,
        commandId: AUTO_TAG_V2_COVERAGE_HISTORY,
        input: {},
        selection: { fileIds: [] },
      }),
    );
    const snapshots = history.entries.map((entry) => JSON.parse(entry) as CoverageSnapshot);
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]!.scanId).toBe("2026-10-15T00:00:00.000Z");
    expect(stateDataBytes(w)).toBeLessThanOrEqual(MAX_V2_STATE_BYTES);
  });

  it("folds concurrent job suggestions into one candidate queue", async () => {
    const w = world({
      files: [record("f1", "paper-bag.wav"), record("f2", "coffee-cup.wav")],
    });
    await Promise.all([
      w.host.execute({
        extensionId: AUTO_TAG_V2_ID,
        commandId: AUTO_TAG_V2_TAG_FILES,
        input: { fileIds: ["f1"] },
        selection: { fileIds: [] },
      }),
      w.host.execute({
        extensionId: AUTO_TAG_V2_ID,
        commandId: AUTO_TAG_V2_TAG_FILES,
        input: { fileIds: ["f2"] },
        selection: { fileIds: [] },
      }),
    ]);

    const value = immediateValue<AutoTagV2ListCandidatesResult>(
      await w.host.execute({
        extensionId: AUTO_TAG_V2_ID,
        commandId: AUTO_TAG_V2_LIST_CANDIDATES,
        input: { limit: 100 },
        selection: { fileIds: [] },
      }),
    );
    // Neither job's suggestions were lost to the other's stale snapshot.
    expect(value.words).toEqual(expect.arrayContaining(["paper", "bag", "coffee", "cup"]));
  });

  it("bounds the retained arrival batch and reports its total", async () => {
    const files = Array.from({ length: 120 }, (_, index) =>
      record(`a${index}`, `thunder-${String(index).padStart(3, "0")}.wav`),
    );
    const w = world({ files });
    const submitted = await w.host.submitJob({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_TAG_FILES,
      input: {
        fileIds: files.map((file) => file.id),
        batchId: "scan:test",
        scanStartedAt: "2026-10-15T00:00:00.000Z",
      },
      selection: { fileIds: [] },
    });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok || submitted.outcome.kind !== "job") throw new Error("expected a job");
    const settled = await w.host.jobs.waitFor(submitted.outcome.jobId);
    expect(settled.state).toBe("succeeded");

    const arrivals = immediateValue<{ hasData: boolean; batch: string }>(
      await w.host.execute({
        extensionId: AUTO_TAG_V2_ID,
        commandId: AUTO_TAG_V2_LATEST_ARRIVALS,
        input: {},
        selection: { fileIds: [] },
      }),
    );
    const batch = JSON.parse(arrivals.batch) as {
      files: unknown[];
      totalFiles: number;
      truncated: boolean;
    };
    expect(batch.totalFiles).toBe(120);
    expect(batch.truncated).toBe(true);
    expect(batch.files.length).toBeLessThanOrEqual(MAX_ARRIVAL_FILES);
    expect(stateDataBytes(w)).toBeLessThanOrEqual(MAX_V2_STATE_BYTES);
  });
});

// Area: auto-tag semantic classification commits (#286). A classification
// commit writes a vector, its semantic attachments, and a completion record
// that must agree. An interruption mid-commit leaves the file explicitly
// incomplete (never falsely complete, never falsely untouched), and a rerun
// resumes the incomplete files without redoing the completed ones.
describe("auto-tag-v2 semantic classification commits (#286)", () => {
  const VKEY = "Xenova/clap-htsat-unfused";

  type ClassificationView = {
    records: Array<{ fileId: string; tagIds: string[] }>;
    dropped: number;
  };

  function classificationState(w: World): ClassificationView {
    const data =
      (w.stateStore.get("data") as Record<string, unknown> | undefined) ?? {};
    const raw = data["semantic-classifications"];
    if (typeof raw !== "object" || raw === null) return { records: [], dropped: 0 };
    const value = raw as { records?: unknown; dropped?: unknown };
    return {
      records: Array.isArray(value.records)
        ? (value.records as Array<{ fileId: string; tagIds: string[] }>)
        : [],
      dropped: typeof value.dropped === "number" ? value.dropped : 0,
    };
  }

  function classify(w: World, fileIds: string[]) {
    return w.host.execute({
      extensionId: AUTO_TAG_V2_ID,
      commandId: AUTO_TAG_V2_TAG_SEMANTIC,
      input: { fileIds },
      selection: { fileIds },
    });
  }

  it("keeps vector, tags, and completion consistent when a commit is interrupted", async () => {
    const w = world({ seedTags: ["thunder", "rain"], attachManyThrowsFor: "f2" });

    const first = await classify(w, ["f1", "f2", "f3"]);
    // The commit was interrupted, so the command fails and nothing beyond the
    // already-committed prefix claims to be complete.
    expect((first as { ok: boolean }).ok).toBe(false);

    // f1 is fully committed and self-consistent: vector, semantic tag with its
    // confidence, and a completion record all agree.
    expect(w.vectors.has(`${VKEY}:f1`)).toBe(true);
    expect(w.attachments).toEqual([
      { fileId: "f1", tagId: "t1", origin: "semantic_ai", confidence: 1 },
    ]);
    expect(classificationState(w).records.map((entry) => entry.fileId)).toEqual(["f1"]);
    expect(classificationState(w).records[0]!.tagIds).toEqual(["t1"]);

    // f2 half-committed: its vector landed but its tag did not and it is not
    // marked complete, so it looks neither fully tagged nor fully untagged.
    expect(w.vectors.has(`${VKEY}:f2`)).toBe(true);
    expect(w.attachments.some((entry) => entry.fileId === "f2")).toBe(false);
    expect(classificationState(w).records.map((entry) => entry.fileId)).not.toContain("f2");
    // f3 was never reached.
    expect(w.vectors.has(`${VKEY}:f3`)).toBe(false);

    // Rerun: the completed f1 is skipped, and only the incomplete f2 and the
    // untouched f3 are re-embedded, so no valid work is lost or repeated.
    w.embedCalls.length = 0;
    const second = immediateValue<AutoTagV2TagSemanticResult>(
      await classify(w, ["f1", "f2", "f3"]),
    );
    expect(w.embedCalls).toEqual(["f2", "f3"]);
    expect((second as unknown as { alreadyClassified: number }).alreadyClassified).toBe(1);
    expect(classificationState(w).records.map((entry) => entry.fileId).sort()).toEqual([
      "f1",
      "f2",
      "f3",
    ]);
    expect(w.attachments).toEqual([
      { fileId: "f1", tagId: "t1", origin: "semantic_ai", confidence: 1 },
      { fileId: "f2", tagId: "t2", origin: "semantic_ai", confidence: 1 },
    ]);
  });

  it("reruns a file whose vector was stored without a completion record", async () => {
    const w = world({ seedTags: ["thunder", "rain"] });
    // A vector left by an earlier interrupted run, with no completion record:
    // its presence alone must not skip the file forever.
    w.vectors.set(`${VKEY}:f1`, { dim: 2, vec: stubVec([1, 0]) });

    const value = immediateValue<AutoTagV2TagSemanticResult>(await classify(w, ["f1"]));

    expect(w.embedCalls).toEqual(["f1"]);
    expect((value as unknown as { inserted: number }).inserted).toBe(1);
    expect((value as unknown as { alreadyClassified: number }).alreadyClassified).toBe(0);
    expect(classificationState(w).records.map((entry) => entry.fileId)).toEqual(["f1"]);
  });

  it("reports inserted, upgraded, and ignored writes from the tag port", async () => {
    const w = world({
      seedTags: ["thunder", "rain"],
      attachManyOutcome: () => ({ inserted: 0, upgraded: 1, ignored: 2 }),
    });

    const value = immediateValue<AutoTagV2TagSemanticResult>(await classify(w, ["f1", "f2"]));

    // Two files each commit one tag: the handler sums the port's outcome
    // instead of counting every attempted write as attached.
    expect((value as unknown as { inserted: number }).inserted).toBe(0);
    expect((value as unknown as { upgraded: number }).upgraded).toBe(2);
    expect((value as unknown as { ignored: number }).ignored).toBe(4);
    expect(value.attached).toBe(2);
  });

  it("keeps the persisted classification queue inside the state budget", async () => {
    const files = Array.from({ length: 400 }, (_, index) =>
      record(`cf${index}`, `thunder-${String(index).padStart(3, "0")}.wav`),
    );
    const w = world({ files, seedTags: ["thunder"] });

    const value = immediateValue<AutoTagV2TagSemanticResult>(
      await classify(w, files.map((file) => file.id)),
    );
    expect(value.alreadyClassified).toBe(0);

    // Retention is explicit: the completion queue is capped at the advertised
    // bound and the whole persisted envelope stays inside the state budget.
    const state = classificationState(w);
    expect(state.records.length).toBeLessThanOrEqual(MAX_RETAINED_CLASSIFICATIONS);
    expect(state.dropped).toBeGreaterThan(0);
    expect(stateDataBytes(w)).toBeLessThanOrEqual(MAX_V2_STATE_BYTES);
    expect(MAX_CLASSIFICATION_STATE_BYTES).toBeLessThanOrEqual(MAX_V2_STATE_BYTES);
  });
});
