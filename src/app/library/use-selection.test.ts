import { describe, expect, it } from "vitest";

import {
  computeSelectTransition,
  pruneSelection,
  resolveMoveTarget,
} from "./use-selection";
import type { FileRecord } from "./types";

function file(id: string): FileRecord {
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
  };
}

describe("selection transitions", () => {
  it("prunes ids that left the visible list", () => {
    expect(pruneSelection(["a", "b", "c"], new Set(["a", "c"]))).toEqual([
      "a",
      "c",
    ]);
  });

  it("extends a range from the anchor on shift", () => {
    const transition = computeSelectTransition({
      orderedIds: ["a", "b", "c"],
      anchor: "a",
      fileId: "c",
      modifiers: { shiftKey: true },
      selectedFileId: null,
    });
    expect(transition).toMatchObject({ action: "range" });
    if (transition.action === "range") {
      expect(transition.selectedIds).toEqual(["a", "b", "c"]);
    }
  });

  it("toggles one id on ctrl without playing", () => {
    const transition = computeSelectTransition({
      orderedIds: ["a", "b"],
      anchor: "a",
      fileId: "b",
      modifiers: { ctrlKey: true },
      selectedFileId: null,
      selectedIds: ["a"],
    });
    expect(transition).toMatchObject({ action: "toggle", anchor: "b" });
    if (transition.action === "toggle") {
      expect(transition.selectedIds).toEqual(["a", "b"]);
    }
  });

  it("toggles playback when the current file is clicked again", () => {
    expect(
      computeSelectTransition({
        orderedIds: ["a"],
        anchor: "a",
        fileId: "a",
        modifiers: {},
        selectedFileId: "a",
      }),
    ).toMatchObject({ action: "toggle-play" });
  });

  it("plays a newly clicked file", () => {
    expect(
      computeSelectTransition({
        orderedIds: ["a", "b"],
        anchor: "a",
        fileId: "b",
        modifiers: {},
        selectedFileId: "a",
      }),
    ).toMatchObject({ action: "play-new" });
  });

  it("moves keyboard focus with wraparound", () => {
    const visible = [file("a"), file("b"), file("c")];
    expect(resolveMoveTarget(visible, "c", 1)?.id).toBe("a");
    expect(resolveMoveTarget(visible, "a", -1)?.id).toBe("c");
    expect(resolveMoveTarget([], "a", 1)).toBeNull();
  });
});
