import { describe, expect, it } from "vitest";

import { applyFilterTagOrigin, initialLibraryViewState } from "./use-library-view";
import {
  applyBulkFavorite,
  applyBulkTag,
  describeFilesQuery,
  idleFilesPaging,
  InFlightRequests,
  nextPageRequest,
  rollbackBulkFavorite,
  rollbackBulkTags,
  snapshotBulkFavorites,
  snapshotBulkTags,
  viewQueryIdentity,
} from "./file-query";
import type { FileRecord } from "./types";

// Area: #276. Rows belong to the view/query that loaded them: identical
// inputs share an identity, and any search, filter, directory, Collection,
// root or sort change produces a new one.
describe("view query identity", () => {
  function input(
    overrides: Partial<Parameters<typeof viewQueryIdentity>[0]> = {},
  ): Parameters<typeof viewQueryIdentity>[0] {
    return {
      view: "all" as const,
      search: "",
      collectionId: null,
      tagId: null,
      tagOrigin: null,
      directory: null,
      libraryRoots: ["/lib"],
      sort: { key: "filename" as const, dir: 1 as const },
      ...overrides,
    };
  }

  it("is stable for identical inputs and changes with the query", () => {
    expect(viewQueryIdentity(input())).toBe(viewQueryIdentity(input()));
    expect(viewQueryIdentity(input({ search: "kick" }))).not.toBe(
      viewQueryIdentity(input()),
    );
    expect(
      viewQueryIdentity(input({ view: "collection", collectionId: "c1" })),
    ).not.toBe(viewQueryIdentity(input()));
    expect(
      viewQueryIdentity(
        input({
          view: "directory",
          directory: {
            libraryRoot: "/lib",
            directory: "drums",
          },
        }),
      ),
    ).not.toBe(viewQueryIdentity(input()));
    expect(
      viewQueryIdentity(input({ sort: { key: "duration", dir: -1 } })),
    ).not.toBe(viewQueryIdentity(input()));
  });

  it("names the shelf and empty branches distinctly", () => {
    expect(viewQueryIdentity(input({ view: "shelf" }))).toBe("shelf");
    expect(viewQueryIdentity(input({ view: "extensions" }))).toBe("empty");
    expect(viewQueryIdentity(input({ view: "auto-tag" }))).toBe("empty");
    // Two roots make the plain Library branch load nothing.
    expect(viewQueryIdentity(input({ libraryRoots: ["/a", "/b"] }))).toBe(
      "empty",
    );
  });
});

// Area: provenance UI (#193). The origin filter travels from view state
// into the files query: set an origin and the fetch params carry it,
// clear it and they do not.
describe("origin filter query", () => {
  function input(tagOrigin: "manual" | "deterministic" | "semantic_ai" | null = null) {
    return {
      view: "all" as const,
      search: "",
      collectionId: null,
      tagId: null,
      tagOrigin,
      directory: null,
      libraryRoots: ["/lib"],
      sort: { key: "filename" as const, dir: 1 as const },
    };
  }

  it("toggles origin in view state and carries it into the files query", () => {
    const set = applyFilterTagOrigin(initialLibraryViewState, "semantic_ai");
    expect(set.tagOrigin).toBe("semantic_ai");
    expect(applyFilterTagOrigin(set, null).tagOrigin).toBeNull();

    const carried = describeFilesQuery(input("deterministic"));
    expect(carried.kind).toBe("list");
    if (carried.kind !== "list") return;
    expect(carried.fetchParams).toContain("origin=deterministic");

    const cleared = describeFilesQuery(input(null));
    expect(cleared.kind).toBe("list");
    if (cleared.kind !== "list") return;
    expect(cleared.fetchParams).not.toContain("origin=");
  });
});

// Area: #278. A page request is only valid when the cursor, more-rows flag,
// lock and request generation all describe the same active query, and duplicate
// requests within one generation share a single promise.
describe("page request state", () => {
  it("refuses a page until the generation owns a cursor with more rows", () => {
    const idle = idleFilesPaging(3);
    expect(idle).toMatchObject({ generation: 3, cursor: null, hasMore: false });
    expect(nextPageRequest(idle, 3)).toBeNull();
    expect(nextPageRequest(idle, 4)).toBeNull();

    const loaded = {
      ...idle,
      query: "libraryRoot=%2Flib",
      cursor: "cursor-1",
      hasMore: true,
    };
    expect(nextPageRequest(loaded, 3)).toEqual({
      query: "libraryRoot=%2Flib",
      cursor: "cursor-1",
    });
    // A different generation may not continue this cursor.
    expect(nextPageRequest(loaded, 4)).toBeNull();
    // Neither may a page while this generation's page is in flight.
    expect(nextPageRequest({ ...loaded, inFlight: true }, 3)).toBeNull();
    // Nor when the server reported no more rows.
    expect(nextPageRequest({ ...loaded, hasMore: false }, 3)).toBeNull();
  });
});

// Area: #278. Duplicate requests within a generation share one promise, and a
// superseded request can never release the entry a newer request installed.
describe("in-flight request coalescing", () => {
  it("runs one request per generation and signature, then releases it", async () => {
    const requests = new InFlightRequests<number>();
    let started = 0;
    const start = async () => {
      started += 1;
      return started;
    };

    const first = requests.run(1, "favorites:a", start);
    const duplicate = requests.run(1, "favorites:a", start);
    expect(duplicate).toBe(first);
    expect(requests.has(1, "favorites:a")).toBe(true);

    // A different key in the same generation is its own request.
    const other = requests.run(1, "favorites:b", start);
    expect(other).not.toBe(first);
    expect(started).toBe(2);

    expect(await first).toBe(1);
    expect(await other).toBe(2);
    await Promise.resolve();
    expect(requests.has(1, "favorites:a")).toBe(false);
  });

  it("does not let a superseded request release a newer generation's lock", async () => {
    const requests = new InFlightRequests<number>();
    let resolveStale!: (value: number) => void;
    const stale = requests.run(
      1,
      "favorites:a",
      () => new Promise<number>((resolve) => { resolveStale = resolve; }),
    );
    expect(requests.has(1, "favorites:a")).toBe(true);

    // The newer generation starts its own request under the same signature.
    const fresh = requests.run(2, "favorites:a", async () => 2);
    expect(await fresh).toBe(2);

    // The stale request lands late and must not disturb the newer entry.
    resolveStale(1);
    expect(await stale).toBe(1);
    expect(requests.has(2, "favorites:a")).toBe(false);
    expect(requests.has(1, "favorites:a")).toBe(false);
  });
});

// Area: #259. A single-item optimistic update allocates one row and keeps
// every other row's identity, so the memoized table only re-renders the
// affected row.
describe("single-item optimistic updates", () => {
  function file(id: string, isFavorite = false): FileRecord {
    return {
      id,
      filename: `${id}.wav`,
      path: `/lib/${id}.wav`,
      directory: null,
      format: "wav",
      duration: 1,
      fileSize: 100,
      isFavorite,
      tags: [],
    };
  }

  it("replaces only the favourited row", () => {
    const files = [file("a"), file("b"), file("c")];
    const next = applyBulkFavorite(files, ["b"], true);
    expect(next).not.toBe(files);
    expect(next[0]).toBe(files[0]);
    expect(next[1]).not.toBe(files[1]);
    expect(next[1].isFavorite).toBe(true);
    expect(next[2]).toBe(files[2]);
  });

  it("returns the same list when the favourite already matches", () => {
    const files = [file("a"), file("b")];
    expect(applyBulkFavorite(files, ["b"], false)).toBe(files);
  });

  it("replaces only the tagged row", () => {
    const files = [file("a"), file("b"), file("c")];
    const next = applyBulkTag(files, ["b"], "t1", true, [
      { id: "t1", name: "thunder", color: "#fff" },
    ]);
    expect(next[0]).toBe(files[0]);
    expect(next[1]).not.toBe(files[1]);
    expect(next[1].tags).toEqual([
      { id: "t1", name: "thunder", color: "#fff", origin: "manual" },
    ]);
    expect(next[2]).toBe(files[2]);
  });

  it("snapshots and rolls back a single row in place", () => {
    const files = [file("a"), file("b", true), file("c")];
    const previous = snapshotBulkFavorites(files, ["b"]);
    expect(previous).toEqual(new Map([["b", true]]));

    const rolled = rollbackBulkFavorite(files, previous);
    expect(rolled).toBe(files);

    const changed = applyBulkFavorite(files, ["b"], false);
    const restored = rollbackBulkFavorite(changed, previous);
    expect(restored[0]).toBe(files[0]);
    expect(restored[1].isFavorite).toBe(true);
    expect(restored[2]).toBe(files[2]);
  });

  it("snapshots and rolls back a single row's tags in place", () => {
    const tagged = { ...file("a"), tags: [{ id: "t1", name: "thunder" }] };
    const files = [tagged, file("b")];
    const previous = snapshotBulkTags(files, ["a"]);
    expect(previous.get("a")).toBe(tagged.tags);

    const detached = applyBulkTag(files, ["a"], "t1", false, []);
    expect(detached[0].tags).toEqual([]);
    const restored = rollbackBulkTags(detached, previous);
    expect(restored[0].tags).toBe(tagged.tags);
    expect(restored[1]).toBe(files[1]);
  });
});
