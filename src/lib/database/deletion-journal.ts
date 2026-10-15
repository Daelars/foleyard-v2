import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { sqlite as defaultSqlite } from "./connection";
import * as schema from "@/lib/schema";

import type Database from "better-sqlite3";

/**
 * One irreversible deletion the app has committed to but not finished.
 *
 * A row is written and committed before the file is unlinked and cleared
 * only after the Library index has caught up. `fileSize`/`mtimeMs` are the
 * identity the row was validated against, so recovery can tell "the unlink
 * never ran" from "the path has moved on since".
 */
export type PendingDeletion = {
  path: string;
  fileId: string;
  fileSize: number | null;
  mtimeMs: number | null;
  createdAt: string;
};

export class SqliteDeletionJournal {
  private sqlite: Database;
  private db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(sqlite: Database) {
    this.sqlite = sqlite;
    this.db = drizzle(sqlite, { schema });
  }

  record(entry: Omit<PendingDeletion, "createdAt"> & { createdAt?: string }): void {
    const createdAt = entry.createdAt ?? new Date().toISOString();
    this.db
      .insert(schema.pendingDeletions)
      .values({
        path: entry.path,
        fileId: entry.fileId,
        fileSize: entry.fileSize,
        mtimeMs: entry.mtimeMs,
        createdAt,
      })
      .onConflictDoUpdate({
        target: schema.pendingDeletions.path,
        set: {
          fileId: entry.fileId,
          fileSize: entry.fileSize,
          mtimeMs: entry.mtimeMs,
          createdAt,
        },
      })
      .run();
  }

  list(): PendingDeletion[] {
    return this.db.select().from(schema.pendingDeletions).all();
  }

  clear(paths: string[]): void {
    if (paths.length === 0) return;
    this.db.delete(schema.pendingDeletions).where(inArray(schema.pendingDeletions.path, paths)).run();
  }
}

let _journal: SqliteDeletionJournal | null = null;

function getJournal(): SqliteDeletionJournal {
  if (!_journal) {
    _journal = new SqliteDeletionJournal(defaultSqlite as unknown as Database);
  }
  return _journal;
}

export const recordPendingDeletion = (entry: Parameters<SqliteDeletionJournal["record"]>[0]) =>
  getJournal().record(entry);
export const listPendingDeletions = () => getJournal().list();
export const clearPendingDeletions = (paths: string[]) => getJournal().clear(paths);
