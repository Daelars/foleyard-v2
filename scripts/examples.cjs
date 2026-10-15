// Single declaration for the runnable-in-repository examples (#310).
//
// `examples/manifest.json` declares every advertised example and the
// runtime that runs it on the primary development platform (Windows).
// The `examples/<area>/<name>/` directory is still the source of truth
// for existence (`run.ts` plus `README.md`); this module reconciles the
// declaration with the directory, so a new example cannot ship
// undiscovered and a declared example cannot point at a missing
// directory. `scripts/run-examples.cjs` (CI), `scripts/prepare-docs.cjs`
// (staged manifest) and the CI example workflow all read this one
// declaration.

const fs = require("node:fs");
const path = require("node:path");

// Runtimes a declared example may use. `node` is the supported runtime on
// the primary development platform for examples that need the native
// `better-sqlite3` module (Bun cannot dlopen it on Windows); `bun` runs
// the TypeScript-only examples natively.
const SUPPORTED_RUNTIMES = ["bun", "node"];

function fail(message) {
  throw new Error(message);
}

function readExamplesDeclaration(root) {
  const declarationPath = path.join(root, "examples", "manifest.json");
  if (!fs.existsSync(declarationPath)) {
    fail("examples/manifest.json not found; it is the single example declaration");
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(declarationPath, "utf8"));
  } catch (error) {
    fail(`examples/manifest.json is not valid JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed.examples)) {
    fail("examples/manifest.json needs an examples array");
  }
  const seen = new Set();
  return parsed.examples.map((entry) => {
    if (!entry || typeof entry.id !== "string" || entry.id.length === 0) {
      fail(`example entry needs a string id: ${JSON.stringify(entry)}`);
    }
    if (seen.has(entry.id)) fail(`duplicate example id "${entry.id}"`);
    seen.add(entry.id);
    if (!SUPPORTED_RUNTIMES.includes(entry.runtime)) {
      fail(
        `example "${entry.id}" needs a supported runtime (${SUPPORTED_RUNTIMES.join(
          " or ",
        )}); got ${JSON.stringify(entry.runtime)}`,
      );
    }
    return { id: entry.id, runtime: entry.runtime };
  });
}

/** Every `examples/<area>/<name>/run.ts` on disk, as `area/name` ids. */
function discoverExampleIds(root) {
  const examplesDir = path.join(root, "examples");
  const found = [];
  if (!fs.existsSync(examplesDir)) return found;
  for (const area of fs.readdirSync(examplesDir, { withFileTypes: true })) {
    if (!area.isDirectory()) continue;
    const areaDir = path.join(examplesDir, area.name);
    for (const example of fs.readdirSync(areaDir, { withFileTypes: true })) {
      if (!example.isDirectory()) continue;
      if (!fs.existsSync(path.join(areaDir, example.name, "run.ts"))) continue;
      found.push(`${area.name}/${example.name}`);
    }
  }
  return found.sort((left, right) => left.localeCompare(right));
}

/**
 * The declared examples, reconciled with the directory. Throws (never
 * exits) so callers decide how to report; both CI consumers fail the run.
 */
function resolveExamples(root) {
  const declared = readExamplesDeclaration(root);
  const declaredIds = declared.map((example) => example.id).sort((a, b) => a.localeCompare(b));
  const discoveredIds = discoverExampleIds(root);

  const undeclared = discoveredIds.filter((id) => !declaredIds.includes(id));
  if (undeclared.length > 0) {
    fail(
      `examples discovered but not declared in examples/manifest.json: ${undeclared.join(", ")}`,
    );
  }
  const missing = declaredIds.filter((id) => !discoveredIds.includes(id));
  if (missing.length > 0) {
    fail(`examples declared but missing examples/<id>/run.ts: ${missing.join(", ")}`);
  }

  return declared.map((entry) => {
    const dir = path.join(root, "examples", entry.id);
    const readme = path.join(dir, "README.md");
    if (!fs.existsSync(readme)) {
      fail(`example "${entry.id}" is missing examples/${entry.id}/README.md`);
    }
    return {
      id: entry.id,
      runtime: entry.runtime,
      dir,
      runPath: path.join(dir, "run.ts"),
      readme,
    };
  });
}

module.exports = {
  SUPPORTED_RUNTIMES,
  readExamplesDeclaration,
  discoverExampleIds,
  resolveExamples,
};
