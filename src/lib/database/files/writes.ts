import { and, eq, isNull } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import type { ScanFileRecord } from "@yard-core";
import { getFileById } from "./reads";
import * as schema from "@/lib/schema";
import type { FileRepositoryContext } from "./context";

export function upsertFile(context: FileRepositoryContext, record: ScanFileRecord): void {
    context.db.insert(schema.files)
      .values({
        id: uuid(),
        path: record.path,
        filename: record.filename,
        libraryRoot: record.libraryRoot ?? null,
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
          libraryRoot: record.libraryRoot ?? null,
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

export function touchFileAsSeen(context: FileRepositoryContext, pathValue: string, lastScannedAt: string) {
    context.db.update(schema.files)
      .set({ removedAt: null, lastScannedAt, updatedAt: new Date().toISOString() })
      .where(eq(schema.files.path, pathValue))
      .run();
  }

export function markFileRemoved(context: FileRepositoryContext, pathValue: string, removedAt: string) {
    context.db.update(schema.files)
      .set({ removedAt, updatedAt: new Date().toISOString() })
      .where(and(eq(schema.files.path, pathValue), isNull(schema.files.removedAt)))
      .run();
  }

export function toggleFavorite(context: FileRepositoryContext, id: string): boolean {
    const file = getFileById(context, id);

    if (!file) {
      return false;
    }

    context.db.update(schema.files)
      .set({ isFavorite: !file.isFavorite, updatedAt: new Date().toISOString() })
      .where(eq(schema.files.id, id))
      .run();

    return true;
  }

/**
 * Batch favourite write: one transaction for the whole id list with an
 * explicit target state. Throws when any id is unknown so the transaction
 * rolls back instead of partially applying.
 */
export function setFavorites(context: FileRepositoryContext, ids: string[], isFavorite: boolean): void {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    const value = isFavorite ? 1 : 0;
    const update = context.sqlite.prepare(
      "UPDATE files SET is_favorite = ?, updated_at = ? WHERE id = ?",
    );
    const txn = context.sqlite.transaction((batchIds: string[]) => {
      for (const id of batchIds) {
        const result = update.run(value, now, id) as unknown as { changes: number };
        if (result.changes === 0) {
          throw new Error(`File does not exist: ${id}`);
        }
      }
    });
    txn(ids);
  }

/**
 * Batch tag write: one transaction for the whole file list with an explicit
 * attach/detach target. Throws on unknown tag or file so partial failures
 * roll back instead of partially applying.
 */
export function setFileTagBatch(
    context: FileRepositoryContext,
    fileIds: string[],
    tagId: string,
    attached: boolean,
  ): void {
    if (fileIds.length === 0) return;
    const txn = context.sqlite.transaction((batchIds: string[]) => {
      const tagExists = context.sqlite.prepare("SELECT 1 FROM tags WHERE id = ?").get(tagId);
      if (!tagExists) {
        throw new Error(`Tag does not exist: ${tagId}`);
      }
      const fileExists = context.sqlite.prepare("SELECT 1 FROM files WHERE id = ?");
      const attach = context.sqlite.prepare(
        "INSERT OR IGNORE INTO file_tags (file_id, tag_id) VALUES (?, ?)",
      );
      const detach = context.sqlite.prepare(
        "DELETE FROM file_tags WHERE file_id = ? AND tag_id = ?",
      );
      for (const fileId of batchIds) {
        if (!fileExists.get(fileId)) {
          throw new Error(`File does not exist: ${fileId}`);
        }
        if (attached) {
          attach.run(fileId, tagId);
        } else {
          detach.run(fileId, tagId);
        }
      }
    });
    txn(fileIds);
  }
