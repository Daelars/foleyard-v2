import type { AudioFile, IndexedAudioFile } from "../domain/audio-file";
import type { FileSearchQuery } from "../domain/search";
import type { ScanFileRecord } from "../services/library/scan-types";

export interface AudioFileTouchEntry {
  path: string;
  lastScannedAt: string;
  libraryRoot?: string | null;
}

/**
 * Result of reconciling removed rows against newly discovered paths (#274).
 * Organization data moves only for a confirmed, unambiguous move; an
 * ambiguous match is recorded for later confirmation instead of guessed.
 */
export type MovedFileReconciliation = {
  /** Removed rows relinked onto exactly one new path; organization data moved. */
  relinked: number;
  /** Removed rows whose identity matched ambiguously: recorded, not merged. */
  ambiguous: number;
};

export interface AudioFileRepository {
  getFiles(query?: FileSearchQuery): AudioFile[];
  getFileCount(query?: FileSearchQuery): number;
  getAllFilesIncludingRemoved(): IndexedAudioFile[];
  /**
   * Narrow projection for scan cleanup (removal reconciliation only needs
   * path, library root and removed state); cheaper than materializing full
   * records for every scan.
   */
  getScanCleanupRows(): Array<{ path: string; libraryRoot: string | null; removedAt: string | null }>;
  getFileById(id: string): IndexedAudioFile | null;
  getFileByPath(filePath: string): IndexedAudioFile | null;
  getFilesByPaths(paths: string[]): IndexedAudioFile[];
  upsertFile(record: ScanFileRecord): void;
  batchTouchFiles(entries: AudioFileTouchEntry[], now: string): void;
  /**
   * Timestamp-only touch for rows already known to be active with
   * unchanged ownership: updates last_scanned_at and updated_at without
   * rewriting removed_at or library_root. Cheaper under the browse indexes
   * than the generic touch, which is kept for restore/ownership changes.
   */
  batchTouchActiveFiles(paths: string[], now: string): void;
  batchUpsertFiles(records: ScanFileRecord[], now: string): void;
  batchUpdateFileMetadata(
    records: Array<
      Pick<
        ScanFileRecord,
        "path" | "codec" | "duration" | "sampleRate" | "bitDepth" | "channels" | "fileSize"
      >
    >,
    now: string,
  ): void;
  batchMarkRemoved(paths: string[], removedAt: string, now: string): void;
  /**
   * Reconcile removed rows against newly discovered paths (#274). Candidates
   * are restricted to `activeFileIds` when the scan supplies the files it
   * added, so an already-indexed unchanged file is never read as a move
   * target; omitting it reconciles against every active row.
   */
  reconcileMovedFiles(activeFileIds?: string[]): MovedFileReconciliation;
  /** Refresh SQLite query statistics after a substantial import/migration. */
  analyzeStatistics(): void;
  toggleFavorite(id: string): boolean;
}
