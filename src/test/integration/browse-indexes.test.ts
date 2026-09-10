import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { initializeDatabaseSchema } from "@/lib/database/migrations";

// Area: #255. The migration path adds partial indexes for duration order
// (including null placement) and library-root plus directory lookups, and
// the browse queries use them without temp sorts.

function queryPlan(sqlite: Database.Database, sql: string): string {
  return sqlite
    .prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .all()
    .map((row) => (row as { detail: string }).detail)
    .join(" | ");
}

describe("browse indexes", () => {
  it("serves duration order and directory browse from the new indexes", () => {
    const sqlite = new Database(":memory:");
    initializeDatabaseSchema(sqlite);
    const insert = sqlite.prepare(
      `INSERT INTO files (id, path, filename, library_root, directory, format, duration, file_size, mtime_ms, removed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    sqlite.transaction(() => {
      for (let i = 0; i < 3000; i += 1) {
        insert.run(
          `f${String(i).padStart(5, "0")}`,
          `/lib/dir${i % 25}/clip${i}.wav`,
          `clip-${String((i * 131) % 1000).padStart(4, "0")}.wav`,
          "/lib",
          `/dir${i % 25}`,
          "wav",
          i % 9 === 0 ? null : 1 + (i % 300),
          1024,
          1_700_000_000_000,
          null,
        );
      }
    })();
    sqlite.exec("ANALYZE;");

    const asc = queryPlan(
      sqlite,
      "SELECT id, filename, duration, file_size FROM files WHERE removed_at IS NULL ORDER BY duration ASC NULLS LAST, filename ASC, id ASC LIMIT 100",
    );
    expect(asc).toContain("idx_files_active_duration");
    expect(asc).not.toContain("TEMP B-TREE");

    const desc = queryPlan(
      sqlite,
      "SELECT id, filename, duration, file_size FROM files WHERE removed_at IS NULL ORDER BY duration DESC NULLS FIRST, filename DESC, id DESC LIMIT 100",
    );
    expect(desc).toContain("idx_files_active_duration");
    expect(desc).not.toContain("TEMP B-TREE");

    const directories = queryPlan(
      sqlite,
      "SELECT DISTINCT directory FROM files WHERE library_root = '/lib' AND directory IS NOT NULL AND removed_at IS NULL",
    );
    expect(directories).toContain("idx_files_active_root_directory");
    expect(directories).not.toContain("TEMP B-TREE");

    // Behaviour: null durations sort last ascending, first descending.
    const repository = new SqliteAudioFileRepository(sqlite);
    const ascending = repository.getFiles({
      sortKey: "duration",
      sortDir: "asc",
      showRemoved: false,
      limit: 5000,
    });
    const firstNull = ascending.findIndex((file) => file.duration === null);
    expect(firstNull, "the fixture has null durations").toBeGreaterThan(0);
    expect(
      ascending.slice(firstNull).every((file) => file.duration === null),
      "all null durations are last ascending",
    ).toBe(true);
    const nonNull = ascending
      .slice(0, firstNull)
      .map((file) => file.duration as number);
    expect([...nonNull].sort((a, b) => a - b)).toEqual(nonNull);

    const descending = repository.getFiles({
      sortKey: "duration",
      sortDir: "desc",
      showRemoved: false,
      limit: 5000,
    });
    const lastNull = descending.findIndex((file) => file.duration !== null);
    expect(lastNull, "null durations are first descending").toBeGreaterThan(0);
    expect(descending.slice(0, lastNull).every((file) => file.duration === null)).toBe(true);
    expect(descending.slice(lastNull).every((file) => file.duration !== null)).toBe(true);

    sqlite.close();
  });

  it("keeps the indexes idempotent on an existing database", () => {
    const sqlite = new Database(":memory:");
    initializeDatabaseSchema(sqlite);
    initializeDatabaseSchema(sqlite);
    const names = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(names).toContain("idx_files_active_duration");
    expect(names).toContain("idx_files_active_root_directory");
    sqlite.close();
  });
});
