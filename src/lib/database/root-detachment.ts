import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { sqlite as defaultSqlite } from "./connection";
import {
  directoryWithinRoot,
  isPathWithinRoot,
  normalizeLibraryRoot,
  resolveOwningRoot,
} from "./file-ownership";
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

  /**
   * Hand the files a root currently owns to whichever remaining configured
   * root contains them (#309). When roots overlap, removing a nested root must
   * not detach (or delete) files a shallower root still owns: they move to the
   * most specific remaining owner, with their directory recomputed against it.
   */
  private reassignCoveredFiles(root: string, remainingRoots: string[]): void {
    if (remainingRoots.length === 0) {
      return;
    }
    const rows = this.sqlite
      .prepare("SELECT id, path FROM files WHERE library_root = ?")
      .all(root) as Array<{ id: string; path: string }>;
    if (rows.length === 0) {
      return;
    }
    const update = this.sqlite.prepare(
      "UPDATE files SET library_root = ?, directory = ?, detached_at = NULL, updated_at = ? WHERE id = ?",
    );
    const now = new Date().toISOString();
    for (const row of rows) {
      const owner = resolveOwningRoot(row.path, remainingRoots);
      if (owner === null) {
        continue;
      }
      update.run(owner, directoryWithinRoot(owner, row.path), now, row.id);
    }
  }

  /**
   * Re-resolve ownership for every file under a root that was just (re-)added,
   * so a nested root takes its files back immediately and a re-added ancestor
   * never steals files a deeper configured root owns (#309). Only canonical
   * changes are written, so a plain re-add writes nothing.
   */
  private reconcileOwnershipUnder(root: string, roots: string[]): number {
    const normalizedRoot = normalizeLibraryRoot(root);
    const rows = this.sqlite
      .prepare(
        "SELECT id, path, library_root AS libraryRoot, detached_at AS detachedAt FROM files",
      )
      .all() as Array<{ id: string; path: string; libraryRoot: string | null; detachedAt: string | null }>;
    const update = this.sqlite.prepare(
      "UPDATE files SET library_root = ?, directory = ?, detached_at = NULL, updated_at = ? WHERE id = ?",
    );
    const now = new Date().toISOString();
    let changed = 0;

    for (const row of rows) {
      if (!isPathWithinRoot(normalizedRoot, row.path)) {
        continue;
      }
      const owner = resolveOwningRoot(row.path, roots);
      if (owner === null) {
        continue;
      }
      const alreadyOwned =
        row.libraryRoot !== null && normalizeLibraryRoot(row.libraryRoot) === owner;
      if (alreadyOwned && row.detachedAt === null) {
        continue;
      }
      update.run(owner, directoryWithinRoot(owner, row.path), now, row.id);
      changed += 1;
    }

    return changed;
  }

  /** Re-resolve then detach whatever no remaining root covers (#309). */
  private applyDetach(root: string, remainingRoots: string[]): number {
    this.reassignCoveredFiles(root, remainingRoots);
    return this.markDetached(root);
  }

  /** Re-resolve then delete whatever no remaining root covers (#309). */
  private applyForget(root: string, remainingRoots: string[]): number {
    this.reassignCoveredFiles(root, remainingRoots);
    return this.deleteRootRows(root);
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
    const remaining = this.withoutRoot(root);
    let files = 0;
    this.sqlite.transaction(() => {
      this.settings.setLibraryRoots(remaining);
      files = this.applyDetach(root, remaining);
    })();
    this.clearPending(root);
    return { files };
  }

  /** Remove a root and permanently delete its files and organization data. */
  forgetRoot(root: string): RootChangeResult {
    this.recordPending("forget", root);
    const remaining = this.withoutRoot(root);
    let files = 0;
    this.sqlite.transaction(() => {
      this.settings.setLibraryRoots(remaining);
      files = this.applyForget(root, remaining);
    })();
    this.clearPending(root);
    return { files };
  }

  /**
   * Re-add a root: register it and reattach every detached record it owns, by
   * path and identity, with its organization data. This is the only path that
   * brings detached records back; nothing resurrects them on its own. A nested
   * root takes over the files it now contains, and a re-added ancestor leaves
   * files owned by a deeper configured root where they are (#309).
   */
  reattachRoot(root: string): RootChangeResult {
    let files = 0;
    this.sqlite.transaction(() => {
      const roots = this.settings.getLibraryRoots();
      if (!roots.includes(root)) {
        this.settings.setLibraryRoots([...roots, root]);
      }
      files = this.reconcileOwnershipUnder(root, this.settings.getLibraryRoots());
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
      const remaining = this.settings.getLibraryRoots();
      this.sqlite.transaction(() => {
        if (entry.mode === "forget") {
          this.applyForget(entry.root, remaining);
        } else {
          this.applyDetach(entry.root, remaining);
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
