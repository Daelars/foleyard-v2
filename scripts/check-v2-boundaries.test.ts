import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// Area: extension v2 R10 (#308). The v2 dependency boundary must hold for
// every import form, not only the spellings a text regex happens to match.
// This suite drives the syntax-aware scanner in
// `scripts/check-v2-boundaries.cjs` over disposable fixtures and proves each
// smuggling form fails: side-effect imports, re-exports, aliases, dynamic
// import(), and require() with a computed or aliased loader. A scanner that
// only ever returns "OK" is worse than the text scan it replaces, so every
// forbidden form below is asserted to produce an error naming the fixture.

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

type SourceAnalysis = {
  references: Array<{ specifier: string; kind: string }>;
  violations: string[];
  parseErrors: string[];
};

type BoundariesModule = {
  OK_MESSAGE: string;
  isAllowedSpecifier(specifier: string): boolean;
  analyzeSource(source: string, fileName: string): SourceAnalysis;
  listSourceFiles(dir: string): string[];
  scanBoundarySources(root: string, scanRoots: string[]): string[];
  checkBoundaries(options?: { root?: string; scanRoots?: string[] }): string[];
};

// The checker is a CommonJS entry point; load it through Node's own resolver
// rather than a static ESM import so `tsc --noEmit` does not need a `.d.cts`.
const nodeRequire = createRequire(import.meta.url);
const boundaries = nodeRequire("./check-v2-boundaries.cjs") as BoundariesModule;

const fixtureRoots: string[] = [];

/** Write `files` under a fresh temp root and return the root path. */
function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "v2-boundaries-"));
  fixtureRoots.push(root);
  for (const [relative, contents] of Object.entries(files)) {
    const absolute = join(root, relative);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, "utf8");
  }
  return root;
}

/** Run the dependency scan over a fixture whose sources live in `extensions/`. */
function scanFixture(files: Record<string, string>): string[] {
  const root = fixture(files);
  return boundaries.scanBoundarySources(root, ["extensions"]);
}

afterEach(() => {
  for (const root of fixtureRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("v2 boundary scanner: syntax-aware import extraction", () => {
  it("accepts yard-core and package-local relatives", () => {
    const errors = scanFixture({
      "extensions/allowed.ts": [
        'import { command } from "yard-core";',
        'import "./side-effect-local";',
        'import type { T } from "yard-core";',
        'export { local } from "./local";',
        'export * from "../shared/local";',
        'const lazy = await import("./lazy-local");',
        'require("./relative-require");',
      ].join("\n"),
    });
    expect(errors).toEqual([]);
  });

  it("flags a bare side-effect import a text regex would miss", () => {
    const errors = scanFixture({ "extensions/side-effect.ts": 'import "react";\n' });
    expect(errors).toEqual([expect.stringContaining('forbidden import in extensions/side-effect.ts: "react"')]);
  });

  it("flags re-exports, including star re-exports", () => {
    const errors = scanFixture({
      "extensions/re-export.ts": [
        'export { useState } from "react";',
        'export * from "next/server";',
      ].join("\n"),
    });
    expect(errors).toEqual([
      expect.stringContaining('forbidden import in extensions/re-export.ts: "react"'),
      expect.stringContaining('forbidden import in extensions/re-export.ts: "next/server"'),
    ]);
  });

  it("flags an aliased import binding to a forbidden module", () => {
    const errors = scanFixture({
      "extensions/alias.ts": 'import { useState as useReactState } from "react";\n',
    });
    expect(errors).toEqual([
      expect.stringContaining('forbidden import in extensions/alias.ts: "react"'),
    ]);
  });

  it("flags dynamic import() with a literal specifier", () => {
    const errors = scanFixture({
      "extensions/dynamic.ts": 'const mod = await import("electron");\n',
    });
    expect(errors).toEqual([
      expect.stringContaining('forbidden import in extensions/dynamic.ts: "electron"'),
    ]);
  });

  it("flags dynamic import() with a computed specifier", () => {
    const errors = scanFixture({
      "extensions/dynamic-computed.ts": [
        'const target = "react";',
        "const mod = await import(target);",
      ].join("\n"),
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("unresolved import in extensions/dynamic-computed.ts");
    expect(errors[0]).toContain("computed dynamic import");
  });

  it("flags require() with a literal specifier", () => {
    const errors = scanFixture({
      "extensions/require.ts": 'const fs = require("node:fs");\n',
    });
    expect(errors).toEqual([
      expect.stringContaining('forbidden import in extensions/require.ts: "node:fs"'),
    ]);
  });

  it("flags require() with a computed specifier", () => {
    const errors = scanFixture({
      "extensions/require-computed.ts": ['const target = "react";', "require(target);"].join("\n"),
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("unresolved import in extensions/require-computed.ts");
    expect(errors[0]).toContain("computed require");
  });

  it("flags require aliased through another identifier", () => {
    const errors = scanFixture({
      "extensions/require-alias.ts": ['const load = require;', 'load("react");'].join("\n"),
    });
    expect(errors).toEqual([
      expect.stringContaining(
        'unresolved import in extensions/require-alias.ts: aliased module loader "require" bound to "load"',
      ),
      expect.stringContaining(
        'unresolved import in extensions/require-alias.ts: aliased require call "load"',
      ),
    ]);
  });

  it("scans nested directories recursively", () => {
    const errors = scanFixture({
      "extensions/deep/nested/smuggled.ts": 'import "better-sqlite3";\n',
    });
    expect(errors).toEqual([
      expect.stringContaining("forbidden import in extensions/deep/nested/smuggled.ts"),
    ]);
  });

  it("skips test sources but still scans sibling sources", () => {
    const root = fixture({
      "extensions/real.ts": 'import "react";',
      "extensions/real.test.ts": 'import "react";',
    });
    const files = boundaries.listSourceFiles(join(root, "extensions")).map((file) =>
      file.replace(/\\/g, "/"),
    );
    expect(files.some((file) => file.endsWith("real.ts"))).toBe(true);
    expect(files.some((file) => file.endsWith("real.test.ts"))).toBe(false);
  });
});

describe("v2 boundary scanner: malformed input diagnostics", () => {
  it("fails a malformed definition with an entry-specific diagnostic", () => {
    const errors = scanFixture({
      "extensions/broken.ts": 'const value = "unterminated\n',
    });
    expect(errors).toEqual([
      expect.stringContaining("malformed source extensions/broken.ts"),
    ]);
  });

  it("reports a missing scan root by name", () => {
    const root = fixture({ "extensions/present.ts": 'import "react";' });
    const errors = boundaries.scanBoundarySources(root, ["extensions", "absent-root"]);
    expect(errors).toContain("scan root missing: absent-root");
  });

  it("fails a malformed workspace manifest with an entry-specific diagnostic", () => {
    const root = fixture({
      "package.json": '{"workspaces":["packages/*","packages/yard-tools/*"]}',
      "tsconfig.json": '{"compilerOptions":{"paths":{"@foleyard/*":["x"]}}}',
      "electron-builder.yml": "!.next/server/app/prototype/**",
      "src/app/prototype/layout.tsx": "notFound()",
      "packages/yard-tools/broken-v2/package.json": "{ not json",
      "packages/yard-tools/broken-v2/src/index.ts": "",
    });
    const errors = boundaries.checkBoundaries({ root, scanRoots: [] });
    expect(errors).toEqual([
      expect.stringContaining(
        "malformed definition packages/yard-tools/broken-v2/package.json:",
      ),
    ]);
  });

  it("fails a registry entry whose manifest is absent", () => {
    const root = fixture({
      "package.json": '{"workspaces":["packages/*","packages/yard-tools/*"]}',
      "tsconfig.json": '{"compilerOptions":{"paths":{"@foleyard/*":["x"]}}}',
      "electron-builder.yml": "!.next/server/app/prototype/**",
      "src/app/prototype/layout.tsx": "notFound()",
      "packages/yard-tools/ghost-v2/src/index.ts": "",
    });
    const errors = boundaries.checkBoundaries({ root, scanRoots: [] });
    expect(errors).toEqual([
      "workspace package without package.json: packages/yard-tools/ghost-v2",
    ]);
  });

  it("accepts the current repository tree", () => {
    expect(boundaries.checkBoundaries({ root: repoRoot })).toEqual([]);
  });
});

describe("v2 boundary scanner: specifier rule", () => {
  it("allows yard-core and relatives only", () => {
    expect(boundaries.isAllowedSpecifier("yard-core")).toBe(true);
    expect(boundaries.isAllowedSpecifier("./local")).toBe(true);
    expect(boundaries.isAllowedSpecifier("../local")).toBe(true);
    expect(boundaries.isAllowedSpecifier("react")).toBe(false);
    expect(boundaries.isAllowedSpecifier("@/lib/extensions")).toBe(false);
    expect(boundaries.isAllowedSpecifier("node:fs")).toBe(false);
  });

  it("preserves the exact CLI OK contract message", () => {
    expect(boundaries.OK_MESSAGE).toBe(
      "check-v2-boundaries: OK — v2 dependency boundary, workspace inclusion, prototype exclusion, and v1 retirement hold.",
    );
  });
});
