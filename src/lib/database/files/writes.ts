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
