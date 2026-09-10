import type { TagOrigin } from "./tag";

export type FileSortKey = "filename" | "duration";
export type FileSortDirection = "asc" | "desc";

export interface FileSearchQuery {
  query?: string;
  favorites?: boolean;
  collectionId?: string | null;
  directory?: string | null;
  libraryRoot?: string | null;
  atLibraryRoot?: boolean;
  tagId?: string | null;
  /** Keep only files with at least one attachment of this origin. */
  tagOrigin?: TagOrigin | null;
  showRemoved?: boolean;
  limit?: number;
  offset?: number;
  /**
   * Opaque keyset cursor naming the last row of the previous page (#256).
   * Takes precedence over `offset`; invalid or order-mismatched cursors
   * throw so callers can reject them instead of duplicating rows.
   */
  cursor?: string | null;
  /** Server-side ordering key. Defaults to "filename". */
  sortKey?: FileSortKey;
  /** Server-side ordering direction. Defaults to "asc". */
  sortDir?: FileSortDirection;
}
