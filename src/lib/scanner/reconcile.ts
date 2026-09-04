import path from "node:path";
import type { AudioFileTouchEntry, ScanFileRecord } from "@yard-core";
import type { ExistingFileRecord, ScanPhaseContext } from "./types";
import type { createMetadataQueue } from "./metadata-queue";

function normalizeDirectory(rootPath: string, filePath: string) {
  const relativeDirectory = path.relative(rootPath, path.dirname(filePath));
  return relativeDirectory === "." ? null : relativeDirectory || null;
}

function normalizeStoredDirectory(directory: string | null | undefined) {
  return directory == null ? null : directory.replace(/\\/g, "/");
}

export async function processDiscoveredBatch(context: ScanPhaseContext, filePaths: string[], normalizedRoot: string, lastScannedAt: string, seenPaths: Set<string>, metadataQueue: ReturnType<typeof createMetadataQueue>) {
    const existingByPath = new Map(
      context.fileRepo.getFilesByPaths(filePaths).map((file) => [file.path, file]),
    );
    const touchEntries: AudioFileTouchEntry[] = [];
    const upsertRecords: ScanFileRecord[] = [];

    filePaths.forEach((filePath) => seenPaths.add(filePath));
    const statResults = await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          const stats = await context.fs.stat(filePath);
          return { filePath, stats };
        } catch {
          context.incrementScanErrors();
          return null;
        }
      }),
    );

    for (const result of statResults) {
      if (!result) {
        continue;
      }

      const { filePath, stats } = result;
      const existing = existingByPath.get(filePath);
      const filename = path.basename(filePath);
      const format = path.extname(filePath).toLowerCase().slice(1) || null;
      const mtimeMs = Math.trunc(stats.mtimeMs);
      const directory = normalizeDirectory(normalizedRoot, filePath);
      const changed =
        !existing ||
        existing.duration === null ||
        existing.fileSize !== stats.size ||
        existing.mtimeMs !== mtimeMs ||
        existing.removedAt !== null ||
        normalizeStoredDirectory(existing.directory) !== normalizeStoredDirectory(directory);
      const ownershipChanged = existing?.libraryRoot !== normalizedRoot;

      seenPaths.add(filePath);
      context.status.indexed += 1;

      if (!changed && !ownershipChanged && existing) {
        touchEntries.push({ path: filePath, lastScannedAt, libraryRoot: normalizedRoot });
        context.status.skippedUnchanged += 1;
        continue;
      }

      upsertRecords.push({
        path: filePath,
        filename,
        libraryRoot: normalizedRoot,
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
      } else {
        context.status.added += 1;
      }
    }

    context.fileRepo.batchTouchFiles(touchEntries, lastScannedAt);
    context.fileRepo.batchUpsertFiles(upsertRecords, lastScannedAt);

    for (const record of upsertRecords) {
      metadataQueue.enqueue({
        filePath: record.path,
        fileSize: record.fileSize ?? 0,
        filename: record.filename,
        format: record.format,
        fullParse: existingByPath.get(record.path)?.duration === null,
      });
    }
  }

export function markRemovedFiles(context: ScanPhaseContext, allExistingFiles: ExistingFileRecord[], seenPaths: Set<string>, now: string) {
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

