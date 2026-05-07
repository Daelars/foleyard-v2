export interface FileSearchQuery {
  query?: string;
  favorites?: boolean;
  collectionId?: string | null;
  directory?: string | null;
  showRemoved?: boolean;
  limit?: number;
  offset?: number;
}
