import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/test/fixtures";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { initializeDatabaseSchema } from "@/lib/database/migrations";
import { escapeLikePattern } from "@/lib/database/sql-parameters";

// Area: #251. Filename search runs through the FTS5 trigram index when it is
// available, with LIKE-identical results, and stays in sync with the files
// table across insert/update/remove.

const NAMES = [
  "Kick Drum.wav",
  "kick_soft.wav",
  "Rimshot 50%.wav",
  "snare_50_off.wav",
  "back\\slash.wav",
  "Über Crash.wav",
  "Rain Loop.wav",
  "kick.wav",
];

function likeMatches(sqlite: TestDatabase, query: string): string[] {
  return (
    sqlite
      .prepare(
        "SELECT id FROM files WHERE filename LIKE ? ESCAPE '\\' AND removed_at IS NULL ORDER BY filename, id",
      )
      .all(`%${escapeLikePattern(query)}%`) as Array<{ id: string }>
  ).map((row) => row.id);
}

function ftsMatches(sqlite: TestDatabase, query: string): string[] {
  return (
    sqlite
      .prepare(
        "SELECT f.id FROM files f WHERE f.rowid IN (SELECT rowid FROM files_fts WHERE files_fts MATCH ?) AND f.removed_at IS NULL ORDER BY f.filename, f.id",
      )
      .all(`"${query.replace(/"/g, '""')}"`) as Array<{ id: string }>
  ).map((row) => row.id);
}

describe("filename FTS search", () => {
  let sqlite: TestDatabase;
  let files: SqliteAudioFileRepository;

  beforeEach(() => {
    sqlite = createTestDatabase();
    files = new SqliteAudioFileRepository(sqlite);
    const insert = sqlite.prepare(
      `INSERT INTO files (id, path, filename, library_root, format, file_size, mtime_ms, removed_at)
       VALUES (?, ?, ?, '/lib', 'wav', 100, 1, ?)`,
    );
    NAMES.forEach((filename, index) => {
      insert.run(`f${index}`, `/lib/${filename}`, filename, null);
    });
  });

  afterEach(() => {
    sqlite.close();
  });

  it("returns LIKE-identical results across punctuation, case and unicode", () => {
    for (const query of ["kick", "KICK", "50%", "50_off", "\\", "crash", "loop", "k"]) {
      expect(likeMatches(sqlite, query).length, `LIKE fixture for ${query}`).toBeGreaterThan(0);
      if (query.length >= 3) {
        expect(ftsMatches(sqlite, query), `FTS parity for ${query}`).toEqual(
          likeMatches(sqlite, query),
        );
      }
    }

    // Non-ASCII queries stay on the LIKE path, so parity holds by construction.
    expect(
      files.getFiles({ query: "Über", limit: 10 }).map((file) => file.filename),
    ).toEqual(["Über Crash.wav"]);
  });

  it("routes repository search and smart counts through the index path", () => {
    const search = files.getFiles({ query: "kick", limit: 100 });
    expect(search.map((file) => file.filename).sort()).toEqual([
      "Kick Drum.wav",
      "kick.wav",
      "kick_soft.wav",
    ]);
    expect(files.getFileCount({ query: "kick" })).toBe(3);

    const plan = sqlite
      .prepare(
        "EXPLAIN QUERY PLAN SELECT f.id FROM files f WHERE f.rowid IN (SELECT rowid FROM files_fts WHERE files_fts MATCH '\"kick\"') AND f.removed_at IS NULL",
      )
      .all() as Array<{ detail: string }>;
    expect(plan.map((row) => row.detail).join(" | ")).toContain("files_fts");
  });

  it("keeps the index in sync across insert, update and removal", () => {
    const id = files.getFiles({ query: "rimshot", limit: 10 })[0]!.id;
    expect(id).toBeTruthy();

    // Rename via upsert (new path, same file id is not possible; the scan
    // updates the filename on the same path).
    const existing = sqlite.prepare("SELECT path FROM files WHERE id = ?").get(id) as {
      path: string;
    };
    sqlite
      .prepare("UPDATE files SET filename = ? WHERE id = ?")
      .run("Rimshot 50 percent.wav", id);
    expect(files.getFiles({ query: "rimshot", limit: 10 }).map((file) => file.path)).toEqual([
      existing.path,
    ]);
    expect(files.getFiles({ query: "50 p", limit: 10 }).map((file) => file.path)).toEqual([
      existing.path,
    ]);

    files.batchMarkRemoved([existing.path], "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    expect(files.getFiles({ query: "50 p", limit: 10 })).toHaveLength(0);
  });

  it("backfills an existing library on a fresh index", () => {
    const legacy = createTestDatabase();
    try {
      legacy.exec("DROP TABLE files_fts");
      legacy.exec("DROP TRIGGER IF EXISTS files_fts_ai");
      legacy.exec("DROP TRIGGER IF EXISTS files_fts_ad");
      legacy.exec("DROP TRIGGER IF EXISTS files_fts_au");
      legacy
        .prepare(
          `INSERT INTO files (id, path, filename, library_root, format, file_size, mtime_ms, removed_at)
           VALUES ('old', '/lib/Old Bell.wav', 'Old Bell.wav', '/lib', 'wav', 100, 1, NULL)`,
        )
        .run();

      initializeDatabaseSchema(legacy);

      const found = (
        legacy
          .prepare(
            "SELECT f.id FROM files f WHERE f.rowid IN (SELECT rowid FROM files_fts WHERE files_fts MATCH '\"bell\"')",
          )
          .all() as Array<{ id: string }>
      ).map((row) => row.id);
      expect(found).toEqual(["old"]);
    } finally {
      legacy.close();
    }
  });
});
