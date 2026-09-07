import type { V2HandlerContext } from "./host";
import {
  createV2CollectionOperations,
  createV2TagOperations,
  denyV2OrganizationOperations,
  type V2CollectionOperations,
  type V2CollectionPorts,
  type V2OrganizationFactoryArgs,
  type V2TagOperations,
  type V2TagPorts,
} from "./organization";
import {
  createV2FolderOperations,
  denyV2FolderOperations,
  type V2FolderFactoryArgs,
  type V2FolderOperations,
  type V2FolderScanPorts,
} from "./maintenance";
import {
  createV2LibraryMutationOperations,
  denyV2LibraryMutationOperations,
  type V2LibraryMutationOperations,
  type V2LibraryMutationPorts,
} from "./library-mutations";
import {
  denyAllV2Operations,
  type V2LibraryReadPorts,
  type V2OperationServices,
} from "./operations";
import {
  createV2ShelfOperations,
  denyV2ShelfOperations,
  type V2ShelfOperations,
  type V2ShelfPorts,
} from "./shelf";
import type { V2SourceGrantStore } from "./source-grants";

/**
 * Extended v2 operation services for the remaining ports (Yard Core
 * context, E1 #176).
 *
 * The base services in `operations.ts` stay untouched: this module
 * composes the operation gaps blocking Sound Shelf, Drop Rules,
 * Folder Janitor, Library Gatherer, and Smart Collections v2 on top
 * of them. The application host spreads both into one handler
 * surface (`{ ...base, ...createV2ExtendedOperations(...) }`), so
 * handlers reach every group through the same `ctx.operations` the
 * Make Pack v2 port uses. Ports declare no `requiredCapabilities`
 * (permission-only, make-pack-v2 precedent); each group enforces its
 * effective permissions first, exactly like the base services.
 *
 * Group map (never inferred from method names):
 * - `libraryMutations.markRemoved/insertGathered` → `library:write`
 * - `collections.*` reads → `collections:read`, writes →
 *   `collections:write` (membership writes also need `library:read`
 *   for target liveness)
 * - `tags.*` reads → `tags:read`, writes → `tags:write`
 *   (membership writes also need `library:read`)
 * - `shelf.*` → `library:read` (matches the v1 Sound Shelf permission)
 * - `folders.listFolder` → `files:read` plus Library-root or readable
 *   source-grant containment; `folders.deleteEmptyFolder` →
 *   `files:delete` plus Library-root containment rechecked at delete
 *   time (source grants never authorize deletion)
 *
 * Hosts without ports get deny-closed groups: every call fails with
 * `permission-denied`, so an unauthorized handler stays confined.
 */

export type V2ExtendedOperationServices = V2OperationServices & {
  libraryMutations: V2LibraryMutationOperations;
  collections: V2CollectionOperations;
  tags: V2TagOperations;
  shelf: V2ShelfOperations;
  folders: V2FolderOperations;
};

export type V2ExtendedOperationFactoryArgs = {
  extensionId: string;
  effectivePermissions: readonly string[];
  /** Index reads used to resolve mutation and membership targets. */
  library: V2LibraryReadPorts;
  mutations?: V2LibraryMutationPorts;
  collections?: V2CollectionPorts;
  tags?: V2TagPorts;
  shelf?: V2ShelfPorts;
  folders?: V2FolderScanPorts;
  /** Readable grants for folders outside the Library roots. */
  sources?: V2SourceGrantStore;
  /** Called after each mutation persists, never before. */
  notify?: (scope: "library" | "collections" | "tags" | "shelf") => void;
  now?: string;
};

/** Extended groups bound to one invocation. See the module docblock for the permission map. */
export function createV2ExtendedOperations(
  args: V2ExtendedOperationFactoryArgs,
): Omit<V2ExtendedOperationServices, keyof V2OperationServices> {
  const notifyLibrary = args.notify ? () => args.notify!("library") : undefined;
  const notifyCollections = args.notify ? () => args.notify!("collections") : undefined;
  const notifyTags = args.notify ? () => args.notify!("tags") : undefined;
  const notifyShelf = args.notify ? () => args.notify!("shelf") : undefined;

  const organizationArgs: V2OrganizationFactoryArgs = {
    extensionId: args.extensionId,
    effectivePermissions: args.effectivePermissions,
    ...(args.collections ? { collections: args.collections } : {}),
    ...(args.tags ? { tags: args.tags } : {}),
    isLiveFile: (fileId) => {
      const record = args.library.getFileById(fileId);
      return record !== null && record.removedAt === null;
    },
    notify: (scope) => {
      if (scope === "collections") notifyCollections?.();
      else notifyTags?.();
    },
  };

  const folderArgs: V2FolderFactoryArgs = {
    extensionId: args.extensionId,
    effectivePermissions: args.effectivePermissions,
    ...(args.folders ? { folders: args.folders } : {}),
    ...(args.sources ? { sources: args.sources } : {}),
    ...(args.now !== undefined ? { now: args.now } : {}),
  };

  return {
    libraryMutations: createV2LibraryMutationOperations({
      extensionId: args.extensionId,
      effectivePermissions: args.effectivePermissions,
      ...(args.mutations ? { mutations: args.mutations } : {}),
      resolveByIds: (ids) =>
        args.library.getFilesByIds(ids).map((record) => ({ id: record.id, path: record.path })),
      ...(notifyLibrary ? { notify: notifyLibrary } : {}),
      ...(args.now !== undefined ? { now: args.now } : {}),
    }),
    collections: createV2CollectionOperations(organizationArgs),
    tags: createV2TagOperations(organizationArgs),
    shelf: createV2ShelfOperations({
      extensionId: args.extensionId,
      effectivePermissions: args.effectivePermissions,
      ...(args.shelf ? { shelf: args.shelf } : {}),
      isLiveFile: organizationArgs.isLiveFile,
      ...(notifyShelf ? { notify: notifyShelf } : {}),
    }),
    folders: createV2FolderOperations(folderArgs),
  };
}

/** Port-author accessor: the extended groups on a handler context. Ports declare no capabilities; they read these groups. */
export function extendedOperationsOf(context: V2HandlerContext): V2ExtendedOperationServices {
  return context.operations as V2ExtendedOperationServices;
}

/** Deny-all extended services for hosts without an operation factory: every call fails closed. */
export function denyAllV2ExtendedOperations(extensionId: string): V2ExtendedOperationServices {
  const denied = denyV2OrganizationOperations(extensionId);
  return {
    ...denyAllV2Operations(extensionId),
    libraryMutations: denyV2LibraryMutationOperations(extensionId),
    collections: denied.collections,
    tags: denied.tags,
    shelf: denyV2ShelfOperations(extensionId),
    folders: denyV2FolderOperations(extensionId),
  };
}
