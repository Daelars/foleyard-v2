// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  useLibraryFiles,
  type LibraryFilesInput,
} from "@/app/library/use-library-files";
import { deferred } from "@/test/fixtures";
import type { FileRecord, TagRecord } from "@/app/library/types";
import {
  applyBulkFavorite,
  rollbackBulkFavorite,
  snapshotBulkFavorites,
} from "@/app/library/file-query";
import {
  MUTATION_REFETCH_MAP,
  SCAN_SETTLE_SLICES,
  type MutationName,
} from "@/app/library/refetch-map";
import {
  SmartCollectionCountCache,
  extractSmartQuery,
  fetchSmartCount,
} from "@/app/library/smart-collection-counts";
import {
  omitSmartCount,
  removeCollectionOptimistic,
  restoreCollection,
} from "@/app/library/use-collections";
import {
  recolorTag,
  removeTagOptimistic,
  renameTagOptimistic,
  restoreTag,
} from "@/app/library/use-tags";
import { consumeFavoritesTotal } from "@/app/library/use-favorites";
import { toShelfFileIds } from "@/app/library/use-shelf";
import { resolveBulkRemove } from "@/app/library/use-bulk-actions";
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
} from "@/app/library/use-library-view";
import { resolveNextTitle } from "@/app/library/use-transport";
import { resolveMakePackDefaultFormat } from "@/app/library/use-extension-ui";
import { resolveScanToast } from "@/app/library/use-settings-scan";
import {
  clampPaletteIndex,
  parsePaletteEntryId,
  stepPaletteIndex,
} from "@/app/library/use-palette";
import {
  computeSelectTransition,
  pruneSelection,
  resolveMoveTarget,
} from "@/app/library/use-selection";

// Area: client mutation lifecycle (#140). Replaces eight files and 61 tests
// that exercised extracted reducers with 5 integration tests importing
// use-library-files.ts directly, driven with deferred promises so requests
// complete out of order — where B04 and B11 live.

type JsonResponse = { ok: boolean; json: () => Promise<unknown> };
const okJson = (data: unknown): JsonResponse => ({
  ok: true,
  json: async () => data,
});
const errJson = (data: unknown): JsonResponse => ({
  ok: false,
  json: async () => data,
});

function file(id: string, overrides: Partial<FileRecord> = {}): FileRecord {
  return {
    id,
    filename: `${id}.wav`,
    path: `/lib/${id}.wav`,
    directory: null,
    format: "wav",
    duration: null,
    fileSize: null,
    isFavorite: false,
    tags: [],
    ...overrides,
  };
}

const KNOWN_TAGS: TagRecord[] = [
  { id: "t1", name: "Loud", color: "red" },
  { id: "t2", name: "Soft", color: "blue" },
];

function baseInput(overrides: Partial<LibraryFilesInput> = {}): LibraryFilesInput {
  return {
    libraryRoots: ["/lib"],
    view: "all",
    search: "",
    collectionId: null,
    tagId: null,
    directory: null,
    getTags: () => KNOWN_TAGS,
    getSelectedFile: () => null,
    syncSelectedFile: () => {},
    onFilesRemoved: () => {},
    onShelfItemsLoaded: () => {},
    ...overrides,
  };
}

/** Fetch stub routing each method to its own deferred queue. */
function stubFetch() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const gets: Array<ReturnType<typeof deferred<JsonResponse>>> = [];
  const patches: Array<ReturnType<typeof deferred<JsonResponse>>> = [];
  const deletes: Array<ReturnType<typeof deferred<JsonResponse>>> = [];
  const posts: Array<ReturnType<typeof deferred<JsonResponse>>> = [];
  const impl = (url: string, init?: RequestInit): Promise<JsonResponse> => {
    calls.push({ url, init });
    const method = init?.method ?? "GET";
    if (url.startsWith("/api/directories")) {
      return Promise.resolve(okJson({ directories: [] }));
    }
    if (method === "PATCH" && url === "/api/files") {
      const next = patches.shift();
      if (!next) throw new Error("unexpected PATCH /api/files");
      return next.promise;
    }
    if (method === "DELETE" && url === "/api/files") {
      const next = deletes.shift();
      if (!next) throw new Error("unexpected DELETE /api/files");
      return next.promise;
    }
    if (method === "POST") {
      const next = posts.shift();
      if (!next) throw new Error(`unexpected POST ${url}`);
      return next.promise;
    }
    const next = gets.shift();
    if (!next) {
      return Promise.resolve(okJson({ files: [], hasMore: false, favoritesTotal: 0 }));
    }
    return next.promise;
  };
  vi.stubGlobal("fetch", impl);
  return { calls, gets, patches, deletes, posts };
}

async function flush() {
  await act(async () => {});
}

describe("client mutation lifecycle", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it.fails("a late-failing tag mutation does not erase a later success (B04)", async () => {
    const fetch = stubFetch();
    const { result } = renderHook(({ input }) => useLibraryFiles(input), {
      initialProps: { input: baseInput() },
    });

    const initialGet = deferred<JsonResponse>();
    fetch.gets.push(initialGet);
    let loading: Promise<void> | undefined;
    act(() => {
      loading = result.current.loadFiles();
    });
    initialGet.resolve(
      okJson({ files: [file("f1"), file("f2")], hasMore: false, favoritesTotal: 0 }),
    );
    await act(async () => {
      await loading;
    });
    expect(result.current.files).toHaveLength(2);

    // Two tag batches in flight over the same file; the later one wins first.
    const firstPatch = deferred<JsonResponse>();
    fetch.patches.push(firstPatch);
    let first: Promise<boolean> | undefined;
    act(() => {
      first = result.current.bulkTag(["f1"], "t1", true);
    });
    const secondPatch = deferred<JsonResponse>();
    fetch.patches.push(secondPatch);
    let second: Promise<boolean> | undefined;
    act(() => {
      second = result.current.bulkTag(["f1"], "t2", true);
    });
    expect(result.current.files.find((f) => f.id === "f1")!.tags.map((t) => t.id)).toEqual([
      "t1",
      "t2",
    ]);

    secondPatch.resolve(okJson({ favoritesTotal: 0 }));
    await act(async () => {
      expect(await second).toBe(true);
    });
    firstPatch.resolve(errJson({ error: "gone" }));
    await act(async () => {
      expect(await first).toBe(false);
    });

    // The failed batch rolls back, but the later success must survive it.
    expect(
      result.current.files.find((f) => f.id === "f1")!.tags.map((t) => t.id),
      "a delayed failure must not erase the newer tag",
    ).toEqual(["t2"]);
  });

  it.fails("a stale deletion failure does not restore the previous root's files (B04)", async () => {
    const fetch = stubFetch();
    const { result, rerender } = renderHook(({ input }) => useLibraryFiles(input), {
      initialProps: { input: baseInput() },
    });

    const rootAGet = deferred<JsonResponse>();
    fetch.gets.push(rootAGet);
    let loading: Promise<void> | undefined;
    act(() => {
      loading = result.current.loadFiles();
    });
    rootAGet.resolve(okJson({ files: [file("a1")], hasMore: false, favoritesTotal: 0 }));
    await act(async () => {
      await loading;
    });

    // Deleting from root A hangs; the user moves on to root B meanwhile.
    const deleteCall = deferred<JsonResponse>();
    fetch.deletes.push(deleteCall);
    let removal: Promise<void> | undefined;
    act(() => {
      removal = result.current.bulkRemove(["a1"], "library");
    });
    rerender({ input: baseInput({ libraryRoots: ["/other"] }) });
    const rootBGet = deferred<JsonResponse>();
    fetch.gets.push(rootBGet);
    let reloading: Promise<void> | undefined;
    act(() => {
      reloading = result.current.loadFiles();
    });
    rootBGet.resolve(okJson({ files: [file("b1")], hasMore: false, favoritesTotal: 0 }));
    await act(async () => {
      await reloading;
    });
    expect(result.current.files.map((f) => f.id)).toEqual(["b1"]);

    deleteCall.resolve(errJson({ error: "gone" }));
    await act(async () => {
      await removal;
    });
    expect(
      result.current.files.map((f) => f.id),
      "a stale failure must not bring root A's files back",
    ).toEqual(["b1"]);
  });

  it.fails("a stale page cannot unlock a newer request or duplicate appended ids (B11)", async () => {
    const fetch = stubFetch();
    const { result } = renderHook(({ input }) => useLibraryFiles(input), {
      initialProps: { input: baseInput() },
    });

    const initialPage = deferred<JsonResponse>();
    fetch.gets.push(initialPage);
    let loading: Promise<void> | undefined;
    act(() => {
      loading = result.current.loadFiles();
    });
    initialPage.resolve(
      okJson({ files: [file("f1"), file("f2")], hasMore: true, favoritesTotal: 0 }),
    );
    await act(async () => {
      await loading;
    });

    // Page one is slow; a fresh load resets the lock while it is in flight.
    const stalePage = deferred<JsonResponse>();
    fetch.gets.push(stalePage);
    act(() => {
      void result.current.loadMoreFiles();
    });
    const freshPage = deferred<JsonResponse>();
    fetch.gets.push(freshPage);
    let reloading: Promise<void> | undefined;
    act(() => {
      reloading = result.current.loadFiles();
    });
    freshPage.resolve(
      okJson({ files: [file("g1"), file("g2")], hasMore: true, favoritesTotal: 0 }),
    );
    await act(async () => {
      await reloading;
    });

    // A newer page starts; the stale first page lands mid-flight and must be
    // inert — no lock release, no second request for the same offset.
    const newerPage = deferred<JsonResponse>();
    fetch.gets.push(newerPage);
    act(() => {
      void result.current.loadMoreFiles();
    });
    const offset2Calls = () =>
      fetch.calls.filter((c) => c.url.includes("offset=2")).length;
    expect(offset2Calls(), "one newer page is legitimately in flight").toBe(2);
    stalePage.resolve(okJson({ files: [file("stale")], hasMore: true }));
    await flush();

    const duplicatePage = deferred<JsonResponse>();
    fetch.gets.push(duplicatePage);
    act(() => {
      void result.current.loadMoreFiles();
    });
    expect(
      offset2Calls(),
      "a stale page must not unlock another request for the same offset",
    ).toBe(2);

    newerPage.resolve(okJson({ files: [file("p1")], hasMore: false }));
    duplicatePage.resolve(okJson({ files: [file("p1")], hasMore: false }));
    await flush();
    const ids = result.current.files.map((f) => f.id);
    expect(ids, "appended ids must not duplicate").toEqual([...new Set(ids)]);
  });

  it("routes each view to the right endpoint and carries sort into fetch and paging", async () => {
    const fetch = stubFetch();
    const onShelfItemsLoaded = vi.fn();
    const { result, rerender } = renderHook(({ input }) => useLibraryFiles(input), {
      initialProps: { input: baseInput({ onShelfItemsLoaded }) },
    });
    const lastGetUrl = () =>
      [...fetch.calls].reverse().find((c) => (c.init?.method ?? "GET") === "GET")!.url;

    // One root lists it; two roots list nothing.
    await act(async () => {
      await result.current.loadFiles();
    });
    expect(lastGetUrl()).toContain("libraryRoot=");
    const callsBeforeEmpty = fetch.calls.length;
    rerender({ input: baseInput({ libraryRoots: ["/a", "/b"], onShelfItemsLoaded }) });
    await act(async () => {
      await result.current.loadFiles();
    });
    expect(fetch.calls.length, "two roots fetch nothing").toBe(callsBeforeEmpty);

    rerender({ input: baseInput({ view: "favorites", onShelfItemsLoaded }) });
    await act(async () => {
      await result.current.loadFiles();
    });
    expect(lastGetUrl()).toContain("favorites=true");

    rerender({
      input: baseInput({ view: "collection", collectionId: "c1", onShelfItemsLoaded }),
    });
    await act(async () => {
      await result.current.loadFiles();
    });
    expect(lastGetUrl()).toContain("collectionId=c1");

    rerender({ input: baseInput({ search: "kick", onShelfItemsLoaded }) });
    await act(async () => {
      await result.current.loadFiles();
    });
    expect(lastGetUrl()).toContain("q=kick");

    rerender({
      input: baseInput({
        view: "directory",
        directory: {
          key: "/lib::drums",
          label: "drums",
          libraryRoot: "/lib",
          directory: "drums",
          absolutePath: "/lib/drums",
          isRoot: false,
          showRoot: true,
        },
        onShelfItemsLoaded,
      }),
    });
    await act(async () => {
      await result.current.loadFiles();
    });
    expect(lastGetUrl()).toContain("directory=drums");

    // Sort reaches the list fetch and the pagination query alike.
    rerender({ input: baseInput({ onShelfItemsLoaded }) });
    act(() => {
      result.current.flipSort("duration");
    });
    await act(async () => {
      await result.current.loadFiles();
    });
    expect(lastGetUrl()).toContain("sortKey=duration");
    expect(lastGetUrl()).toContain("sortDir=asc");
    act(() => {
      result.current.flipSort("duration");
    });
    expect(result.current.sortDir).toBe(-1);

    // The shelf view loads through the extension endpoint, not /api/files.
    rerender({ input: baseInput({ view: "shelf", onShelfItemsLoaded }) });
    const shelfCall = deferred<JsonResponse>();
    fetch.posts.push(shelfCall);
    let shelfLoading: Promise<void> | undefined;
    act(() => {
      shelfLoading = result.current.loadFiles();
    });
    shelfCall.resolve(okJson({ ok: true, value: { items: [] } }));
    await act(async () => {
      await shelfLoading;
    });
    expect(onShelfItemsLoaded).toHaveBeenCalledWith([]);

    // Directories load for the plain workspace and clear for search.
    rerender({ input: baseInput({ onShelfItemsLoaded }) });
    await act(async () => {
      await result.current.loadDirectories();
    });
    expect(fetch.calls.some((c) => c.url.startsWith("/api/directories"))).toBe(true);
  });

  it("keeps the surviving slice-helper contracts: refetch, counts, selection, views and routes", async () => {
    // Refetch map: org mutations refetch their own slice, never the catalog.
    const collectionMutations: MutationName[] = [
      "createCollection",
      "renameCollection",
      "updateCollectionColor",
      "updateCollectionFilter",
      "convertToRegularCollection",
      "deleteCollection",
      "addToCollection",
      "saveSearch",
    ];
    for (const mutation of collectionMutations) {
      expect(MUTATION_REFETCH_MAP[mutation]).toEqual(["collections"]);
    }
    const tagMutations: MutationName[] = [
      "createTag",
      "renameTag",
      "updateTagColor",
      "deleteTag",
    ];
    for (const mutation of tagMutations) {
      expect(MUTATION_REFETCH_MAP[mutation]).toEqual(["tags"]);
    }
    expect([...SCAN_SETTLE_SLICES].sort()).toEqual(["collections", "files"]);

    // Smart counts: trimmed queries cache per string; misses fetch once.
    expect(extractSmartQuery(JSON.stringify({ q: "  rain  " }))).toBe("rain");
    expect(extractSmartQuery("not-json")).toBeNull();
    const cache = new SmartCollectionCountCache();
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ count: 12 }),
    }));
    expect(await fetchSmartCount("id-a", "rain", cache, fetchImpl)).toBe(12);
    expect(await fetchSmartCount("id-b", "rain", cache, fetchImpl)).toBe(12);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(await fetchSmartCount("id-a", null, cache, vi.fn())).toBeNull();

    // Favorites batch: optimistic set with merge-only rollback.
    const favFiles = [file("a"), file("b")];
    const favNext = applyBulkFavorite(favFiles, ["a"], true);
    expect(favNext.find((f) => f.id === "a")!.isFavorite).toBe(true);
    expect(favNext.find((f) => f.id === "b")!.isFavorite).toBe(false);
    const favSnapshot = snapshotBulkFavorites(favFiles, ["a"]);
    const favRolled = rollbackBulkFavorite(favNext, favSnapshot);
    expect(favRolled.find((f) => f.id === "a")!.isFavorite).toBe(false);
    expect(consumeFavoritesTotal(7)).toBe(7);
    expect(consumeFavoritesTotal("7")).toBeNull();

    // Selection: prune, range, toggle, play and move targets.
    expect(pruneSelection(["a", "b", "c"], new Set(["a", "c"]))).toEqual(["a", "c"]);
    const range = computeSelectTransition({
      orderedIds: ["a", "b", "c"],
      anchor: "a",
      fileId: "c",
      modifiers: { shiftKey: true },
      selectedFileId: null,
    });
    expect(range).toMatchObject({ action: "range" });
    const visible = [file("a"), file("b"), file("c")];
    expect(resolveMoveTarget(visible, "c", 1)?.id).toBe("a");
    expect(resolveMoveTarget([], "a", 1)).toBeNull();

    // Domain slices: collections, tags, shelf ids and bulk-remove choices.
    const CLOCK = [
      { id: "a", name: "a" },
      { id: "b", name: "b" },
    ];
    expect(removeCollectionOptimistic(CLOCK, "a").map((c) => c.id)).toEqual(["b"]);
    expect(restoreCollection(CLOCK.slice(1), CLOCK[0]).map((c) => c.id)).toEqual(["a", "b"]);
    expect(omitSmartCount({ a: 1 }, "missing")).toEqual({ a: 1 });
    const tagList = [
      { id: "a", name: "a", color: "red" },
      { id: "b", name: "b", color: "red" },
    ];
    expect(removeTagOptimistic(tagList, "a").map((t) => t.id)).toEqual(["b"]);
    expect(renameTagOptimistic(tagList, "a", "  drums  ")[0].name).toBe("drums");
    expect(recolorTag(tagList, "a", "blue")[0].color).toBe("blue");
    expect(restoreTag(removeTagOptimistic(tagList, "a"), tagList[0]).map((t) => t.id)).toEqual([
      "a",
      "b",
    ]);
    expect(toShelfFileIds([{ id: "a" }, { id: "b" }])).toEqual(["a", "b"]);
    expect(resolveBulkRemove({ stage: "confirm", choice: "disk" }, ["a"])).toBe("disk");
    expect(resolveBulkRemove({ stage: "choose" }, ["a"])).toBeNull();

    // View routing: top-level views, tags, directories, collections, rail.
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
      searchQuery: "",
    });
    expect(applyFilterTag(initialLibraryViewState, "t9").selectedTagId).toBe("t9");
    expect(applyShowCollection(initialLibraryViewState, { id: "c1", name: "Kit" }, "c1")).toMatchObject({
      currentView: "collection",
    });
    expect(deriveRailView("shelf")).toBe("shelf");
    expect(deriveRailView("all")).toBe("library");
    expect(applyEnterView(composed, "all").searchQuery).toBe("kick");
    expect(applyShowExtensions(composed).currentView).toBe("extensions");
    expect(applyShowShelf(composed).currentView).toBe("shelf");
    expect(applyShowOrganize(composed).currentView).toBe("organize");
    expect(applyShowFavorites(composed).currentView).toBe("favorites");
    expect(
      resolveSmartCollectionQuery({ id: "s1", name: "Smart", isSmart: true, filter: "{broken" }),
    ).toBeNull();
    const dir = {
      key: "/lib::drums",
      label: "drums",
      libraryRoot: "/lib",
      directory: "drums",
      absolutePath: "/lib/drums",
      isRoot: false,
      showRoot: true,
    };
    expect(applyNavigateDirectory(initialLibraryViewState, dir).currentView).toBe("directory");

    // Route slices: transport titles, pack defaults, scan toasts, palette ids.
    const queue = [file("a"), file("b"), file("c")];
    expect(
      resolveNextTitle({ files: queue, queue: ["a", "b", "c"], cursor: 0, selectedFileId: "a" }),
    ).toBe("b");
    expect(resolveNextTitle({ files: queue, queue: ["a"], cursor: 0, selectedFileId: "a" })).toBeNull();
    expect(resolveMakePackDefaultFormat([])).toBe("zip");
    expect(
      resolveScanToast({ phase: "done", error: null, errors: 0 } as never),
    ).toMatchObject({ kind: "success" });
    expect(
      resolveScanToast({ phase: "error", error: "boom", errors: 0 } as never),
    ).toMatchObject({ kind: "error" });
    expect(parsePaletteEntryId("view:library")).toEqual({ kind: "view", rest: "library" });
    expect(clampPaletteIndex(9, 3)).toBe(2);
    expect(stepPaletteIndex(2, 1, 3)).toBe(0);
  });
});
