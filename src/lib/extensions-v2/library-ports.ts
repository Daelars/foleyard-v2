import {
  collectionExists,
  getOwnedFileById,
  getFiles,
  getOwnedFilesByIds,
} from "@/lib/db";
import { decodeFileCursor, encodeFileCursor } from "@/lib/database/file-cursor";
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
    getFileById: (id) => getOwnedFileById(id),
    getFilesByIds: (ids) => getOwnedFilesByIds(ids),
    listPage: (cursor, limit) => {
      // Opaque keyset cursors (#256): the decoded ordering drives the query,
      // and one probe row makes `nextCursor` exact at page boundaries.
      const decoded = cursor ? decodeFileCursor(cursor) : null;
      const sortKey = decoded?.key ?? "filename";
      const sortDir = decoded?.dir === -1 ? "desc" : "asc";
      const probe = getFiles({
        limit: limit + 1,
        offset: 0,
        showRemoved: false,
        sortKey,
        sortDir,
        ...(cursor ? { cursor } : {}),
      });
      const files = probe.length > limit ? probe.slice(0, limit) : probe;
      const last = files[files.length - 1];
      return {
        files: files.map(toIndexed),
        nextCursor:
          probe.length > limit && last
            ? encodeFileCursor({
                key: sortKey,
                dir: sortDir === "desc" ? -1 : 1,
                filename: last.filename,
                id: last.id,
                duration: last.duration,
              })
            : null,
      };
    },
    collectionExists: (id) => collectionExists(id),
  };
}
