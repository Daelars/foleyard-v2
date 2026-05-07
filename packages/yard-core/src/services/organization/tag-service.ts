import type { Tag } from "../../domain/tag";

export interface TagService {
  getAllTags(): Tag[];
  getTagsForFile(fileId: string): Tag[];
  createTag(name: string): string;
  attachTagToFile(fileId: string, tagId: string): void;
  detachTagFromFile(fileId: string, tagId: string): void;
}
