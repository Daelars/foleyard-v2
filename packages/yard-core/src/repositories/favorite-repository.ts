export interface FavoriteRepository {
  toggleFavorite(fileId: string): boolean;
}
