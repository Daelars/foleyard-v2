import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/test/fixtures";
import { SqliteEmbeddingRepository } from "@/lib/database/embedding-repository";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { audioFileRecord } from "@/test/fixtures";

// Area: auto-tag v2 (#192). The vector store moves bytes: one row per
// file per model, re-upserts replace, removing a file leaves no orphans.
function floatBytes(values: number[]): Uint8Array {
  const buffer = new ArrayBuffer(values.length * 4);
  const view = new DataView(buffer);
  values.forEach((value, index) => view.setFloat32(index * 4, value, true));
  return new Uint8Array(buffer);
}

describe("file embeddings store", () => {
  let sqlite: TestDatabase;
  let embeddings: SqliteEmbeddingRepository;
  let fileA = "";
  let fileB = "";

  beforeEach(() => {
    sqlite = createTestDatabase();
    embeddings = new SqliteEmbeddingRepository(sqlite);
    const files = new SqliteAudioFileRepository(sqlite);
    files.batchUpsertFiles(
      [
        audioFileRecord({ path: "/lib/a.wav", filename: "a.wav" }),
        audioFileRecord({ path: "/lib/b.wav", filename: "b.wav" }),
      ],
      new Date().toISOString(),
    );
    const rows = files.getFiles({ limit: 10 });
    fileA = rows.find((row) => row.filename === "a.wav")!.id;
    fileB = rows.find((row) => row.filename === "b.wav")!.id;
  });

  afterEach(() => {
    sqlite.close();
  });

  it("round-trips vectors per model", () => {
    embeddings.upsertEmbedding(fileA, "stub", 2, floatBytes([1, 0]));
    embeddings.upsertEmbedding(fileA, "other", 3, floatBytes([0, 1, 0]));
    expect(embeddings.getEmbedding(fileA, "stub")?.dim).toBe(2);
    expect([...embeddings.getEmbedding(fileA, "stub")!.vec].length).toBe(8);
    expect(embeddings.getEmbedding(fileA, "other")?.dim).toBe(3);
    expect(embeddings.getEmbedding(fileB, "stub")).toBeNull();
  });

  it("reads all vectors for a model in one indexed query (#233)", () => {
    embeddings.upsertEmbedding(fileA, "stub", 2, floatBytes([1, 0]));
    embeddings.upsertEmbedding(fileB, "stub", 2, floatBytes([0, 1]));
    embeddings.upsertEmbedding(fileA, "other", 2, floatBytes([1, 1]));

    const listed = embeddings.listEmbeddings("stub");
    expect(listed.map((row) => row.fileId).sort()).toEqual([fileA, fileB].sort());
    expect(listed[0]!.dim).toBe(2);
    expect(listed[0]!.vec.byteLength).toBe(8);

    const plan = sqlite
      .prepare("EXPLAIN QUERY PLAN SELECT file_id, dim, vec FROM file_embeddings WHERE model = 'stub'")
      .all()
      .map((row) => (row as { detail: string }).detail)
      .join(" | ");
    expect(plan).toContain("idx_file_embeddings_model");
    expect(plan).not.toContain("TEMP B-TREE");
  });

  it("re-upserts replace and file removal leaves no orphans", () => {
    embeddings.upsertEmbedding(fileA, "stub", 2, floatBytes([1, 0]));
    embeddings.upsertEmbedding(fileA, "stub", 2, floatBytes([0, 1]));
    expect(embeddings.listEmbeddingIds("stub")).toEqual([fileA]);
    embeddings.deleteEmbeddingsForFile(fileA);
    expect(embeddings.listEmbeddingIds("stub")).toEqual([]);
    expect(embeddings.getEmbedding(fileA, "stub")).toBeNull();
  });
});
