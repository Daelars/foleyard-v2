import { describe, expect, it } from "vitest";

import { buildJanitorScanRequest, countIssuesByKind } from "./use-folder-janitor";

describe("buildJanitorScanRequest", () => {
  it("targets the folder scan command with the folder path", () => {
    expect(buildJanitorScanRequest("folder", "/music/staging")).toEqual({
      extensionId: "folder-janitor",
      commandId: "folder-janitor.scan-folder",
      input: { folderPath: "/music/staging" },
    });
  });

  it("targets the library scan command otherwise", () => {
    expect(buildJanitorScanRequest("library", undefined)).toEqual({
      extensionId: "folder-janitor",
      commandId: "folder-janitor.scan-library",
      input: {},
    });
    expect(buildJanitorScanRequest("folder", undefined)).toEqual({
      extensionId: "folder-janitor",
      commandId: "folder-janitor.scan-library",
      input: {},
    });
  });
});

describe("countIssuesByKind", () => {
  it("tallies one count per issue kind", () => {
    expect(
      countIssuesByKind([
        { kind: "duplicate", path: "a", fileIds: ["1"], message: "dup" },
        { kind: "duplicate", path: "b", fileIds: ["2"], message: "dup" },
        { kind: "empty-folder", path: "c", fileIds: [], message: "empty" },
      ]),
    ).toEqual({ duplicate: 2, "empty-folder": 1 });
  });

  it("returns an empty tally without issues", () => {
    expect(countIssuesByKind([])).toEqual({});
  });
});
