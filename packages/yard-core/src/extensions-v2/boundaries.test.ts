import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Area: extension v2 R3 (#167). Dependency direction enforcement: v2
// modules (and the extension packages built on them) cannot import
// React, Next routes, Electron, database handles, application
// internals, raw filesystem/process/network access, v1 code, or
// privileged modules — including transitive runtime dependencies.
// This test runs in CI (`bun run test`); a violation fails the build.
// Trusted bundled code only: these rules are not a sandbox against
// hostile JavaScript, and no untrusted isolation is claimed.

const here = dirname(fileURLToPath(import.meta.url));

/** Import specifier fragments that must never appear in a v2 module. */
const FORBIDDEN_SPECIFIERS = [
  "react",
  "next",
  "electron",
  "better-sqlite3",
  "drizzle-orm",
  "node:fs",
  "node:process",
  "node:net",
  "node:http",
  "node:child_process",
  "node:worker_threads",
  "node:dns",
  "node:dgram",
  "child_process",
  "../extensions",
  "./extensions",
  "extensions/extension-",
  "extensions/vocabulary",
  "src/lib",
  "src/app",
  "@/lib",
  "@/app",
  "yard-tools",
  "packages/",
];

/**
 * v1 host identifiers that must not appear in v2 sources at all, not
 * even in prose: their presence signals a facade over the v1 engine
 * rather than the from-scratch v2 path.
 */
const FORBIDDEN_IDENTIFIERS = [
  "YardExtensionHost",
  "YardCommandRegistry",
  "createYardUiIntent",
  "isYardUiIntent",
  "extension-command-registry",
  "extension-host",
  "extension-registry",
  "extension-context",
];

function importSpecifiers(content: string): string[] {
  const found: string[] = [];
  const pattern =
    /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]\s*\)|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier) found.push(specifier);
  }
  return found;
}

function v2ModuleSources(): Array<{ file: string; content: string }> {
  return readdirSync(here)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .map((file) => ({ file, content: readFileSync(join(here, file), "utf8") }));
}

describe("v2 module dependency boundaries", () => {
  it("imports no privileged, framework, storage, v1, or app-internal modules", () => {
    const offenders: string[] = [];
    for (const { file, content } of v2ModuleSources()) {
      for (const specifier of importSpecifiers(content)) {
        for (const forbidden of FORBIDDEN_SPECIFIERS) {
          if (specifier.includes(forbidden)) {
            offenders.push(`${file} imports ${JSON.stringify(specifier)}`);
          }
        }
      }
      for (const identifier of FORBIDDEN_IDENTIFIERS) {
        if (content.includes(identifier)) {
          offenders.push(`${file} references ${JSON.stringify(identifier)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("has no runtime dependencies that could carry forbidden transitive imports", () => {
    const manifest = JSON.parse(
      readFileSync(join(here, "..", "..", "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(manifest.dependencies ?? {}).toEqual({});
  });

  it("keeps the privileged surface out of the operation-services permission map", () => {
    const operations = v2ModuleSources().find(({ file }) => file === "operations.ts")!;
    expect(operations.content).toMatch(/Explicit permission map/);
    // The map names permissions, never method-name inference.
    expect(operations.content).not.toMatch(/infer.*permission/i);
  });
});
