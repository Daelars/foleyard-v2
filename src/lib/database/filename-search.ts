import { sql } from "drizzle-orm";

import { filenameLike } from "./sql-parameters";

import type Database from "better-sqlite3";

/**
 * Filename substring search (#251).
 *
 * The FTS5 trigram index (`files_fts`, external content over `files`)
 * answers substring matches case-insensitively without scanning the table;
 * queries shorter than three characters cannot use trigram tokens and keep
 * the LIKE path, as does any database without the index (FTS5 unavailable,
 * or a fixture that initialised before the index existed). LIKE semantics —
 * literal `%`, `_` and the escape character — are preserved on both paths.
 */

const TRIGRAM_MIN_LENGTH = 3;

const ftsAvailability = new WeakMap<Database, boolean>();

export function hasFilenameFts(sqlite: Database): boolean {
  const cached = ftsAvailability.get(sqlite);
  if (cached !== undefined) return cached;
  let available = false;
  try {
    available =
      sqlite
        .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'files_fts'")
        .get() !== undefined;
  } catch {
    available = false;
  }
  ftsAvailability.set(sqlite, available);
  return available;
}

/** FTS5 MATCH phrase: quoted so operators and punctuation stay literal. */
export function ftsMatchPhrase(query: string): string {
  return `"${query.replace(/"/g, '""')}"`;
}

/**
 * True for printable-ASCII queries. SQLite's LIKE folds ASCII case only, so
 * non-ASCII queries stay on the LIKE path where folding semantics are
 * identical by construction.
 */
function isAsciiQuery(query: string): boolean {
  for (let index = 0; index < query.length; index += 1) {
    if (query.charCodeAt(index) > 0x7f) return false;
  }
  return true;
}

/** Filename substring predicate: FTS5 when usable, LIKE otherwise. */
export function filenameSearch(sqlite: Database, query: string) {
  if (query.length >= TRIGRAM_MIN_LENGTH && isAsciiQuery(query) && hasFilenameFts(sqlite)) {
    return sql`files.rowid IN (SELECT rowid FROM files_fts WHERE files_fts MATCH ${ftsMatchPhrase(query)})`;
  }
  return filenameLike(query);
}
