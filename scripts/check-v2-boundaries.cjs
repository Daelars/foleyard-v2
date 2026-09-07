#!/usr/bin/env node
/**
 * v2 dependency boundary scan (CI enforcement for the R10 build contract).
 *
 * Fails when a v2 extension package or runnable v2 example strays from
 * the allowed dependency direction (see
 * `docs/adr/extension-v2-dependency-direction.md`): non-test sources
 * under `packages/yard-tools/make-pack-v2/src` and
 * `examples/extensions-v2` may import `yard-core` and package-local
 * relative modules only — no React/Next/Electron, no application
 * internals, no v1 extension code, no Node filesystem/process/network
 * primitives, no storage drivers. Test files (`*.test.ts`) are
 * excluded: they may use `node:fs`/`node:os` for disposable fixtures.
 * Mirrors the specifier rule in
 * `packages/yard-tools/make-pack-v2/src/handlers.test.ts` and the
 * module rule in
 * `packages/yard-core/src/extensions-v2/boundaries.test.ts`, so
 * `node scripts/check-v2-boundaries.cjs` covers the rule without
 * loading vitest.
 *
 * Also verifies package inclusion wiring: the root workspaces globs and
 * the tsconfig `@foleyard/*` wildcard must resolve every directory under
 * `packages/yard-tools/`, and `make-pack-v2` must stay private with no
 * runtime dependency beyond `yard-core`.
 *
 * Usage: node scripts/check-v2-boundaries.cjs
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

// Every bundled v2 port lives at packages/yard-tools/<name>-v2. Discover
// them so a new port is boundary-scanned the moment it lands, without
// editing this list.
function discoverV2PortRoots() {
  const toolsDir = path.join(root, "packages", "yard-tools");
  const out = [];
  if (!fs.existsSync(toolsDir)) return out;
  for (const tool of fs.readdirSync(toolsDir)) {
    if (!tool.endsWith("-v2")) continue;
    if (!fs.statSync(path.join(toolsDir, tool)).isDirectory()) continue;
    out.push(`packages/yard-tools/${tool}/src`);
  }
  return out;
}

const SCAN_ROOTS = [...discoverV2PortRoots(), "examples/extensions-v2"];

function listSourceFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(abs));
    else if (
      entry.isFile() &&
      /\.(ts|tsx|mts|js|cjs|mjs)$/.test(entry.name) &&
      !entry.name.endsWith(".test.ts") &&
      !entry.name.endsWith(".test.tsx")
    ) {
      out.push(abs);
    }
  }
  return out;
}

function specifiersIn(source) {
  const found = [];
  for (const match of source.matchAll(/(?:import|export)[^'"]*from\s*['"]([^'"]+)['"]/g)) {
    found.push(match[1]);
  }
  for (const match of source.matchAll(/(?:import|require)\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    found.push(match[1]);
  }
  return found;
}

const errors = [];

// 1. Dependency-direction scan: v2 extension sources import yard-core
// and package-local relatives only.
for (const scanRoot of SCAN_ROOTS) {
  const absRoot = path.join(root, scanRoot);
  if (!fs.existsSync(absRoot)) {
    errors.push(`scan root missing: ${scanRoot}`);
    continue;
  }
  for (const file of listSourceFiles(absRoot)) {
    const relative = path.relative(root, file).replace(/\\/g, "/");
    const source = fs.readFileSync(file, "utf8");
    for (const specifier of specifiersIn(source)) {
      if (specifier === "yard-core" || specifier.startsWith("./") || specifier.startsWith("../")) {
        continue;
      }
      errors.push(`forbidden import in ${relative}: ${JSON.stringify(specifier)}`);
    }
  }
}

// 2. Package inclusion wiring.
const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const workspaces = rootPackage.workspaces ?? [];
for (const expected of ["packages/*", "packages/yard-tools/*"]) {
  if (!workspaces.includes(expected)) {
    errors.push(`root package.json workspaces is missing ${JSON.stringify(expected)}`);
  }
}
const tsconfig = JSON.parse(fs.readFileSync(path.join(root, "tsconfig.json"), "utf8"));
const paths = (tsconfig.compilerOptions && tsconfig.compilerOptions.paths) || {};
if (!paths["@foleyard/*"]) {
  errors.push('tsconfig paths is missing the "@foleyard/*" wildcard');
}
const toolsDir = path.join(root, "packages", "yard-tools");
for (const tool of fs.readdirSync(toolsDir)) {
  const toolDir = path.join(toolsDir, tool);
  if (!fs.statSync(toolDir).isDirectory()) continue;
  const packagePath = path.join(toolDir, "package.json");
  if (!fs.existsSync(packagePath)) {
    errors.push(`workspace package without package.json: packages/yard-tools/${tool}`);
    continue;
  }
  const manifest = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  const indexPath = path.join(toolsDir, tool, "src", "index.ts");
  if (!fs.existsSync(indexPath)) {
    errors.push(`workspace package without src/index.ts: packages/yard-tools/${tool}`);
  }
  // Every bundled v2 port stays private (non-publishing) with yard-core
  // as its only runtime dependency; this held for make-pack-v2 first and
  // holds for every port that follows it.
  if (tool.endsWith("-v2")) {
    if (manifest.private !== true) {
      errors.push(`${tool} must stay private (non-publishing).`);
    }
    const runtimeDeps = Object.keys(manifest.dependencies ?? {});
    const unexpected = runtimeDeps.filter((dep) => dep !== "yard-core");
    if (unexpected.length > 0) {
      errors.push(`${tool} has unexpected runtime dependencies: ${unexpected.join(", ")}`);
    }
    if (manifest.version !== "1.0.0") {
      errors.push(`${tool} version is ${JSON.stringify(manifest.version)}, expected "1.0.0".`);
    }
  }
}

// 3. Production fixture exclusion wiring.
const builder = fs.readFileSync(path.join(root, "electron-builder.yml"), "utf8");
if (!builder.includes("!.next/server/app/prototype/**")) {
  errors.push("electron-builder.yml must exclude compiled prototype routes from packaged builds.");
}
const prototypeLayout = fs.readFileSync(
  path.join(root, "src", "app", "prototype", "layout.tsx"),
  "utf8",
);
if (!prototypeLayout.includes("notFound()")) {
  errors.push("src/app/prototype/layout.tsx must resolve prototype routes to not-found in production.");
}

if (errors.length > 0) {
  console.error(`check-v2-boundaries: FAILED with ${errors.length} problem(s):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  "check-v2-boundaries: OK — v2 dependency boundary, workspace inclusion, and prototype exclusion hold.",
);
