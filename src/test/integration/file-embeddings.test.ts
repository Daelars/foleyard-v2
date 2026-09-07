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

  it("re-upserts replace and file removal leaves no orphans", () => {
    embeddings.upsertEmbedding(fileA, "stub", 2, floatBytes([1, 0]));
    embeddings.upsertEmbedding(fileA, "stub", 2, floatBytes([0, 1]));
    expect(embeddings.listEmbeddingIds("stub")).toEqual([fileA]);
    embeddings.deleteEmbeddingsForFile(fileA);
    expect(embeddings.listEmbeddingIds("stub")).toEqual([]);
    expect(embeddings.getEmbedding(fileA, "stub")).toBeNull();
  });

  it("move-reconcile carries origins and vectors to the new file", () => {
    const sqlite2 = createTestDatabase();
    try {
      const insert = sqlite2.prepare(
        `INSERT INTO files (id, path, filename, library_root, file_size, duration, codec,
          sample_rate, bit_depth, channels, removed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      insert.run("old", "/lib/old/hit.wav", "hit.wav", "/lib", 100, 1, "pcm", 44100, 16, 2, "2026-09-01");
      insert.run("new", "/lib/new/hit.wav", "hit.wav", "/lib", 100, 1, "pcm", 44100, 16, 2, null);
      sqlite2.prepare("INSERT INTO tags (id, name) VALUES ('t1', 'thunder')").run();
      sqlite2.prepare(
        "INSERT INTO file_tags (file_id, tag_id, origin, confidence) VALUES ('old', 't1', 'semantic_ai', 0.9)",
      ).run();
      const repository = new SqliteAudioFileRepository(sqlite2);
      const tagged = new SqliteEmbeddingRepository(sqlite2);
      tagged.upsertEmbedding("old", "stub", 2, floatBytes([1, 0]));

      expect(repository.reconcileMovedFiles()).toBe(1);

      expect(tagged.getEmbedding("new", "stub")?.dim).toBe(2);
      expect(tagged.listEmbeddingIds("stub")).toEqual(["new"]);
      const moved = sqlite2
        .prepare("SELECT origin, confidence FROM file_tags WHERE file_id = 'new'")
        .get() as { origin: string; confidence: number };
      expect(moved.origin).toBe("semantic_ai");
      expect(moved.confidence).toBe(0.9);
      expect(repository.getFileById("old")).toBeNull();
    } finally {
      sqlite2.close();
    }
  });
});
