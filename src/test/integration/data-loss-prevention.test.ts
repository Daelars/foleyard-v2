import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  audioFileRecord,
  createScratchLibrary,
  createTestDatabase,
  type ScratchLibrary,
  type TestDatabase,
} from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";

// Area: data-loss prevention (#136).
//
// The v1 Folder Janitor service case retired with the v1 tool: scan issue
// derivation lives in folder-janitor-v2 policy tests, and the delete-only-
// empty-folders contract (review plan, containment + emptiness recheck at
// delete time) lives in its handler tests. Everything here is irreversible
// against a user's actual sound library. Losing an assertion in this file
// costs somebody their files.

let library: ScratchLibrary;

beforeEach(() => {
  library = createScratchLibrary("foleyard-dataloss-");
});

afterEach(() => library.dispose());

describe("data-loss prevention", () => {
  it.fails(
    "keeps two distinct same-size recordings from inheriting each other (B02)",
    () => {
      const sqlite: TestDatabase = createTestDatabase();
      try {
        const repository = new SqliteAudioFileRepository(sqlite);
        const insert = sqlite.prepare(
          "INSERT INTO files (id,path,filename,library_root,file_size,duration,removed_at) VALUES (?,?,?,?,?,?,?)",
        );
        insert.run("old", "/lib/old/hit.wav", "hit.wav", "/lib", 100, 1, "2026-09-01");
        insert.run("new", "/lib/new/hit.wav", "hit.wav", "/lib", 100, 1, null);
        sqlite
          .prepare("INSERT INTO collections(id,name) VALUES ('c','Test')")
          .run();
        sqlite
          .prepare(
            "INSERT INTO file_collections(file_id,collection_id) VALUES ('old','c')",
          )
          .run();

        // Same name, same size, same duration is not identity. Relinking here
        // destroys the old record and hands its collections to a different
        // recording.
        expect(repository.reconcileMovedFiles()).toBe(0);
        expect(repository.getFileById("old")).not.toBeNull();
      } finally {
        sqlite.close();
      }
    },
  );

  it.fails("keeps a user exclusion through the next scan (B10)", () => {
    const sqlite: TestDatabase = createTestDatabase();
    try {
      const repository = new SqliteAudioFileRepository(sqlite);
      const now = new Date().toISOString();
      const record = audioFileRecord({ path: "/lib/gone.wav" });
      repository.batchUpsertFiles([record], now);

      repository.batchMarkRemoved([record.path], now, now);
      expect(repository.getFiles()).toHaveLength(0);

      // A rescan rediscovers the file on disk. Removal means the user excluded
      // it, so re-seeing the path must not silently re-admit it to the library.
      repository.batchUpsertFiles([record], new Date().toISOString());
      expect(
        repository.getFiles(),
        "a user exclusion came back on the next scan",
      ).toHaveLength(0);
    } finally {
      sqlite.close();
    }
  });

  it("rolls batch mutations back as a unit and stages only what it owns", async () => {
    const sqlite: TestDatabase = createTestDatabase();
    try {
      const repository = new SqliteAudioFileRepository(sqlite);
      const tags = new SqliteTagRepository(sqlite);
      const tagId = tags.createTag("Loud");
      repository.batchUpsertFiles(
        [0, 1, 2].map((index) =>
          audioFileRecord({ path: `/lib/file-${index}.wav` }),
        ),
        new Date().toISOString(),
      );
      const ids = repository.getFiles({ limit: 10 }).map((file) => file.id);

      repository.setFileTagBatch(ids, tagId, true);
      expect(
        tags.getTagsForFiles(ids).size,
        "a whole batch commits together",
      ).toBe(ids.length);

      expect(() =>
        repository.setFileTagBatch([...ids, "missing-id"], tagId, true),
      ).toThrow(/does not exist/);

      expect(() =>
        repository.setFavorites([...ids, "missing-id"], true),
      ).toThrow(/does not exist/);
      expect(
        repository.getFileCount({ favorites: true }),
        "one unknown id rolls the whole batch back",
      ).toBe(0);

      repository.setFavorites(ids, true);
      repository.setFavorites([ids[0]], false);
      expect(
        repository.getFileCount({ favorites: true }),
        "favourites take an explicit target state",
      ).toBe(ids.length - 1);
    } finally {
      sqlite.close();
    }
  });
});