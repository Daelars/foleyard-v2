import type { FileSearchQuery } from "../../domain/search";

export interface SearchService<TFile> {
  searchFiles(query: FileSearchQuery): TFile[];
  countFiles(query: FileSearchQuery): number;
}
