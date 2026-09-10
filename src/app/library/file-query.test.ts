import { describe, expect, it } from "vitest";

import { applyFilterTagOrigin, initialLibraryViewState } from "./use-library-view";
import { describeFilesQuery } from "./file-query";

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

  it("carries the origin param when set", () => {
    const described = describeFilesQuery(input("deterministic"));
    expect(described.kind).toBe("list");
    if (described.kind !== "list") return;
    expect(described.fetchParams).toContain("origin=deterministic");
  });

  it("omits the origin param when cleared", () => {
    const described = describeFilesQuery(input(null));
    expect(described.kind).toBe("list");
    if (described.kind !== "list") return;
    expect(described.fetchParams).not.toContain("origin=");
  });

  it("toggles origin in view state", () => {
    const set = applyFilterTagOrigin(initialLibraryViewState, "semantic_ai");
    expect(set.tagOrigin).toBe("semantic_ai");
    expect(applyFilterTagOrigin(set, null).tagOrigin).toBeNull();
  });
});
