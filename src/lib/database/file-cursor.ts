import { sql, type SQL } from "drizzle-orm";

/**
 * Opaque keyset cursor for Audio file pages (#256).
 *
 * A cursor names the last row of the previous page in the active ordering —
 * filename or duration, either direction — plus the deterministic tiebreakers
 * (`filename`, `id`), so the next page starts exactly after it without a deep
 * `OFFSET` scan. The encoding is base64url JSON, opaque to callers; an
 * invalid or order-mismatched cursor is rejected rather than silently
 * restarting the listing.
 */

export type FileCursorKey = "filename" | "duration";

export type FileOrderCursor = {
  key: FileCursorKey;
  dir: 1 | -1;
  filename: string;
  id: string;
  /** The cursor row's duration; null sorts per the ordering's null placement. */
  duration: number | null;
};

export function encodeFileCursor(cursor: FileOrderCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeFileCursor(raw: string): FileOrderCursor | null {
  if (!raw || raw.length > 2048) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as {
      key?: unknown;
      dir?: unknown;
      filename?: unknown;
      id?: unknown;
      duration?: unknown;
    };
    if (parsed.key !== "filename" && parsed.key !== "duration") return null;
    if (parsed.dir !== 1 && parsed.dir !== -1) return null;
    if (typeof parsed.filename !== "string" || typeof parsed.id !== "string") return null;
    if (
      parsed.duration !== null &&
      (typeof parsed.duration !== "number" || !Number.isFinite(parsed.duration))
    ) {
      return null;
    }
    return {
      key: parsed.key,
      dir: parsed.dir,
      filename: parsed.filename,
      id: parsed.id,
      duration: parsed.duration as number | null,
    };
  } catch {
    return null;
  }
}

/**
 * Keyset predicate: rows strictly after `cursor` in the cursor's ordering.
 * Tiebreakers must match `buildFileOrderBy`: filename ordering breaks ties
 * by id ascending, while duration ordering breaks ties by filename and id in
 * the duration direction.
 */
export function fileKeysetFilter(cursor: FileOrderCursor): SQL {
  const idBound =
    cursor.dir === 1 || cursor.key === "filename"
      ? sql`(files.filename = ${cursor.filename} AND files.id > ${cursor.id})`
      : sql`(files.filename = ${cursor.filename} AND files.id < ${cursor.id})`;
  const afterFilename =
    cursor.dir === 1
      ? sql`(files.filename > ${cursor.filename} OR ${idBound})`
      : sql`(files.filename < ${cursor.filename} OR ${idBound})`;

  if (cursor.key === "filename") return afterFilename;

  const nullFlag = cursor.duration === null ? 1 : 0;
  const coalesced = cursor.duration ?? 0;
  const afterDuration =
    cursor.dir === 1
      ? sql`(COALESCE(files.duration, 0) > ${coalesced} OR (COALESCE(files.duration, 0) = ${coalesced} AND ${afterFilename}))`
      : sql`(COALESCE(files.duration, 0) < ${coalesced} OR (COALESCE(files.duration, 0) = ${coalesced} AND ${afterFilename}))`;

  return cursor.dir === 1
    ? sql`((files.duration IS NULL) > ${nullFlag} OR ((files.duration IS NULL) = ${nullFlag} AND ${afterDuration}))`
    : sql`((files.duration IS NULL) < ${nullFlag} OR ((files.duration IS NULL) = ${nullFlag} AND ${afterDuration}))`;
}
