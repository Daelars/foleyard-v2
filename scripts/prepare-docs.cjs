// Stages version-matched documentation for packaged builds.
//
// `docs/manifest.json` is the single registry (#236). This script validates it
// through `docs-registry.cjs` (the same validation the checker uses), clears
// the output directory first so a stale file from an earlier run can never
// survive, then copies each manifest document (plus README) from the repo root
// into the clean staging directory and writes a staged manifest.json with
// version provenance: productVersion (root package.json), coreVersion
// (packages/yard-core/package.json), buildId (.next/BUILD_ID when present),
// sourceRevision (git HEAD or SOURCE_REVISION env), sourceDirty
// (git status --porcelain non-empty), stagedAt (when this run staged the
// output), per-document sha256, and the runnable examples list.
//
// `stagedAt` is what lets check-docs.cjs prove the output came from this
// script: docs:prepare -> docs:check is the only supported order.
//
// Usage: node scripts/prepare-docs.cjs --out <dir>
// Default out dir: staged-docs/foleyard-docs (matches electron-builder
// extraResources below).

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execSync } = require("node:child_process");

const { validateRegistry } = require("./docs-registry.cjs");

const root = path.resolve(__dirname, "..");

/**
 * Runnable examples derived from `examples/<area>/<name>/run.ts` (#249):
 * the directory is the single source, not a hardcoded list.
 */
function listExamples() {
  const examplesDir = path.join(root, "examples");
  const found = [];
  if (!fs.existsSync(examplesDir)) return found;
  for (const area of fs.readdirSync(examplesDir, { withFileTypes: true })) {
    if (!area.isDirectory()) continue;
    const areaDir = path.join(examplesDir, area.name);
    for (const example of fs.readdirSync(areaDir, { withFileTypes: true })) {
      if (!example.isDirectory()) continue;
      if (!fs.existsSync(path.join(areaDir, example.name, "run.ts"))) continue;
      found.push({ id: `${area.name}/${example.name}`, runnableIn: "repository" });
    }
  }
  return found.sort((left, right) => left.id.localeCompare(right.id));
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

/**
 * Staging starts from a clean output: anything left there by an earlier run is
 * removed before the registry documents are copied in, so a stale file cannot
 * survive into a packaged build. Refuse targets that could destroy the
 * checkout or a home/drive root.
 */
function assertSafeToClean(target) {
  const resolved = path.resolve(target);
  const rootResolved = path.resolve(root);
  if (resolved === rootResolved) {
    console.error("prepare-docs: refusing to clean the repository root as the staging output");
    process.exit(1);
  }
  if (path.parse(resolved).root === resolved) {
    console.error(`prepare-docs: refusing to clean the filesystem root "${resolved}"`);
    process.exit(1);
  }
  if (rootResolved.startsWith(resolved + path.sep)) {
    console.error(`prepare-docs: refusing to clean "${resolved}"; it contains the repository`);
    process.exit(1);
  }
  if (fs.existsSync(path.join(resolved, ".git"))) {
    console.error(`prepare-docs: refusing to clean "${resolved}"; it holds a git checkout`);
    process.exit(1);
  }
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
const registryValidation = validateRegistry(root);
if (registryValidation.errors.length > 0) {
  console.error(
    `prepare-docs: docs/manifest.json is invalid (${registryValidation.errors.length} problem(s)):`,
  );
  for (const error of registryValidation.errors) console.error(`  - ${error}`);
  process.exit(1);
}
const documents = registryValidation.documents;
const manifestId =
  typeof registryValidation.manifest?.manifestId === "string"
    ? registryValidation.manifest.manifestId
    : "foleyard-docs";

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

// Clean output first: remove anything an earlier run (or another step) left
// behind, then recreate the directory for this stage.
assertSafeToClean(outDir);
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const stagedDocuments = documents.map((entry) => {
  const abs = path.join(root, entry.path);
  const content = fs.readFileSync(abs, "utf8");
  const dest = path.join(outDir, entry.path);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(abs, dest);
  return {
    id: entry.id,
    path: entry.path,
    title: entry.title,
    status: entry.status,
    audience: entry.audience,
    sha256: sha256(content),
  };
});

const manifest = {
  manifestId,
  productVersion,
  coreVersion,
  buildId,
  sourceRevision,
  sourceDirty,
  stagedAt: new Date().toISOString(),
  documents: stagedDocuments,
  examples: listExamples(),
};

fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `prepare-docs: cleaned and staged ${stagedDocuments.length} documents + manifest.json to ${outDir} ` +
    `(product ${productVersion}, core ${coreVersion}, revision ${sourceRevision}${sourceDirty ? ", dirty" : ""}).`,
);
