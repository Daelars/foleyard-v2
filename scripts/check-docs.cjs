// Verifies staged documentation identity and internal consistency.
//
// `docs/manifest.json` is the single registry (#236): the application, the
// staging script and this checker all read it. Checks:
// - the registry parses, has unique ids, and every path exists in the checkout,
// - manifest.json exists in the staged dir,
// - the staged manifest's document set equals the registry (id, path, status),
// - manifest productVersion matches root package.json (and coreVersion
//   matches packages/yard-core/package.json),
// - each manifest sha256 matches the staged file content,
// - docs/index.md + README.md are present in the staged dir,
// - relative .md links inside live docs resolve (only relative .md links;
//   http(s)/anchors skipped),
// - structured command IDs in docs/commands.md resolve against the
//   packages/yard-tools/*-v2/src/definition.ts files.
//
// Usage: node scripts/check-docs.cjs --dir <staged-dir>
// (also accepts --out or a positional dir; defaults to
// staged-docs/foleyard-docs). Exits non-zero with a clear message on failure.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = path.resolve(__dirname, "..");
const REGISTRY_PATH = path.join(root, "docs", "manifest.json");

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

function findV2DefinitionFiles() {
  const files = [];
  const toolsDir = path.join(root, "packages", "yard-tools");
  if (!fs.existsSync(toolsDir)) return files;
  for (const tool of fs.readdirSync(toolsDir)) {
    if (!tool.endsWith("-v2")) continue;
    const candidate = path.join(toolsDir, tool, "src", "definition.ts");
    if (fs.existsSync(candidate)) files.push(candidate);
  }
  return files;
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

// 1. Registry parses and every source exists in the checkout.
let registry = null;
if (!fs.existsSync(REGISTRY_PATH)) {
  errors.push("docs/manifest.json not found; it is the single registry");
} else {
  try {
    const parsed = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
    if (Array.isArray(parsed.documents) && parsed.documents.length > 0) {
      registry = parsed;
    } else {
      errors.push("docs/manifest.json declares no documents");
    }
  } catch (error) {
    errors.push(`docs/manifest.json is not valid JSON: ${error.message}`);
  }
}
if (registry) {
  const ids = new Set();
  for (const entry of registry.documents) {
    if (typeof entry.id !== "string" || typeof entry.path !== "string") {
      errors.push(`manifest entry needs id and path: ${JSON.stringify(entry)}`);
      continue;
    }
    if (ids.has(entry.id)) errors.push(`duplicate manifest id "${entry.id}"`);
    ids.add(entry.id);
    if (!fs.existsSync(path.join(root, entry.path))) {
      errors.push(`registry source missing in checkout: ${entry.path} (id "${entry.id}")`);
    }
  }
}
const registryDocuments = registry ? registry.documents : [];

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

// 4. Staged document set equals the registry, and each sha256 matches.
if (manifest && Array.isArray(manifest.documents)) {
  const stagedById = new Map(manifest.documents.map((doc) => [doc.id, doc]));
  for (const entry of registryDocuments) {
    const staged = stagedById.get(entry.id);
    if (!staged) {
      errors.push(`staged manifest is missing registry id "${entry.id}"`);
      continue;
    }
    if (staged.path !== entry.path) {
      errors.push(
        `staged manifest path for "${entry.id}" is "${staged.path}", registry says "${entry.path}"`,
      );
    }
    if (staged.status !== entry.status) {
      errors.push(
        `staged manifest status for "${entry.id}" is "${staged.status}", registry says "${entry.status}"`,
      );
    }
  }
  const registryIds = new Set(registryDocuments.map((entry) => entry.id));
  for (const doc of manifest.documents) {
    if (!registryIds.has(doc.id)) {
      errors.push(`staged manifest has unknown id "${doc.id}" (registry is the single source)`);
    }
    const stagedPath = path.join(stagedDir, doc.path);
    if (!fs.existsSync(stagedPath)) {
      errors.push(`staged file missing: ${doc.path} (id "${doc.id}")`);
      continue;
    }
    const actual = sha256(fs.readFileSync(stagedPath, "utf8"));
    if (actual !== doc.sha256) {
      errors.push(`sha256 mismatch for staged ${doc.path} (id "${doc.id}")`);
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
function checkLinksInFile(absPath, resolveRoot) {
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
      errors.push(`unresolved .md link in ${fromRelative}: "${target}"`);
    }
  }
}
for (const entry of registryDocuments) {
  if (!entry.path.startsWith("docs/") || !entry.path.endsWith(".md")) continue;
  const stagedPath = path.join(stagedDir, entry.path);
  if (fs.existsSync(stagedPath)) checkLinksInFile(stagedPath, stagedDir);
}
// Remaining top-level docs/*.md working files (not in the registry):
// live working docs, so their relative .md links must resolve.
{
  const covered = new Set(registryDocuments.map((entry) => path.join(root, entry.path)));
  for (const abs of listFilesRecursive(path.join(root, "docs"), ".md")) {
    if (path.dirname(abs) !== path.join(root, "docs")) continue;
    if (covered.has(abs)) continue;
    checkLinksInFile(abs, root);
  }
}

// 7. Repository paths referenced by served documents exist. Historical or
// proposed references are allowlisted with a reason instead of skipped
// silently.
const HISTORICAL_PATH_ALLOWLIST = [
  { prefix: "docs/audit-2026-09/", reason: "archived audit material in Daelars/foleyard-archive" },
  { prefix: "docs/plans/", reason: "archived plans in Daelars/foleyard-archive" },
  { prefix: "docs/audits/", reason: "historical audit material" },
  { prefix: "src/definition.ts", reason: "package-relative path inside a generated extension" },
  { prefix: "src/handlers.ts", reason: "package-relative path inside a generated extension" },
  { prefix: "src/index.ts", reason: "package-relative path inside a generated extension" },
  { prefix: "src/lib/extensions/", reason: "retired v1 sources recorded by the historical extensions guide" },
  { prefix: "packages/yard-core/src/extensions/", reason: "retired v1 sources recorded by the historical extensions guide" },
  { prefix: "docs/audits/foleyard-self-awareness-audit.md", reason: "historical audit" },
];
const PATH_PREFIX = /^(docs|src|packages|scripts|electron|examples|public)\/[A-Za-z0-9._/-]+$/;
const ALLOWLISTED_PATHS = [];

function checkPathsInFile(absPath, resolveRoot) {
  const content = fs.readFileSync(absPath, "utf8");
  const fromRelative = path.relative(resolveRoot, absPath).replace(/\\/g, "/");
  for (const match of content.matchAll(/`([^`]+)`/g)) {
    let token = match[1].trim();
    if (token.includes("*") || token.includes("<") || token.includes(">")) continue;
    if (token.includes("(") || token.includes(")")) continue;
    if (token.includes("@") || token.includes(" ")) continue;
    token = token.replace(/:\d+(?:-\d+)?$/, "").replace(/[.,;)]+$/, "");
    if (!PATH_PREFIX.test(token)) continue;
    const allow = HISTORICAL_PATH_ALLOWLIST.find((entry) => token.startsWith(entry.prefix));
    if (allow) {
      ALLOWLISTED_PATHS.push(`${token} (${allow.reason})`);
      continue;
    }
    let candidate = token;
    if (candidate.includes("{")) {
      candidate = candidate.slice(0, candidate.indexOf("{")).replace(/\/$/, "");
    }
    const absolute = path.resolve(root, candidate);
    const exists = fs.existsSync(absolute);
    const isDirectory = candidate.endsWith("/");
    if (!exists || (isDirectory && !fs.statSync(absolute).isDirectory())) {
      errors.push(`missing repository path in ${fromRelative}: "${token}"`);
    }
  }
}
for (const entry of registryDocuments) {
  const stagedPath = path.join(stagedDir, entry.path);
  if (fs.existsSync(stagedPath)) checkPathsInFile(stagedPath, stagedDir);
}

// 8. Docs ids referenced by capabilities, events, commands and definitions
// resolve against the manifest registry.
const docsIds = new Set(registryDocuments.map((entry) => entry.id));
function checkDocsIds(sourceLabel, ids) {
  for (const id of ids) {
    if (!docsIds.has(id)) {
      errors.push(`${sourceLabel} references unknown docs id "${id}"`);
    }
  }
}
const definitionsFiles = findV2DefinitionFiles();
const capabilitiesSource = path.join(root, "src", "lib", "capabilities.ts");
if (fs.existsSync(capabilitiesSource)) {
  checkDocsIds(
    "capabilities",
    [...fs.readFileSync(capabilitiesSource, "utf8").matchAll(/docsId:\s*"([^"]+)"/g)].map((m) => m[1]),
  );
}
const eventsSource = path.join(root, "src", "lib", "events.ts");
if (fs.existsSync(eventsSource)) {
  checkDocsIds(
    "events",
    [...fs.readFileSync(eventsSource, "utf8").matchAll(/docsId:\s*"([^"]+)"/g)].map((m) => m[1]),
  );
}
for (const file of definitionsFiles) {
  const source = fs.readFileSync(file, "utf8");
  checkDocsIds(
    `definitions (${path.basename(path.dirname(path.dirname(file)))})`,
    [...source.matchAll(/docsId:\s*"([^"]+)"/g)].map((m) => m[1]),
  );
  for (const block of source.matchAll(/docsRefs:\s*\[([\s\S]*?)\]/g)) {
    checkDocsIds(
      `docsRefs (${path.basename(path.dirname(path.dirname(file)))})`,
      [...block[1].matchAll(/id:\s*"([^"]+)"/g)].map((m) => m[1]),
    );
  }
}

// 9. Every example the manifest lists has a directory and a README.
const examples = Array.isArray(registry?.examples) ? registry.examples : [];
for (const example of examples) {
  if (typeof example?.id !== "string") {
    errors.push(`manifest example entry needs an id: ${JSON.stringify(example)}`);
    continue;
  }
  const exampleDir = path.join(root, "examples", example.id);
  if (!fs.existsSync(exampleDir) || !fs.statSync(exampleDir).isDirectory()) {
    errors.push(`manifest example directory missing: examples/${example.id}`);
    continue;
  }
  if (!fs.existsSync(path.join(exampleDir, "README.md"))) {
    errors.push(`manifest example README missing: examples/${example.id}/README.md`);
  }
}

// 10. Command IDs in docs/commands.md resolve against v2 definition.ts files.
const definedCommands = new Set();
for (const file of definitionsFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/export\s+const\s+[A-Z0-9_]+\s*=\s*"([^"]+)"/g)) {
    if (match[1].includes(".")) definedCommands.add(match[1]);
  }
}
if (definedCommands.size === 0) {
  errors.push("no command IDs found in packages/yard-tools/*-v2/src/definition.ts");
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
    `check-docs: ${definedCommands.size} defined commands in ${definitionsFiles.length} v2 definition.ts files, ${resolvedRefs} command references in docs/commands.md resolved.`,
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
  `check-docs: OK — ${registryDocuments.length} registry sources, staged set matches docs/manifest.json, manifest identity (product ${productVersion}, core ${coreVersion}), ${linkCount} relative .md links checked, ${ALLOWLISTED_PATHS.length} allowlisted historical references, staged dir ${stagedDir}.`,
);
