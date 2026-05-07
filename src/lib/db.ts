export { db, sqlite } from "@/lib/database/connection";
export {
  getSubdirectories,
  getUniqueDirectories,
} from "@/lib/database/browse-repository";
export {
  attachFileToCollection,
  createCollection,
  deleteCollection,
  detachFileFromCollection,
  getAllCollections,
} from "@/lib/database/collection-repository";
export {
  batchMarkRemoved,
  batchTouchFiles,
  batchUpdateFileMetadata,
  batchUpsertFiles,
  getAllFilesIncludingRemoved,
  getFileById,
  getFileByPath,
  getFilesByPaths,
  getFileCount,
  getFiles,
  markFileRemoved,
  reconcileMovedFiles,
  toggleFavorite,
  touchFileAsSeen,
  upsertFile,
} from "@/lib/database/file-repository";
export {
  clearLibraryData,
  getExtensionEnabled,
  getLibraryRoot,
  getLibraryRoots,
  getLibraryStats,
  addLibraryRoot,
  removeLibraryRoot,
  setExtensionEnabled,
  setLibraryRoot,
  setLibraryRoots,
} from "@/lib/database/settings-repository";
export {
  attachTagToFile,
  createTag,
  deleteTag,
  detachTagFromFile,
  getAllTags,
  getTagsForFile,
} from "@/lib/database/tag-repository";

export type FileRecord = typeof import("@/lib/schema").files.$inferSelect;
export type TagRecord = typeof import("@/lib/schema").tags.$inferSelect;
export type CollectionRecord = typeof import("@/lib/schema").collections.$inferSelect;
