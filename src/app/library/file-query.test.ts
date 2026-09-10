import { describe, expect, it } from "vitest";

import { applyFilterTagOrigin, initialLibraryViewState } from "./use-library-view";
import {
  applyBulkFavorite,
  applyBulkTag,
  describeFilesQuery,
  rollbackBulkFavorite,
  rollbackBulkTags,
  snapshotBulkFavorites,
  snapshotBulkTags,
} from "./file-query";
import type { FileRecord } from "./types";

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
