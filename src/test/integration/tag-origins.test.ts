import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";

import { createTestDatabase, audioFileRecord, type TestDatabase } from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";
import {
  CURRENT_SCHEMA_VERSION,
  getDatabaseVersionInfo,
  initializeDatabaseSchema,
} from "@/lib/database/migrations";

// Area: auto-tag slice 1 (#189). Attachments remember how they got there so
// automatic tags stay revertible by origin and manual tags stay untouchable.
describe("tag origin storage", () => {
  let sqlite: TestDatabase;
  let tags: SqliteTagRepository;

  beforeEach(() => {
    sqlite = createTestDatabase();
    tags = new SqliteTagRepository(sqlite);
  });

  afterEach(() => {
    sqlite.close();
  });

  it("fresh databases carry origin columns defaulting to manual", () => {
    const columns = sqlite
      .prepare("PRAGMA table_info(file_tags)")
      .all() as Array<{ name: string }>;
    expect(columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["file_id", "tag_id", "origin", "confidence", "created_at"]),
    );

    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    expect(tables.map((table) => table.name)).toEqual(
      expect.arrayContaining(["tag_aliases", "file_embeddings"]),
    );

    expect(CURRENT_SCHEMA_VERSION).toBe(2);
    expect(getDatabaseVersionInfo(sqlite).appliedVersion).toBe(2);
  });

  it("upgrades a version-1 database without losing attachments", () => {
    const legacy = new Database(":memory:");
    try {
      legacy.exec(`
        CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT,
          updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE files (id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE,
          filename TEXT NOT NULL, library_root TEXT, directory TEXT, format TEXT,
          codec TEXT, duration REAL, sample_rate INTEGER, bit_depth INTEGER,
          channels INTEGER, file_size INTEGER, mtime_ms INTEGER,
          is_favorite INTEGER DEFAULT 0, removed_at TEXT, last_scanned_at TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE tags (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE,
          color TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
        CREATE TABLE file_tags (
          file_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          PRIMARY KEY (file_id, tag_id),
          FOREIGN KEY (file_id) REFERENCES files(id),
          FOREIGN KEY (tag_id) REFERENCES tags(id)
        );
        CREATE TABLE collections (id TEXT PRIMARY KEY, name TEXT NOT NULL,
          color TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          is_smart INTEGER DEFAULT 0, filter TEXT);
        CREATE TABLE file_collections (file_id TEXT NOT NULL,
          collection_id TEXT NOT NULL,
          PRIMARY KEY (file_id, collection_id));
        INSERT INTO files (id, path, filename) VALUES ('f1', '/lib/rain.wav', 'rain.wav');
        INSERT INTO tags (id, name) VALUES ('t1', 'rain');
        INSERT INTO file_tags (file_id, tag_id) VALUES ('f1', 't1');
      `);

      initializeDatabaseSchema(legacy);

      const legacyTags = new SqliteTagRepository(legacy);
      expect(legacyTags.getTagsForFile("f1").map((tag) => tag.name)).toEqual(["rain"]);
      const attachments = legacyTags.getAttachmentsForFile("f1");
      expect(attachments).toEqual([
        { fileId: "f1", tagId: "t1", origin: "manual", confidence: null },
      ]);
      expect(getDatabaseVersionInfo(legacy).appliedVersion).toBe(2);
    } finally {
      legacy.close();
    }
  });

  function seedFile(filename: string): string {
    const repo = new SqliteAudioFileRepository(sqlite);
    repo.batchUpsertFiles(
      [audioFileRecord({ path: `/lib/${filename}`, filename })],
      new Date().toISOString(),
    );
    return repo.getFiles({ limit: 10 })[0]!.id;
  }

  it("a plain attach counts as manual", () => {
    const fileId = seedFile("kick.wav");
    const tagId = tags.createTag("kick");
    tags.attachTagToFile(fileId, tagId);
    expect(tags.getAttachmentsForFile(fileId)).toEqual([
      { fileId, tagId, origin: "manual", confidence: null },
    ]);
  });

  it("manual wins whichever order the writes arrive in", () => {
    const first = seedFile("a.wav");
    const second = seedFile("b.wav");
    const tagId = tags.createTag("hit");

    tags.attachTagToFileWithOrigin(first, tagId, "deterministic");
    tags.attachTagToFile(first, tagId);
    expect(tags.getAttachmentsForFile(first)[0]?.origin).toBe("manual");

    tags.attachTagToFile(second, tagId);
    tags.attachTagToFileWithOrigin(second, tagId, "semantic_ai", 0.9);
    expect(tags.getAttachmentsForFile(second)[0]?.origin).toBe("manual");
  });

  it("semantic attaches keep their confidence and revert by origin", () => {
    const fileId = seedFile("rain.wav");
    const weather = tags.createTag("weather");
    const rain = tags.createTag("rain");
    tags.attachTagToFileWithOrigin(fileId, weather, "semantic_ai", 0.83);
    tags.attachTagToFileWithOrigin(fileId, rain, "deterministic");

    expect(tags.getAttachmentsForFile(fileId)).toEqual(
      expect.arrayContaining([
        { fileId, tagId: weather, origin: "semantic_ai", confidence: 0.83 },
      ]),
    );

    expect(tags.detachAttachmentsByOrigin("semantic_ai")).toBe(1);
    expect(tags.getTagsForFile(fileId).map((tag) => tag.name)).toEqual(["rain"]);
    expect(tags.detachAttachmentsByOrigin("semantic_ai")).toBe(0);
  });

  it("aliases survive a merge and resolve to the surviving tag", () => {
    const oldId = tags.createTag("door-slam");
    const newId = tags.createTag("door");
    // Merge procedure: record the loser name against the survivor, then delete the loser.
    tags.addTagAlias(newId, "Door-Slam ");
    tags.deleteTag(oldId);
    expect(tags.resolveTagAlias("door-slam")).toBe(newId);
    expect(tags.resolveTagAlias("missing")).toBeNull();
  });
});
