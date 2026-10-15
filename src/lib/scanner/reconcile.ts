import { mapConcurrent } from "@yard-core";
import path from "node:path";
import type { ScanFileRecord } from "@yard-core";
import { directoryWithinRoot, resolveOwningRoot } from "@/lib/database/file-ownership";
import type { ScanCleanupRow, ScanPhaseContext } from "./types";
import type { createMetadataQueue } from "./metadata-queue";

function normalizeStoredDirectory(directory: string | null | undefined) {
  return directory == null ? null : directory.replace(/\\/g, "/");
}

export async function processDiscoveredBatch(context: ScanPhaseContext, filePaths: string[], normalizedRoot: string, owningRoots: readonly string[], lastScannedAt: string, seenPaths: Set<string>, metadataQueue: ReturnType<typeof createMetadataQueue>, arrivals: string[]) {
    const existingByPath = new Map(
      context.fileRepo.getFilesByPaths(filePaths).map((file) => [file.path, file]),
    );
    const touchActivePaths: string[] = [];
    const upsertRecords: ScanFileRecord[] = [];
    const newPaths: string[] = [];

    filePaths.forEach((filePath) => seenPaths.add(filePath));
    const statResults = await mapConcurrent(filePaths, 32, async (filePath) => {
        try {
          const stats = await context.fs.stat(filePath);
          return { filePath, stats };
        } catch {
          context.incrementScanErrors();
          return null;
        }
      });

    for (const result of statResults) {
      if (!result) {
        continue;
      }

      const { filePath, stats } = result;
      const existing = existingByPath.get(filePath);
      const filename = path.basename(filePath);
      const format = path.extname(filePath).toLowerCase().slice(1) || null;
      const mtimeMs = Math.trunc(stats.mtimeMs);
      // Ownership is resolved from every configured root, not from the root
      // whose walk happened to find the file (#309): overlapping roots always
      // agree, and the directory is stored relative to the resolved owner so
      // directory navigation and atLibraryRoot reads match that owner too.
      const owner = resolveOwningRoot(filePath, owningRoots) ?? normalizedRoot;
      const directory = directoryWithinRoot(owner, filePath);
      const changed =
        !existing ||
        existing.duration === null ||
        existing.fileSize !== stats.size ||
        existing.mtimeMs !== mtimeMs ||
        existing.removedAt !== null ||
        (existing.detachedAt ?? null) !== null ||
        normalizeStoredDirectory(existing.directory) !== normalizeStoredDirectory(directory);
      const ownershipChanged = existing?.libraryRoot !== owner;

      seenPaths.add(filePath);
      context.status.indexed += 1;

      if (!changed && !ownershipChanged && existing) {
        // Already active with unchanged ownership: only the timestamps
        // move. This keeps the browse indexes out of the write path and
        // is equivalent to the generic touch for this state, where
        // removed_at is already NULL and library_root is unchanged.
        touchActivePaths.push(filePath);
        context.status.skippedUnchanged += 1;
        continue;
      }

      upsertRecords.push({
        path: filePath,
        filename,
        libraryRoot: owner,
        directory,
        format,
        codec: null,
        duration: null,
        sampleRate: null,
        bitDepth: null,
        channels: null,
        fileSize: stats.size,
        mtimeMs,
        removedAt: null,
        lastScannedAt,
      });

      if (existing) {
        context.status.updated += 1;
        arrivals.push(existing.id);
      } else {
        context.status.added += 1;
        newPaths.push(filePath);
      }
    }

    context.fileRepo.batchTouchActiveFiles(touchActivePaths, lastScannedAt);
    context.fileRepo.batchUpsertFiles(upsertRecords, lastScannedAt);
    if (newPaths.length > 0) {
      // New rows get their ids at insert; resolve them so the arrival list
      // matches the files the scan actually added.
      for (const file of context.fileRepo.getFilesByPaths(newPaths)) {
        arrivals.push(file.id);
      }
    }

    for (const record of upsertRecords) {
      // Unknown files escalate to a full parse in the same job when the
      // header cannot see required fields (B05): header-first is preserved
      // inside extractMetadata, so files with complete headers never pay
      // for a full read. Known files keep the cheap header-only refresh.
      // Awaitable admission pauses discovery while the waiting list is at
      // capacity instead of growing an unbounded backlog.
      const prior = existingByPath.get(record.path);
      await metadataQueue.enqueue({
        filePath: record.path,
        fileSize: record.fileSize ?? 0,
        filename: record.filename,
        format: record.format,
        fullParse: !prior || prior.duration === null,
      });
    }
  }

export function markRemovedFiles(context: ScanPhaseContext, allExistingFiles: ScanCleanupRow[], seenPaths: Set<string>, now: string) {
    context.status.phase = "cleaning";
    context.emitProgress();
    const removedAt = new Date().toISOString();
    const removedPaths: string[] = [];

    for (const file of allExistingFiles) {
      if (seenPaths.has(file.path) || file.removedAt !== null) {
        continue;
      }

      removedPaths.push(file.path);
      context.status.removed += 1;
    }

    context.fileRepo.batchMarkRemoved(removedPaths, removedAt, now);

    const relinkedFiles = context.fileRepo.reconcileMovedFiles();
    context.status.removed = Math.max(0, context.status.removed - relinkedFiles);
  }

