import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { listArchiveArtifacts, readArchiveFile, resolveArchiveRoot } from "./archive";

const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-archive-"));

beforeEach(() => {
  fs.mkdirSync(path.join(fixtureRoot, "prototypes", "demo"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "docs", "audits"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, ".hidden"), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, "node_modules", "pkg"), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, "prototypes", "demo", "index.html"), "<h1>Demo</h1>");
  fs.writeFileSync(path.join(fixtureRoot, "docs", "audits", "finding.md"), "# Finding\n");
  fs.writeFileSync(path.join(fixtureRoot, "docs", "audits", "screenshot.png"), "png");
  fs.writeFileSync(path.join(fixtureRoot, "notes.txt"), "not an artifact");
  fs.writeFileSync(path.join(fixtureRoot, ".hidden", "secret.html"), "<h1>Hidden</h1>");
  fs.writeFileSync(path.join(fixtureRoot, "node_modules", "pkg", "bad.html"), "<h1>Dep</h1>");
  vi.stubEnv("FOLEYARD_ARCHIVE_DIR", fixtureRoot);
});

afterAll(() => {
  vi.unstubAllEnvs();
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
});

describe("archive artifacts", () => {
  it("resolves the archive root from the environment override", () => {
    expect(resolveArchiveRoot()).toEqual({ root: path.resolve(fixtureRoot), source: "env" });
  });

  it("lists allowlisted artifacts and skips hidden or dependency directories", () => {
    const entries = listArchiveArtifacts();
    expect(entries.map((entry) => entry.path).sort()).toEqual([
      "docs/audits/finding.md",
      "docs/audits/screenshot.png",
      "prototypes/demo/index.html",
    ]);
    const index = entries.find((entry) => entry.path === "prototypes/demo/index.html");
    expect(index).toMatchObject({ kind: "html", group: "prototypes/demo", title: "demo" });
    const finding = entries.find((entry) => entry.path === "docs/audits/finding.md");
    expect(finding).toMatchObject({ kind: "markdown", group: "docs/audits", title: "finding" });
  });

  it("serves allowlisted files and rejects traversal, dot segments, and unknown types", () => {
    const markdown = readArchiveFile("docs/audits/finding.md");
    expect(markdown?.contentType).toBe("text/markdown; charset=utf-8");
    expect(markdown?.content.toString("utf8")).toContain("# Finding");

    const html = readArchiveFile("prototypes/demo/index.html");
    expect(html?.contentType).toBe("text/html; charset=utf-8");

    expect(readArchiveFile("../outside.md")).toBeNull();
    expect(readArchiveFile("docs/audits/../../outside.md")).toBeNull();
    expect(readArchiveFile(".hidden/secret.html")).toBeNull();
    expect(readArchiveFile("notes.txt")).toBeNull();
    expect(readArchiveFile("docs/audits/missing.md")).toBeNull();
  });
});
