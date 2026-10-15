// Stages version-matched documentation for packaged builds.
//
// `docs/manifest.json` is the single registry (#236). This script copies
// each manifest document (plus README) from the repo root into a staging
// directory and writes a staged manifest.json with version provenance:
// productVersion (root package.json), coreVersion
// (packages/yard-core/package.json), buildId (.next/BUILD_ID when present),
// sourceRevision (git HEAD or SOURCE_REVISION env), sourceDirty
// (git status --porcelain non-empty), per-document sha256, and the runnable
// examples list.
//
// Usage: node scripts/prepare-docs.cjs --out <dir>
// Default out dir: staged-docs/foleyard-docs (matches electron-builder
// extraResources below).

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const REGISTRY_PATH = path.join(root, "docs", "manifest.json");
const { resolveExamples } = require("./examples.cjs");

function readRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) {
    console.error("prepare-docs: docs/manifest.json not found; it is the single registry");
    process.exit(1);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
  } catch (error) {
    console.error(`prepare-docs: docs/manifest.json is not valid JSON: ${error.message}`);
    process.exit(1);
  }
  const documents = Array.isArray(parsed.documents) ? parsed.documents : [];
  if (documents.length === 0) {
    console.error("prepare-docs: docs/manifest.json declares no documents");
    process.exit(1);
  }
  for (const doc of documents) {
    if (typeof doc.id !== "string" || typeof doc.path !== "string") {
      console.error(`prepare-docs: manifest entry needs id and path: ${JSON.stringify(doc)}`);
      process.exit(1);
    }
  }
  return {
    manifestId: typeof parsed.manifestId === "string" ? parsed.manifestId : "foleyard-docs",
    documents,
  };
}

/**
 * Runnable examples from the single declaration (#310):
 * `examples/manifest.json` names each example and the runtime that runs
 * it on the primary development platform; `scripts/examples.cjs`
 * reconciles that declaration with the `examples/` directory. The staged
 * manifest therefore advertises exactly the set CI executes.
 */
function listExamples() {
  return resolveExamples(root).map((example) => ({
    id: example.id,
    runtime: example.runtime,
    runnableIn: "repository",
  }));
}

function parseOutDir(argv) {
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === "--out" || argv[i] === "--dir") && argv[i + 1]) {
      return path.resolve(argv[i + 1]);
    }
  }
  const positional = argv.find((a) => !a.startsWith("-"));
  if (positional) return path.resolve(positional);
  return path.join(root, "staged-docs", "foleyard-docs");
}

function tryExec(cmd) {
  try {
    return execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function sha256(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

const outDir = parseOutDir(process.argv.slice(2));
const registry = readRegistry();

const productVersion = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
).version;
const coreVersion = JSON.parse(
  fs.readFileSync(path.join(root, "packages", "yard-core", "package.json"), "utf8"),
).version;

// Build provenance, written after `next build` (write-build-provenance.cjs),
// keeps the manifest and the running identity in agreement. Fall back to the
// raw BUILD_ID and git when the provenance file is absent (docs-only staging
// in a checkout).
let provenance = null;
try {
  provenance = JSON.parse(
    fs.readFileSync(path.join(root, ".next", "build-provenance.json"), "utf8"),
  );
} catch {
  provenance = null;
}

let buildId = typeof provenance?.buildId === "string" ? provenance.buildId : null;
if (buildId === null) {
  const buildIdPath = path.join(root, ".next", "BUILD_ID");
  if (fs.existsSync(buildIdPath)) buildId = fs.readFileSync(buildIdPath, "utf8").trim() || null;
}

const statusOutput = tryExec("git status --porcelain");
const sourceRevision =
  process.env.SOURCE_REVISION ||
  (typeof provenance?.sourceRevision === "string" ? provenance.sourceRevision : null) ||
  tryExec("git rev-parse HEAD") ||
  "unknown";
const sourceDirty =
  process.env.FOLEYARD_SOURCE_DIRTY === "true"
    ? true
    : process.env.FOLEYARD_SOURCE_DIRTY === "false"
      ? false
      : typeof provenance?.sourceDirty === "boolean"
        ? provenance.sourceDirty
        : statusOutput === null
          ? false
          : statusOutput.length > 0;

const seenIds = new Set();
const documents = registry.documents.map((entry) => {
  if (seenIds.has(entry.id)) {
    console.error(`prepare-docs: duplicate document id "${entry.id}" in docs/manifest.json`);
    process.exit(1);
  }
  seenIds.add(entry.id);
  const abs = path.join(root, entry.path);
  if (!fs.existsSync(abs)) {
    console.error(`prepare-docs: missing source file ${entry.path} (id "${entry.id}")`);
    process.exit(1);
  }
  const content = fs.readFileSync(abs, "utf8");
  const dest = path.join(outDir, entry.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(abs, dest);
  return {
    id: entry.id,
    path: entry.path,
    title: typeof entry.title === "string" ? entry.title : entry.id,
    status: typeof entry.status === "string" ? entry.status : "current",
    audience: typeof entry.audience === "string" ? entry.audience : null,
    sha256: sha256(content),
  };
});

let examples;
try {
  examples = listExamples();
} catch (error) {
  console.error(`prepare-docs: ${error.message}`);
  process.exit(1);
}

const manifest = {
  manifestId: registry.manifestId,
  productVersion,
  coreVersion,
  buildId,
  sourceRevision,
  sourceDirty,
  documents,
  examples,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `prepare-docs: staged ${documents.length} documents + manifest.json to ${outDir} ` +
    `(product ${productVersion}, core ${coreVersion}, revision ${sourceRevision}${sourceDirty ? ", dirty" : ""}).`,
);
