import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { BUILTIN_COMMANDS } from "@/lib/commands";
import { getServerRuntimeSnapshot } from "@/lib/runtime-info";

// Area: #243. The commands guide lists exactly the built-in palette ids and
// the bundled v2 command ids the registries declare.

describe("commands guide", () => {
  const guide = fs.readFileSync(
    path.join(process.cwd(), "docs", "commands.md"),
    "utf8",
  );

  const FILE_EXTENSIONS = /\.(ts|tsx|md|json|cjs|mjs|css|html)$/;

  function referenced(pattern: RegExp): Set<string> {
    const found = new Set<string>();
    for (const match of guide.matchAll(/`([^`]+)`/g)) {
      if (pattern.test(match[1]) && !FILE_EXTENSIONS.test(match[1])) {
        found.add(match[1]);
      }
    }
    return found;
  }

  it("lists every built-in palette id from the descriptor table", () => {
    const ids = referenced(/^(view|transport|file):[a-z-]+$/);
    expect([...ids].sort()).toEqual(
      BUILTIN_COMMANDS.map((command) => command.id).sort(),
    );
  });

  it("lists every bundled v2 command id", () => {
    const snapshot = getServerRuntimeSnapshot();
    const declared = snapshot.extensionsV2
      .flatMap((extension) => extension.commandIds)
      .sort();
    const ids = referenced(/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/);
    expect([...ids].sort()).toEqual(declared);
  });

  it("does not claim every extension declares a settings namespace", () => {
    expect(guide).not.toMatch(/each (is |disabled by default with its own settings namespace)/i);
    expect(guide).toMatch(/auto-tag-v2` declares none/);
  });
});
