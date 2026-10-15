import { and, asc, count, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import type { AudioFile, IndexedAudioFile, FileSearchQuery, TagOrigin } from "@yard-core";
import { normalizeDirectoryPath } from "@yard-core";
import { decodeFileCursor, fileKeysetFilter } from "../file-cursor";
import { filenameSearch } from "../filename-search";
import { chunkArray, SQLITE_MAX_VARIABLES } from "../sql-parameters";
import * as schema from "@/lib/schema";
import type { FileRepositoryContext } from "./context";

function tagIdSubselect(context: FileRepositoryContext, tagId: string) {
  return inArray(
    schema.files.id,
    context.db
      .select({ fileId: schema.fileTags.fileId })
      .from(schema.fileTags)
      .where(eq(schema.fileTags.tagId, tagId)),
  );
}

function tagOriginSubselect(context: FileRepositoryContext, origin: TagOrigin) {
  return inArray(
    schema.files.id,
    context.db
      .select({ fileId: schema.fileTags.fileId })
      .from(schema.fileTags)
      .where(eq(schema.fileTags.origin, origin)),
  );
}

/**
 * The one filter-construction contract shared by every Audio file query
 * (#272). A Collection query is the same query with an extra
 * `fileCollections` membership predicate; nothing else differs, so search,
 * favorites, library root, directory, tag, tag origin, removed state and
 * keyset cursors all apply identically whether or not a `collectionId` is
 * set. The `fileCollections` predicate is only added when `collectionId` is
 * present, matching the `FROM` clause the caller builds.
 *
 * The caller decides whether the cursor and paging fields participate:
 * `getFiles` passes them, `getFileCount` counts the whole filtered set.
 */
function buildFilters(context: FileRepositoryContext, options: FileSearchQuery) {
  const {
    query,
    favorites,
    collectionId,
    directory,
    libraryRoot,
    atLibraryRoot,
    tagId,
    tagOrigin,
    showRemoved,
    cursor,
  } = options;
  const filters = [];

  if (collectionId) {
    filters.push(eq(schema.fileCollections.collectionId, collectionId));
  }

  if (cursor) {
    const decoded = decodeFileCursor(cursor);
    const expectedKey = options.sortKey ?? "filename";
    const expectedDir = options.sortDir === "desc" ? -1 : 1;
    if (!decoded || decoded.key !== expectedKey || decoded.dir !== expectedDir) {
      throw new Error("Invalid file cursor for this ordering.");
    }
    filters.push(fileKeysetFilter(decoded));
  }

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

  if (tagOrigin) {
    filters.push(tagOriginSubselect(context, tagOrigin));
  }

  if (query) {
    filters.push(filenameSearch(context.sqlite, query));
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

/** The Audio file columns every listing projection returns. */
const fileProjection = {
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
  createdAt: schema.files.createdAt,
};

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
    // NULLS LAST/FIRST matches the previous `duration IS NULL` expression and
    // is index-supported by idx_files_active_duration (#255). The tiebreakers
    // follow the duration direction so a reverse index scan satisfies both.
    return descending
      ? [sql`${schema.files.duration} DESC NULLS FIRST`, desc(schema.files.filename), desc(schema.files.id)]
      : [sql`${schema.files.duration} ASC NULLS LAST`, asc(schema.files.filename), asc(schema.files.id)];
  }

  return [
    descending ? desc(schema.files.filename) : asc(schema.files.filename),
    asc(schema.files.id),
  ];
}

export function getFiles(context: FileRepositoryContext, options?: FileSearchQuery): AudioFile[] {
    const { collectionId, limit = 500, offset = 0, sortKey, sortDir } = options ?? {};
    const orderBy = buildFileOrderBy({ sortKey, sortDir });
    const filters = buildFilters(context, options ?? {});

    if (collectionId) {
      return context.db
        .select(fileProjection)
        .from(schema.fileCollections)
        .innerJoin(schema.files, eq(schema.fileCollections.fileId, schema.files.id))
        .where(and(...filters))
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset)
        .all() as AudioFile[];
    }

    return context.db
      .select(fileProjection)
      .from(schema.files)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(...orderBy)
      .limit(limit)
      .offset(offset)
      .all() as AudioFile[];
  }

export function getFileCount(context: FileRepositoryContext, options?: FileSearchQuery): number {
    // A count describes the whole filtered set, so the keyset cursor (a page
    // boundary) is deliberately excluded; every real filter still travels the
    // same builder as the listing.
    const { collectionId } = options ?? {};
    const filters = buildFilters(context, { ...options, cursor: undefined });

    if (collectionId) {
      const result = context.db
        .select({ count: count() })
        .from(schema.fileCollections)
        .innerJoin(schema.files, eq(schema.fileCollections.fileId, schema.files.id))
        .where(and(...filters))
        .get();

      return result?.count ?? 0;
    }

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

/**
 * Narrow scan-cleanup projection: only the fields removal reconciliation
 * consumes (path, library root, removed state). Raw select without Drizzle
 * mapping; used by ScanRunner before discovery so a large library is not
 * fully materialized through the repository mapping for every scan.
 */
export function getScanCleanupRows(context: FileRepositoryContext): Array<{
  path: string;
  libraryRoot: string | null;
  removedAt: string | null;
}> {
    return context.sqlite
      .prepare("SELECT path, library_root AS libraryRoot, removed_at AS removedAt FROM files")
      .all() as Array<{ path: string; libraryRoot: string | null; removedAt: string | null }>;
  }

export function getFileById(context: FileRepositoryContext, id: string): IndexedAudioFile | null {
  return (context.db.select().from(schema.files).where(eq(schema.files.id, id)).get() ?? null) as IndexedAudioFile | null;
}

/**
 * Live files touched by the scan that started at `sinceIso`: the
 * post-scan auto-tag trigger's arrival list. Removed files never qualify.
 */
export function getFileIdsScannedSince(context: FileRepositoryContext, sinceIso: string): string[] {
  return context.db
    .select({ id: schema.files.id })
    .from(schema.files)
    .where(and(gte(schema.files.lastScannedAt, sinceIso), isNull(schema.files.removedAt)))
    .orderBy(asc(schema.files.id))
    .all()
    .map((row) => row.id);
}

export function getFileByPath(context: FileRepositoryContext, filePath: string): IndexedAudioFile | null {
    return (context.db.select().from(schema.files).where(eq(schema.files.path, filePath)).get() ?? null) as IndexedAudioFile | null;
  }

export function getFilesByPaths(context: FileRepositoryContext, paths: string[]): IndexedAudioFile[] {    if (paths.length === 0) {
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

export function getFilesByIds(context: FileRepositoryContext, ids: string[]): IndexedAudioFile[] {
    if (ids.length === 0) {
      return [];
    }

    const results: IndexedAudioFile[] = [];
    const chunkSize = Math.max(1, SQLITE_MAX_VARIABLES - 1);

    for (const chunk of chunkArray(ids, chunkSize)) {
      const rows = context.db
        .select()
        .from(schema.files)
        .where(inArray(schema.files.id, chunk))
        .all() as IndexedAudioFile[];

      results.push(...rows);
    }

    return results;
  }
