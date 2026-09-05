import { describe, expect, it } from "vitest";

import {
  buildDropRulesRenamePreview,
  getSettingPreview,
} from "./setting-previews";

describe("buildDropRulesRenamePreview", () => {
  it("renders the rename pattern with the sample sound", () => {
    expect(buildDropRulesRenamePreview("{index}-{name}{ext}")).toEqual({
      output: "001-whoosh-rise.wav",
      valid: true,
    });
  });

  it("rejects an empty pattern", () => {
    expect(buildDropRulesRenamePreview("   ").valid).toBe(false);
  });
});

describe("getSettingPreview", () => {
  it("resolves the Drop Rules rename-pattern preview hook", () => {
    expect(
      getSettingPreview("drop-rules", "rename-pattern", "{name}{ext}"),
    ).toEqual({ output: "whoosh-rise.wav", valid: true });
  });

  it("returns null when no preview hook is registered", () => {
    expect(getSettingPreview("sound-shelf", "anything", "value")).toBeNull();
    expect(
      getSettingPreview("drop-rules", "copy-on-drop", true),
    ).toBeNull();
  });
});
