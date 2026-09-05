import { describe, expect, it } from "vitest";

import { validateGatherInputs } from "./use-library-gatherer";

describe("validateGatherInputs", () => {
  it("requires at least one source folder", () => {
    expect(validateGatherInputs([], "/library")).toBe(
      "Add at least one source folder",
    );
  });

  it("requires a destination directory", () => {
    expect(validateGatherInputs(["/staging"], "  ")).toBe(
      "Choose a destination directory",
    );
  });

  it("accepts folders plus a destination", () => {
    expect(validateGatherInputs(["/staging"], "/library")).toBeNull();
  });
});
