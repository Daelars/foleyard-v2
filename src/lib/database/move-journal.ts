import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { sqlite as defaultSqlite } from "./connection";
import * as schema from "@/lib/schema";

import type Database from "better-sqlite3";

/**
 * A move reconciliation the scan refused to guess (#274).
 *
 * When a removed path's size+mtime identity matches more than one active
 * file in a root, or one active file is matched by more than one removed
 * path, the result is recorded here instead of copying organization data
 * onto one of the candidates. The removed row and its data stay put, so
 * nothing is lost and nothing is inherited on a coin flip. Resolution is an
 * explicit, user-initiated confirmation; a scan never hashes content.
 */
export type AmbiguousMove = {
  removedFileId: string;
  path: string;
  libraryRoot: string | null;
  fileSize: number | null;
  mtimeMs: number | null;
  candidateFileIds: string[];
  candidateCount: number;
  createdAt: string;
};

export type AmbiguousMoveInput = Omit<AmbiguousMove, "candidateCount" | "createdAt"> & {
  createdAt?: string;
};

export class SqliteMoveJournal {
  private sqlite: Database;
  private db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(sqlite: Database) {
    this.sqlite = sqlite;
    this.db = drizzle(sqlite, { schema });
  }

  /**
   * Replace the recorded set with the ambiguities from this reconciliation
   * pass. Ambiguity is re-derived from the index on every scan, so an entry
   * whose match resolved must disappear with it.
   */
  replace(entries: AmbiguousMoveInput[]): void {
    const write = this.sqlite.transaction((rows: AmbiguousMoveInput[]) => {
      this.db.delete(schema.ambiguousMoves).run();
      for (const entry of rows) {
        this.db
          .insert(schema.ambiguousMoves)
          .values({
            removedFileId: entry.removedFileId,
            path: entry.path,
            libraryRoot: entry.libraryRoot,
            fileSize: entry.fileSize,
            mtimeMs: entry.mtimeMs,
            candidateFileIds: JSON.stringify(entry.candidateFileIds),
            candidateCount: entry.candidateFileIds.length,
            createdAt: entry.createdAt ?? new Date().toISOString(),
          })
          .run();
      }
    });
    write(entries);
  }

  list(): AmbiguousMove[] {
    return this.db
      .select()
      .from(schema.ambiguousMoves)
      .all()
      .map((row) => ({
        removedFileId: row.removedFileId,
        path: row.path,
        libraryRoot: row.libraryRoot,
        fileSize: row.fileSize,
        mtimeMs: row.mtimeMs,
        candidateFileIds: parseCandidateIds(row.candidateFileIds),
        candidateCount: row.candidateCount,
        createdAt: row.createdAt,
      }));
  }

  /** Drop recorded ambiguities by their removed file id. */
  clear(removedFileIds: string[]): void {
    if (removedFileIds.length === 0) return;
    this.db
      .delete(schema.ambiguousMoves)
      .where(inArray(schema.ambiguousMoves.removedFileId, removedFileIds))
      .run();
  }
}

function parseCandidateIds(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

let _journal: SqliteMoveJournal | null = null;

function getJournal(): SqliteMoveJournal {
  if (!_journal) {
    _journal = new SqliteMoveJournal(defaultSqlite as unknown as Database);
  }
  return _journal;
}

export const listAmbiguousMoves = () => getJournal().list();
export const clearAmbiguousMoves = (removedFileIds: string[]) => getJournal().clear(removedFileIds);
