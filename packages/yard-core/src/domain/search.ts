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
}
