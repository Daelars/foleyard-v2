import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { audioFileRecord, createTestDatabase, type TestDatabase } from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteCollectionRepository } from "@/lib/database/collection-repository";

// Area: #252. Collection existence, fetch and name uniqueness are point
// lookups against the collections table; membership is only counted for the
// single collection being fetched, and storage enforces uniqueness.

describe("collection point lookups", () => {
  let sqlite: TestDatabase;
  let collections: SqliteCollectionRepository;
  let files: SqliteAudioFileRepository;

  beforeEach(() => {
    sqlite = createTestDatabase();
    collections = new SqliteCollectionRepository(sqlite);
    files = new SqliteAudioFileRepository(sqlite);
    files.batchUpsertFiles(
      [
        audioFileRecord({ path: "/lib/kick.wav", filename: "kick.wav" }),
        audioFileRecord({ path: "/lib/snare.wav", filename: "snare.wav" }),
        audioFileRecord({
          path: "/lib/hat.wav",
          filename: "hat.wav",
          removedAt: "2026-01-01T00:00:00.000Z",
        }),
      ],
      new Date().toISOString(),
    );
  });

  afterEach(() => {
    sqlite.close();
  });

  it("answers existence and name checks without reading membership", () => {
    const id = collections.createCollection("Impacts");
    expect(collections.collectionExists(id)).toBe(true);
    expect(collections.collectionExists("missing")).toBe(false);
    expect(collections.collectionNameExists("Impacts")).toBe(true);
    expect(collections.collectionNameExists("Impacts", id)).toBe(false);
    expect(collections.collectionNameExists("Other")).toBe(false);

    const byId = sqlite
      .prepare("EXPLAIN QUERY PLAN SELECT id FROM collections WHERE id = 'anything'")
      .all() as Array<{ detail: string }>;
    expect(byId.map((row) => row.detail).join(" | ")).toMatch(/collections/);
    expect(byId.map((row) => row.detail).join(" | ")).not.toContain("file_collections");

    const byName = sqlite
      .prepare("EXPLAIN QUERY PLAN SELECT id FROM collections WHERE name = 'Impacts'")
      .all() as Array<{ detail: string }>;
    expect(byName.map((row) => row.detail).join(" | ")).toContain("idx_collections_name");
  });

  it("fetches one collection with a bounded active-member count", () => {
    const id = collections.createCollection("Impacts");
    const kick = files.getFileByPath("/lib/kick.wav")!;
    const snare = files.getFileByPath("/lib/snare.wav")!;
    const hat = files.getFileByPath("/lib/hat.wav")!;
    collections.attachFileToCollection(kick.id, id);
    collections.attachFileToCollection(snare.id, id);
    collections.attachFileToCollection(hat.id, id);

    const fetched = collections.getCollectionById(id);
    expect(fetched).toMatchObject({ id, name: "Impacts", fileCount: 2 });
    expect(collections.getCollectionById("missing")).toBeNull();

    // Listing computes the same counts as the point fetch.
    const listed = collections.getAllCollections().find((entry) => entry.id === id);
    expect(listed?.fileCount).toBe(fetched?.fileCount);
  });

  it("rejects duplicate names at the storage layer", () => {
    collections.createCollection("Impacts");
    expect(() => collections.createCollection("Impacts")).toThrowError(
      /UNIQUE constraint failed: collections.name/i,
    );

    const id = collections.createCollection("Other");
    expect(() => collections.renameCollection(id, "Impacts")).toThrowError(
      /UNIQUE constraint failed: collections.name/i,
    );
  });
});
