import { describe, expect, it } from "vitest";

import {
  ITEM_COLOR_PRESETS,
  fallbackItemColor,
  isHexColor,
  resolveItemColor,
} from "./item-colors";

describe("item colors", () => {
  it("accepts only #rrggbb hex strings", () => {
    expect(isHexColor("#f0503c")).toBe(true);
    expect(isHexColor("#F0503C")).toBe(true);
    expect(isHexColor("red")).toBe(false);
    expect(isHexColor("#fff")).toBe(false);
    expect(isHexColor(null)).toBe(false);
    expect(isHexColor(undefined)).toBe(false);
  });

  it("assigns deterministic fallback colors from the preset palette", () => {
    expect(fallbackItemColor("impacts")).toBe(fallbackItemColor("impacts"));
    expect(ITEM_COLOR_PRESETS).toContain(fallbackItemColor("rain beds"));
    expect(ITEM_COLOR_PRESETS).toContain(fallbackItemColor(""));
  });

  it("keeps stored colors and falls back for the rest", () => {
    expect(resolveItemColor("impacts", "#7ab8ff")).toBe("#7ab8ff");
    expect(resolveItemColor("impacts", null)).toBe(fallbackItemColor("impacts"));
    expect(resolveItemColor("impacts", undefined)).toBe(fallbackItemColor("impacts"));
    expect(resolveItemColor("impacts", "nope")).toBe(fallbackItemColor("impacts"));
  });
});
