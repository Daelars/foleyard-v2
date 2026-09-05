import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";

import { initializeDatabaseSchema } from "../migrations";
import { SqliteSettingsRepository } from "../settings-repository";

function createTestDb() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  initializeDatabaseSchema(sqlite);
  return sqlite;
}

function readRawSetting(sqlite: Database, key: string): string | null {
  const row = sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(key) as {
    value: string | null;
  } | undefined;
  return row?.value ?? null;
}

describe("SqliteSettingsRepository library roots", () => {
  let sqlite: Database;
  let repo: SqliteSettingsRepository;

  beforeEach(() => {
    sqlite = createTestDb();
    repo = new SqliteSettingsRepository(sqlite);
  });

  it("writes the legacy and current Library-root keys together", () => {
    repo.setLibraryRoots(["/new"]);

    expect(repo.getLibraryRoots()).toEqual(["/new"]);
    expect(repo.getLibraryRoot()).toBe("/new");
    expect(readRawSetting(sqlite, "libraryRoot")).toBe("/new");
    expect(readRawSetting(sqlite, "libraryRoots")).toBe(JSON.stringify(["/new"]));
  });

  it("a failed write leaves legacy and current keys consistent", () => {
    repo.setLibraryRoots(["/old"]);

    const internals = repo as unknown as { db: Record<string, unknown> };
    const db = internals.db;
    const originalInsert = (db["insert"] as (...args: unknown[]) => unknown).bind(db);
    let calls = 0;
    internals.db["insert"] = (...args: unknown[]) => {
      calls += 1;
      if (calls === 2) {
        throw new Error("simulated write failure");
      }
      return originalInsert(...args);
    };

    expect(() => repo.setLibraryRoots(["/new"])).toThrow("simulated write failure");

    expect(repo.getLibraryRoots()).toEqual(["/old"]);
    expect(repo.getLibraryRoot()).toBe("/old");
    expect(readRawSetting(sqlite, "libraryRoot")).toBe("/old");
    expect(readRawSetting(sqlite, "libraryRoots")).toBe(JSON.stringify(["/old"]));
  });
});
