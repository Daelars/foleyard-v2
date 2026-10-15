import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SqliteEmbeddingRepository } from "@/lib/database/embedding-repository";
import { createV2EmbeddingPorts } from "@/lib/extensions-v2/embeddings";
import { createTestDatabase, type TestDatabase } from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import {
  createV2EmbeddingOperations,
  SIMILARITY_CHUNK_SIZE,
  type V2EmbeddingPorts,
} from "@yard-core";

// Area: similarity search memory (#298). The ranking walk must read and
// score candidate vectors in bounded pages served by the model-first
// index, so peak memory tracks the page bound rather than Library size.
// `listEmbeddings()` (one `.all()` of every vector, #233) is gone: the
// repository only exposes a keyset-paged reader, and no port hands back a
// model's whole vector set at once.

const MODEL = "audio-stub-v1";
const OTHER_MODEL = "other-model-v1";
const DIM = 64;

/** Deterministic unit vector so a synthetic Library is reproducible. */
function unitVector(seed: number, dim = DIM): Float32Array {
  const vec = new Float32Array(dim);
  let sum = 0;
  for (let index = 0; index < dim; index += 1) {
    const value = Math.sin(seed * (index + 1) * 0.137) + Math.cos(seed * 0.017 * (index + 2));
    vec[index] = value;
    sum += value * value;
  }
  const norm = Math.sqrt(sum) || 1;
  for (let index = 0; index < dim; index += 1) vec[index] = vec[index]! / norm;
  return vec;
}

function floatBytes(values: Float32Array): Uint8Array {
  return new Uint8Array(values.buffer.slice(0));
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    dot += a[index]! * b[index]!;
    normA += a[index]! * a[index]!;
    normB += b[index]! * b[index]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function fileId(index: number): string {
  return `f${String(index).padStart(6, "0")}`;
}

type ReadStats = {
  pages: number;
  maxRequestedLimit: number;
  maxPageRows: number;
  maxPageBytes: number;
  totalRows: number;
};

/** Real app ports over a repository, with every read instrumented. */
function instrumentedPorts(repo: SqliteEmbeddingRepository): {
  ports: V2EmbeddingPorts;
  stats: ReadStats;
} {
  const stats: ReadStats = {
    pages: 0,
    maxRequestedLimit: 0,
    maxPageRows: 0,
    maxPageBytes: 0,
    totalRows: 0,
  };
  const inner = createV2EmbeddingPorts({
    notify: () => {},
    embeddings: {
      upsert: (fileId, model, dim, vec) => repo.upsertEmbedding(fileId, model, dim, vec),
      get: (fileId, model) => repo.getEmbedding(fileId, model),
      listPage: (model, request) => repo.listEmbeddingsPage(model, request),
      removeFile: (fileId) => repo.deleteEmbeddingsForFile(fileId),
    },
  });
  const ports: V2EmbeddingPorts = {
    ...inner,
    listPage: (model, request) => {
      stats.pages += 1;
      stats.maxRequestedLimit = Math.max(stats.maxRequestedLimit, request.limit);
      const page = inner.listPage(model, request);
      stats.maxPageRows = Math.max(stats.maxPageRows, page.rows.length);
      stats.maxPageBytes = Math.max(
        stats.maxPageBytes,
        page.rows.reduce((total, row) => total + row.vec.byteLength, 0),
      );
      stats.totalRows += page.rows.length;
      return page;
    },
  };
  return { ports, stats };
}

describe("similarity search memory (#298)", () => {
  let sqlite: TestDatabase;
  let repo: SqliteEmbeddingRepository;

  beforeEach(() => {
    sqlite = createTestDatabase();
    repo = new SqliteEmbeddingRepository(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  /** Real file rows with deterministic ids so the benchmark is repeatable. */
  function seedFiles(count: number): string[] {
    const insert = sqlite.prepare("INSERT INTO files (id, path, filename) VALUES (?, ?, ?)");
    const ids: string[] = [];
    const write = sqlite.transaction(() => {
      for (let index = 0; index < count; index += 1) {
        const id = fileId(index);
        insert.run(id, `/library/${id}.wav`, `${id}.wav`);
        ids.push(id);
      }
    });
    write();
    return ids;
  }

  function seedEmbeddings(ids: string[], model = MODEL): void {
    const write = sqlite.transaction(() => {
      ids.forEach((id, index) => {
        repo.upsertEmbedding(id, model, DIM, floatBytes(unitVector(index + 1)));
      });
    });
    write();
  }

  it("pages candidate vectors through the model-first index", () => {
    const ids = seedFiles(40);
    seedEmbeddings(ids);

    const first = repo.listEmbeddingsPage(MODEL, { after: null, limit: 10 });
    expect(first.rows).toHaveLength(10);
    expect(first.hasMore).toBe(true);
    expect(first.rows.map((row) => row.fileId)).toEqual(ids.slice(0, 10));

    const second = repo.listEmbeddingsPage(MODEL, { after: first.rows.at(-1)!.fileId, limit: 10 });
    expect(second.rows.map((row) => row.fileId)).toEqual(ids.slice(10, 20));

    let after: string | null = null;
    const walked: string[] = [];
    for (;;) {
      const page = repo.listEmbeddingsPage(MODEL, { after, limit: 7 });
      walked.push(...page.rows.map((row) => row.fileId));
      if (!page.hasMore) break;
      after = page.rows.at(-1)!.fileId;
    }
    expect(walked).toEqual(ids);

    const plan = sqlite
      .prepare(
        "EXPLAIN QUERY PLAN SELECT file_id, dim, vec FROM file_embeddings WHERE model = 'stub' AND file_id > '' ORDER BY file_id LIMIT 8",
      )
      .all()
      .map((row) => (row as { detail: string }).detail)
      .join(" | ");
    expect(plan).toContain("idx_file_embeddings_model");
    expect(plan).not.toContain("TEMP B-TREE");
  });

  it("clamps the page size so a caller cannot ask for an unbounded read", () => {
    const ids = seedFiles(20);
    seedEmbeddings(ids);

    const page = repo.listEmbeddingsPage(MODEL, { after: null, limit: 100_000 });
    expect(page.rows).toHaveLength(20);
    expect(page.rows.length).toBeLessThanOrEqual(512);
    expect(page.hasMore).toBe(false);
  });

  it("excludes removed sounds and foreign-model vectors", () => {
    const ids = seedFiles(8);
    const foreign = ids[7]!;
    seedEmbeddings(ids.slice(0, 7));
    repo.upsertEmbedding(foreign, OTHER_MODEL, DIM, floatBytes(unitVector(1)));
    const removed = ids[1]!;

    const files = new SqliteAudioFileRepository(sqlite);
    files.markFileRemoved(`/library/${removed}.wav`, new Date().toISOString());

    const { ports } = instrumentedPorts(repo);
    const ops = createV2EmbeddingOperations({
      extensionId: "auto-tag-v2",
      effectivePermissions: ["embeddings:read"],
      embeddings: ports,
      isLiveFile: (id) => {
        const record = files.getFileById(id);
        return record !== null && record.removedAt === null;
      },
      liveFileIds: (candidateIds) =>
        files
          .getFilesByIds(candidateIds)
          .filter((record) => record.removedAt === null)
          .map((record) => record.id),
    });

    const ranked = ops.findSimilar(ids[0]!, { model: MODEL, topN: 10 }).map((entry) => entry.fileId);
    expect(ranked).not.toContain(removed);
    expect(ranked).not.toContain(foreign);
    expect(new Set(ranked)).toEqual(new Set(ids.slice(2, 7)));
  });

  // The acceptance benchmark: a synthetic Library far larger than one page.
  // Peak memory is the largest page of vectors the ranking walk ever holds
  // (plus the target and the bounded top-N); it must stay flat as the
  // Library grows by ten times while the best-N stays correct.
  it(
    "benchmark: records bounded peak memory and correct top-N over a large Library",
    () => {
      const reports: Array<{
        size: number;
        pages: number;
        peakPageRows: number;
        peakPageBytes: number;
        heapDeltaBytes: number;
        topN: string[];
      }> = [];

      for (const size of [1_000, 10_000]) {
        const localSqlite = createTestDatabase();
        const localRepo = new SqliteEmbeddingRepository(localSqlite);
        const insert = localSqlite.prepare("INSERT INTO files (id, path, filename) VALUES (?, ?, ?)");
        const ids: string[] = [];
        localSqlite.transaction(() => {
          for (let index = 0; index < size; index += 1) {
            const id = fileId(index);
            insert.run(id, `/library/${id}.wav`, `${id}.wav`);
            ids.push(id);
          }
          ids.forEach((id, index) => {
            localRepo.upsertEmbedding(id, MODEL, DIM, floatBytes(unitVector(index + 1)));
          });
        })();

        const { ports, stats } = instrumentedPorts(localRepo);
        const ops = createV2EmbeddingOperations({
          extensionId: "auto-tag-v2",
          effectivePermissions: ["embeddings:read"],
          embeddings: ports,
        });

        const target = ids[0]!;
        const heapBefore = process.memoryUsage().heapUsed;
        const ranked = ops.findSimilar(target, { model: MODEL, topN: 10 });
        // Informational only: this is uncollected allocation churn from the
        // walk, not a retained bound, so it is recorded but not asserted on.
        const heapDeltaBytes = Math.max(0, process.memoryUsage().heapUsed - heapBefore);
        const topN = ranked.map((entry) => entry.fileId);

        // Correctness: brute-force cosine over the same deterministic vectors.
        const targetVec = unitVector(1);
        const expected = ids
          .filter((id) => id !== target)
          .map((id, index) => ({ id, score: cosine(targetVec, unitVector(index + 2)) }))
          .sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score;
            return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
          })
          .slice(0, 10)
          .map((entry) => entry.id);

        expect(topN).toEqual(expected);
        expect(ranked).toHaveLength(10);
        // Every stored vector was streamed once, across many bounded pages.
        expect(stats.totalRows).toBe(size);
        expect(stats.pages).toBeGreaterThan(1);
        expect(stats.maxRequestedLimit).toBeLessThanOrEqual(SIMILARITY_CHUNK_SIZE);
        expect(stats.maxPageRows).toBeLessThanOrEqual(SIMILARITY_CHUNK_SIZE);
        expect(stats.maxPageBytes).toBeLessThanOrEqual(SIMILARITY_CHUNK_SIZE * DIM * 4);

        reports.push({
          size,
          pages: stats.pages,
          peakPageRows: stats.maxPageRows,
          peakPageBytes: stats.maxPageBytes,
          heapDeltaBytes,
          topN,
        });
        localSqlite.close();
      }

      // Recorded measurement: `console.log` carries the same evidence into CI
      // logs, and the assertions below hold the walk to a flat bound.
      console.log(`[similarity-memory] ${JSON.stringify(reports)}`);

      const [small, large] = reports as [(typeof reports)[number], (typeof reports)[number]];
      expect(small.size).toBe(1_000);
      expect(large.size).toBe(10_000);
      // Peak resident candidate bytes must not grow with Library size.
      expect(large.peakPageBytes).toBe(small.peakPageBytes);
      expect(large.peakPageRows).toBe(small.peakPageRows);
      expect(large.peakPageRows).toBeLessThanOrEqual(SIMILARITY_CHUNK_SIZE);
      // Ten times the Library means ten times the pages, not ten times the page.
      expect(large.pages).toBeGreaterThan(small.pages * 9);
    },
    30_000,
  );
});
