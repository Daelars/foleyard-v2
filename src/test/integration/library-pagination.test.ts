// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  useLibraryFiles,
  type LibraryFilesInput,
} from "@/app/library/use-library-files";
import { deferred } from "@/test/fixtures";
import type { FileRecord, TagRecord } from "@/app/library/types";

// Area: #278. A page cursor, loading flag and request generation must describe
// the same query state. A page or mutation started in one generation can
// neither release a newer generation's lock nor submit duplicate work, and a
// superseded response must be inert. Where #276 withholds stale rows, this
// suite pins the request lock that decides whether another request may start.

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

const KNOWN_TAGS: TagRecord[] = [{ id: "t1", name: "Loud", color: "red" }];

function baseInput(overrides: Partial<LibraryFilesInput> = {}): LibraryFilesInput {
  return {
    libraryRoots: ["/lib"],
    view: "all",
    search: "",
    collectionId: null,
    tagId: null,
    tagOrigin: null,
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
  const impl = (url: string, init?: RequestInit): Promise<JsonResponse> => {
    calls.push({ url, init });
    const method = init?.method ?? "GET";
    if (url.startsWith("/api/directories")) {
      return Promise.resolve(okJson({ directories: [] }));
    }
    if (method === "PATCH") {
      const next = patches.shift();
      if (!next) throw new Error("unexpected PATCH /api/files");
      return next.promise;
    }
    const next = gets.shift();
    if (!next) {
      return Promise.resolve(okJson({ files: [], hasMore: false, favoritesTotal: 0 }));
    }
    return next.promise;
  };
  vi.stubGlobal("fetch", impl);
  return { calls, gets, patches };
}

type HookResult = { current: ReturnType<typeof useLibraryFiles> };
type Fetch = ReturnType<typeof stubFetch>;

function pageCalls(fetch: Fetch, cursor: string): number {
  return fetch.calls.filter((call) => call.url.includes(`cursor=${cursor}`)).length;
}

function patchCalls(fetch: Fetch): number {
  return fetch.calls.filter((call) => (call.init?.method ?? "GET") === "PATCH").length;
}

async function flush() {
  await act(async () => {});
}

/** Resolves one loadFiles() call with the given page body. */
async function loadPage(
  result: HookResult,
  fetch: Fetch,
  files: FileRecord[],
  options: { hasMore?: boolean; nextCursor?: string } = {},
): Promise<void> {
  const call = deferred<JsonResponse>();
  fetch.gets.push(call);
  let loading: Promise<void> | undefined;
  act(() => {
    loading = result.current.loadFiles();
  });
  call.resolve(
    okJson({
      files,
      hasMore: options.hasMore ?? false,
      favoritesTotal: 0,
      ...(options.nextCursor ? { nextCursor: options.nextCursor } : {}),
    }),
  );
  await act(async () => {
    await loading;
  });
}

/** Starts a loadMoreFiles() the test resolves later. */
function startPage(
  result: HookResult,
  fetch: Fetch,
): ReturnType<typeof deferred<JsonResponse>> {
  const call = deferred<JsonResponse>();
  fetch.gets.push(call);
  act(() => {
    void result.current.loadMoreFiles();
  });
  return call;
}

describe("Library pagination request state", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rejects a duplicate page when a superseded page lands after a newer transition", async () => {
    const fetch = stubFetch();
    const { result, rerender } = renderHook(({ input }) => useLibraryFiles(input), {
      initialProps: { input: baseInput() },
    });

    await loadPage(result, fetch, [file("f1"), file("f2")], {
      hasMore: true,
      nextCursor: "cursor-1",
    });

    // A page for the first query is slow.
    const stalePage = startPage(result, fetch);
    expect(pageCalls(fetch, "cursor-1")).toBe(1);

    // The user switches search: a fresh load starts a new generation and a
    // new cursor.
    rerender({ input: baseInput({ search: "kick" }) });
    await loadPage(result, fetch, [file("k1")], {
      hasMore: true,
      nextCursor: "cursor-2",
    });

    // A page for the newer query is legitimately in flight.
    const newerPage = startPage(result, fetch);
    expect(pageCalls(fetch, "cursor-2")).toBe(1);

    // The superseded page lands mid-flight. It must not release the newer
    // generation's lock.
    stalePage.resolve(okJson({ files: [file("stale")], hasMore: true }));
    await flush();

    const duplicatePage = deferred<JsonResponse>();
    fetch.gets.push(duplicatePage);
    act(() => {
      void result.current.loadMoreFiles();
    });
    expect(
      pageCalls(fetch, "cursor-2"),
      "a stale page must not unlock a duplicate request for the same cursor",
    ).toBe(1);

    newerPage.resolve(okJson({ files: [file("p1")], hasMore: false }));
    await flush();
    expect(result.current.files.map((f) => f.id)).toEqual(["k1", "p1"]);
  });

  it("does not append a superseded page to a newer query's rows", async () => {
    const fetch = stubFetch();
    const { result, rerender } = renderHook(({ input }) => useLibraryFiles(input), {
      initialProps: { input: baseInput() },
    });

    await loadPage(result, fetch, [file("f1"), file("f2")], {
      hasMore: true,
      nextCursor: "cursor-1",
    });
    const stalePage = startPage(result, fetch);

    rerender({ input: baseInput({ search: "kick" }) });
    await loadPage(result, fetch, [file("k1")], {
      hasMore: true,
      nextCursor: "cursor-2",
    });

    stalePage.resolve(okJson({ files: [file("stale")], hasMore: true }));
    await flush();

    expect(
      result.current.files.map((f) => f.id),
      "a page from the superseded query must not append to the new rows",
    ).toEqual(["k1"]);
  });

  it("does not repopulate the list from a superseded first page", async () => {
    const fetch = stubFetch();
    const { result } = renderHook(({ input }) => useLibraryFiles(input), {
      initialProps: { input: baseInput() },
    });

    const slowFirst = deferred<JsonResponse>();
    fetch.gets.push(slowFirst);
    let slowLoading: Promise<void> | undefined;
    act(() => {
      slowLoading = result.current.loadFiles();
    });

    const fastFirst = deferred<JsonResponse>();
    fetch.gets.push(fastFirst);
    let fastLoading: Promise<void> | undefined;
    act(() => {
      fastLoading = result.current.loadFiles();
    });
    fastFirst.resolve(okJson({ files: [file("b1")], hasMore: false, favoritesTotal: 0 }));
    await act(async () => {
      await fastLoading;
    });

    slowFirst.resolve(okJson({ files: [file("a1")], hasMore: false, favoritesTotal: 0 }));
    await act(async () => {
      await slowLoading;
    });

    expect(
      result.current.files.map((f) => f.id),
      "a superseded first page must not replace the newer rows",
    ).toEqual(["b1"]);
  });

  it("releases the page lock after a failed page so the same cursor can be retried", async () => {
    const fetch = stubFetch();
    const { result } = renderHook(({ input }) => useLibraryFiles(input), {
      initialProps: { input: baseInput() },
    });

    await loadPage(result, fetch, [file("f1"), file("f2")], {
      hasMore: true,
      nextCursor: "cursor-1",
    });

    const failing = startPage(result, fetch);
    failing.resolve(errJson({ error: "boom" }));
    await flush();
    expect(pageCalls(fetch, "cursor-1")).toBe(1);

    // The failed request released its own lock, so a retry is allowed.
    const retry = startPage(result, fetch);
    expect(
      pageCalls(fetch, "cursor-1"),
      "a failed page must release its own lock",
    ).toBe(2);
    retry.resolve(okJson({ files: [file("f3")], hasMore: false }));
    await flush();
    expect(result.current.files.map((f) => f.id)).toEqual(["f1", "f2", "f3"]);
  });

  it("does not release the newer lock when a superseded page fails", async () => {
    const fetch = stubFetch();
    const { result, rerender } = renderHook(({ input }) => useLibraryFiles(input), {
      initialProps: { input: baseInput() },
    });

    await loadPage(result, fetch, [file("f1")], {
      hasMore: true,
      nextCursor: "cursor-1",
    });
    const stalePage = startPage(result, fetch);

    rerender({ input: baseInput({ search: "kick" }) });
    await loadPage(result, fetch, [file("k1")], {
      hasMore: true,
      nextCursor: "cursor-2",
    });
    const newerPage = startPage(result, fetch);
    expect(pageCalls(fetch, "cursor-2")).toBe(1);

    // A stale page *failure* must be as inert as a stale success.
    stalePage.resolve(errJson({ error: "boom" }));
    await flush();

    const duplicatePage = deferred<JsonResponse>();
    fetch.gets.push(duplicatePage);
    act(() => {
      void result.current.loadMoreFiles();
    });
    expect(
      pageCalls(fetch, "cursor-2"),
      "a stale page failure must not unlock a duplicate request",
    ).toBe(1);

    newerPage.resolve(okJson({ files: [file("p1")], hasMore: false }));
    await flush();
  });

  it("coalesces duplicate mutation requests for the same generation", async () => {
    const fetch = stubFetch();
    const { result } = renderHook(({ input }) => useLibraryFiles(input), {
      initialProps: { input: baseInput() },
    });
    await loadPage(result, fetch, [file("f1")]);

    const firstPatch = deferred<JsonResponse>();
    fetch.patches.push(firstPatch);
    let first: Promise<boolean> | undefined;
    act(() => {
      first = result.current.bulkFavorite(["f1"], true);
    });
    expect(patchCalls(fetch)).toBe(1);

    // A second identical mutation must join the first, not submit again.
    let second: Promise<boolean> | undefined;
    act(() => {
      second = result.current.bulkFavorite(["f1"], true);
    });
    expect(
      patchCalls(fetch),
      "a duplicate mutation request must be coalesced",
    ).toBe(1);

    firstPatch.resolve(okJson({ favoritesTotal: 1 }));
    await act(async () => {
      expect(await first).toBe(true);
      expect(await second).toBe(true);
    });

    // The lock releases with the request, so a fresh mutation is allowed.
    const thirdPatch = deferred<JsonResponse>();
    fetch.patches.push(thirdPatch);
    let third: Promise<boolean> | undefined;
    act(() => {
      third = result.current.bulkFavorite(["f1"], true);
    });
    expect(patchCalls(fetch), "the coalesced lock must release").toBe(2);
    thirdPatch.resolve(okJson({ favoritesTotal: 1 }));
    await act(async () => {
      expect(await third).toBe(true);
    });
  });

  it("does not let a superseded mutation release a newer request's lock", async () => {
    const fetch = stubFetch();
    const { result, rerender } = renderHook(({ input }) => useLibraryFiles(input), {
      initialProps: { input: baseInput() },
    });
    await loadPage(result, fetch, [file("f1")]);

    // A mutation starts under the first generation and hangs.
    const stalePatch = deferred<JsonResponse>();
    fetch.patches.push(stalePatch);
    let stale: Promise<boolean> | undefined;
    act(() => {
      stale = result.current.bulkFavorite(["f1"], true);
    });

    // A view transition bumps the generation; the same mutation is a new
    // intent and starts its own request.
    rerender({ input: baseInput({ search: "kick" }) });
    await loadPage(result, fetch, [file("k1")]);
    const freshPatch = deferred<JsonResponse>();
    fetch.patches.push(freshPatch);
    let fresh: Promise<boolean> | undefined;
    act(() => {
      fresh = result.current.bulkFavorite(["f1"], true);
    });
    expect(patchCalls(fetch)).toBe(2);

    let duplicate: Promise<boolean> | undefined;
    act(() => {
      duplicate = result.current.bulkFavorite(["f1"], true);
    });
    expect(patchCalls(fetch), "the newer generation's duplicate is coalesced").toBe(2);

    // The stale request lands; it must not release the newer generation's lock.
    stalePatch.resolve(okJson({ favoritesTotal: 1 }));
    await act(async () => {
      expect(await stale).toBe(true);
    });

    let afterStale: Promise<boolean> | undefined;
    act(() => {
      afterStale = result.current.bulkFavorite(["f1"], true);
    });
    expect(
      patchCalls(fetch),
      "a superseded mutation must not unlock a newer request",
    ).toBe(2);

    freshPatch.resolve(okJson({ favoritesTotal: 1 }));
    await act(async () => {
      expect(await fresh).toBe(true);
      expect(await duplicate).toBe(true);
      expect(await afterStale).toBe(true);
    });
  });
});
