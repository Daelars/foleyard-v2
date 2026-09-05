import { describe, expect, it } from "vitest";

import { resolveCollectionCount } from "./collections-section";

describe("resolveCollectionCount", () => {
  it("prefers the lazily resolved smart count for Smart Collections", () => {
    expect(
      resolveCollectionCount(
        { isSmart: true, fileCount: 3 },
        { "col-1": 42 },
        "col-1",
      ),
    ).toBe(42);
  });

  it("falls back to the stored file count when no smart count resolved yet", () => {
    expect(
      resolveCollectionCount({ isSmart: true, fileCount: 3 }, {}, "col-1"),
    ).toBe(3);
    expect(
      resolveCollectionCount({ isSmart: true }, undefined, "col-1"),
    ).toBe(0);
  });

  it("ignores smart counts for plain Collections", () => {
    expect(
      resolveCollectionCount(
        { fileCount: 7 },
        { "col-1": 42 },
        "col-1",
      ),
    ).toBe(7);
    expect(resolveCollectionCount({}, undefined, "col-1")).toBe(0);
  });
});
