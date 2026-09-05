import { describe, expect, it } from "vitest";

import { resolveSelectionScrollIndex } from "./selection-scroll";

const files = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("resolveSelectionScrollIndex", () => {
  it("returns null when nothing is selected", () => {
    expect(
      resolveSelectionScrollIndex({
        files,
        directoryCount: 2,
        selectedFileId: null,
        prevSelectedFileId: null,
      }),
    ).toBeNull();
  });

  it("scrolls to the newly selected row on mount and on selection change", () => {
    expect(
      resolveSelectionScrollIndex({
        files,
        directoryCount: 2,
        selectedFileId: "b",
        prevSelectedFileId: null,
      }),
    ).toBe(3);

    expect(
      resolveSelectionScrollIndex({
        files,
        directoryCount: 0,
        selectedFileId: "c",
        prevSelectedFileId: "a",
      }),
    ).toBe(2);
  });

  it("leaves the viewport alone when the selection is unchanged", () => {
    // Favourite toggles and optimistic updates rebuild the file array but
    // keep the same selection: no viewport jump.
    const mutatedFiles = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

    expect(
      resolveSelectionScrollIndex({
        files: mutatedFiles,
        directoryCount: 0,
        selectedFileId: "b",
        prevSelectedFileId: "b",
      }),
    ).toBeNull();
  });

  it("returns null when the selected row is no longer visible", () => {
    expect(
      resolveSelectionScrollIndex({
        files,
        directoryCount: 0,
        selectedFileId: "gone",
        prevSelectedFileId: "a",
      }),
    ).toBeNull();
  });
});
