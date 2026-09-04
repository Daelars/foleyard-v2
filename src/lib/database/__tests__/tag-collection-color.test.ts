import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";

import { initializeDatabaseSchema } from "../migrations";
import { SqliteTagRepository } from "../tag-repository";
import { SqliteCollectionRepository } from "../collection-repository";

function createLegacyDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  initializeDatabaseSchema(sqlite);
  return sqlite;
}

describe("tag and collection colors", () => {
  let sqlite: Database.Database;
  let tags: SqliteTagRepository;
  let collections: SqliteCollectionRepository;

  beforeEach(() => {
    sqlite = createLegacyDb();
    tags = new SqliteTagRepository(sqlite);
    collections = new SqliteCollectionRepository(sqlite);
  });

  it("migrates legacy tables with color columns", () => {
    const columns = (table: string) =>
      (
        sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
      ).map((column) => column.name);

    expect(columns("tags")).toContain("color");
    expect(columns("collections")).toContain("color");
  });

  it("round-trips tag colors", () => {
    const id = tags.createTag("impact");
    expect(tags.getAllTags()[0].color).toBeNull();

    tags.updateTagColor(id, "#f0503c");
    expect(tags.getAllTags()[0].color).toBe("#f0503c");

    tags.updateTagColor(id, null);
    expect(tags.getAllTags()[0].color).toBeNull();
  });

  it("round-trips collection colors through getAllCollections", () => {
    const id = collections.createCollection("Impacts");
    collections.updateCollectionColor(id, "#7ab8ff");

    const found = collections.getAllCollections().find((c) => c.id === id);
    expect(found?.color).toBe("#7ab8ff");
  });
});
