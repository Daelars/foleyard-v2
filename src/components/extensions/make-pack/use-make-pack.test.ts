import { describe, expect, it } from "vitest";

import { defaultPackName, validatePackInputs } from "./use-make-pack";

describe("defaultPackName", () => {
  it("names the pack after its source", () => {
    expect(defaultPackName("selection")).toBe("Selected Sounds Pack");
    expect(defaultPackName("shelf")).toBe("Shelf Pack");
    expect(defaultPackName("recent")).toBe("Recent Sounds Pack");
  });
});

describe("validatePackInputs", () => {
  it("requires a destination folder", () => {
    expect(validatePackInputs("  ", "Pack")).toBe("Choose a destination folder");
  });

  it("requires a pack name", () => {
    expect(validatePackInputs("/out", "   ")).toBe("Enter a pack name");
  });

  it("accepts a destination plus a name", () => {
    expect(validatePackInputs("/out", "Pack")).toBeNull();
  });
});
