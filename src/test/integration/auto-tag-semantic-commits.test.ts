import { afterEach, describe, expect, it } from "vitest";

import {
  createV2ExtendedOperations,
  createV2OperationServices,
  ExtensionV2Host,
  ExtensionV2Registry,
  V2WorkflowStateStore,
  type IndexedAudioFile,
  type V2AnalysisPorts,
  type V2EmbeddingPorts,
  type V2ExtensionStatePorts,
  type V2HostServices,
  type V2LibraryReadPorts,
  type V2TagPorts,
} from "@yard-core";
import {
  AUTO_TAG_V2_ID,
  AUTO_TAG_V2_TAG_SEMANTIC,
  SEMANTIC_CLASSIFICATION_KEY,
  createAutoTagV2Definition,
  registerAutoTagV2Handlers,
  type AutoTagV2TagSemanticResult,
} from "@foleyard/auto-tag-v2";

import { audioFileRecord, createTestDatabase, type TestDatabase } from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteEmbeddingRepository } from "@/lib/database/embedding-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";

// Area: #286. Semantic classification commits run against the production
// SQLite tag and embedding repositories, not an append-only fake. A batch
// interrupted mid-commit leaves the committed prefix and an explicit,
// resumable remainder: a vector without a completion record is reprocessed,
// never skipped forever, and a completed file is never re-embedded.

const CLAP_MODEL = "Xenova/clap-htsat-unfused";
const THUNDER_PROMPT = "This is a sound of thunder";
const FULL_PERMISSIONS = [
  "library:read",
  "files:read",
  "tags:read",
  "tags:write",
  "settings:read",
  "embeddings:read",
  "embeddings:write",
];

type Harness = {
  host: ExtensionV2Host;
  sqlite: TestDatabase;
  files: SqliteAudioFileRepository;
  tags: SqliteTagRepository;
  embeddings: SqliteEmbeddingRepository;
  stateStore: Map<string, unknown>;
  embedCalls: string[];
  thunderId: string;
  rainId: string;
  interruptOn: { current: string | null };
};

function harness(): Harness {
  const sqlite = createTestDatabase();
  const files = new SqliteAudioFileRepository(sqlite);
  const tags = new SqliteTagRepository(sqlite);
  const embeddings = new SqliteEmbeddingRepository(sqlite);
  files.batchUpsertFiles(
    [
      audioFileRecord({ path: "/lib/thunder.wav", filename: "thunder.wav" }),
      audioFileRecord({ path: "/lib/rain.wav", filename: "rain.wav" }),
    ],
    new Date().toISOString(),
  );
  const thunderFile = files.getFileByPath("/lib/thunder.wav")!;
  const rainFile = files.getFileByPath("/lib/rain.wav")!;
  tags.createTag("thunder");
  tags.createTag("rain");

  const byId = new Map<string, IndexedAudioFile>([
    [thunderFile.id, thunderFile],
    [rainFile.id, rainFile],
  ]);
  const library: V2LibraryReadPorts = {
    getFileById: (id) => byId.get(id) ?? null,
    getFilesByIds: (ids) => ids.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : [])),
    listPage: (cursor) => {
      const start = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
      const all = [...byId.values()];
      const slice = all.slice(start, start + 2);
      return { files: slice, nextCursor: start + 2 < all.length ? String(start + 2) : null };
    },
  };

  let interrupted = false;
  const interruptOn: { current: string | null } = { current: null };
  const maybeInterrupt = (fileIds: string[]): void => {
    if (!interrupted && interruptOn.current && fileIds.includes(interruptOn.current)) {
      interrupted = true;
      throw new Error("tag commit interrupted");
    }
  };

  const tagPorts: V2TagPorts = {
    list: () => tags.getAllTags(),
    tagsForFile: (id) => tags.getTagsForFile(id),
    create: (name) => tags.createTag(name),
    attach: (fileId, tagId, origin, confidence) =>
      tags.attachTagToFileWithOrigin(fileId, tagId, origin ?? "manual", confidence),
    attachMany: (entries) => {
      maybeInterrupt(entries.map((entry) => entry.fileId));
      return tags.attachTagsBatch(entries);
    },
    attachmentsForFiles: (ids) => tags.getAttachmentsWithTagsForFiles(ids),
    detach: (fileId, tagId) => tags.detachTagFromFile(fileId, tagId),
    detachByOrigin: (origin) => tags.detachAttachmentsByOrigin(origin),
    resolveAlias: (alias) => tags.resolveTagAlias(alias),
    renamePreservingAlias: (tagId, name) => tags.renameTagPreservingAlias(tagId, name),
    merge: (source, target) => tags.mergeTags(source, target),
  };

  const embeddingPorts: V2EmbeddingPorts = {
    upsert: (fileId, model, dim, vec) => embeddings.upsertEmbedding(fileId, model, dim, vec),
    get: (fileId, model) => embeddings.getEmbedding(fileId, model),
    listIds: (model) => embeddings.listEmbeddingIds(model),
    list: (model) => embeddings.listEmbeddings(model),
    removeFile: (fileId) => embeddings.deleteEmbeddingsForFile(fileId),
  };

  const embedCalls: string[] = [];
  const analysisPorts: V2AnalysisPorts = {
    modelStatus: () => ({
      modelId: CLAP_MODEL,
      state: "ready",
      downloadedBytes: 1,
      totalBytes: 1,
      backendAvailable: true,
    }),
    downloadModel: async () => ({ bytes: 1 }),
    embedAudio: async (fileId) => {
      embedCalls.push(fileId);
      return { dim: 2, vec: fileId === thunderFile.id ? [1, 0] : [0, 1] };
    },
    embedTexts: async (texts) =>
      texts.map((text) => (text === THUNDER_PROMPT ? [1, 0] : [0, 1])),
    backendAvailable: () => true,
  };

  const stateStore = new Map<string, unknown>();
  const extensionState: V2ExtensionStatePorts = {
    readAll: () => Object.fromEntries(stateStore),
    writeAll: (_extensionId, state) => {
      stateStore.clear();
      for (const [key, value] of Object.entries(state)) stateStore.set(key, value);
    },
  };
  const workflowState = new V2WorkflowStateStore(AUTO_TAG_V2_ID, extensionState);

  const registry = new ExtensionV2Registry();
  registry.register(createAutoTagV2Definition());
  const services: V2HostServices = {
    registry,
    isEnabled: () => true,
    capabilities: {},
    grantedPermissions: () => [...FULL_PERMISSIONS],
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
            realpath: async (path: string) => path,
            lstat: async () => ({ exists: true, isLink: false }),
          }),
        },
        archive: {
          createZipArchive: async () => ({
            bytesWritten: 0,
            version: { device: "memory", fileId: "unused" },
          }),
        },
        settings: { readRaw: () => undefined, writeRaw: () => {} },
        extensionState,
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
    sqlite,
    files,
    tags,
    embeddings,
    stateStore,
    embedCalls,
    thunderId: thunderFile.id,
    rainId: rainFile.id,
    interruptOn,
  };
}

function classificationRecords(w: Harness): Array<{ fileId: string; tagIds: string[] }> {
  const data = (w.stateStore.get("data") as Record<string, unknown> | undefined) ?? {};
  const raw = data[SEMANTIC_CLASSIFICATION_KEY];
  if (typeof raw !== "object" || raw === null) return [];
  const records = (raw as { records?: unknown }).records;
  return Array.isArray(records) ? (records as Array<{ fileId: string; tagIds: string[] }>) : [];
}

function classify(w: Harness, fileIds: string[]) {
  return w.host.execute({
    extensionId: AUTO_TAG_V2_ID,
    commandId: AUTO_TAG_V2_TAG_SEMANTIC,
    input: { fileIds },
    selection: { fileIds: [] },
  });
}

function immediate<T>(result: unknown): T {
  const outcome = (result as { outcome: { kind: string; value: unknown } }).outcome;
  expect(outcome.kind).toBe("immediate");
  return outcome.value as T;
}

describe("auto-tag semantic commits on production SQLite (#286)", () => {
  let w: Harness;

  afterEach(() => {
    w.sqlite.close();
  });

  it("commits vector, tags, and completion together and resumes after an interrupt", async () => {
    w = harness();
    w.interruptOn.current = w.rainId;

    const first = await classify(w, [w.thunderId, w.rainId]);
    expect((first as { ok: boolean }).ok).toBe(false);

    // thunder fully committed on the real SQLite stores.
    const thunderTag = w.tags.getAllTags().find((tag) => tag.name === "thunder")!;
    expect(w.embeddings.getEmbedding(w.thunderId, CLAP_MODEL)).not.toBeNull();
    expect(w.tags.getAttachmentsForFile(w.thunderId)).toEqual([
      expect.objectContaining({ origin: "semantic_ai", confidence: 1, tagId: thunderTag.id }),
    ]);
    expect(classificationRecords(w).map((entry) => entry.fileId)).toEqual([w.thunderId]);
    expect(classificationRecords(w)[0]!.tagIds).toEqual([thunderTag.id]);

    // rain half-committed: a vector, no tag, and no completion.
    expect(w.embeddings.getEmbedding(w.rainId, CLAP_MODEL)).not.toBeNull();
    expect(w.tags.getAttachmentsForFile(w.rainId)).toEqual([]);
    expect(classificationRecords(w).map((entry) => entry.fileId)).not.toContain(w.rainId);

    // Rerun: thunder is not re-embedded; only rain reruns and completes.
    w.embedCalls.length = 0;
    const second = immediate<AutoTagV2TagSemanticResult>(
      await classify(w, [w.thunderId, w.rainId]),
    );
    expect(w.embedCalls).toEqual([w.rainId]);
    expect(second.alreadyClassified).toBe(1);
    expect(second.inserted).toBe(1);
    expect(w.tags.getAttachmentsForFile(w.rainId)).toEqual([
      expect.objectContaining({ origin: "semantic_ai", confidence: 1 }),
    ]);
    expect(classificationRecords(w).map((entry) => entry.fileId).sort()).toEqual(
      [w.thunderId, w.rainId].sort(),
    );
  });

  it("reprocesses a vector stored without a completion record", async () => {
    w = harness();
    // A vector left by an earlier interrupted run, with no completion.
    w.embeddings.upsertEmbedding(w.thunderId, CLAP_MODEL, 2, new Uint8Array(8));

    const result = immediate<AutoTagV2TagSemanticResult>(await classify(w, [w.thunderId]));
    expect(w.embedCalls).toEqual([w.thunderId]);
    expect(result.alreadyClassified).toBe(0);
    expect(w.tags.getAttachmentsForFile(w.thunderId)).toHaveLength(1);
    expect(classificationRecords(w).map((entry) => entry.fileId)).toEqual([w.thunderId]);
  });
});
