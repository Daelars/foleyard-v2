import { describe, expect, it } from "vitest";

import {
  buildPaletteEntries,
  type PaletteBuildInput,
} from "./command-palette";

// Area: #227. "Go to Shelf" is gated by the sound-shelf-v2 enablement flag
// the same way "Go to Auto tag" is gated by auto-tag-v2.

const BASE: PaletteBuildInput = {
  query: "",
  isPlaying: false,
  autoplay: false,
  hasCurrentFile: false,
  canStepQueue: false,
  isFavorite: false,
  shelfEnabled: false,
  autoTagEnabled: false,
  sounds: [],
};

const ids = (input: PaletteBuildInput) =>
  buildPaletteEntries(input).map((entry) => entry.id);

describe("palette extension-view gating", () => {
  it("omits Go to Shelf while the extension is disabled", () => {
    expect(ids(BASE)).not.toContain("view:shelf");
  });

  it("includes Go to Shelf while the extension is enabled", () => {
    expect(ids({ ...BASE, shelfEnabled: true })).toContain("view:shelf");
  });

  it("keeps Go to Auto tag gated independently", () => {
    expect(ids({ ...BASE, shelfEnabled: true })).not.toContain("view:auto-tag");
    expect(ids({ ...BASE, autoTagEnabled: true })).toContain("view:auto-tag");
  });
});
