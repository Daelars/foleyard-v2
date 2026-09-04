import type { EventBus } from "../events/event-bus";
import type { CollectionService } from "../services/organization/collection-service";
import type { FavoriteService } from "../services/organization/favorite-service";
import type { TagService } from "../services/organization/tag-service";
import type { LibraryService } from "../services/library/library-service";

import {
  createPermissionChecker,
  type PermissionChecker,
  type YardPermission,
} from "./vocabulary";
import type { YardCommandRegistry } from "./extension-command-registry";

export type YardExtensionSettings = {
  get<T = unknown>(settingId: string): T | undefined;
};

export type YardExtensionFileService = {
  markRemoved(fileIds: string[]): void;
};

export type YardExtensionContext = {
  services: {
    filesystem?: {
      resolveReadablePath(path: string, allowRoot?: boolean): Promise<string | null>;
      resolveWritablePath(path: string): Promise<string | null>;
    };
    library?: LibraryService;
    files?: YardExtensionFileService;
    collections?: CollectionService;
    tags?: TagService;
    favorites?: FavoriteService;
    settings?: YardExtensionSettings;
    commands: YardCommandRegistry;
    events?: EventBus;
  };
  selection: {
    fileIds: string[];
    folderPath?: string;
    collectionId?: string;
  };
  input?: unknown;
  permissions: PermissionChecker;
};

export type CreateYardExtensionContextOptions = {
  services: YardExtensionContext["services"];
  selection?: {
    fileIds?: string[];
    folderPath?: string;
    collectionId?: string;
  };
  input?: unknown;
  permissions: YardPermission[];
};

export function createYardExtensionContext(
  options: CreateYardExtensionContextOptions,
): YardExtensionContext {
  return {
    services: options.services,
    selection: {
      fileIds: options.selection?.fileIds ?? [],
      folderPath: options.selection?.folderPath,
      collectionId: options.selection?.collectionId,
    },
    input: options.input,
    permissions: createPermissionChecker(options.permissions),
  };
}
