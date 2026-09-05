"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { FileTableDirectory } from "@/components/FileTable/types";
import { useFavorites } from "./use-favorites";
import {
  applyBulkFavorite,
  applyBulkTag,
  describeFilesQuery,
  pageLimit,
  rollbackBulkFavorite,
  rollbackBulkTags,
  snapshotBulkFavorites,
  snapshotBulkTags,
  sortFileRecords,
  type BulkFavoritesBatch,
  type BulkTagBatch,
  type FileSortDir,
  type FileSortKey,
  type LibraryView,
} from "./file-query";
import type { FileRecord, TagRecord } from "./types";

export type { BulkFavoritesBatch, BulkTagBatch, FileSortDir, FileSortKey, LibraryView };

export interface LibraryFilesCallbacks {
  getTags: () => TagRecord[];
  getSelectedFile: () => FileRecord | null;
  syncSelectedFile: (updater: (prev: FileRecord | null) => FileRecord | null) => void;
  onFilesRemoved: (removedIds: Set<string>, mode: "bulk" | "single") => void;
  /** Shelf view loads through the sound-shelf endpoint; the catalog owns the count. */
  onShelfItemsLoaded: (items: FileRecord[]) => void;
}

export interface LibraryFilesInput extends LibraryFilesCallbacks {
  libraryRoots: string[];
  view: LibraryView;
  /** Debounced search text. */
  search: string;
  collectionId: string | null;
  tagId: string | null;
  directory: FileTableDirectory | null;
}

interface FilesPage {
  files?: FileRecord[];
  favoritesTotal?: number;
  hasMore?: boolean;
}

/**
 * Library files data layer: server-sorted list, pagination, directories,
 * favorites count, and every file mutation with its optimistic update and
 * rollback in one place. The view keeps selection, palette, dialog, and
 * transport state and only wires side-effect callbacks.
 */
export function useLibraryFiles(input: LibraryFilesInput) {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [directories, setDirectories] = useState<FileTableDirectory[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [hasMoreFiles, setHasMoreFiles] = useState(false);
  const {
    favoritesCount,
    loadFavoritesCount,
    noteFavoritesTotal,
  } = useFavorites();
  const [sort, setSort] = useState<{ key: FileSortKey; dir: FileSortDir }>({
    key: "filename",
    dir: 1,
  });

  const filesRequestIdRef = useRef(0);
  const filesQueryRef = useRef<string | null>(null);
  const filesNextOffsetRef = useRef(0);
  const isLoadingMoreFilesRef = useRef(false);
  const directoriesRequestIdRef = useRef(0);

  // Callbacks are mirrored so loader identities stay stable across renders.
  const callbacksRef = useRef<LibraryFilesCallbacks>({
    getTags: input.getTags,
    getSelectedFile: input.getSelectedFile,
    syncSelectedFile: input.syncSelectedFile,
    onFilesRemoved: input.onFilesRemoved,
    onShelfItemsLoaded: input.onShelfItemsLoaded,
  });
  useEffect(() => {
    callbacksRef.current = {
      getTags: input.getTags,
      getSelectedFile: input.getSelectedFile,
      syncSelectedFile: input.syncSelectedFile,
      onFilesRemoved: input.onFilesRemoved,
      onShelfItemsLoaded: input.onShelfItemsLoaded,
    };
  });

  const orderedFiles = useMemo(
    // List views arrive server-ordered so infinite scroll appends
    // globally-correct pages; only the shelf view sorts client-side.
    () => (input.view === "shelf" ? sortFileRecords(files, sort.key, sort.dir) : files),
    [files, sort, input.view],
  );
  const filesRef = useRef(orderedFiles);
  useEffect(() => {
    filesRef.current = orderedFiles;
  }, [orderedFiles]);

  const flipSort = useCallback((key: FileSortKey) => {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 1 ? -1 : 1 }
        : { key, dir: 1 },
    );
  }, []);

  const loadFiles = useCallback(async () => {
    const requestId = filesRequestIdRef.current + 1;
    filesRequestIdRef.current = requestId;
    filesQueryRef.current = null;
    filesNextOffsetRef.current = 0;
    isLoadingMoreFilesRef.current = false;
    setHasMoreFiles(false);

    if (input.view === "shelf") {
      setIsLoadingFiles(true);
      try {
        const res = await fetch("/api/extensions/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            extensionId: "sound-shelf",
            commandId: "sound-shelf.list",
          }),
        });
        if (!res.ok) {
          throw new Error("Failed to fetch shelf");
        }
        const data = (await res.json()) as {
          ok?: boolean;
          value?: { items?: FileRecord[] };
        };
        if (data?.ok === false) {
          throw new Error("Failed to fetch shelf");
        }
        if (filesRequestIdRef.current === requestId) {
          const items = (data.value?.items ?? []) as FileRecord[];
          setFiles(items);
          callbacksRef.current.onShelfItemsLoaded(items);
        }
      } catch {
        if (filesRequestIdRef.current === requestId) {
          toast.error("Failed to load shelf");
        }
      } finally {
        if (filesRequestIdRef.current === requestId) {
          setIsLoadingFiles(false);
        }
      }
      return;
    }

    const described = describeFilesQuery({
      view: input.view,
      search: input.search,
      collectionId: input.collectionId,
      tagId: input.tagId,
      directory: input.directory,
      libraryRoots: input.libraryRoots,
      sort,
    });
    if (described.kind !== "list") {
      setFiles([]);
      setIsLoadingFiles(false);
      return;
    }

    setIsLoadingFiles(true);
    try {
      const response = await fetch(`/api/files?${described.fetchParams}`);
      if (!response.ok) {
        throw new Error("Failed to fetch files");
      }
      const data = (await response.json()) as FilesPage;
      const pageFiles = data.files ?? [];
      if (filesRequestIdRef.current !== requestId) {
        return;
      }
      filesQueryRef.current = described.query;
      filesNextOffsetRef.current = pageFiles.length;
      setFiles(pageFiles);
      setHasMoreFiles(data.hasMore === true && pageFiles.length > 0);
      noteFavoritesTotal(data.favoritesTotal);    } catch {
      if (filesRequestIdRef.current === requestId) {
        toast.error("Failed to load library");
      }
    } finally {
      if (filesRequestIdRef.current === requestId) {
        setIsLoadingFiles(false);
      }
    }
  }, [
    input.view,
    input.search,
    input.collectionId,
    input.tagId,
    input.directory,
    input.libraryRoots,
    sort,
    noteFavoritesTotal,
  ]);

  const loadMoreFiles = useCallback(async () => {
    // Pagination reuses the stored list query (filters plus sort), so the
    // next page continues the server's global order.
    const query = filesQueryRef.current;
    if (query === null || !hasMoreFiles || isLoadingFiles || isLoadingMoreFilesRef.current) {
      return;
    }
    isLoadingMoreFilesRef.current = true;
    const requestId = filesRequestIdRef.current;
    const params = new URLSearchParams(query);
    params.set("limit", String(pageLimit()));
    params.set("offset", String(filesNextOffsetRef.current));
    try {
      const response = await fetch(`/api/files?${params.toString()}`);
      if (!response.ok) {
        throw new Error("Failed to fetch more files");
      }
      const data = (await response.json()) as FilesPage;
      const pageFiles = data.files ?? [];
      if (filesRequestIdRef.current !== requestId) {
        return;
      }
      filesNextOffsetRef.current += pageFiles.length;
      setFiles((current) => [...current, ...pageFiles]);
      setHasMoreFiles(data.hasMore === true && pageFiles.length > 0);
    } catch {
      if (filesRequestIdRef.current === requestId) {
        toast.error("Failed to load more files");
      }
    } finally {
      isLoadingMoreFilesRef.current = false;
    }
  }, [hasMoreFiles, isLoadingFiles]);

  const loadDirectories = useCallback(async () => {
    const requestId = directoriesRequestIdRef.current + 1;
    directoriesRequestIdRef.current = requestId;

    if (
      input.search.trim() ||
      input.tagId ||
      input.view === "favorites" ||
      input.view === "collection" ||
      input.view === "extensions" ||
      input.view === "shelf"
    ) {
      setDirectories([]);
      return;
    }
    try {
      const params = new URLSearchParams();
      if (input.directory) {
        params.set("root", input.directory.libraryRoot);
        if (input.directory.directory) {
          params.set("parent", input.directory.directory);
        }
      }
      const res = await fetch(`/api/directories?${params.toString()}`);
      const data = await res.json();
      if (directoriesRequestIdRef.current === requestId) {
        setDirectories(data.directories ?? []);
      }
    } catch (error) {
      if (directoriesRequestIdRef.current === requestId) {
        console.error("Failed to load directories:", error);
        toast.error("Failed to load directories");
      }
    }
  }, [input.search, input.view, input.directory, input.tagId]);

  /**
   * One batch, one request, one outcome. The batch carries an explicit target
   * state, runs server-side in a single transaction, and returns the new
   * favourites total, which the client consumes instead of refetching per
   * item. Rollback is per-batch and merge-only: only this batch's flags are
   * restored, so concurrent edits to the same files are not clobbered.
   */
  const sendFavoritesBatch = useCallback(
    async (batch: BulkFavoritesBatch, silent = false) => {
      const targets = new Set(batch.ids);
      if (targets.size === 0) {
        return true;
      }
      const snapshot = filesRef.current;
      const previous = snapshotBulkFavorites(snapshot, batch.ids);
      const selectedSnapshot = callbacksRef.current.getSelectedFile();
      setFiles((prev) => applyBulkFavorite(prev, batch.ids, batch.isFavorite));
      callbacksRef.current.syncSelectedFile((prev) =>
        prev && targets.has(prev.id) ? { ...prev, isFavorite: batch.isFavorite } : prev,
      );
      try {
        const response = await fetch("/api/files", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "setFavorites", ids: batch.ids, isFavorite: batch.isFavorite }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? "Failed to update favorite status");
        }
        const data = (await response.json()) as { favoritesTotal?: number };
        noteFavoritesTotal(data.favoritesTotal);
        return true;
      } catch (error) {
        setFiles((prev) => rollbackBulkFavorite(prev, previous));
        if (selectedSnapshot && targets.has(selectedSnapshot.id)) {
          callbacksRef.current.syncSelectedFile((prev) =>
            prev && prev.id === selectedSnapshot.id
              ? { ...prev, isFavorite: selectedSnapshot.isFavorite }
              : prev,
          );
        }
        if (!silent) {
          toast.error(error instanceof Error ? error.message : "Failed to update favorite status");
        }
        return false;
      }
    },
    [noteFavoritesTotal],
  );

  const toggleFavorite = useCallback(
    async (id: string, silent = false) => {
      const current = filesRef.current.find((file) => file.id === id);
      const selected = callbacksRef.current.getSelectedFile();
      const isFavorite = !(current?.isFavorite ?? selected?.isFavorite ?? false);
      return sendFavoritesBatch({ ids: [id], isFavorite }, silent);
    },
    [sendFavoritesBatch],
  );

  /**
   * One batch, one request, one outcome. The batch carries an explicit
   * attach/detach target and runs server-side in a single transaction.
   * Rollback is per-batch and merge-only: only this batch's tag lists are
   * restored, so concurrent edits to the same files are not clobbered.
   */
  const sendTagBatch = useCallback(async (batch: BulkTagBatch, silent = false) => {
    const targets = new Set(batch.fileIds);
    if (targets.size === 0) {
      return true;
    }
    const callbacks = callbacksRef.current;
    const snapshot = filesRef.current;
    const previous = snapshotBulkTags(snapshot, batch.fileIds);
    const selectedSnapshot = callbacks.getSelectedFile();
    const tags = callbacks.getTags();
    setFiles((prev) => applyBulkTag(prev, batch.fileIds, batch.tagId, batch.attached, tags));
    if (selectedSnapshot && targets.has(selectedSnapshot.id)) {
      callbacks.syncSelectedFile((prev) => {
        if (!prev || prev.id !== selectedSnapshot.id) {
          return prev;
        }
        const hasTag = prev.tags.some((tag) => tag.id === batch.tagId);
        if (batch.attached && !hasTag) {
          const known = tags.find((tag) => tag.id === batch.tagId);
          return { ...prev, tags: [...prev.tags, known ?? { id: batch.tagId, name: "" }] };
        }
        if (!batch.attached && hasTag) {
          return { ...prev, tags: prev.tags.filter((tag) => tag.id !== batch.tagId) };
        }
        return prev;
      });
    }
    try {
      const response = await fetch("/api/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "setFileTag",
          fileIds: batch.fileIds,
          tagId: batch.tagId,
          attached: batch.attached,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Failed to update tag");
      }
      const data = (await response.json()) as { favoritesTotal?: number };
      noteFavoritesTotal(data.favoritesTotal);
      return true;
    } catch (error) {
      setFiles((prev) => rollbackBulkTags(prev, previous));
      if (selectedSnapshot && targets.has(selectedSnapshot.id)) {
        callbacks.syncSelectedFile((prev) =>
          prev && prev.id === selectedSnapshot.id
            ? { ...prev, tags: selectedSnapshot.tags }
            : prev,
        );
      }
      if (!silent) {
        toast.error(error instanceof Error ? error.message : "Failed to update tag");
      }
      return false;
    }
  }, [noteFavoritesTotal]);

  const toggleFileTag = useCallback(
    async (fileId: string, tagId: string, silent = false) => {
      const file = filesRef.current.find((entry) => entry.id === fileId);
      if (!file) {
        return false;
      }
      const attached = !file.tags.some((tag) => tag.id === tagId);
      return sendTagBatch({ fileIds: [fileId], tagId, attached }, silent);
    },
    [sendTagBatch],
  );

  /** One batch, one request: favourite every id in the batch. */
  const bulkFavorite = useCallback(
    async (ids: string[], isFavorite = true) => {
      const ok = await sendFavoritesBatch({ ids, isFavorite }, true);
      if (!ok) {
        toast.error("Failed to update favorite status");
      }
      return ok;
    },
    [sendFavoritesBatch],
  );

  /** One batch, one request: attach the tag to every id in the batch. */
  const bulkTag = useCallback(
    async (ids: string[], tagId: string, attached = true) => {
      const ok = await sendTagBatch({ fileIds: ids, tagId, attached }, true);
      if (!ok) {
        toast.error("Failed to update tag");
      }
      return ok;
    },
    [sendTagBatch],
  );

  const removeMany = useCallback(
    async (ids: string[], permanent: boolean, mode: "bulk" | "single") => {
      const snapshot = filesRef.current;
      const targets = new Set(ids);
      setFiles((prev) => prev.filter((file) => !targets.has(file.id)));
      try {
        const res = await fetch("/api/files", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileIds: ids, permanent }),
        });
        if (!res.ok) {
          throw new Error();
        }
        const data = (await res.json()) as {
          removed?: string[];
          failed?: Array<{ id: string }>;
        };
        const removedIds = new Set(data.removed ?? ids);
        // Server truth wins: restore anything the server did not remove.
        setFiles((prev) => [
          ...prev,
          ...snapshot.filter((file) => targets.has(file.id) && !removedIds.has(file.id)),
        ]);
        callbacksRef.current.onFilesRemoved(removedIds, mode);
        void loadFavoritesCount();
        return { removedIds, failed: data.failed ?? [] };
      } catch {
        setFiles(snapshot);
        toast.error("Failed to remove files");
        return null;
      }
    },
    [loadFavoritesCount],
  );

  const bulkRemove = useCallback(
    async (ids: string[], choice: "library" | "disk") => {
      if (ids.length === 0) {
        return;
      }
      const result = await removeMany(ids, choice === "disk", "bulk");
      if (!result) {
        return;
      }
      if (result.failed.length > 0) {
        toast.error(`Could not remove ${result.failed.length} file(s)`);
      } else if (choice === "disk") {
        toast.success(`Deleted ${result.removedIds.size} file(s) from disk`);
      } else {
        toast.success(`Removed ${result.removedIds.size} file(s) from library`);
      }
    },
    [removeMany],
  );

  const removeFile = useCallback(
    async (id: string, filename: string) => {
      const result = await removeMany([id], false, "single");
      if (!result) {
        return;
      }
      if (result.failed.some((item) => item.id === id)) {
        // removeMany already restored the file from the server truth.
        toast.error("Failed to remove file from library");
        return;
      }
      toast.success(`Removed ${filename} from library`);
    },
    [removeMany],
  );

  return {
    files,
    orderedFiles,
    sortKey: sort.key,
    sortDir: sort.dir,
    flipSort,
    directories,
    isLoadingFiles,
    hasMoreFiles,
    favoritesCount,
    loadFiles,
    loadMoreFiles,
    loadDirectories,
    loadFavoritesCount,
    toggleFavorite: useCallback(
      async (id: string) => {
        await toggleFavorite(id);
      },
      [toggleFavorite],
    ),
    toggleFileTag: useCallback(
      async (fileId: string, tagId: string) => {
        await toggleFileTag(fileId, tagId);
      },
      [toggleFileTag],
    ),
    bulkFavorite,
    bulkTag,
    bulkRemove,
    removeFile,
  };
}
