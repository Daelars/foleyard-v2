import {
  batchMarkRemoved,
  batchUpsertFiles,
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
 * Persist-before-notify: each mutation commits its repository write
 * first and emits `contributions-changed` afterwards, so a subscriber
 * that re-reads the catalog on receipt always observes the triggering
 * change.
 */

export type V2LibraryMutationDeps = {
  markRemovedByPaths?: (paths: string[], removedAt: string, now: string) => void;
  insertRecords?: (records: ScanFileRecord[], now: string) => void;
  notify?: () => void;
};

function defaultNotify(): void {
  getV2Events().emit("contributions-changed", "*");
}

/** Repository-backed mutation ports; pass deps only in tests. */
export function createV2LibraryMutationPorts(
  deps: V2LibraryMutationDeps = {},
): V2LibraryMutationPorts {
  const markRemoved = deps.markRemovedByPaths ?? batchMarkRemoved;
  const insert = deps.insertRecords ?? batchUpsertFiles;
  const notify = deps.notify ?? defaultNotify;
  return {
    markRemovedByPaths: (paths, removedAt, now) => {
      markRemoved(paths, removedAt, now);
      notify();
    },
    insertRecords: (records, now) => {
      insert(records, now);
      notify();
    },
  };
}
