import { and, asc, count, eq, inArray, isNull, like, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { v4 as uuid } from "uuid";

import type { AudioFileRepository, AudioFileTouchEntry, FileSearchQuery, ScanFileRecord } from "@yard-core";
import { normalizeDirectoryPath } from "@yard-core";

import type { AudioFile, IndexedAudioFile } from "@yard-core";

import { sqlite as defaultSqlite } from "./connection";
import * as schema from "@/lib/schema";

import type Database from "better-sqlite3";

const SQLITE_MAX_VARIABLES = 999;

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

export class SqliteAudioFileRepository implements AudioFileRepository {
  private sqlite: Database;
  private db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(sqlite: Database) {
    this.sqlite = sqlite;
    this.db = drizzle(sqlite, { schema });
  }

  getFiles(options?: FileSearchQuery): AudioFile[] {
    const {
      query,
      favorites,
      collectionId,
      directory,
      showRemoved,
      limit = 500,
      offset = 0,
    } = options ?? {};

    if (collectionId) {
      const collectionFilters = [eq(schema.fileCollections.collectionId, collectionId)];

      if (!showRemoved) {
        collectionFilters.push(isNull(schema.files.removedAt));
      }

      const rows = this.db
        .select({
          id: schema.files.id,
          path: schema.files.path,
          filename: schema.files.filename,
          directory: schema.files.directory,
          format: schema.files.format,
          duration: schema.files.duration,
          sampleRate: schema.files.sampleRate,
          bitDepth: schema.files.bitDepth,
          channels: schema.files.channels,
          fileSize: schema.files.fileSize,
          isFavorite: schema.files.isFavorite,
          removedAt: schema.files.removedAt,
        })
        .from(schema.fileCollections)
        .innerJoin(schema.files, eq(schema.fileCollections.fileId, schema.files.id))
        .where(and(...collectionFilters))
        .orderBy(asc(schema.files.filename))
        .all();

      return rows as AudioFile[];
    }

    const filters = [];

    if (!showRemoved) {
      filters.push(isNull(schema.files.removedAt));
    }

    if (favorites) {
      filters.push(eq(schema.files.isFavorite, true));
    }

    if (query) {
      filters.push(like(schema.files.filename, `%${query}%`));
    }

    if (directory) {
      const normalizedDirectory = normalizeDirectoryPath(directory);
      filters.push(
        or(
          eq(schema.files.directory, directory),
          eq(schema.files.directory, normalizedDirectory),
          eq(schema.files.directory, normalizedDirectory.replace(/\//g, "\\")),
        ),
      );
    }

    return this.db
      .select({
        id: schema.files.id,
        path: schema.files.path,
        filename: schema.files.filename,
        directory: schema.files.directory,
        format: schema.files.format,
        duration: schema.files.duration,
        sampleRate: schema.files.sampleRate,
        bitDepth: schema.files.bitDepth,
        channels: schema.files.channels,
        fileSize: schema.files.fileSize,
        isFavorite: schema.files.isFavorite,
        removedAt: schema.files.removedAt,
      })
      .from(schema.files)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(schema.files.filename))
      .limit(limit)
      .offset(offset)
      .all() as AudioFile[];
  }

  getFileCount(options?: FileSearchQuery): number {
    const { query, favorites, collectionId, showRemoved } = options ?? {};

    if (collectionId) {
      const collectionFilters = [eq(schema.fileCollections.collectionId, collectionId)];
      if (!showRemoved) {
        collectionFilters.push(isNull(schema.files.removedAt));
      }
      const result = this.db
        .select({ count: count() })
        .from(schema.fileCollections)
        .innerJoin(schema.files, eq(schema.fileCollections.fileId, schema.files.id))
        .where(and(...collectionFilters))
        .get();

      return result?.count ?? 0;
    }

    const filters = [];
    if (!showRemoved) filters.push(isNull(schema.files.removedAt));
    if (favorites) filters.push(eq(schema.files.isFavorite, true));
    if (query) filters.push(like(schema.files.filename, `%${query}%`));

    const result = this.db
      .select({ count: count() })
      .from(schema.files)
      .where(filters.length ? and(...filters) : undefined)
      .get();

    return result?.count ?? 0;
  }

  getAllFilesIncludingRemoved(): IndexedAudioFile[] {
    return this.db
      .select({
        id: schema.files.id,
        path: schema.files.path,
        filename: schema.files.filename,
        directory: schema.files.directory,
        format: schema.files.format,
        codec: schema.files.codec,
        duration: schema.files.duration,
        sampleRate: schema.files.sampleRate,
        bitDepth: schema.files.bitDepth,
        channels: schema.files.channels,
        fileSize: schema.files.fileSize,
        isFavorite: schema.files.isFavorite,
        removedAt: schema.files.removedAt,
        lastScannedAt: schema.files.lastScannedAt,
        mtimeMs: schema.files.mtimeMs,
      })
      .from(schema.files)
      .all() as IndexedAudioFile[];
  }

  getFileById(id: string): IndexedAudioFile | null {
    return (this.db.select().from(schema.files).where(eq(schema.files.id, id)).get() ?? null) as IndexedAudioFile | null;
  }

  getFileByPath(filePath: string): IndexedAudioFile | null {
    return (this.db.select().from(schema.files).where(eq(schema.files.path, filePath)).get() ?? null) as IndexedAudioFile | null;
  }

  getFilesByPaths(paths: string[]): IndexedAudioFile[] {
    if (paths.length === 0) {
      return [];
    }

    const results: IndexedAudioFile[] = [];
    const chunkSize = Math.max(1, SQLITE_MAX_VARIABLES - 1);

    for (const chunk of chunkArray(paths, chunkSize)) {
      const rows = this.db
        .select()
        .from(schema.files)
        .where(inArray(schema.files.path, chunk))
        .all() as IndexedAudioFile[];

      results.push(...rows);
    }

    return results;
  }

  upsertFile(record: ScanFileRecord): void {
    this.db.insert(schema.files)
      .values({
        id: uuid(),
        path: record.path,
        filename: record.filename,
        directory: record.directory,
        format: record.format,
        codec: record.codec,
        duration: record.duration,
        sampleRate: record.sampleRate,
        bitDepth: record.bitDepth,
        channels: record.channels,
        fileSize: record.fileSize,
        mtimeMs: record.mtimeMs,
        removedAt: record.removedAt,
        lastScannedAt: record.lastScannedAt,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: schema.files.path,
        set: {
          filename: record.filename,
          directory: record.directory,
          format: record.format,
          codec: record.codec,
          duration: record.duration,
          sampleRate: record.sampleRate,
          bitDepth: record.bitDepth,
          channels: record.channels,
          fileSize: record.fileSize,
          mtimeMs: record.mtimeMs,
          removedAt: record.removedAt,
          lastScannedAt: record.lastScannedAt,
          updatedAt: new Date().toISOString(),
        },
      })
      .run();
  }

  touchFileAsSeen(pathValue: string, lastScannedAt: string) {
    this.db.update(schema.files)
      .set({ removedAt: null, lastScannedAt, updatedAt: new Date().toISOString() })
      .where(eq(schema.files.path, pathValue))
      .run();
  }

  batchTouchFiles(entries: AudioFileTouchEntry[], now: string): void {
    if (entries.length === 0) return;
    const stmt = this.sqlite.prepare(
      "UPDATE files SET removed_at = NULL, last_scanned_at = ?, updated_at = ? WHERE path = ?",
    );
    const txn = this.sqlite.transaction((batchEntries: AudioFileTouchEntry[]) => {
      for (const entry of batchEntries) {
        stmt.run(now, now, entry.path);
      }
    });

    txn(entries);
  }

  batchUpsertFiles(records: ScanFileRecord[], now: string): void {
    if (records.length === 0) return;

    const stmt = this.sqlite.prepare(
      `INSERT INTO files (id, path, filename, directory, format, codec, duration, sample_rate, bit_depth, channels, file_size, mtime_ms, removed_at, last_scanned_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         filename=excluded.filename, directory=excluded.directory, format=excluded.format, codec=excluded.codec,
         duration=excluded.duration, sample_rate=excluded.sample_rate, bit_depth=excluded.bit_depth,
         channels=excluded.channels, file_size=excluded.file_size, mtime_ms=excluded.mtime_ms,
         removed_at=excluded.removed_at, last_scanned_at=excluded.last_scanned_at, updated_at=excluded.updated_at`,
    );
    const txn = this.sqlite.transaction((batchRecords: ScanFileRecord[]) => {
      for (const record of batchRecords) {
        stmt.run(
          uuid(),
          record.path,
          record.filename,
          record.directory,
          record.format,
          record.codec,
          record.duration,
          record.sampleRate,
          record.bitDepth,
          record.channels,
          record.fileSize,
          record.mtimeMs,
          record.removedAt,
          record.lastScannedAt,
          now,
        );
      }
    });

    txn(records);
  }

  batchUpdateFileMetadata(
    records: Array<
      Pick<
        ScanFileRecord,
        "path" | "codec" | "duration" | "sampleRate" | "bitDepth" | "channels" | "fileSize"
      >
    >,
    now: string,
  ): void {
    if (records.length === 0) return;

    const stmt = this.sqlite.prepare(
      `UPDATE files
       SET codec = ?,
           duration = ?,
           sample_rate = ?,
           bit_depth = ?,
           channels = ?,
           file_size = ?,
           updated_at = ?
       WHERE path = ?`,
    );
    const txn = this.sqlite.transaction((batchRecords: typeof records) => {
      for (const record of batchRecords) {
        stmt.run(
          record.codec,
          record.duration,
          record.sampleRate,
          record.bitDepth,
          record.channels,
          record.fileSize,
          now,
          record.path,
        );
      }
    });

    txn(records);
  }

  markFileRemoved(pathValue: string, removedAt: string) {
    this.db.update(schema.files)
      .set({ removedAt, updatedAt: new Date().toISOString() })
      .where(and(eq(schema.files.path, pathValue), isNull(schema.files.removedAt)))
      .run();
  }

  batchMarkRemoved(paths: string[], removedAt: string, now: string): void {
    if (paths.length === 0) return;

    const stmt = this.sqlite.prepare(
      "UPDATE files SET removed_at = ?, updated_at = ? WHERE path = ? AND removed_at IS NULL",
    );
    const txn = this.sqlite.transaction((batchPaths: string[]) => {
      for (const filePath of batchPaths) {
        stmt.run(removedAt, now, filePath);
      }
    });

    txn(paths);
  }

  reconcileMovedFiles(): number {
    const removedFiles = this.sqlite
      .prepare(
        `SELECT id, filename, file_size as fileSize, duration, is_favorite as isFavorite
         FROM files
         WHERE removed_at IS NOT NULL`,
      )
      .all() as Array<{
        id: string;
        filename: string;
        fileSize: number | null;
        duration: number | null;
        isFavorite: number | boolean | null;
      }>;

    const findActiveMatch = this.sqlite.prepare(
      `SELECT id
       FROM files
       WHERE removed_at IS NULL
         AND filename = ?
         AND COALESCE(file_size, -1) = COALESCE(?, -1)
         AND ABS(COALESCE(duration, -1) - COALESCE(?, -1)) < 0.01`,
    );
    const copyCollections = this.sqlite.prepare(
      `INSERT OR IGNORE INTO file_collections (file_id, collection_id)
       SELECT ?, collection_id FROM file_collections WHERE file_id = ?`,
    );
    const copyTags = this.sqlite.prepare(
      `INSERT OR IGNORE INTO file_tags (file_id, tag_id)
       SELECT ?, tag_id FROM file_tags WHERE file_id = ?`,
    );
    const preserveFavorite = this.sqlite.prepare("UPDATE files SET is_favorite = 1 WHERE id = ?");
    const deleteOldCollections = this.sqlite.prepare("DELETE FROM file_collections WHERE file_id = ?");
    const deleteOldTags = this.sqlite.prepare("DELETE FROM file_tags WHERE file_id = ?");
    const deleteOldFile = this.sqlite.prepare("DELETE FROM files WHERE id = ?");

    const reconcile = this.sqlite.transaction(() => {
      let relinked = 0;

      for (const removedFile of removedFiles) {
        const matches = findActiveMatch.all(
          removedFile.filename,
          removedFile.fileSize,
          removedFile.duration,
        ) as Array<{ id: string }>;

        if (matches.length !== 1) {
          continue;
        }

        const activeFileId = matches[0].id;
        copyCollections.run(activeFileId, removedFile.id);
        copyTags.run(activeFileId, removedFile.id);

        if (Boolean(removedFile.isFavorite)) {
          preserveFavorite.run(activeFileId);
        }

        deleteOldCollections.run(removedFile.id);
        deleteOldTags.run(removedFile.id);
        deleteOldFile.run(removedFile.id);
        relinked += 1;
      }

      return relinked;
    });

    return reconcile();
  }

  toggleFavorite(id: string): boolean {
    const file = this.getFileById(id);

    if (!file) {
      return false;
    }

    this.db.update(schema.files)
      .set({ isFavorite: !file.isFavorite, updatedAt: new Date().toISOString() })
      .where(eq(schema.files.id, id))
      .run();

    return true;
  }
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
