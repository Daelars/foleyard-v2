#!/usr/bin/env bun
/**
 * Runnable query-library demo: inserts 3 fixture rows into a disposable
 * in-memory SQLite database, runs a filename LIKE query plus ordering,
 * asserts results, prints rows, and closes the DB.
 *
 * Uses direct SQL matching the app's query contracts (LIKE filter on
 * filename, ORDER BY filename). The app-internal adapter
 * (SqliteAudioFileRepository in src/lib/database/) is NOT imported here;
 * see the README for that labelling.
 */

import Database from "better-sqlite3";

function fail(message: string): never {
  console.error(`FAIL: ${message}`);
  process.exit(1);
}

type Row = { id: string; filename: string; path: string };

const db = new Database(":memory:");
try {
  db.exec(`
    CREATE TABLE files (
      id TEXT PRIMARY KEY,
      filename TEXT NOT NULL,
      path TEXT NOT NULL
    );
  `);

  const insert = db.prepare(
    "INSERT INTO files (id, filename, path) VALUES (?, ?, ?)",
  );
  const fixtures: Row[] = [
    { id: "f1", filename: "kick.wav", path: "/lib/kick.wav" },
    { id: "f2", filename: "snare.wav", path: "/lib/snare.wav" },
    { id: "f3", filename: "kick-loop.wav", path: "/lib/kick-loop.wav" },
  ];
  for (const row of fixtures) insert.run(row.id, row.filename, row.path);

  // Filter: filename LIKE '%kick%' (same shape as the app's search filter).
  const filtered = db
    .prepare("SELECT id, filename, path FROM files WHERE filename LIKE ? ORDER BY filename ASC")
    .all("%kick%") as Row[];
  if (filtered.length !== 2) {
    fail(`LIKE query should return 2 rows, got ${filtered.length}`);
  }
  if (filtered[0]!.filename !== "kick-loop.wav" || filtered[1]!.filename !== "kick.wav") {
    fail(`ordering mismatch, got ${JSON.stringify(filtered.map((r) => r.filename))}`);
  }

  // Full listing sorted descending.
  const sorted = db
    .prepare("SELECT id, filename, path FROM files ORDER BY filename DESC")
    .all() as Row[];
  const names = sorted.map((r) => r.filename);
  const expected = ["snare.wav", "kick.wav", "kick-loop.wav"];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    fail(`desc sort mismatch, got ${JSON.stringify(names)}`);
  }

  console.log("filtered (LIKE '%kick%' ASC):");
  for (const row of filtered) console.log(`  ${row.id} ${row.filename} ${row.path}`);
  console.log("all (DESC):");
  for (const row of sorted) console.log(`  ${row.id} ${row.filename} ${row.path}`);
  console.log("query-library example: assertions passed (3 fixtures, LIKE filter, ordering).");
} finally {
  db.close();
}
