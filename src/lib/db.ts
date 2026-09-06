export { db, sqlite } from "@/lib/database/connection";
export {
  getSubdirectoriesForRoot,
  getUniqueDirectories,
} from "@/lib/database/browse-repository";
export {
  attachFileToCollection,
  convertToRegularCollection,
  createCollection,
  deleteCollection,
  detachFileFromCollection,
  getAllCollections,
  getSmartCollectionCount,
  renameCollection,
  updateCollectionColor,
  updateCollectionFilter,
} from "@/lib/database/collection-repository";
export {
  batchMarkRemoved,
  batchTouchFiles,
  batchUpdateFileMetadata,
  batchUpsertFiles,
  getAllFilesIncludingRemoved,
  getFileById,
  getFileByPath,
  getFilesByIds,
  getFilesByPaths,
  getFileCount,
  getFiles,
  markFileRemoved,
  reconcileMovedFiles,
  setFavorites,
  setFileTagBatch,
  toggleFavorite,
  touchFileAsSeen,
  upsertFile,
} from "@/lib/database/file-repository";
export {
  getExtensionEnabled,
  getLibraryRoot,
  getLibraryRoots,
  getLibraryStats,
  getOnboardingVersion,
  addLibraryRoot,
  removeLibraryRoot,
  setExtensionEnabled,
  setLibraryRoot,
  setLibraryRoots,
  setOnboardingVersion,
} from "@/lib/database/settings-repository";
export {
  attachTagToFile,
  createTag,
  deleteTag,
  detachTagFromFile,
  getAllTags,
  getTagsForFile,
  getTagsForFiles,
  renameTag,
  updateTagColor,
} from "@/lib/database/tag-repository";

import { sqlite } from "@/lib/database/connection";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";
import { SqliteCollectionRepository } from "@/lib/database/collection-repository";
import { SqliteSettingsRepository } from "@/lib/database/settings-repository";
import { SqliteBrowseRepository } from "@/lib/database/browse-repository";

import type { CollectionService, FavoriteService, LibraryService, TagService } from "@yard-core";

import type { YardExtensionContext } from "@yard-core";

export type AppServices = {
  fileRepository: SqliteAudioFileRepository;
  tagRepository: SqliteTagRepository;
  collectionRepository: SqliteCollectionRepository;
  settingsRepository: SqliteSettingsRepository;
  browseRepository: SqliteBrowseRepository;
  libraryService: LibraryService;
  tagService: TagService;
  collectionService: CollectionService;
  favoriteService: FavoriteService;
};

let _services: AppServices | null = null;

export function getAppServices(): AppServices {
  if (!_services) {
    const fileRepo = new SqliteAudioFileRepository(sqlite);
    const tagRepo = new SqliteTagRepository(sqlite);
    const collectionRepo = new SqliteCollectionRepository(sqlite);
    const settingsRepo = new SqliteSettingsRepository(sqlite);
    const browseRepo = new SqliteBrowseRepository(sqlite);

    _services = {
      fileRepository: fileRepo,
      tagRepository: tagRepo,
      collectionRepository: collectionRepo,
      settingsRepository: settingsRepo,
      browseRepository: browseRepo,
      libraryService: {
        getLibraryRoot: () => settingsRepo.getLibraryRoot(),
        setLibraryRoot: (root: string) => settingsRepo.setLibraryRoot(root),
        getLibraryStats: () => settingsRepo.getLibraryStats(),
      },
      tagService: tagRepo,
      collectionService: collectionRepo,
      favoriteService: fileRepo,
    };
  }
  return _services;
}

export function createExtensionServices(): Omit<
  YardExtensionContext["services"],
  "commands" | "settings"
> {
  const services = getAppServices();
  return {
    library: services.libraryService,
    files: {
      markRemoved: (fileIds) => {
        const removedAt = new Date().toISOString();
        const paths = services.fileRepository.getFilesByIds(fileIds).map((file) => file.path);
        if (paths.length > 0) {
          services.fileRepository.batchMarkRemoved(paths, removedAt, removedAt);
        }
      },
    },
    collections: services.collectionService,
    tags: services.tagService,
    favorites: services.favoriteService,
  };
}
