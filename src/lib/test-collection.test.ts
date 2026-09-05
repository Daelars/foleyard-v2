import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// A test that is never collected passes by not existing. The suite named three
// tree roots and only *.test.ts, so electron/ and scripts/ had nowhere to put a
// test that would run, and the Electron main hardening test had to be parked in
// src/lib to be seen at all. This guard walks the repo and holds every test file
// on disk to the one include pattern in vitest.config.ts.

const repoRoot = path.resolve(__dirname, "..", "..");

// Directories that hold no first-party source we would ever test.
const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  ".next",
  ".waveform-cache",
  "dist-electron",
  "out",
  "coverage",
]);

// Test files deliberately kept out of the product run, each with a reason.
// Anything not listed here must be collected by the default `vitest run`.
const UNCOLLECTED_BY_DESIGN = new Map([
  [
    "docs/audit-2026-09/reproduce.test.ts",
    "Audit evidence: asserts current faulty behaviour on purpose. Runs via its own config until each assertion is inverted into a regression.",
  ],
]);

const COLLECTED_EXTENSIONS = [".test.ts", ".test.tsx"];

function findTestFiles(directory: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORIES.has(entry.name)) continue;
      findTestFiles(path.join(directory, entry.name), found);
      continue;
    }
    if (/\.test\./.test(entry.name)) {
      found.push(
        path
          .relative(repoRoot, path.join(directory, entry.name))
          .split(path.sep)
          .join("/"),
      );
    }
  }
  return found;
}

describe("test collection", () => {
  const testFiles = findTestFiles(repoRoot);

  it("finds test files to check", () => {
    // Guards the guard: a walk that silently returns nothing would pass everything below.
    // Floor lowered from 50 by the integration rebuild (#135–#142), which
    // deletes test files on purpose: the end state is ~10 files, so the
    // floor only proves the walk itself works.
    expect(testFiles.length).toBeGreaterThan(5);
  });

  it("collects every test file on disk, or declares why not", () => {
    const uncollected = testFiles.filter(
      (file) =>
        !COLLECTED_EXTENSIONS.some((extension) => file.endsWith(extension)) ||
        file.startsWith("docs/"),
    );
    const undeclared = uncollected.filter(
      (file) => !UNCOLLECTED_BY_DESIGN.has(file),
    );

    expect(
      undeclared,
      "These test files exist but the default `vitest run` never collects them. " +
        "Either rename them to *.test.ts / *.test.tsx outside docs/, or add them " +
        "to UNCOLLECTED_BY_DESIGN with a reason.",
    ).toEqual([]);
  });

  it("keeps the declared exclusions honest", () => {
    const stale = [...UNCOLLECTED_BY_DESIGN.keys()].filter(
      (file) => !fs.existsSync(path.join(repoRoot, file)),
    );

    expect(
      stale,
      "UNCOLLECTED_BY_DESIGN names files that no longer exist.",
    ).toEqual([]);
  });
});
