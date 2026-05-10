import { createDatabaseConnection } from "@/lib/database/connection";
import {
  getDatabasePath,
  ensureDesktopDatabaseInitialized,
} from "@/lib/database-path";
import { SqliteAudioFileRepository } from "@/lib/database/file-repository";
import { SqliteTagRepository } from "@/lib/database/tag-repository";
import { SqliteCollectionRepository } from "@/lib/database/collection-repository";
import { SqliteSettingsRepository } from "@/lib/database/settings-repository";
import { SqliteBrowseRepository } from "@/lib/database/browse-repository";

import type { CollectionService, FavoriteService, LibraryService, TagService } from "@yard-core";
import { EventBus, YardCommandRegistry } from "@yard-core";

import type { YardExtensionContext } from "@yard-core";
import { createYardExtensionContext } from "@yard-core";
import type { YardPermission } from "@yard-core";

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
  commandRegistry: YardCommandRegistry;
};

let _services: AppServices | null = null;

export function getAppServices(): AppServices {
  if (!_services) {
    const databasePath = getDatabasePath();
    ensureDesktopDatabaseInitialized(databasePath);
    const { sqlite } = createDatabaseConnection(databasePath);
    const fileRepo = new SqliteAudioFileRepository(sqlite);
    const tagRepo = new SqliteTagRepository(sqlite);
    const collectionRepo = new SqliteCollectionRepository(sqlite);
    const settingsRepo = new SqliteSettingsRepository(sqlite);
    const browseRepo = new SqliteBrowseRepository(sqlite);
    const eventBus = new EventBus();
    const commandRegistry = new YardCommandRegistry();

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
      commandRegistry,
    };
  }
  return _services;
}

export function createExtensionServices(): YardExtensionContext["services"] {
  const services = getAppServices();
  return {
    library: services.libraryService,
    files: services.fileRepository,
    collections: services.collectionService,
    tags: services.tagService,
    favorites: services.favoriteService,
    commands: services.commandRegistry,
    events: services.eventBus,
  };
}

export function createAppExtensionContext(options: {
  permissions: YardPermission[];
  selection?: { fileIds?: string[]; folderPath?: string; collectionId?: string };
}): YardExtensionContext {
  return createYardExtensionContext({
    services: createExtensionServices(),
    ...options,
  });
}
