import type { AudioFile, IndexedAudioFile } from "@yard-core";
import { drizzle } from "drizzle-orm/better-sqlite3";

import type { AudioFileRepository, AudioFileTouchEntry, FileSearchQuery, ScanFileRecord } from "@yard-core";


import { sqlite as defaultSqlite } from "./connection";
import * as schema from "@/lib/schema";

import type Database from "better-sqlite3";

import * as reads from "./files/reads";
import * as writes from "./files/writes";
import * as batch from "./files/batch";

export class SqliteAudioFileRepository implements AudioFileRepository {
private sqlite: Database;
private db: ReturnType<typeof drizzle<typeof schema>>;
constructor(sqlite: Database) {
    this.sqlite = sqlite;
    this.db = drizzle(sqlite, { schema });
  }
getFiles(options?: FileSearchQuery): AudioFile[] { return reads.getFiles({ sqlite: this.sqlite, db: this.db }, options); }
getFileCount(options?: FileSearchQuery): number { return reads.getFileCount({ sqlite: this.sqlite, db: this.db }, options); }
getAllFilesIncludingRemoved(): IndexedAudioFile[] { return reads.getAllFilesIncludingRemoved({ sqlite: this.sqlite, db: this.db }); }
getFileById(id: string): IndexedAudioFile | null { return reads.getFileById({ sqlite: this.sqlite, db: this.db }, id); }
getFileByPath(filePath: string): IndexedAudioFile | null { return reads.getFileByPath({ sqlite: this.sqlite, db: this.db }, filePath); }
getFilesByPaths(paths: string[]): IndexedAudioFile[] { return reads.getFilesByPaths({ sqlite: this.sqlite, db: this.db }, paths); }
upsertFile(record: ScanFileRecord): void { return writes.upsertFile({ sqlite: this.sqlite, db: this.db }, record); }
touchFileAsSeen(pathValue: string, lastScannedAt: string) { return writes.touchFileAsSeen({ sqlite: this.sqlite, db: this.db }, pathValue, lastScannedAt); }
batchTouchFiles(entries: AudioFileTouchEntry[], now: string): void { return batch.batchTouchFiles({ sqlite: this.sqlite, db: this.db }, entries, now); }
batchUpsertFiles(records: ScanFileRecord[], now: string): void { return batch.batchUpsertFiles({ sqlite: this.sqlite, db: this.db }, records, now); }
batchUpdateFileMetadata(
    records: Array<
      Pick<
        ScanFileRecord,
        "path" | "codec" | "duration" | "sampleRate" | "bitDepth" | "channels" | "fileSize"
      >
    >,
    now: string,
  ): void { return batch.batchUpdateFileMetadata({ sqlite: this.sqlite, db: this.db }, records, now); }
markFileRemoved(pathValue: string, removedAt: string) { return writes.markFileRemoved({ sqlite: this.sqlite, db: this.db }, pathValue, removedAt); }
batchMarkRemoved(paths: string[], removedAt: string, now: string): void { return batch.batchMarkRemoved({ sqlite: this.sqlite, db: this.db }, paths, removedAt, now); }
reconcileMovedFiles(): number { return batch.reconcileMovedFiles({ sqlite: this.sqlite, db: this.db }); }
toggleFavorite(id: string): boolean { return writes.toggleFavorite({ sqlite: this.sqlite, db: this.db }, id); }
setFavorites(ids: string[], isFavorite: boolean): void { return writes.setFavorites({ sqlite: this.sqlite, db: this.db }, ids, isFavorite); }
setFileTagBatch(fileIds: string[], tagId: string, attached: boolean): void { return writes.setFileTagBatch({ sqlite: this.sqlite, db: this.db }, fileIds, tagId, attached); }
}


let _fileRepo: SqliteAudioFileRepository | null = null;
function getFileRepo(): SqliteAudioFileRepository {
  if (!_fileRepo) {
    _fileRepo = new SqliteAudioFileRepository(defaultSqlite as unknown as Database);
  }
  return _fileRepo;
}

export const getFiles = (options?: FileSearchQuery) => getFileRepo().getFiles(options);
export const getFileCount = (options?: FileSearchQuery) => getFileRepo().getFileCount(options);
export const getAllFilesIncludingRemoved = () => getFileRepo().getAllFilesIncludingRemoved();
export const getFileById = (id: string) => getFileRepo().getFileById(id);
export const getFileByPath = (filePath: string) => getFileRepo().getFileByPath(filePath);
export const getFilesByPaths = (paths: string[]) => getFileRepo().getFilesByPaths(paths);
export const upsertFile = (record: ScanFileRecord) => getFileRepo().upsertFile(record);
export const touchFileAsSeen = (path: string, scanned: string) => getFileRepo().touchFileAsSeen(path, scanned);
export const batchTouchFiles = (entries: AudioFileTouchEntry[], now: string) => getFileRepo().batchTouchFiles(entries, now);
export const batchUpsertFiles = (records: ScanFileRecord[], now: string) => getFileRepo().batchUpsertFiles(records, now);
export const batchUpdateFileMetadata = (...args: Parameters<SqliteAudioFileRepository["batchUpdateFileMetadata"]>) => getFileRepo().batchUpdateFileMetadata(...args);
export const markFileRemoved = (path: string, removed: string) => getFileRepo().markFileRemoved(path, removed);
export const batchMarkRemoved = (paths: string[], removed: string, now: string) => getFileRepo().batchMarkRemoved(paths, removed, now);
export const reconcileMovedFiles = () => getFileRepo().reconcileMovedFiles();
export const toggleFavorite = (id: string) => getFileRepo().toggleFavorite(id);
export const setFavorites = (ids: string[], isFavorite: boolean) => getFileRepo().setFavorites(ids, isFavorite);
export const setFileTagBatch = (fileIds: string[], tagId: string, attached: boolean) =>
  getFileRepo().setFileTagBatch(fileIds, tagId, attached);
