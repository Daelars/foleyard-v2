import { describe, expect, it } from "vitest";

import { buildShelfToggleRequest } from "./use-shelf-toggle";

describe("buildShelfToggleRequest", () => {
  it("adds a file that is not on the shelf", () => {
    expect(buildShelfToggleRequest("file-1", false)).toEqual({
      extensionId: "sound-shelf",
      commandId: "sound-shelf.add-selected",
      selection: { fileIds: ["file-1"] },
    });
  });

  it("removes a file that is already on the shelf", () => {
    expect(buildShelfToggleRequest("file-1", true)).toEqual({
      extensionId: "sound-shelf",
      commandId: "sound-shelf.remove-selected",
      selection: { fileIds: ["file-1"] },
    });
  });
});
