import fs from "node:fs";
import type { IndexedAudioFile } from "@yard-core";
import {
  batchMarkRemoved,
  clearPendingDeletions,
  getFilesByIds,
  getLibraryRoots,
  listPendingDeletions,
  recordPendingDeletion,
} from "@/lib/db";
import { resolveReadablePath } from "@/lib/filesystem-boundary";

/**
 * On-disk identity of a path, taken without following links. Permanent
 * deletion compares this against the Library index so a path that was
 * replaced since it was indexed is never unlinked (#269).
 */
export type PathIdentity = {
  symbolicLink: boolean;
  file: boolean;
  size: number;
  mtimeMs: number;
};

/**
 * The filesystem operations permanent deletion and its recovery need, behind
 * a seam so failure and interruption can be injected at each boundary.
 */
export type DeletionFileSystem = {
  lstat(path: string): Promise<PathIdentity>;
  unlink(path: string): Promise<void>;
};

export const realDeletionFileSystem: DeletionFileSystem = {
  async lstat(filePath) {
    const stats = await fs.promises.lstat(filePath);
    return {
      symbolicLink: stats.isSymbolicLink(),
      file: stats.isFile(),
      size: stats.size,
      // The scanner records Math.trunc(stats.mtimeMs); compare the same way.
      mtimeMs: Math.trunc(stats.mtimeMs),
    };
  },
  unlink: (filePath) => fs.promises.unlink(filePath),
};

export const INDEX_UPDATE_FAILED =
  "Deleted from disk, but the Library index could not be updated; it will be reconciled on the next scan";

function errorCode(error: unknown) {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

/** True when the on-disk entry is still the file the Library indexed. */
function matchesIndexedIdentity(
  identity: PathIdentity,
  record: Pick<IndexedAudioFile, "fileSize" | "mtimeMs">,
) {
  return (
    !identity.symbolicLink &&
    identity.file &&
    record.fileSize !== null &&
    record.mtimeMs !== null &&
    identity.size === record.fileSize &&
    identity.mtimeMs === record.mtimeMs
  );
}

/**
 * Unlink one indexed file, or explain why it was refused. The durable intent
 * is committed before the unlink; a non-null result means nothing was
 * deleted and no intent is left behind.
 */
async function unlinkIndexedFile(
  record: IndexedAudioFile,
  roots: string[],
  deletionFs: DeletionFileSystem,
): Promise<string | null> {
  if (!(await resolveReadablePath(record.path, roots))) {
    return "File is missing or outside the configured Library roots";
  }

  const identity = await deletionFs.lstat(record.path).catch(() => null);
  if (!identity) {
    return "File is missing or outside the configured Library roots";
  }
  if (identity.symbolicLink) {
    return "Path is a symbolic link, not the indexed file; refusing to delete";
  }
  if (!matchesIndexedIdentity(identity, record)) {
    return "Path was replaced since it was indexed; refusing to delete";
  }

  // Durable intent before the irreversible step: a crash from here on is
  // reconciled from this row instead of leaving disk and index disagreeing.
  recordPendingDeletion({
    path: record.path,
    fileId: record.id,
    fileSize: identity.size,
    mtimeMs: identity.mtimeMs,
  });

  // Re-check immediately before unlinking. Writing the intent is time the
  // path can be replaced in, and a redirected unlink must never happen.
  const recheck = await deletionFs.lstat(record.path).catch(() => null);
  if (!recheck || !matchesIndexedIdentity(recheck, record)) {
    clearPendingDeletions([record.path]);
    return "Path changed between validation and deletion; refusing to delete";
  }

  try {
    await deletionFs.unlink(record.path);
  } catch (error) {
    if (errorCode(error) !== "ENOENT") {
      clearPendingDeletions([record.path]);
      return error instanceof Error ? error.message : "Delete failed";
    }
  }

  return null;
}

export type DeleteFilesResult = {
  removed: string[];
  failed: Array<{ id: string; error: string }>;
};

export async function deleteFiles(
  fileIds: string[],
  permanent: boolean,
  options: { fileSystem?: DeletionFileSystem } = {},
): Promise<DeleteFilesResult> {
  const removed: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];
  const now = new Date().toISOString();

  const byId = new Map(getFilesByIds(fileIds).map((record) => [record.id, record]));
  const roots = permanent === true ? getLibraryRoots() : [];
  const deletionFs = options.fileSystem ?? realDeletionFileSystem;
  const unlinked: Array<{ id: string; path: string }> = [];
  const softRemoved: Array<{ id: string; path: string }> = [];

  const concurrency = 8;
  type DeleteOutcome =
    | { id: string; error: string }
    | { id: string; path: string; unlinked: boolean };
  for (let start = 0; start < fileIds.length; start += concurrency) {
    const batch = fileIds.slice(start, start + concurrency);
    const results: DeleteOutcome[] = await Promise.all(
      batch.map(async (id): Promise<DeleteOutcome> => {
        const record = byId.get(id);
        if (!record) {
          return { id, error: "Not found" };
        }

        if (permanent === true) {
          const error = await unlinkIndexedFile(record, roots, deletionFs);
          return error === null
            ? { id, path: record.path, unlinked: true }
            : { id, error };
        }

        return { id, path: record.path, unlinked: false };
      }),
    );

    for (const result of results) {
      if ("error" in result) {
        failed.push({ id: result.id, error: result.error });
      } else {
        (result.unlinked ? unlinked : softRemoved).push({ id: result.id, path: result.path });
      }
    }
  }

  if (softRemoved.length > 0) {
    batchMarkRemoved(softRemoved.map((entry) => entry.path), now, now);
    removed.push(...softRemoved.map((entry) => entry.id));
  }

  if (unlinked.length > 0) {
    try {
      batchMarkRemoved(unlinked.map((entry) => entry.path), now, now);
      clearPendingDeletions(unlinked.map((entry) => entry.path));
      removed.push(...unlinked.map((entry) => entry.id));
    } catch {
      // The files are gone but the index did not record it. The durable
      // intent stays, so the next scan reconciles it; the files are reported
      // as failed rather than as a success the database never stored (#269).
      failed.push(...unlinked.map((entry) => ({ id: entry.id, error: INDEX_UPDATE_FAILED })));
    }
  }

  return { removed, failed };
}

export type DeletionRecovery = {
  /** Intents whose unlink happened; the index now agrees. */
  reconciled: number;
  /** Intents whose path still holds the indexed file: the unlink never ran. */
  abandoned: number;
  /** Intents whose path is now a different entry than the one validated. */
  superseded: number;
  /** Intents that could not be inspected; retried on the next pass. */
  pending: number;
};

/**
 * Finish permanent deletions interrupted between the unlink and the index
 * update (#269). Recovery never deletes: it either completes the index side
 * for a path that is gone, or drops the intent because the path is still
 * occupied — including by a file that replaced the indexed one.
 */
export async function recoverPendingDeletions(
  options: { fileSystem?: DeletionFileSystem } = {},
): Promise<DeletionRecovery> {
  const entries = listPendingDeletions();
  if (entries.length === 0) {
    return { reconciled: 0, abandoned: 0, superseded: 0, pending: 0 };
  }

  const deletionFs = options.fileSystem ?? realDeletionFileSystem;
  const removedPaths: string[] = [];
  const abandonedPaths: string[] = [];
  const supersededPaths: string[] = [];
  let pending = 0;

  for (const entry of entries) {
    let identity: PathIdentity;
    try {
      identity = await deletionFs.lstat(entry.path);
    } catch (error) {
      if (errorCode(error) === "ENOENT") {
        // The unlink happened before the interruption: finish the index side.
        removedPaths.push(entry.path);
      } else {
        pending += 1;
      }
      continue;
    }

    // Still occupied: either the unlink never ran, or the path has moved on
    // while the intent was pending. Recovery abandons the intent either way
    // and never touches what is there now.
    const stillIndexed = matchesIndexedIdentity(identity, entry);
    (stillIndexed ? abandonedPaths : supersededPaths).push(entry.path);
  }

  const now = new Date().toISOString();
  if (removedPaths.length > 0) {
    batchMarkRemoved(removedPaths, now, now);
    clearPendingDeletions(removedPaths);
  }
  clearPendingDeletions([...abandonedPaths, ...supersededPaths]);

  return {
    reconciled: removedPaths.length,
    abandoned: abandonedPaths.length,
    superseded: supersededPaths.length,
    pending,
  };
}
