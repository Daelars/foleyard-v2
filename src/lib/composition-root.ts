import { sqlite } from "@/lib/database/connection";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";
import { SqliteCollectionRepository } from "@/lib/database/collection-repository";
import { SqliteSettingsRepository } from "@/lib/database/settings-repository";
import { SqliteBrowseRepository } from "@/lib/database/browse-repository";

import type { CollectionService, FavoriteService, LibraryService, TagService } from "@yard-core";
import { EventBus } from "@yard-core";

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
  eventBus: EventBus;
};

let _services: AppServices | null = null;

export function getAppServices(): AppServices {
  if (!_services) {
    const fileRepo = new SqliteAudioFileRepository(sqlite);
    const tagRepo = new SqliteTagRepository(sqlite);
    const collectionRepo = new SqliteCollectionRepository(sqlite);
    const settingsRepo = new SqliteSettingsRepository(sqlite);
    const browseRepo = new SqliteBrowseRepository(sqlite);
    const eventBus = new EventBus();

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
      eventBus,
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
        for (const fileId of fileIds) {
          const file = services.fileRepository.getFileById(fileId);
          if (file) {
            services.fileRepository.markFileRemoved(file.path, removedAt);
          }
        }
      },
    },
    collections: services.collectionService,
    tags: services.tagService,
    favorites: services.favoriteService,
    events: services.eventBus,
  };
}
