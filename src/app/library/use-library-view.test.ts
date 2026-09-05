import { describe, expect, it } from "vitest";

import {
  applyEnterView,
  applyFilterTag,
  applyNavigateDirectory,
  applyShowCollection,
  applyShowExtensions,
  applyShowFavorites,
  applyShowLibrary,
  applyShowOrganize,
  applyShowShelf,
  deriveRailView,
  initialLibraryViewState,
  resolveSmartCollectionQuery,
} from "./use-library-view";
import type { CollectionRecord } from "./types";

function smartCollection(filter: string): CollectionRecord {
  return { id: "s1", name: "Smart", isSmart: true, filter };
}

describe("library view routing", () => {
  it("navigates between top-level views and clears composition", () => {
    const composed = {
      ...initialLibraryViewState,
      currentView: "collection" as const,
      selectedCollection: "c1",
      selectedTagId: "t1",
      searchQuery: "kick",
    };
    expect(applyShowLibrary(composed)).toMatchObject({
      currentView: "all",
      selectedCollection: null,
      selectedTagId: null,
      searchQuery: "",
    });
    expect(applyShowFavorites(composed).currentView).toBe("favorites");
    expect(applyShowExtensions(composed).currentView).toBe("extensions");
    expect(applyShowShelf(composed).currentView).toBe("shelf");
    expect(applyShowOrganize(composed).currentView).toBe("organize");
  });

  it("filters by tag without touching the view", () => {
    const next = applyFilterTag(initialLibraryViewState, "t9");
    expect(next.selectedTagId).toBe("t9");
    expect(next.currentView).toBe("all");
  });

  it("navigates directories and back to the library root", () => {
    const dir = {
      key: "/lib::drums",
      label: "drums",
      libraryRoot: "/lib",
      directory: "drums",
      absolutePath: "/lib/drums",
      isRoot: false,
      showRoot: true,
    };
    const into = applyNavigateDirectory(initialLibraryViewState, dir);
    expect(into.currentView).toBe("directory");
    expect(into.selectedDirectory).toEqual(dir);
    const back = applyNavigateDirectory(into, null);
    expect(back.currentView).toBe("all");
    expect(back.selectedDirectory).toBeNull();
  });

  it("opens smart collections in the library view with their query", () => {
    const collection = smartCollection(JSON.stringify({ q: "snare" }));
    const next = applyShowCollection(initialLibraryViewState, collection, "s1");
    expect(next).toMatchObject({
      currentView: "all",
      selectedCollection: "s1",
      searchQuery: "snare",
    });
  });

  it("opens regular collections in the collection view", () => {
    const next = applyShowCollection(
      { ...initialLibraryViewState, searchQuery: "old" },
      { id: "c1", name: "Kit" },
      "c1",
    );
    expect(next).toMatchObject({
      currentView: "collection",
      selectedCollection: "c1",
      searchQuery: "",
    });
  });

  it("falls back to the collection view for invalid smart filters", () => {
    const collection = smartCollection("{broken");
    expect(resolveSmartCollectionQuery(collection)).toBeNull();
    const next = applyShowCollection(initialLibraryViewState, collection, "s1");
    expect(next.currentView).toBe("collection");
  });

  it("enters a view without touching filters or selection", () => {
    const state = {
      ...initialLibraryViewState,
      selectedCollection: "c1",
      searchQuery: "kick",
    };
    expect(applyEnterView(state, "all")).toMatchObject({
      currentView: "all",
      selectedCollection: "c1",
      searchQuery: "kick",
    });
  });

  it("derives the rail view for every route", () => {
    expect(deriveRailView("all")).toBe("library");
    expect(deriveRailView("collection")).toBe("library");
    expect(deriveRailView("directory")).toBe("library");
    expect(deriveRailView("favorites")).toBe("favorites");
    expect(deriveRailView("shelf")).toBe("shelf");
    expect(deriveRailView("extensions")).toBe("extensions");
    expect(deriveRailView("organize")).toBe("organize");
  });
});
