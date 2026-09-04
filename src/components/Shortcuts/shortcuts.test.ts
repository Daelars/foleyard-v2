import { describe, expect, it } from "vitest";

import {
  DEFAULT_SHORTCUTS,
  findBindingConflicts,
  isTypingTarget,
  loadRemoveDefault,
  loadShortcutBindings,
  matchShortcutKey,
  mergeShortcutBindings,
  normalizeRemoveDefault,
  shouldSkipSpace,
} from "./shortcuts";

describe("shortcut map", () => {
  it("adopts the full prototype set with no conflicts", () => {
    expect(DEFAULT_SHORTCUTS).toEqual({
      "toggle-playback": "Space",
      "focus-search": "/",
      "toggle-favorite": "f",
      "move-next": "j",
      "move-prev": "k",
      "open-settings": ",",
    });
    expect(findBindingConflicts(DEFAULT_SHORTCUTS)).toEqual([]);
  });

  it("merges custom bindings over the defaults and reports new conflicts", () => {
    const merged = mergeShortcutBindings({ "move-next": "n" });

    expect(merged["move-next"]).toBe("n");
    expect(merged["move-prev"]).toBe("k");
    expect(findBindingConflicts(merged)).toEqual([]);

    const conflicted = mergeShortcutBindings({ "move-next": "f" });
    expect(findBindingConflicts(conflicted)).toEqual([
      { key: "f", actions: ["toggle-favorite", "move-next"] },
    ]);
  });

  it("guards printable keys while typing", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "textarea" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(
      true,
    );
    expect(isTypingTarget({ tagName: "DIV" })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("skips global Space on sliders, buttons, and inputs", () => {
    const skip = (tagName: string) => ({
      tagName,
      closest: () => ({}) as unknown,
    });
    const row = { tagName: "DIV", closest: () => null };

    expect(shouldSkipSpace(skip("BUTTON"))).toBe(true);
    expect(shouldSkipSpace(skip("INPUT"))).toBe(true);
    expect(shouldSkipSpace({ tagName: "DIV" })).toBe(false);
    expect(shouldSkipSpace(row)).toBe(false);
    expect(shouldSkipSpace(null)).toBe(false);
  });

  it("matches Space by code and printable keys case-insensitively", () => {
    expect(matchShortcutKey({ code: "Space", key: " " }, "Space")).toBe(true);
    expect(matchShortcutKey({ code: "KeyF", key: "F" }, "f")).toBe(true);
    expect(matchShortcutKey({ code: "KeyF", key: "F" }, "j")).toBe(false);
  });

  it("falls back to safe client defaults without stored prefs", () => {
    expect(normalizeRemoveDefault("disk")).toBe("disk");
    expect(normalizeRemoveDefault("library")).toBe("library");
    expect(normalizeRemoveDefault("nope")).toBe("library");
    expect(normalizeRemoveDefault(null)).toBe("library");
    expect(loadRemoveDefault()).toBe("library");
    expect(loadShortcutBindings()).toEqual(DEFAULT_SHORTCUTS);
  });
});
