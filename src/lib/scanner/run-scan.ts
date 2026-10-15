import {
  batchMarkRemoved,
  batchTouchFiles,
  batchTouchActiveFiles,
  batchUpdateFileMetadata,
  batchUpsertFiles,
  getAllFilesIncludingRemoved,
  getScanCleanupRows,
  getFileById,
  getFileByPath,
  getFileCount,
  getFiles,
  getFilesByPaths,
  getLibraryRoot,
  getLibraryRoots,
  getLibraryStats,
  reconcileMovedFiles,
  analyzeStatistics,
  setLibraryRoots,
  toggleFavorite,
  upsertFile,
} from "@/lib/db";
import { extractMetadata } from "@/lib/metadata";
import { recoverPendingDeletions } from "@/lib/files/delete-files";
import { triggerAutoTagAfterScan } from "@/lib/extensions-v2/auto-tag-trigger";

import { RealFileSystemSeam } from "./filesystem";
import { ScanRunner } from "./scan-runner";

let _runner: ScanRunner | null = null;

function getRunner(): ScanRunner {
  if (!_runner) {
    _runner = new ScanRunner({
      fileRepo: {
        getFiles,
        getFileCount,
        getAllFilesIncludingRemoved,
        getScanCleanupRows,
        getFileById,
        getFileByPath,
        getFilesByPaths,
        upsertFile,
        batchTouchFiles,
        batchTouchActiveFiles,
        batchUpsertFiles,
        batchUpdateFileMetadata,
        batchMarkRemoved,
        reconcileMovedFiles,
        analyzeStatistics,
        toggleFavorite,
      },
      settingsRepo: {
        getLibraryRoot,
        setLibraryRoot: (root: string) => setLibraryRoots([root]),
        getLibraryStats,
      },
      getLibraryRoots,
      fs: new RealFileSystemSeam(),
      metadataExtractor: {
        extract: extractMetadata,
      },
      // Interrupted permanent deletions are reconciled before the scan reads
      // the index, so the removal phase sees rows that agree with disk (#269).
      recoverDeletions: recoverPendingDeletions,
      // Post-scan auto-tag (#194, #234): fire and forget with the files
      // the scan actually added or updated. The runner fires onComplete
      // even for failed runs because arrivals that landed are real; a
      // failing trigger itself must never fail the scan.
      onComplete: ({ startedAt, fileIds }) => {
        void triggerAutoTagAfterScan({ startedAt, fileIds }).catch((error) => {
          console.error("Auto-tag trigger failed after scan", error);
        });
      },
    });
  }
  return _runner;
}

export function getScanStatus() {
  const runnerStatus = getRunner().getStatus();
  return {
    ...runnerStatus,
    libraryRoot: runnerStatus.libraryRoot ?? getLibraryRoot(),
    stats: getLibraryStats(),
  };
}

export function saveLibraryRoot(libraryRoot: string) {
  setLibraryRoots([libraryRoot]);
}

export function startScan() {
  return getRunner().startScan();
}
