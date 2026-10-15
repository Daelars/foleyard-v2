import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { sqlite as defaultSqlite } from "./connection";
import { SqliteSettingsRepository } from "./settings-repository";
import * as schema from "@/lib/schema";

import type Database from "better-sqlite3";

export type RootChangeMode = "detach" | "forget";

export type PendingRootChange = {
  root: string;
  mode: RootChangeMode;
  createdAt: string;
};

export type RootRecovery = {
  /** Intents whose settings change had already committed; the index now agrees. */
  completed: number;
  /** Intents whose root is still owned: the removal never committed. */
  dropped: number;
};

export type RootChangeResult = {
  /** Files whose ownership the change touched. */
  files: number;
};

/**
 * Library-root removal as one recoverable operation (#271).
 *
 * Removing a root is a soft, default operation: its indexed files are marked
 * detached and every read stops seeing them, but the rows are not deleted and
 * tags, favourites, Collection membership and embeddings survive for a later
 * re-add. `forget` is the explicit destructive alternative.
 *
 * The durable intent is committed before the settings/index change and cleared
 * only once both agree, mirroring the permanent-deletion journal (#269):
 *
 *   1. record the intent (its own committed row)
 *   2. in one SQLite transaction, drop the root from settings and update files
 *   3. clear the intent
 *
 * A crash between 1 and 3 is reconciled by {@link SqliteLibraryRootService.recover}:
 * a root the settings no longer list finishes detaching (or forgetting); a
 * root still listed drops the intent.
 */
export class SqliteLibraryRootService {
  private sqlite: Database;
  private db: ReturnType<typeof drizzle<typeof schema>>;
  private settings: SqliteSettingsRepository;

  constructor(sqlite: Database) {
    this.sqlite = sqlite;
    this.db = drizzle(sqlite, { schema });
    this.settings = new SqliteSettingsRepository(sqlite);
  }

  listPending(): PendingRootChange[] {
    return this.db.select().from(schema.pendingRootChanges).all() as PendingRootChange[];
  }

  private recordPending(mode: RootChangeMode, root: string): void {
    const createdAt = new Date().toISOString();
    this.db
      .insert(schema.pendingRootChanges)
      .values({ root, mode, createdAt })
      .onConflictDoUpdate({
        target: schema.pendingRootChanges.root,
        set: { mode, createdAt },
      })
      .run();
  }

  private clearPending(root: string): void {
    this.db.delete(schema.pendingRootChanges).where(eq(schema.pendingRootChanges.root, root)).run();
  }

  private withoutRoot(root: string): string[] {
    return this.settings.getLibraryRoots().filter((entry) => entry !== root);
  }

  /** Marks the root's files detached. Idempotent; detached rows are skipped. */
  private markDetached(root: string): number {
    const result = this.db
      .update(schema.files)
      .set({ detachedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(and(eq(schema.files.libraryRoot, root), isNull(schema.files.detachedAt)))
      .run();
    return Number(result.changes ?? 0);
  }

  /** Deletes the root's files and everything attached to them. */
  private deleteRootRows(root: string): number {
    const count = (
      this.sqlite.prepare("SELECT COUNT(*) AS n FROM files WHERE library_root = ?").get(root) as { n: number }
    ).n;
    this.sqlite
      .prepare("DELETE FROM file_tags WHERE file_id IN (SELECT id FROM files WHERE library_root = ?)")
      .run(root);
    this.sqlite
      .prepare("DELETE FROM file_collections WHERE file_id IN (SELECT id FROM files WHERE library_root = ?)")
      .run(root);
    this.sqlite
      .prepare("DELETE FROM file_embeddings WHERE file_id IN (SELECT id FROM files WHERE library_root = ?)")
      .run(root);
    this.sqlite.prepare("DELETE FROM files WHERE library_root = ?").run(root);
    return count;
  }

  /** Soft-remove a root: detach its files, keep their rows and organization data. */
  detachRoot(root: string): RootChangeResult {
    this.recordPending("detach", root);
    let files = 0;
    this.sqlite.transaction(() => {
      this.settings.setLibraryRoots(this.withoutRoot(root));
      files = this.markDetached(root);
    })();
    this.clearPending(root);
    return { files };
  }

  /** Remove a root and permanently delete its files and organization data. */
  forgetRoot(root: string): RootChangeResult {
    this.recordPending("forget", root);
    let files = 0;
    this.sqlite.transaction(() => {
      this.settings.setLibraryRoots(this.withoutRoot(root));
      files = this.deleteRootRows(root);
    })();
    this.clearPending(root);
    return { files };
  }

  /**
   * Re-add a root: register it and reattach every detached record it owns, by
   * path and identity, with its organization data. This is the only path that
   * brings detached records back; nothing resurrects them on its own.
   */
  reattachRoot(root: string): RootChangeResult {
    let files = 0;
    this.sqlite.transaction(() => {
      const roots = this.settings.getLibraryRoots();
      if (!roots.includes(root)) {
        this.settings.setLibraryRoots([...roots, root]);
      }
      const result = this.db
        .update(schema.files)
        .set({ detachedAt: null, updatedAt: new Date().toISOString() })
        .where(and(eq(schema.files.libraryRoot, root), isNotNull(schema.files.detachedAt)))
        .run();
      files = Number(result.changes ?? 0);
    })();
    return { files };
  }

  /**
   * Finish root removals interrupted before the index agreed (#271). Never
   * resurrects anything: it either completes the settings/index side for a
   * root the settings no longer own, or drops the intent because the root is
   * still owned.
   */
  recover(): RootRecovery {
    const pending = this.listPending();
    let completed = 0;
    let dropped = 0;

    for (const entry of pending) {
      if (this.settings.getLibraryRoots().includes(entry.root)) {
        this.clearPending(entry.root);
        dropped += 1;
        continue;
      }
      this.sqlite.transaction(() => {
        if (entry.mode === "forget") {
          this.deleteRootRows(entry.root);
        } else {
          this.markDetached(entry.root);
        }
      })();
      this.clearPending(entry.root);
      completed += 1;
    }

    return { completed, dropped };
  }
}

let _rootService: SqliteLibraryRootService | null = null;
function getRootService(): SqliteLibraryRootService {
  if (!_rootService) {
    _rootService = new SqliteLibraryRootService(defaultSqlite as unknown as Database);
  }
  return _rootService;
}

export const detachLibraryRoot = (root: string) => getRootService().detachRoot(root);
export const forgetLibraryRoot = (root: string) => getRootService().forgetRoot(root);
export const reattachLibraryRoot = (root: string) => getRootService().reattachRoot(root);
export const recoverPendingRootChanges = () => getRootService().recover();
export const listPendingRootChanges = () => getRootService().listPending();
