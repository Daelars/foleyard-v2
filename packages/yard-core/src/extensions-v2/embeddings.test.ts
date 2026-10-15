import { describe, expect, it } from "vitest";

import {
  cosineSimilarity,
  createV2EmbeddingOperations,
  denyV2EmbeddingOperations,
  SIMILARITY_CHUNK_SIZE,
  STUB_EMBEDDING_MODEL,
  type V2EmbeddingPage,
  type V2EmbeddingPageRequest,
  type V2EmbeddingPorts,
} from "./embeddings";

// Area: auto-tag v2 (#192). Embedding store plus cosine ranking through
// the real permission checks: storing needs embeddings:write, reading
// needs embeddings:read, removed sounds never rank.

function f32(values: number[]): Uint8Array {
  return new Uint8Array(new Float32Array(values).buffer);
}

type PagedPorts = {
  ports: V2EmbeddingPorts;
  calls: { get: number; page: number; maxRequestedLimit: number };
};

/**
 * In-memory embedding port that only exposes a bounded, keyset-paged
 * reader — there is no API that hands back every vector at once, so a
 * test cannot accidentally accept an unbounded read (#298). `maxRowsPerPage`
 * forces smaller pages so chunk-boundary stability is exercised.
 */
function pagedPorts(
  byModel: Record<string, Record<string, number[]>>,
  options: { maxRowsPerPage?: number } = {},
): PagedPorts {
  const calls = { get: 0, page: 0, maxRequestedLimit: 0 };
  const cap = options.maxRowsPerPage ?? Number.POSITIVE_INFINITY;
  return {
    calls,
    ports: {
      upsert: () => {},
      get: (fileId, model) => {
        calls.get += 1;
        const vec = byModel[model]?.[fileId];
        return vec ? { dim: vec.length, vec: f32(vec) } : null;
      },
      listPage: (model: string, request: V2EmbeddingPageRequest): V2EmbeddingPage => {
        calls.page += 1;
        calls.maxRequestedLimit = Math.max(calls.maxRequestedLimit, request.limit);
        const ids = Object.keys(byModel[model] ?? {})
          .sort()
          .filter((id) => request.after === null || id > request.after);
        const rows = ids.slice(0, Math.min(request.limit, cap)).map((id) => ({
          fileId: id,
          dim: byModel[model]![id]!.length,
          vec: f32(byModel[model]![id]!),
        }));
        return { rows, hasMore: ids.length > rows.length };
      },
      removeFile: () => {},
    },
  };
}

const FULL = ["embeddings:read", "embeddings:write", "library:read"];

/** Brute-force ranking with the same total order the operations promise. */
function rank(files: Array<{ fileId: string; score: number }>): string[] {
  return [...files]
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      return left.fileId < right.fileId ? -1 : left.fileId > right.fileId ? 1 : 0;
    })
    .map((entry) => entry.fileId);
}

describe("cosineSimilarity", () => {
  it("ranks identical vectors first and silence last", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("createV2EmbeddingOperations", () => {
  it("stores and ranks by cosine, skipping self and removed sounds", () => {
    const { ports } = pagedPorts({
      [STUB_EMBEDDING_MODEL]: {
        a: [1, 0],
        b: [0.9, 0.1],
        c: [0, 1],
        gone: [1, 0],
      },
    });
    const ops = createV2EmbeddingOperations({
      extensionId: "ext",
      effectivePermissions: FULL,
      embeddings: ports,
      isLiveFile: (fileId) => fileId !== "gone",
    });
    expect(ops.store("a", STUB_EMBEDDING_MODEL, [1, 0])).toEqual({ dim: 2 });
    ops.store("b", STUB_EMBEDDING_MODEL, [0.9, 0.1]);
    ops.store("c", STUB_EMBEDDING_MODEL, [0, 1]);
    expect(ops.get("a", STUB_EMBEDDING_MODEL)?.dim).toBe(2);
    const similar = ops.findSimilar("a", { topN: 10 });
    expect(similar.map((entry) => entry.fileId)).toEqual(["b", "c"]);
    expect(similar[0]!.score).toBeGreaterThan(similar[1]!.score);
    expect(ops.findSimilar("missing")).toEqual([]);
  });

  // #298: the ranking walk must page candidates and keep only a bounded
  // top-N, so a Library far larger than one page never materialises in
  // one array. Ordering must not depend on where the page boundaries fall.
  it("streams candidates in bounded pages and keeps top-N stable across pages", () => {
    const vectors: Record<string, number[]> = {};
    for (let index = 0; index < 1000; index += 1) {
      const id = `f${String(index).padStart(4, "0")}`;
      // A spread of directions plus duplicates so ties are real.
      const angle = (index % 50) / 50;
      vectors[id] = [Math.cos(angle), Math.sin(angle), 0.001 * (index % 7)];
    }
    vectors.target = [1, 0, 0];
    const { ports, calls } = pagedPorts({ [STUB_EMBEDDING_MODEL]: vectors });
    const ops = createV2EmbeddingOperations({
      extensionId: "ext",
      effectivePermissions: ["embeddings:read"],
      embeddings: ports,
    });

    const expected = rank(
      Object.entries(vectors)
        .filter(([id]) => id !== "target")
        .map(([id, vec]) => ({
          fileId: id,
          score: cosineSimilarity([1, 0, 0], vec),
        })),
    ).slice(0, 10);

    const similar = ops.findSimilar("target", { topN: 10 });
    expect(similar.map((entry) => entry.fileId)).toEqual(expected);
    expect(calls.page).toBeGreaterThan(1);
    expect(calls.maxRequestedLimit).toBeLessThanOrEqual(SIMILARITY_CHUNK_SIZE);
    expect(calls.get).toBe(1);

    // Same best-N when the port hands back one row at a time: the result
    // depends on the ordering, not on the chunk boundaries.
    const small = pagedPorts({ [STUB_EMBEDDING_MODEL]: vectors }, { maxRowsPerPage: 1 });
    const smallOps = createV2EmbeddingOperations({
      extensionId: "ext",
      effectivePermissions: ["embeddings:read"],
      embeddings: small.ports,
    });
    expect(smallOps.findSimilar("target", { topN: 10 }).map((entry) => entry.fileId)).toEqual(expected);
    expect(small.calls.page).toBe(Object.keys(vectors).length);
  });

  it("excludes removed sounds and vectors from another model", () => {
    const { ports } = pagedPorts({
      [STUB_EMBEDDING_MODEL]: { a: [1, 0], b: [0.9, 0.1], gone: [1, 0] },
      "other-model": { foreign: [1, 0] },
    });
    const ops = createV2EmbeddingOperations({
      extensionId: "ext",
      effectivePermissions: ["embeddings:read"],
      embeddings: ports,
      liveFileIds: (ids) => ids.filter((id) => id !== "gone"),
    });
    expect(ops.findSimilar("a", { topN: 10 }).map((entry) => entry.fileId)).toEqual(["b"]);
  });

  it("ranks with one batched liveness check per page (#233, #298)", () => {
    const { ports, calls } = pagedPorts({
      [STUB_EMBEDDING_MODEL]: { a: [1, 0], b: [0.9, 0.1], c: [0, 1], gone: [1, 0] },
    });
    let liveChecks = 0;
    const ops = createV2EmbeddingOperations({
      extensionId: "ext",
      effectivePermissions: ["embeddings:read"],
      embeddings: ports,
      liveFileIds: (fileIds) => {
        liveChecks += 1;
        return fileIds.filter((fileId) => fileId !== "gone");
      },
    });

    const similar = ops.findSimilar("a", { topN: 2 });
    expect(similar.map((entry) => entry.fileId)).toEqual(["b", "c"]);
    expect(liveChecks).toBe(calls.page);
    expect(calls.maxRequestedLimit).toBeLessThanOrEqual(SIMILARITY_CHUNK_SIZE);
  });

  it("denies reads and writes outside the effective set", () => {
    const { ports } = pagedPorts({ [STUB_EMBEDDING_MODEL]: { a: [1, 0] } });
    const reader = createV2EmbeddingOperations({
      extensionId: "ext",
      effectivePermissions: ["embeddings:read", "library:read"],
      embeddings: ports,
    });
    expect(() => reader.store("a", STUB_EMBEDDING_MODEL, [1])).toThrowError(/"embeddings:write"/);
    const denied = denyV2EmbeddingOperations("ext");
    expect(() => denied.findSimilar("a")).toThrowError(/"embeddings:read"/);
  });
});
