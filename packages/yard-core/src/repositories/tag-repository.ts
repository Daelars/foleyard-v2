import type { FileTagAttachment, Tag, TagOrigin } from "../domain/tag";

export interface TagRepository {
  getAllTags(): Tag[];
  getTagsForFile(fileId: string): Tag[];
  createTag(name: string): string;
  renameTag(tagId: string, name: string): void;
  updateTagColor(tagId: string, color: string | null): void;
  attachTagToFile(fileId: string, tagId: string): void;
  detachTagFromFile(fileId: string, tagId: string): void;
  /** Attach with provenance; a stored manual origin is never downgraded. */
  attachTagToFileWithOrigin(
    fileId: string,
    tagId: string,
    origin: TagOrigin,
    confidence?: number | null,
  ): void;
  /** Every attachment of a file with its provenance. */
  getAttachmentsForFile(fileId: string): FileTagAttachment[];
  getAttachmentsWithTagsForFiles?(fileIds: string[]): Array<FileTagAttachment & { tagName: string }>;
  /** Remove every attachment of one origin across the library; returns the count removed. */
  detachAttachmentsByOrigin(origin: TagOrigin): number;
  /** Record a retired name against its surviving tag; normalized lowercase. */
  addTagAlias(tagId: string, alias: string): void;
  /** Resolve a retired name to its surviving tag id, or null. */
  resolveTagAlias(alias: string): string | null;
  /** Rename and keep the old normalized name as an alias. */
  renameTagPreservingAlias?(tagId: string, name: string): void;
  /** Move attachments and aliases into the target while preserving manual precedence. */
  mergeTags?(sourceTagId: string, targetTagId: string): { moved: number };
}
