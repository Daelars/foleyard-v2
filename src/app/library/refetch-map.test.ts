import { describe, expect, it } from "vitest";

import {
  MUTATION_REFETCH_MAP,
  SCAN_SETTLE_SLICES,
  type MutationName,
} from "./refetch-map";

const COLLECTION_MUTATIONS: MutationName[] = [
  "createCollection",
  "renameCollection",
  "updateCollectionColor",
  "updateCollectionFilter",
  "convertToRegularCollection",
  "deleteCollection",
  "addToCollection",
  "saveSearch",
];

const TAG_MUTATIONS: MutationName[] = [
  "createTag",
  "renameTag",
  "updateTagColor",
  "deleteTag",
];

describe("mutation refetch map", () => {
  it("refetches collections only for every collection mutation", () => {
    for (const mutation of COLLECTION_MUTATIONS) {
      expect(MUTATION_REFETCH_MAP[mutation]).toEqual(["collections"]);
    }
  });

  it("refetches tags only for every tag mutation", () => {
    for (const mutation of TAG_MUTATIONS) {
      expect(MUTATION_REFETCH_MAP[mutation]).toEqual(["tags"]);
    }
  });

  it("never pulls the extension catalog for an organization mutation", () => {
    for (const mutation of [...COLLECTION_MUTATIONS, ...TAG_MUTATIONS]) {
      expect(MUTATION_REFETCH_MAP[mutation]).not.toContain("catalog");
    }
  });

  it("settles a scan with files and collections only (no catalog re-register)", () => {
    expect([...SCAN_SETTLE_SLICES].sort()).toEqual(["collections", "files"]);
    expect(SCAN_SETTLE_SLICES).not.toContain("catalog");
    expect(SCAN_SETTLE_SLICES).not.toContain("tags");
  });
});
