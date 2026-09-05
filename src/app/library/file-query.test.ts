import { describe } from "vitest";
import { expect, it } from "vitest";

import {
  describeFilesQuery,
  sortFileRecords,
} from "./file-query";
import type { FileRecord } from "./types";

function file(overrides: Partial<FileRecord> & { id: string }): FileRecord {
  return {
    filename: `${overrides.id}.wav`,
    path: `/lib/${overrides.id}.wav`,
    directory: null,
    format: "wav",
    duration: null,
    fileSize: null,
    isFavorite: false,
    tags: [],
    ...overrides,
  };
}

describe("describeFilesQuery", () => {
  const base = {
    view: "all" as const,
    search: "",
    collectionId: null,
    tagId: null,
    directory: null,
    libraryRoots: ["/lib"],
    sort: { key: "filename" as const, dir: 1 as const },
  };

  it("routes the shelf view to the sound-shelf endpoint", () => {
    expect(describeFilesQuery({ ...base, view: "shelf" })).toEqual({ kind: "shelf" });
  });

  it("loads no files for the extensions view", () => {
    expect(describeFilesQuery({ ...base, view: "extensions" })).toEqual({ kind: "empty" });
  });

  it("loads no files for the all view without exactly one library root", () => {
    expect(describeFilesQuery({ ...base, libraryRoots: [] }).kind).toBe("empty");
    expect(
      describeFilesQuery({ ...base, libraryRoots: ["/a", "/b"] }).kind,
    ).toBe("empty");
  });

  it("scopes the all view to the single library root", () => {
    const result = describeFilesQuery(base);
    expect(result.kind).toBe("list");
    if (result.kind !== "list") return;
    expect(result.fetchParams).toContain(
      `libraryRoot=${encodeURIComponent("/lib")}`,
    );
    expect(result.fetchParams).toContain("atLibraryRoot=true");
    expect(result.fetchParams).toContain("limit=500");
    expect(result.fetchParams).toContain("offset=0");
  });

  it("keeps a stable pagination query separate from the fetch params", () => {
    const result = describeFilesQuery(base);
    if (result.kind !== "list") throw new Error("expected list query");
    expect(result.query).not.toContain("limit=");
    expect(result.fetchParams).toContain("limit=500");
  });

  it("searches across roots instead of scoping to a directory", () => {
    const result = describeFilesQuery({
      ...base,
      search: "  kick  ",
      directory: { libraryRoot: "/lib", directory: "/lib/drums" },
      view: "directory",
    });
    if (result.kind !== "list") throw new Error("expected list query");
    expect(result.fetchParams).toContain("q=kick");
    expect(result.fetchParams).not.toContain("directory=");
  });

  it("passes sort through to the fetch params and the pagination query", () => {
    const result = describeFilesQuery({
      ...base,
      sort: { key: "duration", dir: -1 },
    });
    if (result.kind !== "list") throw new Error("expected list query");
    expect(result.fetchParams).toContain("sortKey=duration");
    expect(result.fetchParams).toContain("sortDir=desc");
    // The pagination query seeds load-more, so it must carry the sort.
    expect(result.query).toContain("sortKey=duration");
    expect(result.query).toContain("sortDir=desc");
  });

  it("maps ascending filename sort to asc", () => {
    const result = describeFilesQuery(base);
    if (result.kind !== "list") throw new Error("expected list query");
    expect(result.fetchParams).toContain("sortKey=filename");
    expect(result.fetchParams).toContain("sortDir=asc");
  });

  it("combines view, collection, tag, and favorite filters", () => {
    const result = describeFilesQuery({
      ...base,
      view: "collection",
      collectionId: "c1",
      tagId: "t1",
      search: "",
    });
    if (result.kind !== "list") throw new Error("expected list query");
    expect(result.fetchParams).toContain("collectionId=c1");
    expect(result.fetchParams).toContain("tagId=t1");

    const fav = describeFilesQuery({ ...base, view: "favorites" });
    if (fav.kind !== "list") throw new Error("expected list query");
    expect(fav.fetchParams).toContain("favorites=true");
  });
});

describe("sortFileRecords", () => {
  it("sorts by filename in either direction without mutating input", () => {
    const input = [file({ id: "b" }), file({ id: "a" })];
    expect(sortFileRecords(input, "filename", 1).map((f) => f.id)).toEqual(["a", "b"]);
    expect(sortFileRecords(input, "filename", -1).map((f) => f.id)).toEqual([
      "b",
      "a",
    ]);
    expect(input.map((f) => f.id)).toEqual(["b", "a"]);
  });

  it("sorts null durations last in both directions", () => {
    const input = [
      file({ id: "nodur", duration: null }),
      file({ id: "long", duration: 30 }),
      file({ id: "short", duration: 5 }),
    ];
    expect(sortFileRecords(input, "duration", 1).map((f) => f.id)).toEqual([
      "short",
      "long",
      "nodur",
    ]);
    expect(sortFileRecords(input, "duration", -1).map((f) => f.id)).toEqual([
      "nodur",
      "long",
      "short",
    ]);
  });
});
