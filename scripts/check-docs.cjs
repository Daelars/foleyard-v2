// Verifies staged documentation identity and internal consistency.
//
// Checks:
// - every DOCUMENT_REGISTRY relativePath exists in the checkout,
// - manifest.json exists in the staged dir,
// - manifest productVersion matches root package.json (and coreVersion
//   matches packages/yard-core/package.json),
// - each manifest sha256 matches the staged file content,
// - docs/index.md + README.md are present in the staged dir,
// - relative .md links inside live docs resolve (only relative .md links;
//   http(s)/anchors skipped; historical audits are exempt from source-path
//   checks but inter-audit links must resolve),
// - structured command IDs in docs/commands.md resolve against the six
//   packages/yard-tools/*/src/command-definitions.ts files.
//
// Usage: node scripts/check-docs.cjs --dir <staged-dir>
// (also accepts --out or a positional dir; defaults to
// staged-docs/foleyard-docs). Exits non-zero with a clear message on failure.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

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

const HISTORICAL_PREFIXES = ["docs/audits/", "docs/audit-"];
const isHistorical = (relativePath) =>
  HISTORICAL_PREFIXES.some((prefix) => relativePath.startsWith(prefix));

function parseStagedDir(argv) {
  for (let i = 0; i < argv.length; i++) {
    if ((argv[i] === "--dir" || argv[i] === "--out") && argv[i + 1]) {
      return path.resolve(argv[i + 1]);
    }
  }
  const positional = argv.find((a) => !a.startsWith("-"));
  if (positional) return path.resolve(positional);
  return path.join(root, "staged-docs", "foleyard-docs");
}

function sha256(content) {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

/** Extract relative .md link targets; skips http(s), anchors, absolute paths. */
function relativeMarkdownLinks(markdown) {
  const targets = [];
  const pattern = /\[[^\]]*\]\(([^)]+)\)/g;
  let match;
  while ((match = pattern.exec(markdown)) !== null) {
    let target = match[1].trim().split(/\s+/)[0];
    if (!target) continue;
    if (/^(https?:|mailto:|data:|#|\/|\\)/i.test(target)) continue;
    target = target.split("#")[0].split("?")[0];
    if (!target || !target.toLowerCase().endsWith(".md")) continue;
    if (target.includes("\\")) continue;
    targets.push(target);
  }
  return targets;
}

function listFilesRecursive(dir, extension) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFilesRecursive(abs, extension));
    else if (entry.isFile() && abs.endsWith(extension)) out.push(abs);
  }
  return out;
}

const errors = [];
const stagedDir = parseStagedDir(process.argv.slice(2));

// 1. Registry sources exist in the checkout.
for (const entry of DOCUMENTS) {
  if (!fs.existsSync(path.join(root, entry.relativePath))) {
    errors.push(`registry source missing in checkout: ${entry.relativePath} (id "${entry.id}")`);
  }
}

// 2. Manifest exists in the staged dir.
const manifestPath = path.join(stagedDir, "manifest.json");
if (!fs.existsSync(manifestPath)) {
  errors.push(`manifest.json not found in staged dir: ${manifestPath}`);
}
let manifest = null;
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    errors.push(`manifest.json is not valid JSON: ${error.message}`);
  }
}

// 3. Version identity.
const productVersion = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
).version;
const coreVersion = JSON.parse(
  fs.readFileSync(path.join(root, "packages", "yard-core", "package.json"), "utf8"),
).version;
if (manifest) {
  if (manifest.manifestId !== "foleyard-docs") {
    errors.push(`manifest manifestId is "${manifest.manifestId}", expected "foleyard-docs"`);
  }
  if (manifest.productVersion !== productVersion) {
    errors.push(
      `manifest productVersion "${manifest.productVersion}" does not match package.json "${productVersion}"`,
    );
  }
  if (manifest.coreVersion !== coreVersion) {
    errors.push(
      `manifest coreVersion "${manifest.coreVersion}" does not match yard-core "${coreVersion}"`,
    );
  }
}

// 4. sha256 of every manifest document matches the staged file.
if (manifest && Array.isArray(manifest.documents)) {
  const manifestIds = new Set(manifest.documents.map((d) => d.id));
  for (const entry of DOCUMENTS) {
    if (!manifestIds.has(entry.id)) {
      errors.push(`manifest is missing registry id "${entry.id}"`);
    }
  }
  for (const doc of manifest.documents) {
    const stagedPath = path.join(stagedDir, doc.relativePath);
    if (!fs.existsSync(stagedPath)) {
      errors.push(`staged file missing: ${doc.relativePath} (id "${doc.id}")`);
      continue;
    }
    const actual = sha256(fs.readFileSync(stagedPath, "utf8"));
    if (actual !== doc.sha256) {
      errors.push(`sha256 mismatch for staged ${doc.relativePath} (id "${doc.id}")`);
    }
  }
} else if (manifest) {
  errors.push("manifest has no documents array");
}

// 5. index.md + README present in the staged dir.
for (const required of ["docs/index.md", "README.md"]) {
  if (!fs.existsSync(path.join(stagedDir, required))) {
    errors.push(`required staged file missing: ${required}`);
  }
}

// 6. Relative .md links resolve.
let linkCount = 0;
function checkLinksInFile(absPath, resolveRoot, exemptNonAuditTargets) {
  const content = fs.readFileSync(absPath, "utf8");
  const fromRelative = path.relative(resolveRoot, absPath).replace(/\\/g, "/");
  for (const target of relativeMarkdownLinks(content)) {
    linkCount += 1;
    const resolved = path.resolve(path.dirname(absPath), target);
    const resolvedRelative = path.relative(resolveRoot, resolved).replace(/\\/g, "/");
    const escapesRoot = resolvedRelative.startsWith("..") || path.isAbsolute(resolvedRelative);
    // Links escaping the staged tree (e.g. ../../src/...) resolve against the
    // checkout root instead; staged docs mirror the checkout layout.
    const exists = escapesRoot
      ? fs.existsSync(path.resolve(root, resolvedRelative))
      : fs.existsSync(resolved);
    if (!exists) {
      const targetIsAudit = isHistorical(resolvedRelative);
      if (exemptNonAuditTargets && !targetIsAudit) continue; // historical audits exempt from source-path checks
      errors.push(`unresolved .md link in ${fromRelative}: "${target}"`);
    }
  }
}
for (const entry of DOCUMENTS) {
  if (!entry.relativePath.startsWith("docs/") || !entry.relativePath.endsWith(".md")) continue;
  const stagedPath = path.join(stagedDir, entry.relativePath);
  if (fs.existsSync(stagedPath)) checkLinksInFile(stagedPath, stagedDir, false);
}
// Historical audits: exempt from source-path checks, but inter-audit links must resolve.
for (const auditsDir of ["docs/audit-2026-09", "docs/audits"]) {
  for (const abs of listFilesRecursive(path.join(root, auditsDir), ".md")) {
    checkLinksInFile(abs, root, true);
  }
}
// Remaining top-level docs/*.md working files (not in the registry, not
// audits): live working docs, so their relative .md links must resolve.
{
  const covered = new Set(DOCUMENTS.map((d) => path.join(root, d.relativePath)));
  for (const abs of listFilesRecursive(path.join(root, "docs"), ".md")) {
    if (path.dirname(abs) !== path.join(root, "docs")) continue;
    if (covered.has(abs)) continue;
    checkLinksInFile(abs, root, false);
  }
}

// 7. Command IDs in docs/commands.md resolve against command-definitions.ts.
const definitionsFiles = [];
const toolsDir = path.join(root, "packages", "yard-tools");
if (fs.existsSync(toolsDir)) {
  for (const tool of fs.readdirSync(toolsDir)) {
    const candidate = path.join(toolsDir, tool, "src", "command-definitions.ts");
    if (fs.existsSync(candidate)) definitionsFiles.push(candidate);
  }
}
const definedCommands = new Set();
for (const file of definitionsFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/id:\s*"([^"]+)"/g)) definedCommands.add(match[1]);
}
if (definedCommands.size === 0) {
  errors.push("no command IDs found in packages/yard-tools/*/src/command-definitions.ts");
}
const extensionPrefixes = new Set(
  [...definedCommands].map((id) => id.split(".")[0]),
);
const commandsDoc = path.join(stagedDir, "docs", "commands.md");
if (fs.existsSync(commandsDoc)) {
  const content = fs.readFileSync(commandsDoc, "utf8");
  const referenced = new Set();
  for (const match of content.matchAll(/`([a-z0-9-]+(?:\.[a-z0-9-]+)+)`/g)) {
    referenced.add(match[1]);
  }
  let resolvedRefs = 0;
  for (const ref of referenced) {
    if (!extensionPrefixes.has(ref.split(".")[0])) continue; // capability ids (shelf.write), not commands
    resolvedRefs += 1;
    if (!definedCommands.has(ref)) {
      errors.push(`docs/commands.md references unknown command "${ref}"`);
    }
  }
  console.log(
    `check-docs: ${definedCommands.size} defined commands in ${definitionsFiles.length} command-definitions.ts files, ${resolvedRefs} command references in docs/commands.md resolved.`,
  );
} else {
  errors.push("staged docs/commands.md not found; cannot verify command IDs");
}

if (errors.length > 0) {
  console.error(`check-docs: FAILED with ${errors.length} problem(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `check-docs: OK — ${DOCUMENTS.length} registry sources, manifest identity (product ${productVersion}, core ${coreVersion}), ${linkCount} relative .md links checked, staged dir ${stagedDir}.`,
);
