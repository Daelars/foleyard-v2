import {
  attachFileToCollection,
  attachTagToFile,
  createSmartCollection,
  createTag,
  deleteCollection,
  detachFileFromCollection,
  detachTagFromFile,
  getAllCollections,
  getAllTags,
  getTagsForFile,
  updateCollectionFilter,
} from "@/lib/db";
import type { Collection, Tag, V2CollectionPorts, V2TagPorts } from "@yard-core";
import { extractSmartQuery } from "@/lib/smart-collection-filter";

import { getV2Events } from "./events";

/**
 * Application Collection/tag ports for v2 operations (Application
 * context, E1 #176).
 *
 * Narrow structural subsets of the repository contracts over the
 * existing SQLite repositories — no new migration, no v1 extension
 * modules. Smart-collection writes validate the query through the
 * app-owned filter service: an invalid query fails with a reason,
 * never a silent empty Collection (the Smart Collections v2 port
 * relies on this instead of evaluating filters itself).
 *
 * Persist-before-notify: each mutation commits its repository write
 * first and emits `contributions-changed` afterwards, so subscribers
 * that re-read on receipt always observe the triggering change.
 */

export type V2OrganizationDeps = {
  collections?: V2CollectionPorts;
  tags?: V2TagPorts;
  validateSmartQuery?: (filter: string) => string | null;
  notify?: () => void;
};

function defaultNotify(): void {
  getV2Events().emit("contributions-changed", "*");
}

function defaultValidateSmartQuery(filter: string): string | null {
  return extractSmartQuery(filter);
}

function checkedSmartQuery(
  filter: string,
  validate: (query: string) => string | null,
): void {
  if (!validate(filter)) {
    throw new Error(
      `Smart Collection query ${JSON.stringify(filter)} is invalid; save a query the search box accepts.`,
    );
  }
}

/** Repository-backed Collection ports; pass deps only in tests. */
export function createV2CollectionPorts(deps: V2OrganizationDeps = {}): V2CollectionPorts {
  const validate = deps.validateSmartQuery ?? defaultValidateSmartQuery;
  const notify = deps.notify ?? defaultNotify;
  const ports = deps.collections;
  const find = (id: string): Collection | null =>
    ports ? ports.get(id) : (getAllCollections().find((entry) => entry.id === id) ?? null);
  return {
    list: () => (ports ? ports.list() : getAllCollections()),
    get: (id) => find(id),
    createSmart: (name, filter) => {
      checkedSmartQuery(filter, validate);
      const id = ports ? ports.createSmart(name, filter) : createSmartCollection(name, filter);
      notify();
      return id;
    },
    updateSmartFilter: (id, filter) => {
      checkedSmartQuery(filter, validate);
      if (ports) ports.updateSmartFilter(id, filter);
      else updateCollectionFilter(id, filter);
      notify();
    },
    attachFile: (fileId, collectionId) => {
      if (ports) ports.attachFile(fileId, collectionId);
      else attachFileToCollection(fileId, collectionId);
      notify();
    },
    detachFile: (fileId, collectionId) => {
      if (ports) ports.detachFile(fileId, collectionId);
      else detachFileFromCollection(fileId, collectionId);
      notify();
    },
    deleteCollection: (id) => {
      if (ports) ports.deleteCollection(id);
      else deleteCollection(id);
      notify();
    },
  };
}

/** Repository-backed tag ports; pass deps only in tests. */
export function createV2TagPorts(deps: V2OrganizationDeps = {}): V2TagPorts {
  const notify = deps.notify ?? defaultNotify;
  const ports = deps.tags;
  return {
    list: () => (ports ? ports.list() : getAllTags()),
    tagsForFile: (fileId): Tag[] => (ports ? ports.tagsForFile(fileId) : getTagsForFile(fileId)),
    create: (name) => {
      const id = ports ? ports.create(name) : createTag(name);
      notify();
      return id;
    },
    attach: (fileId, tagId) => {
      if (ports) ports.attach(fileId, tagId);
      else attachTagToFile(fileId, tagId);
      notify();
    },
    detach: (fileId, tagId) => {
      if (ports) ports.detach(fileId, tagId);
      else detachTagFromFile(fileId, tagId);
      notify();
    },
  };
}
