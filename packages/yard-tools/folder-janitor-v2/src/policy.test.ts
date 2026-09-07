import { describe, expect, it } from "vitest";

import {
  deriveIndexIssues,
  extensionOf,
  formatOf,
  normalizePath,
  parseAllowedFormats,
  toReportArrays,
  type JanitorRecord,
} from "./policy";

// Area: extension v2 J4 (#179). Pure janitor policy: index-derived
// issue detection, format/threshold parsing, path normalization.

function rec(overrides: Partial<JanitorRecord> & { id: string }): JanitorRecord {
  return {
    filename: `${overrides.id}.wav`,
    path: `/lib/${overrides.id}.wav`,
    format: "wav",
    fileSize: 2048,
    ...overrides,
  };
}

describe("parseAllowedFormats", () => {
  it("lowercases, trims, and strips leading dots", () => {
    expect([...parseAllowedFormats(" WAV, .Mp3 ,flac")]).toEqual(["wav", "mp3", "flac"]);
  });
  it("falls back to the default set when blank", () => {
    expect(parseAllowedFormats("").has("wav")).toBe(true);
    expect(parseAllowedFormats(undefined).has("aiff")).toBe(true);
  });
});

describe("extensionOf / formatOf", () => {
  it("derives the extension, ignoring dotfiles and trailing dots", () => {
    expect(extensionOf("kick.WAV")).toBe("wav");
    expect(extensionOf("noext")).toBe("");
    expect(extensionOf(".hidden")).toBe("");
  });
  it("prefers the declared format, else the extension", () => {
    expect(formatOf(rec({ id: "a", format: "FLAC" }))).toBe("flac");
    expect(formatOf(rec({ id: "b", format: null, filename: "b.OGG" }))).toBe("ogg");
  });
});

describe("normalizePath", () => {
  it("uses forward slashes, no trailing slash, lowercased", () => {
    expect(normalizePath("C:\\Lib\\Kick\\")).toBe("c:/lib/kick");
    expect(normalizePath("/lib//a/")).toBe("/lib/a");
  });
});

describe("deriveIndexIssues", () => {
  const allowed = parseAllowedFormats(undefined);

  it("flags empty files as broken and small files as tiny", () => {
    const issues = deriveIndexIssues(
      [rec({ id: "empty", fileSize: 0 }), rec({ id: "tiny", fileSize: 100 })],
      { tinyThresholdBytes: 1024, allowedFormats: allowed },
    );
    expect(issues.find((i) => i.fileIds[0] === "empty")?.kind).toBe("broken");
    expect(issues.find((i) => i.fileIds[0] === "tiny")?.kind).toBe("tiny-file");
  });

  it("flags unusual formats", () => {
    const issues = deriveIndexIssues([rec({ id: "weird", format: "xyz" })], {
      tinyThresholdBytes: 1024,
      allowedFormats: allowed,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.kind).toBe("weird-format");
    expect(issues[0]!.message).toContain("xyz");
  });

  it("buckets duplicates by name and size", () => {
    const issues = deriveIndexIssues(
      [
        rec({ id: "a", filename: "same.wav", fileSize: 2048 }),
        rec({ id: "b", filename: "SAME.wav", fileSize: 2048 }),
        rec({ id: "c", filename: "same.wav", fileSize: 4096 }),
      ],
      { tinyThresholdBytes: 1024, allowedFormats: allowed },
    );
    const duplicate = issues.find((i) => i.kind === "duplicate");
    expect(duplicate?.fileIds.sort()).toEqual(["a", "b"]);
  });

  it("does not flag a normal file", () => {
    expect(
      deriveIndexIssues([rec({ id: "ok" })], { tinyThresholdBytes: 1024, allowedFormats: allowed }),
    ).toEqual([]);
  });
});

describe("toReportArrays", () => {
  it("flattens issues into parallel string arrays", () => {
    const arrays = toReportArrays([
      { kind: "duplicate", path: "/lib/a.wav", fileIds: ["a", "b"], message: "dupe" },
    ]);
    expect(arrays).toEqual({
      issueKinds: ["duplicate"],
      issuePaths: ["/lib/a.wav"],
      issueMessages: ["dupe"],
      issueFileIds: ["a,b"],
    });
  });
});
