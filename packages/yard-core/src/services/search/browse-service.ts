export interface BrowseService {
  getUniqueDirectories(): string[];
  getSubdirectories(parentDir: string | null): string[];
}
