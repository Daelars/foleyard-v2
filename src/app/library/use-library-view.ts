"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { FileTableDirectory } from "@/components/FileTable/types";
import type { RailView } from "@/components/IconRail";
import type { LibraryView } from "./file-query";
import type { CollectionRecord } from "./types";

export type { LibraryView };

export interface LibraryViewState {
  currentView: LibraryView;
  selectedCollection: string | null;
  selectedTagId: string | null;
  selectedDirectory: FileTableDirectory | null;
  searchQuery: string;
}

export const initialLibraryViewState: LibraryViewState = {
  currentView: "all",
  selectedCollection: null,
  selectedTagId: null,
  selectedDirectory: null,
  searchQuery: "",
};

function clearedSelection(state: LibraryViewState): LibraryViewState {
  return {
    ...state,
    selectedCollection: null,
    selectedDirectory: null,
    selectedTagId: null,
    searchQuery: "",
  };
}

export function applyShowLibrary(state: LibraryViewState): LibraryViewState {
  return { ...clearedSelection(state), currentView: "all" };
}

/** Switch the visible view without touching filters or selection. */
export function applyEnterView(
  state: LibraryViewState,
  view: LibraryView,
): LibraryViewState {
  return { ...state, currentView: view };
}

export function applyShowFavorites(state: LibraryViewState): LibraryViewState {
  return { ...clearedSelection(state), currentView: "favorites" };
}

export function applyShowExtensions(state: LibraryViewState): LibraryViewState {
  return { ...clearedSelection(state), currentView: "extensions" };
}

export function applyShowShelf(state: LibraryViewState): LibraryViewState {
  return { ...clearedSelection(state), currentView: "shelf" };
}

export function applyShowOrganize(state: LibraryViewState): LibraryViewState {
  return { ...clearedSelection(state), currentView: "organize" };
}

export function applyFilterTag(
  state: LibraryViewState,
  id: string | null,
): LibraryViewState {
  return { ...state, selectedTagId: id };
}

export function applyNavigateDirectory(
  state: LibraryViewState,
  directory: FileTableDirectory | null,
): LibraryViewState {
  return {
    ...clearedSelection(state),
    currentView: directory ? "directory" : "all",
    selectedDirectory: directory,
  };
}

/**
 * Smart collections with a `{ q }` filter open the library view filtered by
 * that query instead of the collection view. Returns the query when that
 * branch applies, null for a regular collection view.
 */
export function resolveSmartCollectionQuery(
  collection: CollectionRecord | undefined,
): string | null {
  if (!collection?.isSmart || !collection.filter) {
    return null;
  }
  try {
    const filter = JSON.parse(collection.filter) as { q?: string };
    return filter.q ?? "";
  } catch {
    return null;
  }
}

export function applyShowCollection(
  state: LibraryViewState,
  collection: CollectionRecord | undefined,
  collectionId: string,
): LibraryViewState {
  const smartQuery = resolveSmartCollectionQuery(collection);
  if (smartQuery !== null) {
    return {
      ...state,
      currentView: "all",
      selectedCollection: collectionId,
      selectedDirectory: null,
      searchQuery: smartQuery,
    };
  }
  return {
    ...clearedSelection(state),
    currentView: "collection",
    selectedCollection: collectionId,
  };
}

export function deriveRailView(view: LibraryView): RailView | null {
  if (view === "all" || view === "collection" || view === "directory") {
    return "library";
  }
  if (view === "favorites") {
    return "favorites";
  }
  if (view === "shelf") {
    return "shelf";
  }
  if (view === "extensions") {
    return "extensions";
  }
  if (view === "organize") {
    return "organize";
  }
  return null;
}

export interface LibraryViewCallbacks {
  /** Called on every navigation so the route clears multi-select. */
  onNavigate?: () => void;
}

/**
 * Library view routing: current view, selected collection/tag/directory, and
 * the debounced search text. Server reads stay in `useLibraryFiles`;
 * selection stays in `use-selection`. Navigation helpers notify through the
 * explicit `onNavigate` callback and never write another hook's state
 * directly. Collection data stays an explicit call-time argument so this hook
 * can be created before the organization slice.
 */
export function useLibraryView(callbacks: LibraryViewCallbacks = {}) {
  const [viewState, setViewState] = useState<LibraryViewState>(
    initialLibraryViewState,
  );
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);

  const { currentView, selectedCollection, selectedTagId, selectedDirectory } =
    viewState;
  const searchQuery = viewState.searchQuery;
  const setSearchQuery = useCallback((query: string) => {
    setViewState((prev) => ({ ...prev, searchQuery: query }));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearchQuery(viewState.searchQuery);
    }, 180);
    return () => {
      window.clearTimeout(timer);
    };
  }, [viewState.searchQuery]);

  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  });
  const notifyNavigated = useCallback(() => {
    callbacksRef.current.onNavigate?.();
  }, []);

  const showLibrary = useCallback(() => {
    setViewState((prev) => applyShowLibrary(prev));
    notifyNavigated();
  }, [notifyNavigated]);

  const showFavorites = useCallback(() => {
    setViewState((prev) => applyShowFavorites(prev));
    notifyNavigated();
  }, [notifyNavigated]);

  const showExtensions = useCallback(() => {
    setViewState((prev) => applyShowExtensions(prev));
    notifyNavigated();
  }, [notifyNavigated]);

  const showShelf = useCallback(() => {
    setViewState((prev) => applyShowShelf(prev));
    notifyNavigated();
  }, [notifyNavigated]);

  const showOrganize = useCallback(() => {
    setViewState((prev) => applyShowOrganize(prev));
    notifyNavigated();
  }, [notifyNavigated]);

  const handleFilterTag = useCallback((id: string | null) => {
    setViewState((prev) => applyFilterTag(prev, id));
  }, []);

  const showCollection = useCallback(
    (
      collectionId: string,
      collections: CollectionRecord[],
      loadSmartCount: (id: string) => Promise<number | null>,
    ) => {
      const collection = collections.find((c) => c.id === collectionId);
      if (collection?.isSmart) {
        void loadSmartCount(collectionId);
      }
      setViewState((prev) => applyShowCollection(prev, collection, collectionId));
      notifyNavigated();
    },
    [notifyNavigated],
  );

  const navigateDirectory = useCallback(
    (directory: FileTableDirectory | null) => {
      setViewState((prev) => applyNavigateDirectory(prev, directory));
      notifyNavigated();
    },
    [notifyNavigated],
  );

  /** Organization slice calls back when the selected collection is gone. */
  const clearCollectionSelection = useCallback(() => {
    setViewState((prev) => ({ ...prev, selectedCollection: null, currentView: "all" }));
  }, []);

  /** Organization slice calls back when a delete rolls back. */
  const restoreCollectionSelection = useCallback((id: string) => {
    setViewState((prev) => ({ ...prev, selectedCollection: id, currentView: "collection" }));
  }, []);

  /** Switch the visible view, keeping filters and selection untouched. */
  const enterView = useCallback((view: LibraryView) => {
    setViewState((prev) => applyEnterView(prev, view));
  }, []);

  const openMobileSidebar = useCallback(() => setShowMobileSidebar(true), []);
  const closeMobileSidebar = useCallback(() => setShowMobileSidebar(false), []);

  return {
    currentView,
    selectedCollection,
    selectedTagId,
    selectedDirectory,
    searchQuery,
    setSearchQuery,
    debouncedSearchQuery,
    showLibrary,
    showFavorites,
    showExtensions,
    showShelf,
    showOrganize,
    handleFilterTag,
    showCollection,
    navigateDirectory,
    clearCollectionSelection,
    restoreCollectionSelection,
    enterView,
    showMobileSidebar,
    openMobileSidebar,
    closeMobileSidebar,
    railView: deriveRailView(currentView),
  };
}
