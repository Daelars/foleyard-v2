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
import { SqliteCollectionRepository } from "@/lib/database/collection-repository";
import { SqliteMoveJournal } from "@/lib/database/move-journal";

// Area: data-loss prevention (#136, #274).
//
// The v1 Folder Janitor service case retired with the v1 tool: scan issue
// derivation lives in folder-janitor-v2 policy tests, and the delete-only-
// empty-folders contract (review plan, containment + emptiness recheck at
// delete time) lives in its handler tests. Everything here is irreversible
// against a user's actual sound library. Losing an assertion in this file
// costs somebody their files.
//
// Move reconciliation (#274) keeps organization data on the same recording:
// size+mtime identity decides a move, an ambiguous match is recorded rather
// than guessed, and a replacement never inherits a distinct recording's tags,
// embeddings, favourites, or Collections.

let library: ScratchLibrary;

beforeEach(() => {
  library = createScratchLibrary("foleyard-dataloss-");
});

afterEach(() => library.dispose());

function seedEmbedding(sqlite: TestDatabase, fileId: string, model = "m1") {
  sqlite
    .prepare("INSERT INTO file_embeddings (file_id, model, dim, vec) VALUES (?, ?, ?, ?)")
    .run(fileId, model, 3, Buffer.from([1, 2, 3]));
}

function embeddingModels(sqlite: TestDatabase, fileId: string): string[] {
  return (
    sqlite.prepare("SELECT model FROM file_embeddings WHERE file_id = ?").all(fileId) as Array<{
      model: string;
    }>
  ).map((row) => row.model);
}

describe("data-loss prevention", () => {
  it("keeps two distinct same-size recordings from inheriting each other (B02)", () => {
    const sqlite: TestDatabase = createTestDatabase();
    try {
      const repository = new SqliteAudioFileRepository(sqlite);
      const insert = sqlite.prepare(
        "INSERT INTO files (id,path,filename,library_root,file_size,mtime_ms,duration,removed_at) VALUES (?,?,?,?,?,?,?,?)",
      );
      // Same name, size and duration; the modification time is what tells
      // them apart. Matching on name/size/duration alone relinked the old
      // record and handed its Collections to a different recording.
      insert.run("old", "/lib/old/hit.wav", "hit.wav", "/lib", 100, 5_000, 1, "2026-09-01");
      insert.run("new", "/lib/new/hit.wav", "hit.wav", "/lib", 100, 6_000, 1, null);
      sqlite
        .prepare("INSERT INTO collections(id,name) VALUES ('c','Test')")
        .run();
      sqlite
        .prepare(
          "INSERT INTO file_collections(file_id,collection_id) VALUES ('old','c')",
        )
        .run();

      expect(repository.reconcileMovedFiles()).toEqual({ relinked: 0, ambiguous: 0 });
      expect(repository.getFileById("old")).not.toBeNull();
      expect(repository.getFileCount({ collectionId: "c" })).toBe(0);
    } finally {
      sqlite.close();
    }
  });

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

  it("relinks a confirmed move and carries its organization data (#274)", () => {
    const sqlite: TestDatabase = createTestDatabase();
    try {
      const repository = new SqliteAudioFileRepository(sqlite);
      const tags = new SqliteTagRepository(sqlite);
      const collections = new SqliteCollectionRepository(sqlite);
      const now = new Date().toISOString();
      const oldPath = "/lib/a/hit.wav";
      const newPath = "/lib/b/hit.wav";

      repository.batchUpsertFiles(
        [audioFileRecord({ path: oldPath, fileSize: 2048, mtimeMs: 9_000 })],
        now,
      );
      repository.batchUpsertFiles(
        [audioFileRecord({ path: newPath, fileSize: 2048, mtimeMs: 9_000 })],
        now,
      );
      const oldFile = repository.getFileByPath(oldPath)!;
      const newFile = repository.getFileByPath(newPath)!;
      repository.batchMarkRemoved([oldPath], now, now);

      const tagId = tags.createTag("kick");
      tags.attachTagToFile(oldFile.id, tagId);
      const collectionId = collections.createCollection("Session");
      collections.attachFileToCollection(oldFile.id, collectionId);
      repository.toggleFavorite(oldFile.id);
      seedEmbedding(sqlite, oldFile.id);

      const result = repository.reconcileMovedFiles();

      expect(result).toEqual({ relinked: 1, ambiguous: 0 });
      expect(repository.getFileById(oldFile.id), "the moved row is retired").toBeNull();

      const moved = repository.getFileById(newFile.id)!;
      expect(moved.path).toBe(newPath);
      expect(moved.isFavorite, "the favourite follows the recording").toBe(true);
      expect(tags.getTagsForFile(newFile.id).map((tag) => tag.name)).toEqual(["kick"]);
      expect(repository.getFileCount({ collectionId })).toBe(1);
      expect(embeddingModels(sqlite, newFile.id)).toEqual(["m1"]);
      expect(repository.getFileById(newFile.id)!.removedAt).toBeNull();
      expect(new SqliteMoveJournal(sqlite).list()).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("does not relink a same-size replacement whose mtime moved (#274)", () => {
    const sqlite: TestDatabase = createTestDatabase();
    try {
      const repository = new SqliteAudioFileRepository(sqlite);
      const tags = new SqliteTagRepository(sqlite);
      const now = new Date().toISOString();
      const oldPath = "/lib/a/hit.wav";
      const newPath = "/lib/b/hit.wav";

      repository.batchUpsertFiles(
        [audioFileRecord({ path: oldPath, fileSize: 2048, mtimeMs: 9_000 })],
        now,
      );
      repository.batchUpsertFiles(
        [audioFileRecord({ path: newPath, fileSize: 2048, mtimeMs: 9_500 })],
        now,
      );
      const oldFile = repository.getFileByPath(oldPath)!;
      const newFile = repository.getFileByPath(newPath)!;
      repository.batchMarkRemoved([oldPath], now, now);

      const tagId = tags.createTag("kick");
      tags.attachTagToFile(oldFile.id, tagId);
      repository.toggleFavorite(oldFile.id);
      seedEmbedding(sqlite, oldFile.id);

      expect(repository.reconcileMovedFiles()).toEqual({ relinked: 0, ambiguous: 0 });

      // Fail closed: the replacement is a distinct recording. It inherits
      // nothing, and the removed row keeps its organization data.
      expect(repository.getFileById(oldFile.id), "the removed row is kept").not.toBeNull();
      expect(tags.getTagsForFile(oldFile.id).map((tag) => tag.name)).toEqual(["kick"]);
      expect(tags.getTagsForFile(newFile.id)).toEqual([]);
      expect(repository.getFileById(newFile.id)!.isFavorite).toBe(false);
      expect(embeddingModels(sqlite, newFile.id)).toEqual([]);
      expect(embeddingModels(sqlite, oldFile.id)).toEqual(["m1"]);
      expect(new SqliteMoveJournal(sqlite).list()).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("does not use an already-indexed unchanged file as a move target (#274)", () => {
    const sqlite: TestDatabase = createTestDatabase();
    try {
      const repository = new SqliteAudioFileRepository(sqlite);
      const now = new Date().toISOString();

      repository.batchUpsertFiles(
        [audioFileRecord({ path: "/lib/a/hit.wav", fileSize: 2048, mtimeMs: 9_000 })],
        now,
      );
      repository.batchUpsertFiles(
        [audioFileRecord({ path: "/lib/b/hit.wav", fileSize: 2048, mtimeMs: 9_000 })],
        now,
      );
      const oldFile = repository.getFileByPath("/lib/a/hit.wav")!;
      const survivor = repository.getFileByPath("/lib/b/hit.wav")!;
      repository.batchMarkRemoved([oldFile.path], now, now);

      // The scan added nothing this pass: there is no new path to move onto,
      // so the unchanged survivor is not treated as the moved recording.
      expect(repository.reconcileMovedFiles([])).toEqual({ relinked: 0, ambiguous: 0 });
      expect(repository.getFileById(oldFile.id)).not.toBeNull();

      // Naming the file the scan added confirms the move.
      expect(repository.reconcileMovedFiles([survivor.id])).toEqual({
        relinked: 1,
        ambiguous: 0,
      });
      expect(repository.getFileById(oldFile.id)).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it("does not treat the same size and mtime under a different root as a move (#274)", () => {
    const sqlite: TestDatabase = createTestDatabase();
    try {
      const repository = new SqliteAudioFileRepository(sqlite);
      const now = new Date().toISOString();

      repository.batchUpsertFiles(
        [audioFileRecord({ path: "/libA/hit.wav", fileSize: 2048, mtimeMs: 9_000 })],
        now,
      );
      repository.batchUpsertFiles(
        [audioFileRecord({ path: "/libB/hit.wav", fileSize: 2048, mtimeMs: 9_000 })],
        now,
      );
      const oldFile = repository.getFileByPath("/libA/hit.wav")!;
      const otherRoot = repository.getFileByPath("/libB/hit.wav")!;
      sqlite.prepare("UPDATE files SET library_root = '/libA' WHERE id = ?").run(oldFile.id);
      sqlite.prepare("UPDATE files SET library_root = '/libB' WHERE id = ?").run(otherRoot.id);
      repository.batchMarkRemoved([oldFile.path], now, now);

      expect(repository.reconcileMovedFiles()).toEqual({ relinked: 0, ambiguous: 0 });
      expect(repository.getFileById(oldFile.id)).not.toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it("fails closed on an ambiguous match and records it for reconciliation (#274)", () => {
    const sqlite: TestDatabase = createTestDatabase();
    try {
      const repository = new SqliteAudioFileRepository(sqlite);
      const tags = new SqliteTagRepository(sqlite);
      const journal = new SqliteMoveJournal(sqlite);
      const now = new Date().toISOString();

      repository.batchUpsertFiles(
        [audioFileRecord({ path: "/lib/a/hit.wav", fileSize: 2048, mtimeMs: 9_000 })],
        now,
      );
      // Two active files match the removed identity: a coin flip must not
      // hand the removed recording's data to either one.
      repository.batchUpsertFiles(
        [
          audioFileRecord({ path: "/lib/b/hit.wav", fileSize: 2048, mtimeMs: 9_000 }),
          audioFileRecord({ path: "/lib/c/hit.wav", fileSize: 2048, mtimeMs: 9_000 }),
        ],
        now,
      );
      const oldFile = repository.getFileByPath("/lib/a/hit.wav")!;
      const first = repository.getFileByPath("/lib/b/hit.wav")!;
      const second = repository.getFileByPath("/lib/c/hit.wav")!;
      repository.batchMarkRemoved([oldFile.path], now, now);
      const tagId = tags.createTag("kick");
      tags.attachTagToFile(oldFile.id, tagId);

      expect(repository.reconcileMovedFiles()).toEqual({ relinked: 0, ambiguous: 1 });

      const recorded = journal.list();
      expect(recorded).toHaveLength(1);
      expect(recorded[0].removedFileId).toBe(oldFile.id);
      expect(recorded[0].candidateFileIds.sort()).toEqual([first.id, second.id].sort());

      // Nothing was inherited and nothing was destroyed.
      expect(tags.getTagsForFile(oldFile.id).map((tag) => tag.name)).toEqual(["kick"]);
      expect(tags.getTagsForFile(first.id)).toEqual([]);
      expect(tags.getTagsForFile(second.id)).toEqual([]);
      expect(repository.getFileById(oldFile.id)).not.toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it("treats one candidate claimed by two removed paths as ambiguous (#274)", () => {
    const sqlite: TestDatabase = createTestDatabase();
    try {
      const repository = new SqliteAudioFileRepository(sqlite);
      const journal = new SqliteMoveJournal(sqlite);
      const now = new Date().toISOString();

      repository.batchUpsertFiles(
        [
          audioFileRecord({ path: "/lib/a/hit.wav", fileSize: 2048, mtimeMs: 9_000 }),
          audioFileRecord({ path: "/lib/b/hit.wav", fileSize: 2048, mtimeMs: 9_000 }),
        ],
        now,
      );
      repository.batchUpsertFiles(
        [audioFileRecord({ path: "/lib/merged/hit.wav", fileSize: 2048, mtimeMs: 9_000 })],
        now,
      );
      const first = repository.getFileByPath("/lib/a/hit.wav")!;
      const second = repository.getFileByPath("/lib/b/hit.wav")!;
      repository.batchMarkRemoved([first.path, second.path], now, now);

      expect(repository.reconcileMovedFiles()).toEqual({ relinked: 0, ambiguous: 2 });
      expect(journal.list().map((entry) => entry.removedFileId).sort()).toEqual(
        [first.id, second.id].sort(),
      );
      expect(repository.getFileById(first.id)).not.toBeNull();
      expect(repository.getFileById(second.id)).not.toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it("never relinks when the recorded identity is unknown (#274)", () => {
    const sqlite: TestDatabase = createTestDatabase();
    try {
      const repository = new SqliteAudioFileRepository(sqlite);
      const insert = sqlite.prepare(
        "INSERT INTO files (id,path,filename,library_root,file_size,mtime_ms,removed_at) VALUES (?,?,?,?,?,?,?)",
      );
      insert.run("old", "/lib/old/hit.wav", "hit.wav", "/lib", 100, null, "2026-09-01");
      insert.run("new", "/lib/new/hit.wav", "hit.wav", "/lib", 100, null, null);

      expect(repository.reconcileMovedFiles()).toEqual({ relinked: 0, ambiguous: 0 });
      expect(repository.getFileById("old")).not.toBeNull();
    } finally {
      sqlite.close();
    }
  });

  it("clears a recorded ambiguity once it resolves (#274)", () => {
    const sqlite: TestDatabase = createTestDatabase();
    try {
      const repository = new SqliteAudioFileRepository(sqlite);
      const journal = new SqliteMoveJournal(sqlite);
      const now = new Date().toISOString();

      repository.batchUpsertFiles(
        [audioFileRecord({ path: "/lib/a/hit.wav", fileSize: 2048, mtimeMs: 9_000 })],
        now,
      );
      repository.batchUpsertFiles(
        [
          audioFileRecord({ path: "/lib/b/hit.wav", fileSize: 2048, mtimeMs: 9_000 }),
          audioFileRecord({ path: "/lib/c/hit.wav", fileSize: 2048, mtimeMs: 9_000 }),
        ],
        now,
      );
      const oldFile = repository.getFileByPath("/lib/a/hit.wav")!;
      const second = repository.getFileByPath("/lib/c/hit.wav")!;
      repository.batchMarkRemoved([oldFile.path], now, now);
      expect(repository.reconcileMovedFiles()).toEqual({ relinked: 0, ambiguous: 1 });
      expect(journal.list()).toHaveLength(1);

      // One candidate is re-touched on disk (its mtime moves), so it no
      // longer looks like the removed identity: the match is unique again.
      sqlite.prepare("UPDATE files SET mtime_ms = 1234 WHERE id = ?").run(second.id);

      expect(repository.reconcileMovedFiles()).toEqual({ relinked: 1, ambiguous: 0 });
      expect(journal.list()).toEqual([]);
      expect(repository.getFileById(oldFile.id), "the move is now resolved").toBeNull();
    } finally {
      sqlite.close();
    }
  });
});
