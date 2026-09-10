import { describe, expect, it } from "vitest";

import {
  cosineSimilarity,
  createV2EmbeddingOperations,
  denyV2EmbeddingOperations,
  STUB_EMBEDDING_MODEL,
  type V2EmbeddingPorts,
} from "./embeddings";

// Area: auto-tag v2 (#192). Embedding store plus cosine ranking through
// the real permission checks: storing needs embeddings:write, reading
// needs embeddings:read, removed sounds never rank.

function portsDouble(): V2EmbeddingPorts & { rows: Map<string, { dim: number; vec: Uint8Array }> } {
  const rows = new Map<string, { dim: number; vec: Uint8Array }>();
  const key = (fileId: string, model: string) => `${model}:${fileId}`;
  return {
    rows,
    upsert: (fileId, model, dim, vec) => {
      rows.set(key(fileId, model), { dim, vec });
    },
    get: (fileId, model) => rows.get(key(fileId, model)) ?? null,
    listIds: (model) =>
      [...rows.keys()].filter((entry) => entry.startsWith(`${model}:`)).map((entry) => entry.slice(model.length + 1)),
    removeFile: (fileId) => {
      for (const entry of [...rows.keys()]) {
        if (entry.endsWith(`:${fileId}`)) rows.delete(entry);
      }
    },
  };
}

const FULL = ["embeddings:read", "embeddings:write", "library:read"];

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
    const ports = portsDouble();
    const ops = createV2EmbeddingOperations({
      extensionId: "ext",
      effectivePermissions: FULL,
      embeddings: ports,
      isLiveFile: (fileId) => fileId !== "gone",
    });
    expect(ops.store("a", STUB_EMBEDDING_MODEL, [1, 0])).toEqual({ dim: 2 });
    ops.store("b", STUB_EMBEDDING_MODEL, [0.9, 0.1]);
    ops.store("c", STUB_EMBEDDING_MODEL, [0, 1]);
    // A vector whose sound left the index after it was stored.
    ports.upsert("gone", STUB_EMBEDDING_MODEL, 2, new Uint8Array(new Float32Array([1, 0]).buffer));
    expect(ops.get("a", STUB_EMBEDDING_MODEL)?.dim).toBe(2);
    const similar = ops.findSimilar("a", { topN: 10 });
    expect(similar.map((entry) => entry.fileId)).toEqual(["b", "c"]);
    expect(similar[0]!.score).toBeGreaterThan(similar[1]!.score);
    expect(ops.findSimilar("missing")).toEqual([]);
  });

  it("denies reads and writes outside the effective set", () => {
    const ports = portsDouble();
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
