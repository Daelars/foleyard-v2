/**
 * Per-mutation refetch map for the Library workspace.
 *
 * Every organization mutation refetches only its own slice: a collection
 * rename costs one collections round-trip, a tag rename costs one tags
 * round-trip, and neither touches the extension catalog. The scan-settle
 * path refetches files plus collections (counts change) without
 * re-registering extensions.
 */
export type RefetchSlice = "collections" | "tags" | "files" | "catalog";

export type MutationName =
  | "createCollection"
  | "renameCollection"
  | "updateCollectionColor"
  | "updateCollectionFilter"
  | "convertToRegularCollection"
  | "deleteCollection"
  | "addToCollection"
  | "saveSearch"
  | "createTag"
  | "renameTag"
  | "updateTagColor"
  | "deleteTag";

const COLLECTIONS_ONLY: RefetchSlice[] = ["collections"];
const TAGS_ONLY: RefetchSlice[] = ["tags"];

export const MUTATION_REFETCH_MAP: Record<MutationName, RefetchSlice[]> = {
  createCollection: COLLECTIONS_ONLY,
  renameCollection: COLLECTIONS_ONLY,
  updateCollectionColor: COLLECTIONS_ONLY,
  updateCollectionFilter: COLLECTIONS_ONLY,
  convertToRegularCollection: COLLECTIONS_ONLY,
  deleteCollection: COLLECTIONS_ONLY,
  addToCollection: COLLECTIONS_ONLY,
  saveSearch: COLLECTIONS_ONLY,
  createTag: TAGS_ONLY,
  renameTag: TAGS_ONLY,
  updateTagColor: TAGS_ONLY,
  deleteTag: TAGS_ONLY,
};

/** Slices refreshed when a scan settles: files plus collection counts. */
export const SCAN_SETTLE_SLICES: RefetchSlice[] = ["files", "collections"];
