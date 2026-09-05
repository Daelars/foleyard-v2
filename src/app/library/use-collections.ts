"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  SmartCollectionCountCache,
  extractSmartQuery,
  fetchSmartCount,
} from "./smart-collection-counts";
import type { CollectionRecord } from "./types";

export interface CollectionsCallbacks {
  isCollectionSelected: (id: string) => boolean;
  onSelectedCollectionGone: () => void;
  onSelectedCollectionRestored: (id: string) => void;
}

/** Optimistic delete: drop the collection and its cached smart count. */
export function removeCollectionOptimistic(
  collections: CollectionRecord[],
  collectionId: string,
): CollectionRecord[] {
  return collections.filter((collection) => collection.id !== collectionId);
}

export function omitSmartCount(
  counts: Record<string, number>,
  collectionId: string,
): Record<string, number> {
  if (!(collectionId in counts)) {
    return counts;
  }
  const next = { ...counts };
  delete next[collectionId];
  return next;
}

/** Rollback for a failed delete: restore the snapshot in name order. */
export function restoreCollection(
  collections: CollectionRecord[],
  deleted: CollectionRecord,
): CollectionRecord[] {
  if (collections.some((collection) => collection.id === deleted.id)) {
    return collections;
  }
  return [...collections, deleted].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

/**
 * Collections slice: smart and regular collections own their remote state
 * and mutations here. Every mutation refetches only the collections slice —
 * never tags, files, or the extension catalog. Selection side effects travel
 * through explicit callbacks, never direct writes to another hook's state.
 */
export function useCollections(callbacks: CollectionsCallbacks) {
  const [collections, setCollections] = useState<CollectionRecord[]>([]);
  const [smartCounts, setSmartCounts] = useState<Record<string, number>>({});
  const smartCountCacheRef = useRef<SmartCollectionCountCache | null>(null);
  if (smartCountCacheRef.current === null) {
    smartCountCacheRef.current = new SmartCollectionCountCache();
  }
  const collectionsRef = useRef(collections);
  useEffect(() => {
    collectionsRef.current = collections;
  });

  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  const loadCollections = useCallback(async () => {
    try {
      const res = await fetch("/api/collections");
      if (!res.ok) {
        return;
      }
      const data = await res.json();
      const cache = smartCountCacheRef.current;
      const next = (data.collections ?? []) as CollectionRecord[];
      // The list omits smart counts; reuse the last-known count per query
      // string so the badge stays useful without a scan per render.
      setCollections(
        cache
          ? next.map((collection) => {
              if (!collection.isSmart) {
                return collection;
              }
              const query = extractSmartQuery(collection.filter);
              const cached = query ? cache.get(query) : undefined;
              return cached === undefined
                ? collection
                : { ...collection, fileCount: cached };
            })
          : next,
      );
    } catch {
      // Sidebar keeps its last data.
    }
  }, []);

  /**
   * Resolve a smart collection's count lazily on open. Served from the
   * per-query-string cache when the query was already resolved, otherwise
   * one countFor round-trip that also refreshes the badge.
   */
  const loadSmartCount = useCallback(
    async (collectionId: string, filter?: string | null) => {
      const cache = smartCountCacheRef.current;
      if (!cache) {
        return null;
      }
      const collection = collectionsRef.current.find(
        (entry) => entry.id === collectionId && entry.isSmart,
      );
      const query = extractSmartQuery(
        filter !== undefined ? filter : collection?.filter,
      );
      if (!collection && filter === undefined) {
        return null;
      }
      if (query === null) {
        return null;
      }
      const count = await fetchSmartCount(
        collectionId,
        query,
        cache,
        (url) => fetch(url),
      );
      if (count === null) {
        return null;
      }
      setSmartCounts((current) => ({ ...current, [collectionId]: count }));
      setCollections((current) =>
        current.map((entry) =>
          entry.id === collectionId ? { ...entry, fileCount: count } : entry,
        ),
      );
      return count;
    },
    [],
  );

  const createCollection = useCallback(
    async (name: string, color?: string) => {
      if (!name.trim()) {
        return null;
      }
      try {
        const res = await fetch("/api/collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim() }),
        });
        if (!res.ok) {
          throw new Error();
        }
        const data = (await res.json()) as { id?: string };
        if (color && data.id) {
          await fetch("/api/collections", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update-color", collectionId: data.id, color }),
          });
        }
        void loadCollections();
        toast.success("Collection created");
        return data.id ?? null;
      } catch {
        toast.error("Failed to create collection");
        return null;
      }
    },
    [loadCollections],
  );

  const deleteCollection = useCallback(async (collectionId: string) => {
    const callbacksSnapshot = callbacksRef.current;
    const deleted = collectionsRef.current.find(
      (collection) => collection.id === collectionId,
    );
    setCollections((current) =>
      removeCollectionOptimistic(current, collectionId),
    );
    setSmartCounts((current) => omitSmartCount(current, collectionId));
    const wasSelected = callbacksSnapshot.isCollectionSelected(collectionId);
    if (wasSelected) {
      callbacksSnapshot.onSelectedCollectionGone();
    }
    try {
      const res = await fetch("/api/collections", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ collectionId }),
      });
      if (!res.ok) {
        throw new Error();
      }
      toast.success("Collection deleted");
    } catch {
      if (deleted) {
        setCollections((current) => restoreCollection(current, deleted));
      }
      if (wasSelected) {
        callbacksSnapshot.onSelectedCollectionRestored(collectionId);
      }
      toast.error("Failed to delete collection");
    }
  }, []);

  const renameCollection = useCallback(
    async (id: string, name: string) => {
      if (!name.trim()) {
        return;
      }
      try {
        const res = await fetch("/api/collections", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "rename", collectionId: id, name: name.trim() }),
        });
        if (!res.ok) {
          throw new Error();
        }
        void loadCollections();
        toast.success("Collection renamed");
      } catch {
        toast.error("Failed to rename collection");
      }
    },
    [loadCollections],
  );

  const updateCollectionFilter = useCallback(
    async (id: string, filter: string) => {
      try {
        const res = await fetch("/api/collections", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update-filter", collectionId: id, filter }),
        });
        if (!res.ok) {
          throw new Error();
        }
        await loadCollections();
        // The query changed, so resolve the fresh count for the new filter
        // rather than showing the cached count for the old one.
        await loadSmartCount(id, filter);
        toast.success("Search filter updated");
      } catch {
        toast.error("Failed to update search filter");
      }
    },
    [loadCollections, loadSmartCount],
  );

  const convertToRegularCollection = useCallback(
    async (collectionId: string) => {
      try {
        const res = await fetch("/api/collections", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "convert-to-regular", collectionId }),
        });
        if (!res.ok) {
          throw new Error();
        }
        setSmartCounts((current) => omitSmartCount(current, collectionId));
        void loadCollections();
        toast.success("Converted to collection");
      } catch {
        toast.error("Failed to convert collection");
      }
    },
    [loadCollections],
  );

  const updateCollectionColor = useCallback(
    async (collectionId: string, color: string) => {
      setCollections((current) =>
        current.map((collection) =>
          collection.id === collectionId ? { ...collection, color } : collection,
        ),
      );
      try {
        const res = await fetch("/api/collections", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update-color", collectionId, color }),
        });
        if (!res.ok) {
          throw new Error();
        }
      } catch {
        void loadCollections();
        toast.error("Failed to update collection color");
      }
    },
    [loadCollections],
  );

  const addToCollection = useCallback(
    async (collectionId: string, fileId: string) => {
      const collection = collectionsRef.current.find(
        (entry) => entry.id === collectionId,
      );
      try {
        const res = await fetch("/api/collections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId, collectionId }),
        });
        if (!res.ok) {
          throw new Error();
        }
        void loadCollections();
        toast.success(`Added to ${collection?.name ?? "collection"}`);
      } catch {
        toast.error("Failed to add to collection");
      }
    },
    [loadCollections],
  );

  const saveSearch = useCallback(
    async (name: string, query: string) => {
      if (!name.trim() || !query.trim()) {
        return false;
      }
      try {
        const res = await fetch("/api/extensions/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            extensionId: "smart-collections",
            commandId: "smart-collections.save-search",
            input: { name: name.trim(), query: query.trim() },
          }),
        });
        if (!res.ok) {
          throw new Error();
        }
        const data = (await res.json()) as { ok?: boolean };
        if (data?.ok === false) {
          throw new Error();
        }
        void loadCollections();
        toast.success("Smart collection saved");
        return true;
      } catch {
        toast.error("Failed to save smart collection");
        return false;
      }
    },
    [loadCollections],
  );

  return {
    collections,
    smartCounts,
    loadCollections,
    loadSmartCount,
    createCollection,
    deleteCollection,
    renameCollection,
    updateCollectionFilter,
    convertToRegularCollection,
    updateCollectionColor,
    addToCollection,
    saveSearch,
  };
}
