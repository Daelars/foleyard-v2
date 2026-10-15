import {
  batchMarkRemoved,
  batchUpsertFiles,
  getLibraryRoots,
} from "@/lib/db";
import type { ScanFileRecord, V2LibraryMutationPorts } from "@yard-core";

import { getV2Events } from "./events";

/**
 * Application Library-mutation ports for v2 operations (Application
 * context, E1 #176).
 *
 * Narrow structural subset of the repository contracts: index removal
 * by path and gathered-record insertion, no raw queries, no full
 * repository surface. Reuses the SQLite repositories directly without
 * importing v1 extension modules.
 *
 * Gathered inserts are ownership-checked here as a second line of
 * defence: a record whose `libraryRoot` is not a configured Library root
 * is refused, so no handler can write a rootless row (#271). The
 * handler's copy op supplies the root and directory it resolved.
 *
 * Persist-before-notify: each mutation commits its repository write
 * first and emits `contributions-changed` afterwards, so a subscriber
 * that re-reads the catalog on receipt always observes the triggering
 * change.
 */

export type V2LibraryMutationDeps = {
  markRemovedByPaths?: (paths: string[], removedAt: string, now: string) => void;
  insertRecords?: (records: ScanFileRecord[], now: string) => void;
  notify?: () => void;
  /** Configured Library roots; pass only in tests. */
  libraryRoots?: () => readonly string[];
};

function defaultNotify(): void {
  getV2Events().emit("contributions-changed", "*");
}

function assertOwnedRecords(records: ScanFileRecord[], roots: readonly string[]): void {
  const owned = new Set(roots.map((root) => root.toLowerCase()));
  for (const record of records) {
    const root = record.libraryRoot ?? "";
    if (!root.trim() || !owned.has(root.toLowerCase())) {
      throw new Error(
        `Gathered file ${JSON.stringify(record.path)} is not inside a configured Library root; gather destinations must be authorized Library roots.`,
      );
    }
  }
}

/** Repository-backed mutation ports; pass deps only in tests. */
export function createV2LibraryMutationPorts(
  deps: V2LibraryMutationDeps = {},
): V2LibraryMutationPorts {
  const markRemoved = deps.markRemovedByPaths ?? batchMarkRemoved;
  const insert = deps.insertRecords ?? batchUpsertFiles;
  const notify = deps.notify ?? defaultNotify;
  const libraryRoots = deps.libraryRoots ?? (() => getLibraryRoots());
  return {
    markRemovedByPaths: (paths, removedAt, now) => {
      markRemoved(paths, removedAt, now);
      notify();
    },
    insertRecords: (records, now) => {
      assertOwnedRecords(records, libraryRoots());
      insert(records, now);
      notify();
    },
  };
}
