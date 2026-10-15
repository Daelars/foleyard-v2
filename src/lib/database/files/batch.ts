import { v4 as uuid } from "uuid";
import type { AudioFileTouchEntry, MovedFileReconciliation, ScanFileRecord } from "@yard-core";
import { SqliteMoveJournal, type AmbiguousMoveInput } from "@/lib/database/move-journal";
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

/**
 * Timestamp-only touch for rows already known to be active with unchanged
 * ownership (the scanner's unchanged branch, where removed_at is already
 * NULL and library_root is unchanged). Touching fewer columns keeps the
 * partial browse indexes out of the write path where possible.
 */
export function batchTouchActiveFiles(context: FileRepositoryContext, paths: string[], now: string): void {
    if (paths.length === 0) return;
    const stmt = context.sqlite.prepare(
      "UPDATE files SET last_scanned_at = ?, updated_at = ? WHERE path = ?",
    );
    const txn = context.sqlite.transaction((batchPaths: string[]) => {
      for (const filePath of batchPaths) {
        stmt.run(now, now, filePath);
      }
    });

    txn(paths);
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

/**
 * Reconcile removed rows against newly discovered paths (#274).
 *
 * A move and a removed-and-replaced file look alike: the old path is gone and
 * a new one appeared. Identity is size+mtime — the same signal permanent
 * deletion validates against (#269) and documented in `docs/library.md` —
 * within the same Library root, with both values known. Filename, duration
 * and codec are not identity, and a scan never hashes content.
 *
 * A move is confirmed only when the match is unique in both directions:
 * exactly one active candidate for the removed row and exactly one removed
 * row claiming that candidate. Anything else is ambiguous: it is recorded in
 * `ambiguous_moves` and left as a removal plus an add, so a distinct
 * recording never inherits another's organization data.
 *
 * `activeFileIds`, when supplied, restricts candidates to files the scan
 * just added ("the new path appeared", docs/library.md). The scanner passes
 * the paths it discovered as new so a file that was already in the Library
 * and merely unchanged can never be mistaken for a move target; a direct
 * caller that omits it reconciles against every active row.
 */
export function reconcileMovedFiles(
  context: FileRepositoryContext,
  activeFileIds?: string[],
): MovedFileReconciliation {
    const removedFiles = context.sqlite
      .prepare(
        `SELECT id, path, library_root as libraryRoot, file_size as fileSize,
                mtime_ms as mtimeMs, is_favorite as isFavorite
         FROM files
         WHERE removed_at IS NOT NULL`,
      )
      .all() as Array<{
        id: string;
        path: string;
        libraryRoot: string | null;
        fileSize: number | null;
        mtimeMs: number | null;
        isFavorite: number | boolean | null;
      }>;

    // Identity is size+mtime with both known, inside one root. An unknown
    // signal never matches, so it can never move organization data onto a
    // guess. (SELECT ... see docs/library.md "Identity signals and moves".)
    const findActiveMatches = context.sqlite.prepare(
      `SELECT id
       FROM files
       WHERE removed_at IS NULL
         AND COALESCE(library_root, '') = COALESCE(?, '')
         AND file_size IS NOT NULL
         AND mtime_ms IS NOT NULL
         AND file_size = ?
         AND mtime_ms = ?`,
    );

    // Phase 1: candidates for each removed row that has a known identity.
    const newActiveIds = activeFileIds ? new Set(activeFileIds) : null;
    const candidatesByRemoved = new Map<
      string,
      { removed: (typeof removedFiles)[number]; candidates: string[] }
    >();
    for (const removedFile of removedFiles) {
      if (removedFile.fileSize === null || removedFile.mtimeMs === null) continue;
      const candidates = (
        findActiveMatches.all(
          removedFile.libraryRoot,
          removedFile.fileSize,
          removedFile.mtimeMs,
        ) as Array<{ id: string }>
      )
        .map((row) => row.id)
        .filter((id) => !newActiveIds || newActiveIds.has(id));
      if (candidates.length === 0) continue;
      candidatesByRemoved.set(removedFile.id, { removed: removedFile, candidates });
    }

    // Phase 2: how many removed rows claim each active candidate. A move is
    // confirmed only when the match is exclusive in both directions.
    const claimsByActive = new Map<string, number>();
    for (const { candidates } of candidatesByRemoved.values()) {
      for (const id of candidates) {
        claimsByActive.set(id, (claimsByActive.get(id) ?? 0) + 1);
      }
    }

    const confirmed: Array<{ removed: (typeof removedFiles)[number]; activeId: string }> = [];
    const ambiguous: AmbiguousMoveInput[] = [];
    for (const { removed, candidates } of candidatesByRemoved.values()) {
      if (candidates.length === 1 && claimsByActive.get(candidates[0]) === 1) {
        confirmed.push({ removed, activeId: candidates[0] });
      } else {
        ambiguous.push({
          removedFileId: removed.id,
          path: removed.path,
          libraryRoot: removed.libraryRoot,
          fileSize: removed.fileSize,
          mtimeMs: removed.mtimeMs,
          candidateFileIds: candidates,
        });
      }
    }

    const copyCollections = context.sqlite.prepare(
      `INSERT OR IGNORE INTO file_collections (file_id, collection_id)
       SELECT ?, collection_id FROM file_collections WHERE file_id = ?`,
    );
    const copyTags = context.sqlite.prepare(
      `INSERT OR IGNORE INTO file_tags (file_id, tag_id, origin, confidence)
       SELECT ?, tag_id, origin, confidence FROM file_tags WHERE file_id = ?`,
    );
    const copyEmbeddings = context.sqlite.prepare(
      `INSERT OR IGNORE INTO file_embeddings (file_id, model, dim, vec)
       SELECT ?, model, dim, vec FROM file_embeddings WHERE file_id = ?`,
    );
    const preserveFavorite = context.sqlite.prepare("UPDATE files SET is_favorite = 1 WHERE id = ?");
    const deleteOldCollections = context.sqlite.prepare("DELETE FROM file_collections WHERE file_id = ?");
    const deleteOldTags = context.sqlite.prepare("DELETE FROM file_tags WHERE file_id = ?");
    const deleteOldEmbeddings = context.sqlite.prepare("DELETE FROM file_embeddings WHERE file_id = ?");
    const deleteOldFile = context.sqlite.prepare("DELETE FROM files WHERE id = ?");

    const moveJournal = new SqliteMoveJournal(context.sqlite);

    const reconcile = context.sqlite.transaction(() => {
      // Ambiguity is re-derived on every pass: recording the current set
      // clears an entry whose match has since resolved.
      moveJournal.replace(ambiguous);

      let relinked = 0;
      for (const { removed, activeId } of confirmed) {
        copyCollections.run(activeId, removed.id);
        copyTags.run(activeId, removed.id);
        copyEmbeddings.run(activeId, removed.id);

        if (Boolean(removed.isFavorite)) {
          preserveFavorite.run(activeId);
        }

        deleteOldCollections.run(removed.id);
        deleteOldTags.run(removed.id);
        deleteOldEmbeddings.run(removed.id);
        deleteOldFile.run(removed.id);
        relinked += 1;
      }

      return relinked;
    });

    const relinked = reconcile();
    return { relinked, ambiguous: ambiguous.length };
}

