import { describe, expect, it } from "vitest";

import {
  clearSelection,
  rangeSelect,
  toggleInSelection,
} from "./selection";

describe("selection helpers", () => {
  it("toggles an id in and out preserving order", () => {
    expect(toggleInSelection([], "a")).toEqual(["a"]);
    expect(toggleInSelection(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(toggleInSelection(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("selects a forward and backward range from the anchor", () => {
    const ordered = ["a", "b", "c", "d"];

    expect(rangeSelect(ordered, "b", "d")).toEqual(["b", "c", "d"]);
    expect(rangeSelect(ordered, "d", "b")).toEqual(["b", "c", "d"]);
    expect(rangeSelect(ordered, "b", "b")).toEqual(["b"]);
  });

  it("falls back to the target alone when the anchor is missing", () => {
    expect(rangeSelect(["a", "b"], null, "b")).toEqual(["b"]);
    expect(rangeSelect(["a", "b"], "z", "a")).toEqual(["a"]);
  });

  it("clears the selection", () => {
    expect(clearSelection()).toEqual([]);
  });
});
