"use client";

import type { FileSortKey } from "@yard-core";
import type { FileRecord, TagRecord } from "./types";

export type { FileSortKey };
export type FileSortDir = 1 | -1;

export type LibraryView =
  | "all"
  | "favorites"
  | "extensions"
  | "collection"
  | "directory"
  | "shelf"
  | "organize";

export interface FilesQueryInput {
  view: LibraryView;
  /** Debounced raw search text. */
  search: string;
  collectionId: string | null;
  tagId: string | null;
  directory: { libraryRoot: string; directory: string | null } | null;
  libraryRoots: string[];
  /** Server-side ordering; the server pages in this order. */
  sort: { key: FileSortKey; dir: FileSortDir };
}

export type FilesQuery =
  | { kind: "shelf" }
  | { kind: "empty" }
  | { kind: "list"; /** Query string without pagination. */ query: string; fetchParams: string };

const PAGE_LIMIT = 500;

/**
 * Pure description of what the file list should load for a given workspace
 * state. The shelf branch is served by the sound-shelf endpoint; the
 * extensions view shows no files; every other branch maps to /api/files.
 * Extracted so the list contract is unit-testable without a DOM.
 */
export function describeFilesQuery(input: FilesQueryInput): FilesQuery {
  if (input.view === "shelf") {
    return { kind: "shelf" };
  }
  if (input.view === "extensions") {
    return { kind: "empty" };
  }

  const params = new URLSearchParams();
  if (input.search.trim()) {
    params.set("q", input.search.trim());
  } else {
    if (input.view === "directory" && input.directory) {
      params.set("libraryRoot", input.directory.libraryRoot);
      if (input.directory.directory) {
        params.set("directory", input.directory.directory);
      } else {
        params.set("atLibraryRoot", "true");
      }
    } else if (input.view === "all") {
      if (input.libraryRoots.length !== 1) {
        return { kind: "empty" };
      }
      params.set("libraryRoot", input.libraryRoots[0]);
      params.set("atLibraryRoot", "true");
    }
  }

  if (input.view === "favorites") {
    params.set("favorites", "true");
  }
  if (input.view === "collection" && input.collectionId) {
    params.set("collectionId", input.collectionId);
  }
  if (input.tagId) {
    params.set("tagId", input.tagId);
  }

  params.set("sortKey", input.sort.key);
  params.set("sortDir", input.sort.dir === 1 ? "asc" : "desc");

  const query = params.toString();
  params.set("limit", String(PAGE_LIMIT));
  params.set("offset", "0");
  return { kind: "list", query, fetchParams: params.toString() };
}

/** Client-side ordering for the shelf view. List views arrive server-ordered. */
export function sortFileRecords(
  files: FileRecord[],
  key: FileSortKey,
  dir: FileSortDir,
): FileRecord[] {
  const sorted = [...files];
  sorted.sort((a, b) => {
    if (key === "duration") {
      const av = a.duration ?? Number.POSITIVE_INFINITY;
      const bv = b.duration ?? Number.POSITIVE_INFINITY;
      return (av - bv) * dir;
    }
    return a.filename.localeCompare(b.filename) * dir;
  });
  return sorted;
}

export function applyFavoriteToggle(files: FileRecord[], id: string): FileRecord[] {
  return files.map((file) =>
    file.id === id ? { ...file, isFavorite: !file.isFavorite } : file,
  );
}

/**
 * Batch contract for the files data layer: bulk mutations carry an explicit
 * target state and run server-side in one transaction. The per-batch
 * optimistic update and its rollback are owned by the files hook.
 */
export interface BulkFavoritesBatch {
  ids: string[];
  isFavorite: boolean;
}

export interface BulkTagBatch {
  fileIds: string[];
  tagId: string;
  attached: boolean;
}

/** Optimistic set (not toggle) of the favourite flag for one batch. */
export function applyBulkFavorite(
  files: FileRecord[],
  ids: string[],
  isFavorite: boolean,
): FileRecord[] {
  if (ids.length === 0) {
    return files;
  }
  const targets = new Set(ids);
  return files.map((file) =>
    targets.has(file.id) && file.isFavorite !== isFavorite
      ? { ...file, isFavorite }
      : file,
  );
}

/** Optimistic attach/detach of one tag for one batch. */
export function applyBulkTag(
  files: FileRecord[],
  fileIds: string[],
  tagId: string,
  attached: boolean,
  tags: TagRecord[],
): FileRecord[] {
  if (fileIds.length === 0) {
    return files;
  }
  const targets = new Set(fileIds);
  const known = tags.find((tag) => tag.id === tagId);
  return files.map((file) => {
    if (!targets.has(file.id)) {
      return file;
    }
    const hasTag = file.tags.some((tag) => tag.id === tagId);
    if (attached && !hasTag) {
      return { ...file, tags: [...file.tags, known ?? { id: tagId, name: "" }] };
    }
    if (!attached && hasTag) {
      return { ...file, tags: file.tags.filter((tag) => tag.id !== tagId) };
    }
    return file;
  });
}

/** Favourite flags captured before the optimistic update, keyed by file id. */
export function snapshotBulkFavorites(
  files: FileRecord[],
  ids: string[],
): Map<string, boolean> {
  const targets = new Set(ids);
  return new Map(
    files.filter((file) => targets.has(file.id)).map((file) => [file.id, file.isFavorite]),
  );
}

/** Tag lists captured before the optimistic update, keyed by file id. */
export function snapshotBulkTags(
  files: FileRecord[],
  fileIds: string[],
): Map<string, FileRecord["tags"]> {
  const targets = new Set(fileIds);
  return new Map(
    files.filter((file) => targets.has(file.id)).map((file) => [file.id, file.tags]),
  );
}

/**
 * Per-batch rollback: restores only the favourite flags this batch changed,
 * leaving every other field (and every other file) at its current value so
 * concurrent edits to the same files are not clobbered.
 */
export function rollbackBulkFavorite(
  current: FileRecord[],
  previousById: Map<string, boolean>,
): FileRecord[] {
  if (previousById.size === 0) {
    return current;
  }
  return current.map((file) =>
    previousById.has(file.id)
      ? { ...file, isFavorite: previousById.get(file.id) as boolean }
      : file,
  );
}

/**
 * Per-batch rollback: restores only the tag lists this batch changed,
 * leaving every other field at its current value so concurrent edits to the
 * same files are not clobbered.
 */
export function rollbackBulkTags(
  current: FileRecord[],
  previousTagsById: Map<string, FileRecord["tags"]>,
): FileRecord[] {
  if (previousTagsById.size === 0) {
    return current;
  }
  return current.map((file) =>
    previousTagsById.has(file.id)
      ? { ...file, tags: previousTagsById.get(file.id) as FileRecord["tags"] }
      : file,
  );
}

export interface TagToggleResult {
  files: FileRecord[];
  /** True when the tag was attached, false when detached. */
  attached: boolean;
}

/** Optimistic attach/detach; callers keep the previous array for rollback. */
export function applyTagToggle(
  files: FileRecord[],
  fileId: string,
  tagId: string,
  tags: TagRecord[],
): TagToggleResult {
  let attached = false;
  const next = files.map((file) => {
    if (file.id !== fileId) {
      return file;
    }
    const alreadyAttached = file.tags.some((tag) => tag.id === tagId);
    attached = !alreadyAttached;
    return {
      ...file,
      tags: alreadyAttached
        ? file.tags.filter((tag) => tag.id !== tagId)
        : [...file.tags, tags.find((tag) => tag.id === tagId) ?? { id: tagId, name: "" }],
    };
  });
  return { files: next, attached };
}

export function pageLimit(): number {
  return PAGE_LIMIT;
}
