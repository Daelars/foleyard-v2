import type { Tag } from "../domain/tag";

export interface TagRepository {
  getAllTags(): Tag[];
  getTagsForFile(fileId: string): Tag[];
  createTag(name: string): string;
  renameTag(tagId: string, name: string): void;
  updateTagColor(tagId: string, color: string | null): void;
  attachTagToFile(fileId: string, tagId: string): void;
  detachTagFromFile(fileId: string, tagId: string): void;
}
