import { and, asc, eq, isNull, like, or } from "drizzle-orm";
import { v4 as uuid } from "uuid";

import type { ScanFileRecord } from "@yard-core";
import { normalizeDirectoryPath } from "@yard-core";

import { db, sqlite } from "./connection";
import * as schema from "@/lib/schema";

const SQLITE_MAX_VARIABLES = 999;
type StoredFileRecord = typeof schema.files.$inferSelect;

function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

export function getFiles(options?: {
  query?: string;
  favorites?: boolean;
  collectionId?: string | null;
  directory?: string | null;
  showRemoved?: boolean;
  limit?: number;
  offset?: number;
}) {
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

    const rows = db
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

    return rows.map((row) => row);
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

  return db
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
    .all();
}

export function getFileCount(options?: {
  query?: string;
  favorites?: boolean;
  collectionId?: string | null;
  showRemoved?: boolean;
}) {
  const { query, favorites, collectionId, showRemoved } = options ?? {};

  if (collectionId) {
    const result = sqlite
      .prepare(
        `SELECT COUNT(*) as count
         FROM file_collections
         JOIN files ON file_collections.file_id = files.id
         WHERE file_collections.collection_id = ?
         ${!showRemoved ? "AND files.removed_at IS NULL" : ""}`,
      )
      .get(collectionId) as { count: number };

    return result.count;
  }

  const filters = [];
  if (!showRemoved) filters.push("removed_at IS NULL");
  if (favorites) filters.push("is_favorite = 1");
  if (query) filters.push("filename LIKE ?");

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const queryParam = query ? `%${query}%` : null;
  const sql = `SELECT COUNT(*) as count FROM files ${whereClause}`;
  const result = queryParam
    ? (sqlite.prepare(sql).get(queryParam) as { count: number })
    : (sqlite.prepare(sql).get() as { count: number });

  return result.count;
}

export function getAllFilesIncludingRemoved() {
  return db
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
    .all();
}

export function getFileById(id: string) {
  return db.select().from(schema.files).where(eq(schema.files.id, id)).get() ?? null;
}

export function getFileByPath(filePath: string) {
  return db.select().from(schema.files).where(eq(schema.files.path, filePath)).get() ?? null;
}

export function getFilesByPaths(paths: string[]) {
  if (paths.length === 0) {
    return [];
  }

  const results: StoredFileRecord[] = [];
  const chunkSize = Math.max(1, SQLITE_MAX_VARIABLES - 1);

  for (const chunk of chunkArray(paths, chunkSize)) {
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = sqlite
      .prepare(
        `SELECT
          id,
          path,
          filename,
          directory,
          format,
          codec,
          duration,
          sample_rate as sampleRate,
          bit_depth as bitDepth,
          channels,
          file_size as fileSize,
          mtime_ms as mtimeMs,
          is_favorite as isFavorite,
          removed_at as removedAt,
          last_scanned_at as lastScannedAt,
          created_at as createdAt,
          updated_at as updatedAt
         FROM files
         WHERE path IN (${placeholders})`,
      )
      .all(...chunk) as StoredFileRecord[];

    results.push(...rows);
  }

  return results;
}

export function upsertFile(record: ScanFileRecord) {
  db.insert(schema.files)
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

export function touchFileAsSeen(pathValue: string, lastScannedAt: string) {
  db.update(schema.files)
    .set({ removedAt: null, lastScannedAt, updatedAt: new Date().toISOString() })
    .where(eq(schema.files.path, pathValue))
    .run();
}

export function batchTouchFiles(
  entries: { path: string; lastScannedAt: string }[],
  now: string,
) {
  if (entries.length === 0) return;

  const stmt = sqlite.prepare(
    "UPDATE files SET removed_at = NULL, last_scanned_at = ?, updated_at = ? WHERE path = ?",
  );
  const txn = sqlite.transaction((batchEntries: typeof entries) => {
    for (const entry of batchEntries) {
      stmt.run(now, now, entry.path);
    }
  });

  txn(entries);
}

export function batchUpsertFiles(records: ScanFileRecord[], now: string) {
  if (records.length === 0) return;

  const stmt = sqlite.prepare(
    `INSERT INTO files (id, path, filename, directory, format, codec, duration, sample_rate, bit_depth, channels, file_size, mtime_ms, removed_at, last_scanned_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(path) DO UPDATE SET
       filename=excluded.filename, directory=excluded.directory, format=excluded.format, codec=excluded.codec,
       duration=excluded.duration, sample_rate=excluded.sample_rate, bit_depth=excluded.bit_depth,
       channels=excluded.channels, file_size=excluded.file_size, mtime_ms=excluded.mtime_ms,
       removed_at=excluded.removed_at, last_scanned_at=excluded.last_scanned_at, updated_at=excluded.updated_at`,
  );
  const txn = sqlite.transaction((batchRecords: ScanFileRecord[]) => {
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

export function batchUpdateFileMetadata(
  records: Array<{
    path: string;
    codec: string | null;
    duration: number | null;
    sampleRate: number | null;
    bitDepth: number | null;
    channels: number | null;
    fileSize: number | null;
  }>,
  now: string,
) {
  if (records.length === 0) return;

  const stmt = sqlite.prepare(
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
  const txn = sqlite.transaction((batchRecords: typeof records) => {
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

export function markFileRemoved(pathValue: string, removedAt: string) {
  db.update(schema.files)
    .set({ removedAt, updatedAt: new Date().toISOString() })
    .where(and(eq(schema.files.path, pathValue), isNull(schema.files.removedAt)))
    .run();
}

export function batchMarkRemoved(paths: string[], removedAt: string, now: string) {
  if (paths.length === 0) return;

  const stmt = sqlite.prepare(
    "UPDATE files SET removed_at = ?, updated_at = ? WHERE path = ? AND removed_at IS NULL",
  );
  const txn = sqlite.transaction((batchPaths: string[]) => {
    for (const filePath of batchPaths) {
      stmt.run(removedAt, now, filePath);
    }
  });

  txn(paths);
}

export function reconcileMovedFiles() {
  const removedFiles = sqlite
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

  const findActiveMatch = sqlite.prepare(
    `SELECT id
     FROM files
     WHERE removed_at IS NULL
       AND filename = ?
       AND COALESCE(file_size, -1) = COALESCE(?, -1)
       AND ABS(COALESCE(duration, -1) - COALESCE(?, -1)) < 0.01`,
  );
  const copyCollections = sqlite.prepare(
    `INSERT OR IGNORE INTO file_collections (file_id, collection_id)
     SELECT ?, collection_id FROM file_collections WHERE file_id = ?`,
  );
  const copyTags = sqlite.prepare(
    `INSERT OR IGNORE INTO file_tags (file_id, tag_id)
     SELECT ?, tag_id FROM file_tags WHERE file_id = ?`,
  );
  const preserveFavorite = sqlite.prepare("UPDATE files SET is_favorite = 1 WHERE id = ?");
  const deleteOldCollections = sqlite.prepare("DELETE FROM file_collections WHERE file_id = ?");
  const deleteOldTags = sqlite.prepare("DELETE FROM file_tags WHERE file_id = ?");
  const deleteOldFile = sqlite.prepare("DELETE FROM files WHERE id = ?");

  const reconcile = sqlite.transaction(() => {
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

export function toggleFavorite(id: string) {
  const file = getFileById(id);

  if (!file) {
    return false;
  }

  db.update(schema.files)
    .set({ isFavorite: !file.isFavorite, updatedAt: new Date().toISOString() })
    .where(eq(schema.files.id, id))
    .run();

  return true;
}
