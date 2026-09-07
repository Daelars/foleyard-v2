import {
  getAllCollections,
  getFileById,
  getFiles,
  getFilesByIds,
} from "@/lib/db";
import type { IndexedAudioFile, V2LibraryPorts, V2LibraryReadPorts } from "@yard-core";

/**
 * Application V2LibraryPorts adapter (Application context, R3).
 *
 * Narrow structural subset of the repository contracts: indexed-record
 * reads only (by ID, by IDs, bounded pages), no raw paths, no writes.
 */

function toIndexed(file: {
  id: string;
  removedAt?: string | null;
  lastScannedAt?: string | null;
  mtimeMs?: number | null;
} & Omit<IndexedAudioFile, "removedAt" | "lastScannedAt" | "mtimeMs">): IndexedAudioFile {
  return {
    ...file,
    removedAt: file.removedAt ?? null,
    lastScannedAt: file.lastScannedAt ?? null,
    mtimeMs: file.mtimeMs ?? null,
  };
}

/** Paged Library reads over the application repositories. */
export function createV2LibraryPorts(): V2LibraryPorts & V2LibraryReadPorts {
  return {
    getFileById: (id) => getFileById(id),
    getFilesByIds: (ids) => getFilesByIds(ids),
    listPage: (cursor, limit) => {
      const offset = cursor ? Number.parseInt(cursor, 10) : 0;
      const start = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;
      const page = getFiles({ limit, offset: start, showRemoved: true });
      const next = start + page.length;
      return {
        files: page.map(toIndexed),
        nextCursor: page.length < limit ? null : String(next),
      };
    },
    collectionExists: (id) => getAllCollections().some((collection) => collection.id === id),
  };
}
