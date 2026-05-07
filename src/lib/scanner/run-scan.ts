import fs from "fs/promises";
import path from "path";

import {
  batchMarkRemoved,
  batchTouchFiles,
  batchUpdateFileMetadata,
  batchUpsertFiles,
  getAllFilesIncludingRemoved,
  getFilesByPaths,
  getLibraryRoot,
  getLibraryStats,
  reconcileMovedFiles,
  setLibraryRoot,
} from "@/lib/db";
import { extractMetadata } from "@/lib/metadata";

import { resetScanStatus, scanStatus, incrementScanErrors } from "./scan-state";
import { streamAudioFileBatches } from "./filesystem";
import { validateLibraryRoot } from "./validation";

const DISCOVERY_BATCH_SIZE = 500;
const METADATA_CONCURRENCY = 4;
const METADATA_WRITE_BATCH_SIZE = 100;

type ExistingFileRecord = ReturnType<typeof getAllFilesIncludingRemoved>[number];
type MetadataUpdateRecord = {
  path: string;
  codec: string | null;
  duration: number | null;
  sampleRate: number | null;
  bitDepth: number | null;
  channels: number | null;
  fileSize: number | null;
};

type MetadataTask = {
  filePath: string;
  fileSize: number;
  filename: string;
  format: string | null;
};

let activeScan: Promise<void> | null = null;

function createMetadataQueue(
  onResult: (record: MetadataUpdateRecord) => void,
) {
  const pending: MetadataTask[] = [];
  const idleResolvers: Array<() => void> = [];
  let activeCount = 0;
  let fatalError: Error | null = null;

  const resolveIdle = () => {
    if (activeCount !== 0 || pending.length !== 0) {
      return;
    }

    while (idleResolvers.length > 0) {
      idleResolvers.shift()?.();
    }
  };

  const runNext = () => {
    while (activeCount < METADATA_CONCURRENCY && pending.length > 0 && !fatalError) {
      const task = pending.shift()!;
      activeCount += 1;

      void (async () => {
        try {
          let metadata;
          try {
            metadata = await extractMetadata(task.filePath, {
              fileSize: task.fileSize,
              filename: task.filename,
              format: task.format,
            });
          } catch {
            incrementScanErrors();
            return;
          }

          onResult({
            path: task.filePath,
            codec: metadata.codec,
            duration: metadata.duration,
            sampleRate: metadata.sampleRate,
            bitDepth: metadata.bitDepth,
            channels: metadata.channels,
            fileSize: metadata.fileSize,
          });
          scanStatus.metadataProcessed += 1;
        } catch (error) {
          fatalError = error instanceof Error ? error : new Error(String(error));
        } finally {
          activeCount -= 1;
          runNext();
          resolveIdle();
        }
      });
    }
  };

  return {
    enqueue(task: MetadataTask) {
      if (fatalError) {
        throw fatalError;
      }

      pending.push(task);
      runNext();
    },
    async onIdle() {
      if (fatalError) {
        throw fatalError;
      }

      if (activeCount === 0 && pending.length === 0) {
        return;
      }

      await new Promise<void>((resolve) => {
        idleResolvers.push(resolve);
      });

      if (fatalError) {
        throw fatalError;
      }
    },
  };
}

function normalizeDirectory(rootPath: string, filePath: string) {
  const relativeDirectory = path.relative(rootPath, path.dirname(filePath));
  return relativeDirectory === "." ? null : relativeDirectory || null;
}

function normalizeStoredDirectory(directory: string | null | undefined) {
  return directory == null ? null : directory.replace(/\\/g, "/");
}

function flushMetadataUpdates(metadataUpdates: MetadataUpdateRecord[]) {
  if (metadataUpdates.length === 0) {
    return;
  }

  const batch = metadataUpdates.splice(0, metadataUpdates.length);
  batchUpdateFileMetadata(batch, new Date().toISOString());
}

async function processDiscoveredBatch(
  filePaths: string[],
  normalizedRoot: string,
  lastScannedAt: string,
  seenPaths: Set<string>,
  metadataQueue: ReturnType<typeof createMetadataQueue>,
) {
  const existingByPath = new Map(
    getFilesByPaths(filePaths).map((file) => [file.path, file]),
  );
  const touchEntries: { path: string; lastScannedAt: string }[] = [];
  const upsertRecords: Array<{
    path: string;
    filename: string;
    directory: string | null;
    format: string | null;
    codec: string | null;
    duration: number | null;
    sampleRate: number | null;
    bitDepth: number | null;
    channels: number | null;
    fileSize: number | null;
    mtimeMs: number;
    removedAt: string | null;
    lastScannedAt: string;
  }> = [];

  const statResults = await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        const stats = await fs.stat(filePath);
        return { filePath, stats };
      } catch {
        incrementScanErrors();
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
      existing.fileSize !== stats.size ||
      existing.mtimeMs !== mtimeMs ||
      existing.removedAt !== null ||
      normalizeStoredDirectory(existing.directory) !== normalizeStoredDirectory(directory);

    seenPaths.add(filePath);
    scanStatus.indexed += 1;

    if (!changed && existing) {
      touchEntries.push({ path: filePath, lastScannedAt });
      scanStatus.skippedUnchanged += 1;
      continue;
    }

    upsertRecords.push({
      path: filePath,
      filename,
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
      scanStatus.updated += 1;
    } else {
      scanStatus.added += 1;
    }
  }

  batchTouchFiles(touchEntries, lastScannedAt);
  batchUpsertFiles(upsertRecords, lastScannedAt);

  for (const record of upsertRecords) {
    metadataQueue.enqueue({
      filePath: record.path,
      fileSize: record.fileSize ?? 0,
      filename: record.filename,
      format: record.format,
    });
  }
}

function markRemovedFiles(
  allExistingFiles: ExistingFileRecord[],
  seenPaths: Set<string>,
  now: string,
) {
  scanStatus.phase = "cleaning";
  const removedAt = new Date().toISOString();
  const removedPaths: string[] = [];

  for (const file of allExistingFiles) {
    if (seenPaths.has(file.path) || file.removedAt !== null) {
      continue;
    }

    removedPaths.push(file.path);
    scanStatus.removed += 1;
  }

  batchMarkRemoved(removedPaths, removedAt, now);

  const relinkedFiles = reconcileMovedFiles();
  scanStatus.removed = Math.max(0, scanStatus.removed - relinkedFiles);
}

async function runScan(libraryRoot: string) {
  resetScanStatus(libraryRoot);

  try {
    const validation = await validateLibraryRoot(libraryRoot);
    if (!validation.valid || !validation.normalizedPath) {
      throw new Error(validation.error ?? "Invalid library root");
    }

    const normalizedRoot = validation.normalizedPath;
    const seenPaths = new Set<string>();
    const allExistingFiles = getAllFilesIncludingRemoved();
    const lastScannedAt = new Date().toISOString();
    const metadataUpdates: MetadataUpdateRecord[] = [];
    const metadataQueue = createMetadataQueue((record) => {
      metadataUpdates.push(record);

      if (metadataUpdates.length >= METADATA_WRITE_BATCH_SIZE) {
        flushMetadataUpdates(metadataUpdates);
      }
    });

    scanStatus.phase = "discovering";

    for await (const batch of streamAudioFileBatches(normalizedRoot, {
      batchSize: DISCOVERY_BATCH_SIZE,
      onDiscover: () => {
        scanStatus.discovered += 1;
        scanStatus.total = scanStatus.discovered;
      },
    })) {
      scanStatus.phase = "indexing";
      await processDiscoveredBatch(
        batch,
        normalizedRoot,
        lastScannedAt,
        seenPaths,
        metadataQueue,
      );
    }

    scanStatus.phase = "metadata";
    await metadataQueue.onIdle();
    flushMetadataUpdates(metadataUpdates);

    markRemovedFiles(allExistingFiles, seenPaths, lastScannedAt);

    scanStatus.phase = "complete";
    scanStatus.finishedAt = new Date().toISOString();
    scanStatus.lastScanSummary = {
      discovered: scanStatus.discovered,
      indexed: scanStatus.indexed,
      skippedUnchanged: scanStatus.skippedUnchanged,
      metadataProcessed: scanStatus.metadataProcessed,
      added: scanStatus.added,
      updated: scanStatus.updated,
      removed: scanStatus.removed,
      failed: scanStatus.failed,
      errors: scanStatus.errors,
      finishedAt: scanStatus.finishedAt,
    };
  } catch (error) {
    scanStatus.phase = "error";
    scanStatus.finishedAt = new Date().toISOString();
    scanStatus.error = error instanceof Error ? error.message : "Scan failed";
  } finally {
    scanStatus.running = false;
  }
}

export function getScanStatus() {
  return {
    ...scanStatus,
    libraryRoot: scanStatus.libraryRoot ?? getLibraryRoot(),
    stats: getLibraryStats(),
  };
}

export function saveLibraryRoot(libraryRoot: string) {
  setLibraryRoot(libraryRoot);
}

export function startScan() {
  if (scanStatus.running) {
    return { started: false, reason: "already-running", status: getScanStatus() };
  }

  const libraryRoot = getLibraryRoot();
  if (!libraryRoot) {
    return { started: false, reason: "missing-root", status: getScanStatus() };
  }

  activeScan = runScan(libraryRoot);
  void activeScan.finally(() => {
    activeScan = null;
  });

  return { started: true, status: getScanStatus() };
}
