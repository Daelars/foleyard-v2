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
  showRemoved?: boolean;
  limit?: number;
  offset?: number;
  /** Server-side ordering key. Defaults to "filename". */
  sortKey?: FileSortKey;
  /** Server-side ordering direction. Defaults to "asc". */
  sortDir?: FileSortDirection;
}
