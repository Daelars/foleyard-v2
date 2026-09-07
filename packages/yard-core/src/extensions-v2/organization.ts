import type { Collection } from "../domain/collection";
import type { Tag } from "../domain/tag";

import type { ExtensionV2Permission } from "./definition";
import { V2OperationError } from "./operations";

/**
 * Collection and tag operations for v2 handlers (Yard Core context, E1 #176).
 *
 * Smart Collections v2 `save-search` and future organization workflows
 * run through these services instead of repository proxies. Reads sit
 * behind `collections:read` / `tags:read`; every mutation sits behind
 * `collections:write` / `tags:write`. Membership changes additionally
 * require `library:read` and resolve the target against the Library
 * index first: attaching a removed or unknown sound fails with a
 * reason instead of writing a dangling membership row.
 *
 * Smart-collection filters are stored as text. This module checks the
 * shape (a non-empty string); the application adapter validates the
 * query against its filter service and rejects invalid queries with
 * reasons, never a silent empty Collection.
 *
 * Every method checks the invocation's effective permissions first.
 * Framework-free: no database handles, no v1 imports.
 */

export const V2_MAX_COLLECTION_NAME_LENGTH = 120;
export const V2_MAX_TAG_NAME_LENGTH = 80;

/** Narrow repository surface behind the Collection services. */
export type V2CollectionPorts = {
  list(): Collection[];
  get(id: string): Collection | null;
  createSmart(name: string, filter: string): string;
  updateSmartFilter(id: string, filter: string): void;
  attachFile(fileId: string, collectionId: string): void;
  detachFile(fileId: string, collectionId: string): void;
  deleteCollection(id: string): void;
};

/** Narrow repository surface behind the tag services. */
export type V2TagPorts = {
  list(): Tag[];
  tagsForFile(fileId: string): Tag[];
  create(name: string): string;
  attach(fileId: string, tagId: string): void;
  detach(fileId: string, tagId: string): void;
};

export type V2CollectionOperations = {
  list(): Collection[];
  get(id: string): Collection | null;
  createSmart(name: string, filter: string): { id: string };
  updateSmartFilter(id: string, filter: string): void;
  attachFile(fileId: string, collectionId: string): void;
  detachFile(fileId: string, collectionId: string): void;
  deleteCollection(id: string): void;
};

export type V2TagOperations = {
  list(): Tag[];
  tagsForFile(fileId: string): Tag[];
  create(name: string): { id: string };
  attach(fileId: string, tagId: string): void;
  detach(fileId: string, tagId: string): void;
};

export type V2OrganizationFactoryArgs = {
  extensionId: string;
  effectivePermissions: readonly string[];
  collections?: V2CollectionPorts;
  tags?: V2TagPorts;
  /** Live index lookup for membership targets. */
  isLiveFile?(fileId: string): boolean;
  /** Called after each mutation persists, never before. */
  notify?: (scope: "collections" | "tags") => void;
};

function denied(permission: string, extensionId: string): V2OperationError {
  return new V2OperationError(
    "permission-denied",
    `Extension "${extensionId}" lacks the "${permission}" permission for this operation; grant it to use this command.`,
  );
}

function unsupported(scope: string, extensionId: string): V2OperationError {
  return new V2OperationError(
    "input-invalid",
    `${scope} are not supported by this host binding; extension "${extensionId}" cannot reach them here.`,
  );
}

function checkName(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new V2OperationError("input-invalid", `${label} must be a non-empty string.`);
  }
  const clean = value.trim();
  if (clean.length > maxLength) {
    throw new V2OperationError(
      "input-invalid",
      `${label} is ${clean.length} characters; the limit is ${maxLength}.`,
    );
  }
  return clean;
}

function checkId(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new V2OperationError("input-invalid", `${label} must be a non-empty string.`);
  }
  return value;
}

function checkFilter(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new V2OperationError(
      "input-invalid",
      "Smart Collection filter must be a non-empty query; empty filters would match nothing silently.",
    );
  }
  return value;
}

/** Collection services bound to one invocation. See the module docblock for the permission map. */
export function createV2CollectionOperations(args: V2OrganizationFactoryArgs): V2CollectionOperations {
  const effective = new Set(args.effectivePermissions);

  const require = (permission: ExtensionV2Permission): void => {
    if (!effective.has(permission)) throw denied(permission, args.extensionId);
  };

  const ports = (): V2CollectionPorts => {
    if (!args.collections) throw unsupported("Collections", args.extensionId);
    return args.collections;
  };

  const liveTarget = (fileId: string): void => {
    require("library:read");
    if (args.isLiveFile && !args.isLiveFile(checkId(fileId, "Sound ID"))) {
      throw new V2OperationError(
        "input-invalid",
        `Sound ${JSON.stringify(fileId)} is not in the Library index; refresh the selection and retry.`,
      );
    }
  };

  return {
    list(): Collection[] {
      require("collections:read");
      return ports().list();
    },
    get(id: string): Collection | null {
      require("collections:read");
      return ports().get(checkId(id, "Collection ID"));
    },
    createSmart(name: string, filter: string): { id: string } {
      require("collections:write");
      const cleanName = checkName(name, "Collection name", V2_MAX_COLLECTION_NAME_LENGTH);
      const cleanFilter = checkFilter(filter);
      // Persist first; only notify after the write lands.
      const id = ports().createSmart(cleanName, cleanFilter);
      args.notify?.("collections");
      return { id };
    },
    updateSmartFilter(id: string, filter: string): void {
      require("collections:write");
      const cleanId = checkId(id, "Collection ID");
      const cleanFilter = checkFilter(filter);
      if (!ports().get(cleanId)) {
        throw new V2OperationError(
          "input-invalid",
          `Collection ${JSON.stringify(cleanId)} does not exist; refresh and retry.`,
        );
      }
      ports().updateSmartFilter(cleanId, cleanFilter);
      args.notify?.("collections");
    },
    attachFile(fileId: string, collectionId: string): void {
      require("collections:write");
      liveTarget(fileId);
      const cleanCollection = checkId(collectionId, "Collection ID");
      if (!ports().get(cleanCollection)) {
        throw new V2OperationError(
          "input-invalid",
          `Collection ${JSON.stringify(cleanCollection)} does not exist; refresh and retry.`,
        );
      }
      ports().attachFile(fileId, cleanCollection);
      args.notify?.("collections");
    },
    detachFile(fileId: string, collectionId: string): void {
      require("collections:write");
      liveTarget(fileId);
      const cleanCollection = checkId(collectionId, "Collection ID");
      if (!ports().get(cleanCollection)) {
        throw new V2OperationError(
          "input-invalid",
          `Collection ${JSON.stringify(cleanCollection)} does not exist; refresh and retry.`,
        );
      }
      ports().detachFile(fileId, cleanCollection);
      args.notify?.("collections");
    },
    deleteCollection(id: string): void {
      require("collections:write");
      const cleanId = checkId(id, "Collection ID");
      if (!ports().get(cleanId)) {
        throw new V2OperationError(
          "input-invalid",
          `Collection ${JSON.stringify(cleanId)} does not exist; refresh and retry.`,
        );
      }
      ports().deleteCollection(cleanId);
      args.notify?.("collections");
    },
  };
}

/** Tag services bound to one invocation. See the module docblock for the permission map. */
export function createV2TagOperations(args: V2OrganizationFactoryArgs): V2TagOperations {
  const effective = new Set(args.effectivePermissions);

  const require = (permission: ExtensionV2Permission): void => {
    if (!effective.has(permission)) throw denied(permission, args.extensionId);
  };

  const ports = (): V2TagPorts => {
    if (!args.tags) throw unsupported("Tags", args.extensionId);
    return args.tags;
  };

  const liveTarget = (fileId: string): void => {
    require("library:read");
    if (args.isLiveFile && !args.isLiveFile(checkId(fileId, "Sound ID"))) {
      throw new V2OperationError(
        "input-invalid",
        `Sound ${JSON.stringify(fileId)} is not in the Library index; refresh the selection and retry.`,
      );
    }
  };

  return {
    list(): Tag[] {
      require("tags:read");
      return ports().list();
    },
    tagsForFile(fileId: string): Tag[] {
      require("tags:read");
      return ports().tagsForFile(checkId(fileId, "Sound ID"));
    },
    create(name: string): { id: string } {
      require("tags:write");
      const cleanName = checkName(name, "Tag name", V2_MAX_TAG_NAME_LENGTH);
      // Persist first; only notify after the write lands.
      const id = ports().create(cleanName);
      args.notify?.("tags");
      return { id };
    },
    attach(fileId: string, tagId: string): void {
      require("tags:write");
      liveTarget(fileId);
      ports().attach(checkId(fileId, "Sound ID"), checkId(tagId, "Tag ID"));
      args.notify?.("tags");
    },
    detach(fileId: string, tagId: string): void {
      require("tags:write");
      liveTarget(fileId);
      ports().detach(checkId(fileId, "Sound ID"), checkId(tagId, "Tag ID"));
      args.notify?.("tags");
    },
  };
}

/** Deny-closed organization services for hosts without organization ports. */
export function denyV2OrganizationOperations(extensionId: string): {
  collections: V2CollectionOperations;
  tags: V2TagOperations;
} {
  const deny = (): never => {
    throw denied("collections:read", extensionId);
  };
  const denyAsync = (): never => deny();
  const collections: V2CollectionOperations = {
    list: () => deny(),
    get: () => deny(),
    createSmart: () => denyAsync(),
    updateSmartFilter: () => deny(),
    attachFile: () => deny(),
    detachFile: () => deny(),
    deleteCollection: () => deny(),
  };
  const tags: V2TagOperations = {
    list: () => deny(),
    tagsForFile: () => deny(),
    create: () => denyAsync(),
    attach: () => deny(),
    detach: () => deny(),
  };
  return { collections, tags };
}
