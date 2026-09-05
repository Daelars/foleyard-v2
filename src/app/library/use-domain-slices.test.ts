import { describe, expect, it } from "vitest";

import {
  omitSmartCount,
  removeCollectionOptimistic,
  restoreCollection,
} from "./use-collections";
import {
  recolorTag,
  removeTagOptimistic,
  renameTagOptimistic,
  restoreTag,
} from "./use-tags";
import { consumeFavoritesTotal } from "./use-favorites";
import { toShelfFileIds } from "./use-shelf";
import { resolveBulkRemove } from "./use-bulk-actions";
import type { CollectionRecord, TagRecord } from "./types";

function collection(overrides: Partial<CollectionRecord> & { id: string }): CollectionRecord {
  return { name: overrides.id, ...overrides };
}

function tag(overrides: Partial<TagRecord> & { id: string }): TagRecord {
  return { name: overrides.id, color: "red", ...overrides };
}

describe("collections slice transitions", () => {
  it("removes one collection optimistically", () => {
    const start = [collection({ id: "a" }), collection({ id: "b" })];
    expect(removeCollectionOptimistic(start, "a").map((c) => c.id)).toEqual([
      "b",
    ]);
  });

  it("restores a deleted collection in name order without duplicates", () => {
    const deleted = collection({ id: "b", name: "b" });
    const current = [collection({ id: "a", name: "a" })];
    expect(
      restoreCollection(current, deleted).map((c) => c.id),
    ).toEqual(["a", "b"]);
    expect(restoreCollection([...current, deleted], deleted)).toHaveLength(2);
  });

  it("drops only the deleted smart count", () => {
    expect(omitSmartCount({ a: 1, b: 2 }, "a")).toEqual({ b: 2 });
    const counts = { a: 1 };
    expect(omitSmartCount(counts, "missing")).toBe(counts);
  });
});

describe("tags slice transitions", () => {
  it("removes and restores one tag without touching others", () => {
    const start = [tag({ id: "a", name: "a" }), tag({ id: "b", name: "b" })];
    expect(removeTagOptimistic(start, "a").map((t) => t.id)).toEqual(["b"]);
    expect(
      restoreTag(removeTagOptimistic(start, "a"), start[0]).map((t) => t.id),
    ).toEqual(["a", "b"]);
  });

  it("renames and recolors one tag", () => {
    const start = [tag({ id: "a", name: "a", color: "red" })];
    expect(renameTagOptimistic(start, "a", "  drums  ")[0].name).toBe("drums");
    expect(recolorTag(start, "a", "blue")[0].color).toBe("blue");
  });
});

describe("favorites slice", () => {
  it("consumes numeric totals and ignores anything else", () => {
    expect(consumeFavoritesTotal(7)).toBe(7);
    expect(consumeFavoritesTotal(undefined)).toBeNull();
    expect(consumeFavoritesTotal("7")).toBeNull();
  });
});

describe("shelf slice", () => {
  it("derives file ids from shelf items", () => {
    expect(toShelfFileIds([{ id: "a" }, { id: "b" }])).toEqual(["a", "b"]);
  });
});

describe("bulk actions", () => {
  it("resolves a choice only at the confirm stage with ids", () => {
    expect(
      resolveBulkRemove({ stage: "confirm", choice: "disk" }, ["a"]),
    ).toBe("disk");
    expect(resolveBulkRemove({ stage: "choose" }, ["a"])).toBeNull();
    expect(resolveBulkRemove(null, ["a"])).toBeNull();
    expect(
      resolveBulkRemove({ stage: "confirm", choice: "library" }, []),
    ).toBeNull();
  });
});
