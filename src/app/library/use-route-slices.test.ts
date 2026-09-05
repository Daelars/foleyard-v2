import { describe, expect, it } from "vitest";

import { resolveNextTitle } from "./use-transport";
import { resolveMakePackDefaultFormat } from "./use-extension-ui";
import { resolveScanToast } from "./use-settings-scan";
import {
  clampPaletteIndex,
  parsePaletteEntryId,
  stepPaletteIndex,
} from "./use-palette";
import type { FileRecord } from "./types";
import type { ExtensionGridItem } from "@/lib/extensions/types";

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

describe("transport next title", () => {
  const files = [file("a"), file("b"), file("c")];

  it("returns null for short queues", () => {
    expect(
      resolveNextTitle({ files, queue: ["a"], cursor: 0, selectedFileId: "a" }),
    ).toBeNull();
  });

  it("titles the queued next file without its extension", () => {
    expect(
      resolveNextTitle({
        files,
        queue: ["a", "b", "c"],
        cursor: 0,
        selectedFileId: "a",
      }),
    ).toBe("b");
  });

  it("skips the selected file when the cursor points at it", () => {
    expect(
      resolveNextTitle({
        files,
        queue: ["a", "b"],
        cursor: 0,
        selectedFileId: "b",
      }),
    ).toBe("a");
  });
});

describe("pack defaults", () => {
  it("reads the make-pack default format and falls back to zip", () => {
    const withFolder = [
      {
        id: "make-pack",
        settings: [{ id: "default-format", value: "folder" }],
      },
    ] as unknown as ExtensionGridItem[];
    expect(resolveMakePackDefaultFormat(withFolder)).toBe("folder");
    expect(resolveMakePackDefaultFormat([])).toBe("zip");
    expect(
      resolveMakePackDefaultFormat([
        { id: "make-pack", settings: [] },
      ] as unknown as ExtensionGridItem[]),
    ).toBe("zip");
  });
});

describe("scan settle toast", () => {
  it("prefers errors, then skipped items, then success", () => {
    expect(
      resolveScanToast({ phase: "error", error: "boom", errors: 0 } as never),
    ).toMatchObject({ kind: "error", message: "boom" });
    expect(
      resolveScanToast({ phase: "done", error: null, errors: 2 } as never),
    ).toMatchObject({ kind: "warning" });
    expect(
      resolveScanToast({ phase: "done", error: null, errors: 0 } as never),
    ).toMatchObject({ kind: "success", message: "Scan complete" });
  });
});

describe("palette index and entry ids", () => {
  it("parses entry ids into kind and payload", () => {
    expect(parsePaletteEntryId("view:library")).toEqual({
      kind: "view",
      rest: "library",
    });
    expect(parsePaletteEntryId("tool:ext:cmd")).toEqual({
      kind: "tool",
      rest: "ext:cmd",
    });
    expect(parsePaletteEntryId("plain")).toEqual({ kind: "plain", rest: "" });
  });

  it("clamps and steps the cursor with wraparound", () => {
    expect(clampPaletteIndex(9, 3)).toBe(2);
    expect(clampPaletteIndex(0, 0)).toBe(0);
    expect(stepPaletteIndex(2, 1, 3)).toBe(0);
    expect(stepPaletteIndex(0, -1, 3)).toBe(2);
  });
});
