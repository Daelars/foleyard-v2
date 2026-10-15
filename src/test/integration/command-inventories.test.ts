import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { createAutoTagV2Definition } from "@foleyard/auto-tag-v2";
import { createDropRulesV2Definition } from "@foleyard/drop-rules-v2";
import { createFolderJanitorV2Definition } from "@foleyard/folder-janitor-v2";
import { createLibraryGathererV2Definition } from "@foleyard/library-gatherer-v2";
import { createMakePackV2Definition } from "@foleyard/make-pack-v2";
import { createSmartCollectionsV2Definition } from "@foleyard/smart-collections-v2";
import { createSoundShelfV2Definition } from "@foleyard/sound-shelf-v2";

// Area: #311 (split from #306). Command inventories and package READMEs are
// checked against the v2 definitions they describe, so documentation cannot
// drift from shipped commands. The checker is scripts/check-command-inventories.cjs;
// these tests pin its drift classes with fixtures and prove the parser still
// agrees with the real definitions.

const require = createRequire(import.meta.url);
const checker = require("../../../scripts/check-command-inventories.cjs");

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const DEFINITIONS = [
  ["auto-tag-v2", createAutoTagV2Definition()],
  ["drop-rules-v2", createDropRulesV2Definition()],
  ["folder-janitor-v2", createFolderJanitorV2Definition()],
  ["library-gatherer-v2", createLibraryGathererV2Definition()],
  ["make-pack-v2", createMakePackV2Definition()],
  ["smart-collections-v2", createSmartCollectionsV2Definition()],
  ["sound-shelf-v2", createSoundShelfV2Definition()],
] as const;

const roots: string[] = [];
afterEach(() => {
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true });
  roots.length = 0;
});

function definitionSource(ids: string[]): string {
  const constants = ids
    .map((id, index) => `export const COMMAND_${index} = "${id}";`)
    .join("\n");
  const entries = ids.map((_, index) => `  { id: COMMAND_${index}, title: "T${index}", scope: "global" }`).join(",\n");
  return `${constants}\nexport function createThing() {\n  return {\n    id: "fixture",\n    commands: [\n${entries}\n    ],\n  };\n}\n`;
}

function readmeWith(ids: string[], declaredCount = ids.length): string {
  const lines = ids.map((id) => `- \`${id}\``).join("\n");
  return `# Fixture\n\n## Layout\n\n- nothing\n\n## Commands\n\nThe definition declares ${declaredCount} commands:\n\n${lines}\n`;
}

function docsWith(ids: string[], declaredCount = ids.length): string {
  const rows = ids.map((id) => `| \`${id}\` | global |`).join("\n");
  return `# Commands\n\n## Bundled v2 commands\n\nAll ${declaredCount} commands run through the host.\n\n| Command id | Scope |\n| --- | --- |\n${rows}\n`;
}

function writeRoot(options: {
  packageName: string;
  commandIds: string[];
  readme?: string;
  docs?: string;
  catalog?: string;
}): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmd-inv-"));
  roots.push(root);
  const pkgDir = path.join(root, "packages", "yard-tools", options.packageName);
  fs.mkdirSync(path.join(pkgDir, "src"), { recursive: true });
  fs.writeFileSync(path.join(pkgDir, "src", "definition.ts"), definitionSource(options.commandIds));
  fs.writeFileSync(path.join(pkgDir, "README.md"), options.readme ?? readmeWith(options.commandIds));
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "commands.md"), options.docs ?? docsWith(options.commandIds));
  fs.writeFileSync(
    path.join(root, "packages", "yard-tools", "README.md"),
    options.catalog ??
      `# Yard Tools\n\n## Catalog\n\n| Package | Extension id | Commands |\n| --- | --- | --- |\n| \`${options.packageName}\` | \`${options.packageName}\` | ${options.commandIds.length} — fixture |\n`,
  );
  return root;
}

function runCli(root: string): string {
  return execFileSync(process.execPath, ["scripts/check-command-inventories.cjs", "--root", root], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runCliExpectFailure(root: string): string {
  try {
    runCli(root);
  } catch (error) {
    return String((error as { stderr?: unknown; stdout?: unknown }).stderr ?? (error as { stdout?: unknown }).stdout ?? error);
  }
  throw new Error("checker unexpectedly passed");
}

describe("command inventory parser", () => {
  it("reads command ids from a definition's commands block only", () => {
    const source = [
      'export const ID = "thing";',
      'export const NOT_A_COMMAND = "thing.setting";',
      "export const OTHER = 1;",
      "export function createThing() {",
      "  return {",
      "    id: ID,",
      "    settings: [{ id: NOT_A_COMMAND }],",
      "    commands: [",
      '      { id: "thing.alpha" },',
      "      { id: COMMAND_BETA },",
      "    ],",
      "    contributions: [{ id: 'thing.palette' }],",
      "  };",
      "}",
      'export const COMMAND_BETA = "thing.beta";',
    ].join("\n");
    expect(checker.parseCommandsFromDefinition(source)).toEqual(["thing.alpha", "thing.beta"]);
  });

  it("reads the README Commands inventory and its stated count", () => {
    const parsed = checker.parseReadmeInventory(readmeWith(["a.one", "a.two"], 2));
    expect(parsed.ids).toEqual(["a.one", "a.two"]);
    expect(parsed.declaredCount).toBe(2);
  });

  it("reads the docs Bundled v2 commands table and its stated count", () => {
    const parsed = checker.parseDocsInventory(docsWith(["a.one", "a.two"], 2));
    expect(parsed.ids).toEqual(["a.one", "a.two"]);
    expect(parsed.declaredCount).toBe(2);
  });

  it("reads the catalog's per-package command counts", () => {
    const counts = checker.parseCatalogInventory(
      "# Yard Tools\n\n## Catalog\n\n| Package | Extension id | Commands | Docs |\n| --- | --- | --- | --- |\n| `auto-tag-v2` (`@foleyard/auto-tag-v2`) | `auto-tag-v2` | 2 — preview/tag-files | `docs/commands.md` |\n",
    );
    expect(counts.get("auto-tag-v2")).toBe(2);
  });
});

describe("command inventory drift classes", () => {
  it("fails when a shipped command is missing from the documentation", () => {
    const errors = checker.compareInventory("docs/commands.md", ["a.one", "a.two"], ["a.one"], 2, 2);
    expect(errors.join("\n")).toMatch(/missing command in docs\/commands\.md: "a\.two"/);
  });

  it("fails when a documented command no longer exists", () => {
    const errors = checker.compareInventory("README", ["a.one"], ["a.one", "a.gone"], 1, 1);
    expect(errors.join("\n")).toMatch(/stale command in README: "a\.gone"/);
  });

  it("fails on a renamed command with both sides named", () => {
    const errors = checker.compareInventory("README", ["a.new-name"], ["a.old-name"], 1, 1);
    const text = errors.join("\n");
    expect(text).toMatch(/missing command in README: "a\.new-name"/);
    expect(text).toMatch(/stale command in README: "a\.old-name"/);
  });

  it("fails when the stated command count disagrees with the definitions", () => {
    const errors = checker.compareInventory("README", ["a.one", "a.two"], ["a.one", "a.two"], 2, 3);
    expect(errors.join("\n")).toMatch(/count mismatch in README: documents 3 commands but the definitions declare 2/);
  });

  it("fails when a command is listed twice", () => {
    const errors = checker.compareInventory("README", ["a.one"], ["a.one", "a.one"], 1, 1);
    expect(errors.join("\n")).toMatch(/duplicate command in README: "a\.one"/);
  });
});

describe("checker CLI on fixtures", () => {
  it("passes when the inventory, README and catalog all match the definition", () => {
    const root = writeRoot({ packageName: "thing-v2", commandIds: ["thing-v2.one", "thing-v2.two"] });
    expect(runCli(root)).toMatch(/command inventories OK/);
  });

  it("fails a README that omits a shipped command", () => {
    const root = writeRoot({
      packageName: "thing-v2",
      commandIds: ["thing-v2.one", "thing-v2.two"],
      readme: readmeWith(["thing-v2.one"]),
    });
    const output = runCliExpectFailure(root);
    expect(output).toMatch(/missing command in packages\/yard-tools\/thing-v2\/README\.md: "thing-v2\.two"/);
  });

  it("fails a docs inventory that still documents a removed command", () => {
    const root = writeRoot({
      packageName: "thing-v2",
      commandIds: ["thing-v2.one"],
      docs: docsWith(["thing-v2.one", "thing-v2.removed"]),
    });
    const output = runCliExpectFailure(root);
    expect(output).toMatch(/stale command in docs\/commands\.md: "thing-v2\.removed"/);
  });

  it("fails a catalog declaring the wrong count", () => {
    const root = writeRoot({
      packageName: "thing-v2",
      commandIds: ["thing-v2.one", "thing-v2.two", "thing-v2.three"],
    });
    fs.writeFileSync(
      path.join(root, "packages", "yard-tools", "README.md"),
      "# Yard Tools\n\n## Catalog\n\n| Package | Extension id | Commands |\n| --- | --- | --- |\n| `thing-v2` | `thing-v2` | 2 — fixture |\n",
    );
    const output = runCliExpectFailure(root);
    expect(output).toMatch(/count mismatch in packages\/yard-tools\/README\.md: thing-v2 lists 2 commands but the definition declares 3/);
  });
});

describe("the real repository", () => {
  it("parses exactly the commands the real definitions declare", () => {
    const parsed = checker.parseDefinitions(REPO_ROOT);
    for (const [name, definition] of DEFINITIONS) {
      const entry = parsed.get(name);
      expect(entry, `no definition parsed for ${name}`).toBeDefined();
      expect(entry.commandIds).toEqual(definition.commands.map((command) => command.id));
    }
  });

  it("passes the inventory check", () => {
    expect(runCli(REPO_ROOT)).toMatch(/command inventories OK/);
  });
});
