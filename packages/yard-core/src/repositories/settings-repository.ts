import type { LibraryStats } from "../domain/library";

export interface SettingsRepository {
  getLibraryRoot(): string | null;
  setLibraryRoot(libraryRoot: string): void;
  getLibraryStats(): LibraryStats;
  clearLibraryData(): void;
}
