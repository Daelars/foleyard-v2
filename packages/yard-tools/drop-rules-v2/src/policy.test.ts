import { describe, expect, it } from "vitest";

import {
  DEFAULT_RENAME_PATTERN,
  expandRenamePattern,
  MAX_DROP_FILES,
  planDropNames,
} from "./policy";

// Area: extension v2 D6 (#181). Pure rename-pattern policy: token
// expansion, sanitizing, in-run dedupe, and the drop-size bound.

const NOW = new Date(2026, 8, 6, 12, 34, 56);

describe("expandRenamePattern", () => {
  it("expands the default pattern with a padded index", () => {
    expect(expandRenamePattern("kick.wav", "wav", DEFAULT_RENAME_PATTERN, 1, NOW)).toBe(
      "001-kick.wav",
    );
    expect(expandRenamePattern("kick.wav", "wav", DEFAULT_RENAME_PATTERN, 42, NOW)).toBe(
      "042-kick.wav",
    );
  });

  it("expands date, time, and format tokens", () => {
    expect(expandRenamePattern("loop.mp3", "mp3", "{date}_{time}_{format}_{name}{ext}", 1, NOW)).toBe(
      "2026-09-06_12-34-56_mp3_loop.mp3",
    );
  });

  it("sanitizes separators out of expanded names", () => {
    expect(expandRenamePattern("a.wav", "wav", "{name}/drop{ext}", 1, NOW)).toBe("a-drop.wav");
  });

  it("leaves unknown tokens visible instead of dropping them silently", () => {
    expect(expandRenamePattern("a.wav", "wav", "{name}-{bpm}{ext}", 1, NOW)).toBe("a-{bpm}.wav");
  });
});

describe("planDropNames", () => {
  it("keeps Library filenames verbatim when renaming is off", () => {
    const planned = planDropNames(
      [
        { fileId: "a", sourcePath: "/lib/a.wav", filename: "a.wav", format: "wav" },
        { fileId: "b", sourcePath: "/lib/b.wav", filename: "b.wav", format: "wav" },
      ],
      { copyOnDrop: true, renameOnDrop: false, renamePattern: DEFAULT_RENAME_PATTERN, markUsed: true },
      NOW,
    );
    expect(planned.map((file) => file.outputName)).toEqual(["a.wav", "b.wav"]);
  });

  it("dedupes planned names case-insensitively within the run", () => {
    const planned = planDropNames(
      [
        { fileId: "a", sourcePath: "/lib/a.wav", filename: "same.wav", format: "wav" },
        { fileId: "b", sourcePath: "/lib/b.wav", filename: "Same.wav", format: "wav" },
      ],
      { copyOnDrop: true, renameOnDrop: false, renamePattern: DEFAULT_RENAME_PATTERN, markUsed: true },
      NOW,
    );
    expect(planned.map((file) => file.outputName)).toEqual(["same.wav", "Same 2.wav"]);
  });

  it("caps a drop at the documented bound", () => {
    expect(MAX_DROP_FILES).toBe(100);
  });
});
