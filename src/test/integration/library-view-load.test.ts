// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  useLibraryFiles,
  type LibraryFilesInput,
} from "@/app/library/use-library-files";
import { deferred } from "@/test/fixtures";
import type { FileRecord, TagRecord } from "@/app/library/types";

// Area: #276. Rows belong to the view/query that loaded them. A transition to
// a new search, Collection, directory or Shelf must withhold the previous
// rows immediately, and a failed load must surface an inline failure with a
// retry instead of leaving the old rows actionable under the new heading.

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

const KNOWN_TAGS: TagRecord[] = [];

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
  const posts: Array<ReturnType<typeof deferred<JsonResponse>>> = [];
  const impl = (url: string, init?: RequestInit): Promise<JsonResponse> => {
    calls.push({ url, init });
    const method = init?.method ?? "GET";
    if (url.startsWith("/api/directories")) {
      return Promise.resolve(okJson({ directories: [] }));
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
  return { calls, gets, posts };
}

type HookResult = { current: ReturnType<typeof useLibraryFiles> };

async function loadFilesInto(
  result: HookResult,
  fetch: ReturnType<typeof stubFetch>,
  files: FileRecord[],
): Promise<void> {
  const call = deferred<JsonResponse>();
  fetch.gets.push(call);
  let loading: Promise<void> | undefined;
  act(() => {
    loading = result.current.loadFiles();
  });
  call.resolve(okJson({ files, hasMore: false, favoritesTotal: 0 }));
  await act(async () => {
    await loading;
  });
}

async function failNextLoad(
  result: HookResult,
  fetch: ReturnType<typeof stubFetch>,
): Promise<void> {
  const call = deferred<JsonResponse>();
  fetch.gets.push(call);
  let loading: Promise<void> | undefined;
  act(() => {
    loading = result.current.loadFiles();
  });
  call.resolve(errJson({ error: "boom" }));
  await act(async () => {
    await loading;
  });
}

describe("Library view load identity", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("withholds the previous rows as soon as the search changes and reports a failed load", async () => {
    const fetch = stubFetch();
    const { result, rerender } = renderHook(({ input }) => useLibraryFiles(input), {
      initialProps: { input: baseInput() },
    });
    await loadFilesInto(result, fetch, [file("f1"), file("f2")]);
    expect(result.current.files.map((f) => f.id)).toEqual(["f1", "f2"]);

    rerender({ input: baseInput({ search: "kick" }) });
    // The transition withholds the Library rows before any request resolves.
    expect(result.current.filesStale).toBe(true);
    expect(
      result.current.files,
      "the previous Library rows must not remain actionable under a search",
    ).toEqual([]);
    expect(
      result.current.orderedFiles,
      "nothing stale is handed to the table or selection",
    ).toEqual([]);

    await failNextLoad(result, fetch);
    expect(result.current.files).toEqual([]);
    expect(result.current.filesStale).toBe(true);
    expect(result.current.filesError).toBe("Failed to load library");

    // Retrying the same view succeeds and clears the inline failure.
    const retry = deferred<JsonResponse>();
    fetch.gets.push(retry);
    let retrying: Promise<void> | undefined;
    act(() => {
      retrying = result.current.retryLoadFiles();
    });
    retry.resolve(
      okJson({ files: [file("k1")], hasMore: false, favoritesTotal: 2 }),
    );
    await act(async () => {
      await retrying;
    });
    expect(result.current.files.map((f) => f.id)).toEqual(["k1"]);
    expect(result.current.filesError).toBeNull();
    expect(result.current.filesStale).toBe(false);
    expect(fetch.calls.at(-1)?.url).toContain("q=kick");
  });

  it("withholds the previous rows on a failed Collection load", async () => {
    const fetch = stubFetch();
    const { result, rerender } = renderHook(({ input }) => useLibraryFiles(input), {
      initialProps: { input: baseInput() },
    });
    await loadFilesInto(result, fetch, [file("f1")]);

    rerender({
      input: baseInput({ view: "collection", collectionId: "c1" }),
    });
    expect(result.current.filesStale).toBe(true);
    expect(result.current.files).toEqual([]);

    await failNextLoad(result, fetch);
    expect(result.current.filesError).toBe("Failed to load library");
    expect(result.current.files).toEqual([]);
    expect(fetch.calls.at(-1)?.url).toContain("collectionId=c1");
  });

  it("withholds the previous rows on a failed directory load", async () => {
    const fetch = stubFetch();
    const { result, rerender } = renderHook(({ input }) => useLibraryFiles(input), {
      initialProps: { input: baseInput() },
    });
    await loadFilesInto(result, fetch, [file("f1")]);

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
      }),
    });
    expect(result.current.filesStale).toBe(true);
    expect(result.current.files).toEqual([]);

    await failNextLoad(result, fetch);
    expect(result.current.filesError).toBe("Failed to load library");
    expect(result.current.files).toEqual([]);
    expect(fetch.calls.at(-1)?.url).toContain("directory=drums");
  });

  it("withholds the previous rows on a failed Shelf load", async () => {
    const fetch = stubFetch();
    const { result, rerender } = renderHook(({ input }) => useLibraryFiles(input), {
      initialProps: { input: baseInput() },
    });
    await loadFilesInto(result, fetch, [file("f1")]);

    rerender({ input: baseInput({ view: "shelf" }) });
    expect(result.current.filesStale).toBe(true);
    expect(result.current.files).toEqual([]);

    const shelfCall = deferred<JsonResponse>();
    fetch.posts.push(shelfCall);
    let loading: Promise<void> | undefined;
    act(() => {
      loading = result.current.loadFiles();
    });
    shelfCall.resolve(
      okJson({ ok: false, error: { message: "shelf is down" } }),
    );
    await act(async () => {
      await loading;
    });
    expect(result.current.filesError).toBe("Failed to load shelf");
    expect(result.current.files).toEqual([]);
    expect(
      fetch.calls.some((call) => call.url.startsWith("/api/extensions-v2/execute")),
    ).toBe(true);
  });

  it("ignores a superseded request so a late response cannot repopulate a failed view", async () => {
    const fetch = stubFetch();
    const { result, rerender } = renderHook(({ input }) => useLibraryFiles(input), {
      initialProps: { input: baseInput() },
    });
    await loadFilesInto(result, fetch, [file("f1")]);

    // A slow search load is started, then abandoned for a failing Collection.
    rerender({ input: baseInput({ search: "kick" }) });
    const staleSearch = deferred<JsonResponse>();
    fetch.gets.push(staleSearch);
    let staleLoading: Promise<void> | undefined;
    act(() => {
      staleLoading = result.current.loadFiles();
    });

    rerender({
      input: baseInput({ view: "collection", collectionId: "c1" }),
    });
    await failNextLoad(result, fetch);
    expect(result.current.filesError).toBe("Failed to load library");

    // The superseded search response lands late and must be inert.
    staleSearch.resolve(
      okJson({ files: [file("late")], hasMore: false, favoritesTotal: 0 }),
    );
    await act(async () => {
      await staleLoading;
    });
    expect(
      result.current.files,
      "a superseded response must not repopulate the failed view",
    ).toEqual([]);
    expect(result.current.filesError).toBe("Failed to load library");
  });
});
