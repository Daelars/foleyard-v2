import type { LibraryStats } from "../../domain/library";

export interface LibraryService {
  getLibraryRoot(): string | null;
  setLibraryRoot(libraryRoot: string): void;
  getLibraryStats(): LibraryStats;
}
