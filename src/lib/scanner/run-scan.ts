import {
  batchMarkRemoved,
  batchTouchFiles,
  batchUpdateFileMetadata,
  batchUpsertFiles,
  clearLibraryData,
  getAllFilesIncludingRemoved,
  getFileById,
  getFileByPath,
  getFileCount,
  getFiles,
  getFilesByPaths,
  getLibraryRoot,
  getLibraryRoots,
  getLibraryStats,
  reconcileMovedFiles,
  setLibraryRoots,
  toggleFavorite,
  upsertFile,
} from "@/lib/db";
import { extractMetadata } from "@/lib/metadata";

import { scanStatus } from "./scan-state";
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
        getFileById,
        getFileByPath,
        getFilesByPaths,
        upsertFile,
        batchTouchFiles,
        batchUpsertFiles,
        batchUpdateFileMetadata,
        batchMarkRemoved,
        reconcileMovedFiles,
        toggleFavorite,
      },
      settingsRepo: {
        getLibraryRoot,
        setLibraryRoot: (root: string) => setLibraryRoots([root]),
        getLibraryStats,
        clearLibraryData,
      },
      getLibraryRoots,
      fs: new RealFileSystemSeam(),
      metadataExtractor: {
        extract: extractMetadata,
      },
      onProgress: (status) => {
        Object.assign(scanStatus, status);
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
