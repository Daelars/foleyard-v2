import { v4 as uuid } from "uuid";
import type { AudioFileTouchEntry, ScanFileRecord } from "@yard-core";
import type { FileRepositoryContext } from "./context";

export function batchTouchFiles(context: FileRepositoryContext, entries: AudioFileTouchEntry[], now: string): void {
    if (entries.length === 0) return;
    const stmt = context.sqlite.prepare(
      "UPDATE files SET removed_at = NULL, last_scanned_at = ?, library_root = COALESCE(?, library_root), updated_at = ? WHERE path = ?",
    );
    const txn = context.sqlite.transaction((batchEntries: AudioFileTouchEntry[]) => {
      for (const entry of batchEntries) {
        stmt.run(now, entry.libraryRoot ?? null, now, entry.path);
      }
    });

    txn(entries);
  }

export function batchUpsertFiles(context: FileRepositoryContext, records: ScanFileRecord[], now: string): void {
    if (records.length === 0) return;

    const stmt = context.sqlite.prepare(
      `INSERT INTO files (id, path, filename, library_root, directory, format, codec, duration, sample_rate, bit_depth, channels, file_size, mtime_ms, removed_at, last_scanned_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         filename=excluded.filename, library_root=excluded.library_root, directory=excluded.directory, format=excluded.format, codec=excluded.codec,
         duration=excluded.duration, sample_rate=excluded.sample_rate, bit_depth=excluded.bit_depth,
         channels=excluded.channels, file_size=excluded.file_size, mtime_ms=excluded.mtime_ms,
         removed_at=excluded.removed_at, last_scanned_at=excluded.last_scanned_at, updated_at=excluded.updated_at`,
    );
    const txn = context.sqlite.transaction((batchRecords: ScanFileRecord[]) => {
      for (const record of batchRecords) {
        stmt.run(
          uuid(),
          record.path,
          record.filename,
          record.libraryRoot ?? null,
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

export function batchUpdateFileMetadata(context: FileRepositoryContext, records: Array<
      Pick<
        ScanFileRecord,
        "path" | "codec" | "duration" | "sampleRate" | "bitDepth" | "channels" | "fileSize"
      >
    >, now: string): void {
    if (records.length === 0) return;

    const stmt = context.sqlite.prepare(
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
    const txn = context.sqlite.transaction((batchRecords: typeof records) => {
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

export function batchMarkRemoved(context: FileRepositoryContext, paths: string[], removedAt: string, now: string): void {
    if (paths.length === 0) return;

    const stmt = context.sqlite.prepare(
      "UPDATE files SET removed_at = ?, updated_at = ? WHERE path = ? AND removed_at IS NULL",
    );
    const txn = context.sqlite.transaction((batchPaths: string[]) => {
      for (const filePath of batchPaths) {
        stmt.run(removedAt, now, filePath);
      }
    });

    txn(paths);
  }

export function reconcileMovedFiles(context: FileRepositoryContext): number {
    const removedFiles = context.sqlite
      .prepare(
        `SELECT id, filename, library_root as libraryRoot, file_size as fileSize,
                duration, codec, sample_rate as sampleRate, bit_depth as bitDepth,
                channels, is_favorite as isFavorite
         FROM files
         WHERE removed_at IS NOT NULL`,
      )
      .all() as Array<{
        id: string;
        filename: string;
        libraryRoot: string | null;
        fileSize: number | null;
        duration: number | null;
        codec: string | null;
        sampleRate: number | null;
        bitDepth: number | null;
        channels: number | null;
        isFavorite: number | boolean | null;
      }>;

    const findActiveMatch = context.sqlite.prepare(
      `SELECT id
       FROM files
       WHERE removed_at IS NULL
         AND filename = ?
         AND COALESCE(library_root, '') = COALESCE(?, '')
         AND COALESCE(file_size, -1) = COALESCE(?, -1)
         AND ABS(COALESCE(duration, -1) - COALESCE(?, -1)) < 0.01
         AND COALESCE(codec, '') = COALESCE(?, '')
         AND COALESCE(sample_rate, -1) = COALESCE(?, -1)
         AND COALESCE(bit_depth, -1) = COALESCE(?, -1)
         AND COALESCE(channels, -1) = COALESCE(?, -1)`,
    );
    const copyCollections = context.sqlite.prepare(
      `INSERT OR IGNORE INTO file_collections (file_id, collection_id)
       SELECT ?, collection_id FROM file_collections WHERE file_id = ?`,
    );
    const copyTags = context.sqlite.prepare(
      `INSERT OR IGNORE INTO file_tags (file_id, tag_id)
       SELECT ?, tag_id FROM file_tags WHERE file_id = ?`,
    );
    const preserveFavorite = context.sqlite.prepare("UPDATE files SET is_favorite = 1 WHERE id = ?");
    const deleteOldCollections = context.sqlite.prepare("DELETE FROM file_collections WHERE file_id = ?");
    const deleteOldTags = context.sqlite.prepare("DELETE FROM file_tags WHERE file_id = ?");
    const deleteOldFile = context.sqlite.prepare("DELETE FROM files WHERE id = ?");

    const reconcile = context.sqlite.transaction(() => {
      let relinked = 0;

      for (const removedFile of removedFiles) {
        const matches = findActiveMatch.all(
          removedFile.filename,
          removedFile.libraryRoot,
          removedFile.fileSize,
          removedFile.duration,
          removedFile.codec,
          removedFile.sampleRate,
          removedFile.bitDepth,
          removedFile.channels,
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
