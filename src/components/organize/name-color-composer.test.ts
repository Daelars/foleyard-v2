import { describe, expect, it } from "vitest";

import { isComposerNameValid } from "./name-color-composer";

describe("isComposerNameValid", () => {
  it("rejects empty and whitespace-only names", () => {
    expect(isComposerNameValid("")).toBe(false);
    expect(isComposerNameValid("   ")).toBe(false);
  });

  it("accepts names with non-whitespace content", () => {
    expect(isComposerNameValid("Beats")).toBe(true);
    expect(isComposerNameValid("  Padded  ")).toBe(true);
  });
});
