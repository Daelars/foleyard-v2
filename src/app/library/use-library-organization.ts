"use client";

import type { CollectionsCallbacks } from "./use-collections";
import { useCallback } from "react";
import { useCollections } from "./use-collections";
import { useTags } from "./use-tags";

export type LibraryOrganizationCallbacks = CollectionsCallbacks;

/**
 * Library organization data layer: collections and tags compose their own
 * slice hooks. Each mutation refetches only its own slice — a collection
 * rename refetches collections, never the whole workspace. The view keeps
 * selection and composition.
 */
export function useLibraryOrganization(callbacks: LibraryOrganizationCallbacks) {
  const collectionsApi = useCollections(callbacks);
  const tagsApi = useTags();
  const { loadCollections } = collectionsApi;
  const { loadTags } = tagsApi;

  const loadOrganization = useCallback(async () => {
    await Promise.all([loadCollections(), loadTags()]);
  }, [loadCollections, loadTags]);

  return {
    collections: collectionsApi.collections,
    tags: tagsApi.tags,
    smartCounts: collectionsApi.smartCounts,
    loadOrganization,
    loadCollections: collectionsApi.loadCollections,
    loadTags: tagsApi.loadTags,
    loadSmartCount: collectionsApi.loadSmartCount,
    createCollection: collectionsApi.createCollection,
    deleteCollection: collectionsApi.deleteCollection,
    renameCollection: collectionsApi.renameCollection,
    updateCollectionFilter: collectionsApi.updateCollectionFilter,
    convertToRegularCollection: collectionsApi.convertToRegularCollection,
    updateCollectionColor: collectionsApi.updateCollectionColor,
    addToCollection: collectionsApi.addToCollection,
    saveSearch: collectionsApi.saveSearch,
    createTag: tagsApi.createTag,
    deleteTag: tagsApi.deleteTag,
    renameTag: tagsApi.renameTag,
    updateTagColor: tagsApi.updateTagColor,
  };
}
