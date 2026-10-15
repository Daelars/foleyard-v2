"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import type { FileTableDirectory } from "@/components/FileTable/types";
import type { TagOrigin } from "@yard-core";
import { SOUND_SHELF_V2_ID, SOUND_SHELF_V2_LIST } from "@foleyard/sound-shelf-v2";
import { invokeV2Command } from "@/lib/extensions-v2/contributions";
import { useFavorites } from "./use-favorites";
import {
  applyBulkFavorite,
  applyBulkTag,
  describeFilesQuery,
  idleFilesPaging,
  InFlightRequests,
  nextPageRequest,
  pageLimit,
  rollbackBulkFavorite,
  rollbackBulkTags,
  snapshotBulkFavorites,
  snapshotBulkTags,
  sortFileRecords,
  viewQueryIdentity,
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
  /** Shelf view loads through the sound-shelf-v2 list command plus files hydration. */
  onShelfItemsLoaded: (items: FileRecord[]) => void;
}

export interface LibraryFilesInput extends LibraryFilesCallbacks {
  libraryRoots: string[];
  view: LibraryView;
  /** Debounced search text. */
  search: string;
  collectionId: string | null;
  tagId: string | null;
  tagOrigin: TagOrigin | null;
  directory: FileTableDirectory | null;
}

interface FilesPage {
  files?: FileRecord[];
  favoritesTotal?: number;
  hasMore?: boolean;
  /** Opaque keyset cursor for the next page (#256). */
  nextCursor?: string | null;
}

/** Outcome of a removal request; null when the request failed. */
type FilesRemoval = { removedIds: Set<string>; failed: Array<{ id: string }> } | null;

/** Stable empty list so stale gating does not churn consumer identities. */
const NO_FILES: FileRecord[] = [];

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
  /** The view/query identity whose rows are currently in `files` (#276). */
  const [loadedViewKey, setLoadedViewKey] = useState<string | null>(null);
  /** Inline failure for the current view; cleared when a load starts. */
  const [filesError, setFilesError] = useState<string | null>(null);
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
  /**
   * Paging state for the active request generation (#278). Cursor, more-rows
   * flag and page lock live together so they always describe one query.
   */
  const filesPagingRef = useRef(idleFilesPaging(0));
  const directoriesRequestIdRef = useRef(0);
  /** Coalesces duplicate mutation requests per request generation (#278). */
  const mutationRequestsRef = useRef(new InFlightRequests<boolean>());
  /** Coalesces duplicate removal requests per request generation (#278). */
  const removalRequestsRef = useRef(new InFlightRequests<FilesRemoval>());

  /**
   * Runs one mutation request per (generation, signature). A duplicate in the
   * same generation joins the in-flight request instead of submitting again,
   * and a request from a superseded generation can never release the newer
   * one's lock (#278).
   */
  const mutateOnce = useCallback(
    (signature: string, start: () => Promise<boolean>) =>
      mutationRequestsRef.current.run(filesRequestIdRef.current, signature, start),
    [],
  );

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

  // Identity of the view/query the current inputs describe (#276). Rows are
  // only "current" when the identity that loaded them still matches, so a
  // failed or in-flight transition can never expose the previous view's
  // rows to the table, selection, palette, or bulk actions.
  const currentViewKey = useMemo(
    () =>
      viewQueryIdentity({
        view: input.view,
        search: input.search,
        collectionId: input.collectionId,
        tagId: input.tagId,
        tagOrigin: input.tagOrigin,
        directory: input.directory,
        libraryRoots: input.libraryRoots,
        sort,
      }),
    [
      input.view,
      input.search,
      input.collectionId,
      input.tagId,
      input.tagOrigin,
      input.directory,
      input.libraryRoots,
      sort,
    ],
  );
  const filesStale = files.length > 0 && loadedViewKey !== currentViewKey;
  // Stale rows are withheld from every consumer until the matching load
  // succeeds, so nothing can play, select, edit, remove or drag them.
  const currentFiles = filesStale ? NO_FILES : files;
  const currentOrderedFiles = filesStale ? NO_FILES : orderedFiles;

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
    // A new generation owns fresh paging state: any page still in flight for
    // the previous generation is superseded and can no longer hold or release
    // a lock, continue a cursor, or append rows (#278).
    filesPagingRef.current = idleFilesPaging(requestId);
    setHasMoreFiles(false);
    setFilesError(null);

    if (input.view === "shelf") {
      setIsLoadingFiles(true);
      try {
        // Sound Shelf v2 owns membership and read-time repair; this
        // data layer only hydrates the returned ids into records.
        const invoked = await invokeV2Command({
          extensionId: SOUND_SHELF_V2_ID,
          commandId: SOUND_SHELF_V2_LIST,
        });
        if (!invoked.ok) {
          throw new Error(invoked.message);
        }
        const body = invoked.body as {
          ok?: boolean;
          error?: { message?: string };
          outcome?: { value?: { ids?: string[] } };
        };
        if (!body?.ok) {
          throw new Error(body?.error?.message ?? "Failed to fetch shelf");
        }
        const ids = body.outcome?.value?.ids ?? [];
        const params = new URLSearchParams();
        if (ids.length > 0) {
          params.set("ids", ids.join(","));
        }
        const res = await fetch(`/api/files?${params.toString()}`);
        if (!res.ok) {
          throw new Error("Failed to fetch shelf");
        }
        const data = (await res.json()) as { files?: FileRecord[] };
        if (filesRequestIdRef.current === requestId) {
          const items = (data.files ?? []) as FileRecord[];
          setFiles(items);
          setLoadedViewKey(currentViewKey);
          callbacksRef.current.onShelfItemsLoaded(items);
        }
      } catch {
        if (filesRequestIdRef.current === requestId) {
          setFilesError("Failed to load shelf");
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
      tagOrigin: input.tagOrigin,
      directory: input.directory,
      libraryRoots: input.libraryRoots,
      sort,
    });
    if (described.kind !== "list") {
      setFiles([]);
      setLoadedViewKey(currentViewKey);
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
      const hasMore = data.hasMore === true && pageFiles.length > 0;
      filesPagingRef.current = {
        generation: requestId,
        query: described.query,
        cursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
        hasMore,
        inFlight: false,
      };
      setFiles(pageFiles);
      setLoadedViewKey(currentViewKey);
      setHasMoreFiles(hasMore);
      noteFavoritesTotal(data.favoritesTotal);
    } catch {
      if (filesRequestIdRef.current === requestId) {
        setFilesError("Failed to load library");
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
    input.tagOrigin,
    input.directory,
    input.libraryRoots,
    sort,
    currentViewKey,
    noteFavoritesTotal,
  ]);

  const loadMoreFiles = useCallback(async () => {
    // Pagination reuses the generation's stored list query (filters plus sort)
    // and its opaque keyset cursor, so the next page continues the server's
    // global order without a deep OFFSET (#256). The generation check is what
    // keeps a stale page from unlocking or appending to a newer query (#278).
    const requestId = filesRequestIdRef.current;
    const request = nextPageRequest(filesPagingRef.current, requestId);
    if (request === null) {
      return;
    }
    // Claim the lock inside the generation that owns the cursor; releasing it
    // is identity-checked in the `finally` below.
    filesPagingRef.current = { ...filesPagingRef.current, inFlight: true };
    const { query, cursor } = request;
    const params = new URLSearchParams(query);
    params.set("limit", String(pageLimit()));
    params.set("cursor", cursor);
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
      const hasMore = data.hasMore === true && pageFiles.length > 0;
      filesPagingRef.current = {
        generation: requestId,
        query,
        cursor: typeof data.nextCursor === "string" ? data.nextCursor : null,
        hasMore,
        inFlight: false,
      };
      setFiles((current) => [...current, ...pageFiles]);
      setHasMoreFiles(hasMore);
    } catch {
      if (filesRequestIdRef.current === requestId) {
        filesPagingRef.current = { ...filesPagingRef.current, inFlight: false };
        toast.error("Failed to load more files");
      }
    } finally {
      // Release only the lock this request owns. A superseded page must never
      // re-enable loading for the newer transition that replaced it (#278).
      if (
        filesPagingRef.current.generation === requestId &&
        filesPagingRef.current.inFlight
      ) {
        filesPagingRef.current = { ...filesPagingRef.current, inFlight: false };
      }
    }
  }, []);

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
      const signature = `favorites:${batch.isFavorite}:${[...targets].sort().join(",")}`;
      return mutateOnce(signature, async () => {
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
      });
    },
    [mutateOnce, noteFavoritesTotal],
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
    const signature = `tags:${batch.tagId}:${batch.attached}:${[...targets].sort().join(",")}`;
    return mutateOnce(signature, async () => {
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
            return {
              ...prev,
              tags: [...prev.tags, { ...(known ?? { id: batch.tagId, name: "" }), origin: "manual" as const }],
            };
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
    });
  }, [mutateOnce, noteFavoritesTotal]);

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
      const targets = new Set(ids);
      // Coalesce a duplicate removal of the same targets in the same
      // generation, so a double submit cannot delete twice or restore stale
      // rows from a superseded request (#278). Mode is part of the signature
      // because it decides which selection state is cleared on success.
      const signature = `remove:${mode}:${permanent}:${[...targets].sort().join(",")}`;
      return removalRequestsRef.current.run(
        filesRequestIdRef.current,
        signature,
        async () => {
          const snapshot = filesRef.current;
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
      );
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
    files: currentFiles,
    orderedFiles: currentOrderedFiles,
    filesStale,
    filesError,
    sortKey: sort.key,
    sortDir: sort.dir,
    flipSort,
    directories,
    isLoadingFiles,
    hasMoreFiles,
    favoritesCount,
    loadFiles,
    /** Retry the current view/query after an inline load failure (#276). */
    retryLoadFiles: loadFiles,
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
