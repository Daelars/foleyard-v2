import type { AudioFile, IndexedAudioFile } from "../domain/audio-file";
import type { FileSearchQuery } from "../domain/search";
import type { ScanFileRecord } from "../services/library/scan-types";

export interface AudioFileTouchEntry {
  path: string;
  lastScannedAt: string;
}

export interface AudioFileRepository {
  getFiles(query?: FileSearchQuery): AudioFile[];
  getFileCount(query?: FileSearchQuery): number;
  getAllFilesIncludingRemoved(): IndexedAudioFile[];
  getFileById(id: string): IndexedAudioFile | null;
  getFileByPath(filePath: string): IndexedAudioFile | null;
  getFilesByPaths(paths: string[]): IndexedAudioFile[];
  upsertFile(record: ScanFileRecord): void;
  batchTouchFiles(entries: AudioFileTouchEntry[], now: string): void;
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
  reconcileMovedFiles(): number;
  toggleFavorite(id: string): boolean;
}
