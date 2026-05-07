import type { EventBus } from "../events/event-bus";
import type { CollectionService } from "../services/organization/collection-service";
import type { FavoriteService } from "../services/organization/favorite-service";
import type { TagService } from "../services/organization/tag-service";
import type { LibraryService } from "../services/library/library-service";

import {
  createPermissionChecker,
  type PermissionChecker,
  type YardPermission,
} from "./extension-permissions";
import type { YardCommandRegistry } from "./extension-command-registry";

export type YardExtensionContext = {
  services: {
    library?: LibraryService;
    // TODO: replace with a stable extension-facing file service contract.
    files?: unknown;
    collections?: CollectionService;
    tags?: TagService;
    favorites?: FavoriteService;
    // TODO: replace with a stable extension-facing settings service contract.
    settings?: unknown;
    commands: YardCommandRegistry;
    events?: EventBus;
  };
  selection: {
    fileIds: string[];
    folderPath?: string;
    collectionId?: string;
  };
  permissions: PermissionChecker;
};

export type CreateYardExtensionContextOptions = {
  services: YardExtensionContext["services"];
  selection?: {
    fileIds?: string[];
    folderPath?: string;
    collectionId?: string;
  };
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
    permissions: createPermissionChecker(options.permissions),
  };
}
