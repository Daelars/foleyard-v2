import { and, asc, count, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { AudioFile, IndexedAudioFile, FileSearchQuery } from "@yard-core";
import { normalizeDirectoryPath } from "@yard-core";
import { chunkArray, escapeLikePattern, SQLITE_MAX_VARIABLES } from "../sql-parameters";
import * as schema from "@/lib/schema";
import type { FileRepositoryContext } from "./context";

/** LIKE predicate on the Audio file filename with `%`/`_`/`\` treated literally. */
function filenameLike(query: string) {
  return sql`${schema.files.filename} LIKE ${`%${escapeLikePattern(query)}%`} ESCAPE '\\'`;
}

function tagIdSubselect(context: FileRepositoryContext, tagId: string) {
  return inArray(
    schema.files.id,
    context.db
      .select({ fileId: schema.fileTags.fileId })
      .from(schema.fileTags)
      .where(eq(schema.fileTags.tagId, tagId)),
  );
}

function buildCollectionFilters(context: FileRepositoryContext, options: FileSearchQuery) {
  const { collectionId, tagId, showRemoved } = options;
  const collectionFilters = [eq(schema.fileCollections.collectionId, collectionId as string)];

  if (tagId) {
    collectionFilters.push(tagIdSubselect(context, tagId));
  }

  if (!showRemoved) {
    collectionFilters.push(isNull(schema.files.removedAt));
  }

  return collectionFilters;
}

function buildFileFilters(context: FileRepositoryContext, options: FileSearchQuery) {
  const { query, favorites, directory, libraryRoot, atLibraryRoot, tagId, showRemoved } = options;
  const filters = [];

  if (!showRemoved) {
    filters.push(isNull(schema.files.removedAt));
  }

  if (favorites) {
    filters.push(eq(schema.files.isFavorite, true));
  }

  if (libraryRoot) {
    filters.push(eq(schema.files.libraryRoot, libraryRoot));
    if (atLibraryRoot) {
      filters.push(isNull(schema.files.directory));
    }
  }

  if (tagId) {
    filters.push(tagIdSubselect(context, tagId));
  }

  if (query) {
    filters.push(filenameLike(query));
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

  return filters;
}

/**
 * Server-side ordering for the Audio file list. Pages must arrive in final
 * order so infinite scroll appends globally-correct rows. Duration ordering
 * mirrors the client sort: Audio files without a duration sort last when
 * ascending and first when descending. Filename and id tiebreakers keep
 * LIMIT/OFFSET paging deterministic.
 */
function buildFileOrderBy(options: FileSearchQuery) {
  const descending = options.sortDir === "desc";

  if (options.sortKey === "duration") {
    return [
      descending
        ? sql`${schema.files.duration} IS NULL DESC`
        : sql`${schema.files.duration} IS NULL ASC`,
      descending ? desc(schema.files.duration) : asc(schema.files.duration),
      asc(schema.files.filename),
      asc(schema.files.id),
    ];
  }

  return [
    descending ? desc(schema.files.filename) : asc(schema.files.filename),
    asc(schema.files.id),
  ];
}

export function getFiles(context: FileRepositoryContext, options?: FileSearchQuery): AudioFile[] {
    const {
      query,
      favorites,
      collectionId,
      directory,
      libraryRoot,
      atLibraryRoot,
      tagId,
      showRemoved,
      limit = 500,
      offset = 0,
      sortKey,
      sortDir,
    } = options ?? {};
    const orderBy = buildFileOrderBy({ sortKey, sortDir });

    if (collectionId) {
      const collectionFilters = buildCollectionFilters(context, { collectionId, tagId, showRemoved });

      const rows = context.db
        .select({
          id: schema.files.id,
          path: schema.files.path,
          filename: schema.files.filename,
          libraryRoot: schema.files.libraryRoot,
          directory: schema.files.directory,
          format: schema.files.format,
          duration: schema.files.duration,
          sampleRate: schema.files.sampleRate,
          bitDepth: schema.files.bitDepth,
          channels: schema.files.channels,
          fileSize: schema.files.fileSize,
          mtimeMs: schema.files.mtimeMs,
          isFavorite: schema.files.isFavorite,
          removedAt: schema.files.removedAt,
        })
        .from(schema.fileCollections)
        .innerJoin(schema.files, eq(schema.fileCollections.fileId, schema.files.id))
        .where(and(...collectionFilters))
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset)
        .all();

      return rows as AudioFile[];
    }

    const filters = buildFileFilters(context, {
      query,
      favorites,
      directory,
      libraryRoot,
      atLibraryRoot,
      tagId,
      showRemoved,
    });

    return context.db
      .select({
        id: schema.files.id,
        path: schema.files.path,
        filename: schema.files.filename,
        libraryRoot: schema.files.libraryRoot,
        directory: schema.files.directory,
        format: schema.files.format,
        duration: schema.files.duration,
        sampleRate: schema.files.sampleRate,
        bitDepth: schema.files.bitDepth,
        channels: schema.files.channels,
        fileSize: schema.files.fileSize,
        mtimeMs: schema.files.mtimeMs,
        isFavorite: schema.files.isFavorite,
        removedAt: schema.files.removedAt,
      })
      .from(schema.files)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset)
      .all() as AudioFile[];
  }

export function getFileCount(context: FileRepositoryContext, options?: FileSearchQuery): number {
    const { collectionId, tagId, showRemoved } = options ?? {};

    if (collectionId) {
      const collectionFilters = buildCollectionFilters(context, { collectionId, tagId, showRemoved });
      const result = context.db
        .select({ count: count() })
        .from(schema.fileCollections)
        .innerJoin(schema.files, eq(schema.fileCollections.fileId, schema.files.id))
        .where(and(...collectionFilters))
        .get();

      return result?.count ?? 0;
    }

    const filters = buildFileFilters(context, options ?? {});

    const result = context.db
      .select({ count: count() })
      .from(schema.files)
      .where(filters.length ? and(...filters) : undefined)
      .get();

    return result?.count ?? 0;
  }

export function getAllFilesIncludingRemoved(context: FileRepositoryContext): IndexedAudioFile[] {
    return context.db
      .select({
        id: schema.files.id,
        path: schema.files.path,
        filename: schema.files.filename,
        libraryRoot: schema.files.libraryRoot,
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

export function getFileById(context: FileRepositoryContext, id: string): IndexedAudioFile | null {
    return (context.db.select().from(schema.files).where(eq(schema.files.id, id)).get() ?? null) as IndexedAudioFile | null;
  }

export function getFileByPath(context: FileRepositoryContext, filePath: string): IndexedAudioFile | null {
    return (context.db.select().from(schema.files).where(eq(schema.files.path, filePath)).get() ?? null) as IndexedAudioFile | null;
  }

export function getFilesByPaths(context: FileRepositoryContext, paths: string[]): IndexedAudioFile[] {
    if (paths.length === 0) {
      return [];
    }

    const results: IndexedAudioFile[] = [];
    const chunkSize = Math.max(1, SQLITE_MAX_VARIABLES - 1);

    for (const chunk of chunkArray(paths, chunkSize)) {
      const rows = context.db
        .select()
        .from(schema.files)
        .where(inArray(schema.files.path, chunk))
        .all() as IndexedAudioFile[];

      results.push(...rows);
    }

    return results;
  }
