// Checks command inventories and package READMEs against the v2 extension
// definitions they describe (#311).
//
// The definition files under packages/yard-tools/*-v2/src/definition.ts are the
// single source of truth for command ids. This checker parses their `commands`
// block and verifies each human-facing inventory lists exactly those commands:
// - docs/commands.md ("Bundled v2 commands" table plus its stated total),
// - each package README's "## Commands" inventory,
// - the packages/yard-tools/README.md catalog command counts.
//
// Missing commands, stale (renamed/removed) commands, duplicates, and stated
// counts that disagree all fail with a specific message. Exits non-zero.
//
// Usage: node scripts/check-command-inventories.cjs [--root <dir>]

const fs = require("node:fs");
const path = require("node:path");

const COMMAND_ID = "[a-z0-9][a-z0-9-]*(?:\\.[a-z0-9-]+)+";

/** Maps exported string constants to their literal values. */
function extractStringConstants(source) {
  const constants = new Map();
  for (const match of source.matchAll(/export\s+const\s+([A-Z0-9_]+)\s*=\s*"([^"]+)"/g)) {
    constants.set(match[1], match[2]);
  }
  return constants;
}

/** Returns the source inside `key: [ ... ]`, string-aware and bracket-balanced. */
function extractBalancedBlock(source, key) {
  const match = new RegExp("\\b" + key + "\\s*:\\s*\\[").exec(source);
  if (!match) return null;
  let depth = 0;
  let quote = null;
  for (let i = match.index + match[0].length - 1; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === "\\") i++;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }
    if (char === "[") depth++;
    else if (char === "]") {
      depth--;
      if (depth === 0) return source.slice(match.index + match[0].length, i);
    }
  }
  return null;
}

/** Command ids declared inside a definition's `commands` array. */
function parseCommandsFromDefinition(source) {
  const constants = extractStringConstants(source);
  const block = extractBalancedBlock(source, "commands");
  if (block === null) return [];
  const ids = [];
  for (const match of block.matchAll(/\bid:\s*([A-Z][A-Z0-9_]*|"[^"]+")\s*[},]/g)) {
    let id = match[1];
    id = id.startsWith('"') ? id.slice(1, -1) : constants.get(id);
    if (id && id.includes(".")) ids.push(id);
  }
  return ids;
}

/** Reads packages/yard-tools/*-v2/src/definition.ts into a package map. */
function parseDefinitions(rootDir) {
  const definitions = new Map();
  const toolsDir = path.join(rootDir, "packages", "yard-tools");
  if (!fs.existsSync(toolsDir)) return definitions;
  for (const name of fs.readdirSync(toolsDir)) {
    if (!name.endsWith("-v2")) continue;
    const file = path.join(toolsDir, name, "src", "definition.ts");
    if (!fs.existsSync(file)) continue;
    definitions.set(name, {
      commandIds: parseCommandsFromDefinition(fs.readFileSync(file, "utf8")),
    });
  }
  return definitions;
}

/** Body of a `## <heading>` section, or null when the heading is absent. */
function sectionBody(markdown, heading) {
  const match = new RegExp(
    "(?:^|\\n)##\\s+" + heading + "\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)",
  ).exec(markdown);
  return match ? match[1] : null;
}

function firstCount(body) {
  const match = /\b(\d+)\s+commands\b/.exec(body);
  return match ? Number(match[1]) : null;
}

/** Command ids and stated count from a package README's `## Commands` section. */
function parseReadmeInventory(markdown) {
  const body = sectionBody(markdown, "Commands");
  if (body === null) return null;
  const ids = [];
  for (const match of body.matchAll(new RegExp("`(" + COMMAND_ID + ")`", "g"))) {
    ids.push(match[1]);
  }
  return { ids, declaredCount: firstCount(body) };
}

/** Command ids and stated total from docs/commands.md's bundled table. */
function parseDocsInventory(markdown) {
  const body = sectionBody(markdown, "Bundled v2 commands");
  if (body === null) return null;
  const ids = [];
  for (const match of body.matchAll(new RegExp("^\\|\\s*`(" + COMMAND_ID + ")`\\s*\\|", "gm"))) {
    ids.push(match[1]);
  }
  const total = /All\s+(\d+)\s+commands/.exec(body);
  return { ids, declaredCount: total ? Number(total[1]) : null };
}

/** Package name -> declared command count from the yard-tools catalog. */
function parseCatalogInventory(markdown) {
  const body = sectionBody(markdown, "Catalog");
  const counts = new Map();
  if (body === null) return counts;
  for (const match of body.matchAll(
    new RegExp("^\\|\\s*`([a-z0-9-]+)`[^|]*\\|\\s*`([^`]+)`\\s*\\|\\s*(\\d+)\\b", "gm"),
  )) {
    counts.set(match[1], Number(match[3]));
  }
  return counts;
}

/** Diffs one documented inventory against the ids the definitions declare. */
function compareInventory(label, declaredIds, documentedIds, declaredCount, documentedCount) {
  const errors = [];
  const declared = new Set(declaredIds);
  const seen = new Set();
  for (const id of documentedIds) {
    if (seen.has(id)) errors.push(`duplicate command in ${label}: "${id}"`);
    seen.add(id);
  }
  for (const id of declaredIds) {
    if (!seen.has(id)) errors.push(`missing command in ${label}: "${id}" is declared but not documented`);
  }
  for (const id of documentedIds) {
    if (!declared.has(id)) errors.push(`stale command in ${label}: "${id}" is documented but not declared`);
  }
  if (declaredCount != null && documentedCount != null && declaredCount !== documentedCount) {
    errors.push(
      `count mismatch in ${label}: documents ${documentedCount} commands but the definitions declare ${declaredCount}`,
    );
  }
  return errors;
}

/** Runs every inventory check under rootDir; returns messages, not an exit. */
function runCheck(rootDir) {
  const errors = [];
  const definitions = parseDefinitions(rootDir);
  if (definitions.size === 0) {
    return {
      errors: ["no v2 extension definitions found under packages/yard-tools/*-v2/src/definition.ts"],
      summary: "",
    };
  }

  const declaredAll = [];
  for (const [name, entry] of definitions) {
    declaredAll.push(...entry.commandIds);
    const label = `packages/yard-tools/${name}/README.md`;
    const readmePath = path.join(rootDir, label);
    if (!fs.existsSync(readmePath)) {
      errors.push(`missing README: ${label}`);
      continue;
    }
    const inventory = parseReadmeInventory(fs.readFileSync(readmePath, "utf8"));
    if (inventory === null) {
      errors.push(`missing "## Commands" inventory in ${label}`);
      continue;
    }
    errors.push(
      ...compareInventory(label, entry.commandIds, inventory.ids, entry.commandIds.length, inventory.declaredCount),
    );
  }

  const docsPath = path.join(rootDir, "docs", "commands.md");
  if (!fs.existsSync(docsPath)) {
    errors.push("missing docs/commands.md");
  } else {
    const inventory = parseDocsInventory(fs.readFileSync(docsPath, "utf8"));
    if (inventory === null) {
      errors.push('missing "Bundled v2 commands" inventory in docs/commands.md');
    } else {
      errors.push(
        ...compareInventory("docs/commands.md", declaredAll, inventory.ids, declaredAll.length, inventory.declaredCount),
      );
    }
  }

  const catalogPath = path.join(rootDir, "packages", "yard-tools", "README.md");
  if (fs.existsSync(catalogPath)) {
    const counts = parseCatalogInventory(fs.readFileSync(catalogPath, "utf8"));
    for (const [name, entry] of definitions) {
      const listed = counts.get(name);
      if (listed === undefined) {
        errors.push(`missing package in packages/yard-tools/README.md catalog: ${name}`);
      } else if (listed !== entry.commandIds.length) {
        errors.push(
          `count mismatch in packages/yard-tools/README.md: ${name} lists ${listed} commands but the definition declares ${entry.commandIds.length}`,
        );
      }
    }
  }

  return {
    errors,
    summary: `command inventories OK — ${definitions.size} definitions, ${declaredAll.length} commands, docs inventory and ${definitions.size} package READMEs match`,
  };
}

module.exports = {
  compareInventory,
  parseCatalogInventory,
  parseCommandsFromDefinition,
  parseDefinitions,
  parseDocsInventory,
  parseReadmeInventory,
  runCheck,
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  let rootDir = path.resolve(__dirname, "..");
  const rootIndex = argv.indexOf("--root");
  if (rootIndex !== -1 && argv[rootIndex + 1]) rootDir = path.resolve(argv[rootIndex + 1]);

  const { errors, summary } = runCheck(rootDir);
  if (errors.length > 0) {
    console.error(`check-command-inventories: FAILED with ${errors.length} problem(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`check-command-inventories: ${summary}.`);
}
