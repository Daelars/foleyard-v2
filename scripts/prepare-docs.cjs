// Stages version-matched documentation for packaged builds.
//
// Copies the DOCUMENT_REGISTRY files (plus README) from the repo root into a
// staging directory and writes manifest.json with version provenance:
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

// Same table as DOCUMENT_REGISTRY in src/lib/documentation.ts.
const DOCUMENTS = [
  { id: "index", relativePath: "docs/index.md", status: "current" },
  { id: "quickstart", relativePath: "docs/quickstart.md", status: "current" },
  { id: "development", relativePath: "docs/development.md", status: "current" },
  { id: "library", relativePath: "docs/library.md", status: "current" },
  { id: "scanning", relativePath: "docs/scanning.md", status: "current" },
  { id: "metadata", relativePath: "docs/metadata.md", status: "current" },
  { id: "playback", relativePath: "docs/playback.md", status: "current" },
  { id: "search", relativePath: "docs/search.md", status: "current" },
  { id: "collections", relativePath: "docs/collections.md", status: "current" },
  { id: "filesystem", relativePath: "docs/filesystem.md", status: "current" },
  { id: "settings", relativePath: "docs/settings.md", status: "current" },
  { id: "database", relativePath: "docs/database.md", status: "current" },
  { id: "extensions", relativePath: "docs/extensions.md", status: "current" },
  { id: "extensions-v2", relativePath: "docs/extensions-v2.md", status: "current" },
  { id: "extensions-v2-migration", relativePath: "docs/extensions-v2-migration.md", status: "current" },
  { id: "extensions-v2-make-pack", relativePath: "docs/extensions-v2-make-pack.md", status: "current" },
  { id: "extensions-v2-troubleshooting", relativePath: "docs/extensions-v2-troubleshooting.md", status: "current" },
  { id: "commands", relativePath: "docs/commands.md", status: "current" },
  { id: "events", relativePath: "docs/events.md", status: "current" },
  { id: "runtime", relativePath: "docs/runtime.md", status: "current" },
  { id: "architecture/application", relativePath: "docs/architecture/application.md", status: "current" },
  { id: "architecture/desktop", relativePath: "docs/architecture/desktop.md", status: "current" },
  { id: "architecture/yard-core", relativePath: "docs/architecture/yard-core.md", status: "current" },
  { id: "architecture/extensions", relativePath: "docs/architecture/extensions.md", status: "current" },
  { id: "adr/filesystem-access", relativePath: "docs/adr/filesystem-access.md", status: "current" },
  { id: "readme", relativePath: "README.md", status: "current" },
];

const EXAMPLES = [
  { id: "extensions/selected-ids", runnableIn: "repository" },
  { id: "core/query-library", runnableIn: "repository" },
];

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

const productVersion = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
).version;
const coreVersion = JSON.parse(
  fs.readFileSync(path.join(root, "packages", "yard-core", "package.json"), "utf8"),
).version;

let buildId = null;
const buildIdPath = path.join(root, ".next", "BUILD_ID");
if (fs.existsSync(buildIdPath)) buildId = fs.readFileSync(buildIdPath, "utf8").trim() || null;

const sourceRevision =
  process.env.SOURCE_REVISION || tryExec("git rev-parse HEAD") || "unknown";
const statusOutput = tryExec("git status --porcelain");
const sourceDirty = statusOutput === null ? false : statusOutput.length > 0;

const documents = DOCUMENTS.map((entry) => {
  const abs = path.join(root, entry.relativePath);
  if (!fs.existsSync(abs)) {
    console.error(`prepare-docs: missing source file ${entry.relativePath}`);
    process.exit(1);
  }
  const content = fs.readFileSync(abs, "utf8");
  const dest = path.join(outDir, entry.relativePath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(abs, dest);
  return { ...entry, sha256: sha256(content) };
});

const manifest = {
  manifestId: "foleyard-docs",
  productVersion,
  coreVersion,
  buildId,
  sourceRevision,
  sourceDirty,
  documents,
  examples: EXAMPLES,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

console.log(
  `prepare-docs: staged ${documents.length} documents + manifest.json to ${outDir} ` +
    `(product ${productVersion}, core ${coreVersion}, revision ${sourceRevision}${sourceDirty ? ", dirty" : ""}).`,
);
