#!/usr/bin/env node
/**
 * v2 dependency boundary scan (CI enforcement for the R10 build contract).
 *
 * Fails when a v2 extension package or runnable v2 example strays from
 * the allowed dependency direction (see
 * `docs/adr/extension-v2-dependency-direction.md`): non-test sources
 * under `packages/yard-tools/*-v2/src` and `examples/extensions-v2` may
 * import `yard-core` and package-local relative modules only — no
 * React/Next/Electron, no application internals, no v1 extension code, no
 * Node filesystem/process/network primitives, no storage drivers.
 *
 * The import direction is read from the TypeScript/JavaScript syntax tree
 * (#308), not from source text, so the boundary holds for every load form:
 * static imports, bare side-effect imports, `export ... from` re-exports,
 * `import()` (dynamic, literal or computed), `require()` (literal or
 * computed), and aliased loaders (`const load = require`). Test files
 * (`*.test.ts`, `*.test.tsx`) are excluded: they may use `node:fs`/`node:os`
 * for disposable fixtures. A source file that does not parse, or a module
 * specifier we cannot resolve statically, fails closed with a file-specific
 * diagnostic rather than being skipped. Mirrors the specifier rule in
 * `packages/yard-core/src/extensions-v2/boundaries.test.ts`, so
 * `node scripts/check-v2-boundaries.cjs` covers the rule without loading
 * vitest.
 *
 * Also verifies package inclusion wiring: the root workspaces globs and
 * the tsconfig `@foleyard/*` wildcard must resolve every directory under
 * `packages/yard-tools/`, and each `-v2` port must stay private with no
 * runtime dependency beyond `yard-core`. Malformed manifests and missing
 * registry entries fail with entry-specific diagnostics.
 *
 * Usage: node scripts/check-v2-boundaries.cjs
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const OK_MESSAGE =
  "check-v2-boundaries: OK — v2 dependency boundary, workspace inclusion, prototype exclusion, and v1 retirement hold.";

const SOURCE_FILE = /\.(ts|tsx|mts|cts|js|jsx|cjs|mjs)$/;

/** Specifiers the dependency direction permits: the v2 API and relatives. */
function isAllowedSpecifier(specifier) {
  return specifier === "yard-core" || specifier.startsWith("./") || specifier.startsWith("../");
}

function isTestSource(fileName) {
  return fileName.endsWith(".test.ts") || fileName.endsWith(".test.tsx");
}

function scriptKindFor(fileName) {
  if (/\.tsx$/i.test(fileName)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(fileName)) return ts.ScriptKind.JSX;
  if (/\.(ts|mts|cts)$/i.test(fileName)) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function stringLiteralText(node) {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return null;
}

function expressionText(node, sourceFile) {
  if (!node) return "";
  return node.getText(sourceFile).replace(/\s+/g, " ").trim().slice(0, 80);
}

/** `require(...)` or `require.resolve(...)` — the direct loader callees. */
function requireCalleeName(expression) {
  if (ts.isIdentifier(expression) && expression.text === "require") return "require";
  if (
    ts.isPropertyAccessExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "require" &&
    expression.name.text === "resolve"
  ) {
    return "require.resolve";
  }
  return null;
}

/**
 * `require` names that are property keys, type members or binding names are
 * not loader references; only value-position uses evade a text scan.
 */
function isRequireNamePosition(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (
    (ts.isPropertyAccessExpression(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isBindingElement(parent) ||
      ts.isImportSpecifier(parent) ||
      ts.isExportSpecifier(parent)) &&
    (parent.name === node ||
      ("propertyName" in parent && parent.propertyName === node))
  ) {
    return true;
  }
  if (ts.isQualifiedName(parent)) return true;
  return false;
}

/**
 * A `require` identifier used as the direct callee of `require(...)` or as
 * the receiver of `require.resolve(...)` is handled by the call branch.
 */
function isDirectRequireReference(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isCallExpression(parent) && parent.expression === node) return true;
  if (
    ts.isPropertyAccessExpression(parent) &&
    parent.expression === node &&
    parent.name.text === "resolve" &&
    ts.isCallExpression(parent.parent) &&
    parent.parent.expression === parent
  ) {
    return true;
  }
  return false;
}

/**
 * Parse one source and collect every module reference plus the constructs we
 * cannot resolve statically. Returns:
 *   references: [{ specifier, kind }] — literal module specifiers
 *   violations: string[] — computed specifiers and aliased loaders
 *   parseErrors: string[] — syntax diagnostics naming the malformed source
 */
function analyzeSource(source, fileName) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(fileName),
  );
  const references = [];
  const violations = [];
  const parseErrors = [];

  for (const diagnostic of sourceFile.parseDiagnostics ?? []) {
    parseErrors.push(ts.flattenDiagnosticMessageText(diagnostic.messageText, " "));
  }

  // Pass 1: names bound to the loader, e.g. `const load = require`.
  const requireAliases = new Set();
  const collectAliases = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isIdentifier(node.initializer) &&
      node.initializer.text === "require"
    ) {
      requireAliases.add(node.name.text);
    }
    ts.forEachChild(node, collectAliases);
  };
  collectAliases(sourceFile);

  const addReference = (specifier, kind) => references.push({ specifier, kind });

  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      // Covers `import x from`, `import "side-effect"`, `export ... from`,
      // and `export * from` alike.
      const specifier = stringLiteralText(node.moduleSpecifier);
      if (specifier !== null) {
        addReference(specifier, ts.isImportDeclaration(node) ? "import" : "export");
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      const reference = node.moduleReference;
      if (ts.isExternalModuleReference(reference)) {
        const specifier = stringLiteralText(reference.expression);
        if (specifier !== null) addReference(specifier, "import-equals");
        else {
          violations.push(
            `computed import-equals ${JSON.stringify(expressionText(reference.expression, sourceFile))}`,
          );
        }
      }
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const specifier = stringLiteralText(node.arguments[0]);
        if (specifier !== null) addReference(specifier, "dynamic-import");
        else {
          violations.push(
            `computed dynamic import ${JSON.stringify(expressionText(node.arguments[0], sourceFile))}`,
          );
        }
      } else {
        const callee = requireCalleeName(node.expression);
        if (callee) {
          const specifier = stringLiteralText(node.arguments[0]);
          if (specifier !== null) addReference(specifier, "require");
          else {
            violations.push(
              `computed ${callee} ${JSON.stringify(expressionText(node.arguments[0], sourceFile))}`,
            );
          }
        } else if (ts.isIdentifier(node.expression) && requireAliases.has(node.expression.text)) {
          violations.push(`aliased require call ${JSON.stringify(node.expression.text)}`);
        }
      }
    }

    if (
      ts.isIdentifier(node) &&
      node.text === "require" &&
      !isRequireNamePosition(node) &&
      !isDirectRequireReference(node)
    ) {
      const boundTo =
        ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)
          ? node.parent.name.text
          : null;
      violations.push(
        boundTo
          ? `aliased module loader "require" bound to ${JSON.stringify(boundTo)}`
          : 'aliased module loader "require"',
      );
    }

    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return { references, violations, parseErrors };
}

function listSourceFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listSourceFiles(absolute));
    else if (entry.isFile() && SOURCE_FILE.test(entry.name) && !isTestSource(entry.name)) {
      out.push(absolute);
    }
  }
  return out;
}

/**
 * Read and syntax-scan every non-test source under the given scan roots.
 * Returns a flat list of errors; an empty list means the boundary holds.
 */
function scanBoundarySources(root, scanRoots) {
  const errors = [];
  for (const scanRoot of scanRoots) {
    const absoluteRoot = path.join(root, scanRoot);
    if (!fs.existsSync(absoluteRoot)) {
      errors.push(`scan root missing: ${scanRoot}`);
      continue;
    }
    for (const file of listSourceFiles(absoluteRoot)) {
      const relative = path.relative(root, file).replace(/\\/g, "/");
      let source;
      try {
        source = fs.readFileSync(file, "utf8");
      } catch (error) {
        errors.push(`unreadable source ${relative}: ${error.message}`);
        continue;
      }
      const { references, violations, parseErrors } = analyzeSource(source, relative);
      for (const message of parseErrors) errors.push(`malformed source ${relative}: ${message}`);
      for (const message of violations) errors.push(`unresolved import in ${relative}: ${message}`);
      for (const { specifier } of references) {
        if (!isAllowedSpecifier(specifier)) {
          errors.push(`forbidden import in ${relative}: ${JSON.stringify(specifier)}`);
        }
      }
    }
  }
  return errors;
}

// Every bundled v2 port lives at packages/yard-tools/<name>-v2. Discover
// them so a new port is boundary-scanned the moment it lands, without
// editing this list.
function discoverV2PortRoots(root) {
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

/** Parse a JSON manifest, failing with an entry-specific diagnostic. */
function readJson(errors, filePath, label) {
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    errors.push(`malformed definition ${label}: ${error.message}`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    errors.push(`malformed definition ${label}: ${error.message}`);
    return null;
  }
}

/**
 * Run the whole boundary check. Returns the list of problems; empty means
 * every rule holds. `options.root` and `options.scanRoots` exist for tests.
 */
function checkBoundaries(options = {}) {
  const root = options.root ?? path.resolve(__dirname, "..");
  const scanRoots = options.scanRoots ?? [...discoverV2PortRoots(root), "examples/extensions-v2"];
  const errors = [];

  // 1. Dependency-direction scan over the syntax tree.
  errors.push(...scanBoundarySources(root, scanRoots));

  // 2. Package inclusion wiring.
  const rootPackage = readJson(errors, path.join(root, "package.json"), "package.json");
  if (rootPackage) {
    const workspaces = rootPackage.workspaces ?? [];
    for (const expected of ["packages/*", "packages/yard-tools/*"]) {
      if (!workspaces.includes(expected)) {
        errors.push(`root package.json workspaces is missing ${JSON.stringify(expected)}`);
      }
    }
    if (rootPackage.scripts && rootPackage.scripts["example:selected-ids"]) {
      errors.push("package.json must not expose the retired example:selected-ids script.");
    }
  }

  const tsconfig = readJson(errors, path.join(root, "tsconfig.json"), "tsconfig.json");
  const paths = (tsconfig && tsconfig.compilerOptions && tsconfig.compilerOptions.paths) || {};
  if (!paths["@foleyard/*"]) {
    errors.push('tsconfig paths is missing the "@foleyard/*" wildcard');
  }

  const toolsDir = path.join(root, "packages", "yard-tools");
  if (fs.existsSync(toolsDir)) {
    for (const tool of fs.readdirSync(toolsDir)) {
      const toolDir = path.join(toolsDir, tool);
      if (!fs.statSync(toolDir).isDirectory()) continue;
      const packagePath = path.join(toolDir, "package.json");
      if (!fs.existsSync(packagePath)) {
        errors.push(`workspace package without package.json: packages/yard-tools/${tool}`);
        continue;
      }
      const manifest = readJson(errors, packagePath, `packages/yard-tools/${tool}/package.json`);
      if (!manifest) continue;
      const indexPath = path.join(toolDir, "src", "index.ts");
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
      } else {
        // Version 1 tools were retired; only `-v2` ports may exist.
        errors.push(`v1 tool package reintroduced: packages/yard-tools/${tool}`);
      }
    }
  }

  // 2b. Version 1 removal guards: the core v1 engine must stay deleted.
  if (fs.existsSync(path.join(root, "packages", "yard-core", "src", "extensions"))) {
    errors.push("packages/yard-core/src/extensions (v1 engine) must not exist.");
  }

  // 3. Production fixture exclusion wiring.
  const builder = readText(errors, path.join(root, "electron-builder.yml"), "electron-builder.yml");
  if (builder !== null && !builder.includes("!.next/server/app/prototype/**")) {
    errors.push("electron-builder.yml must exclude compiled prototype routes from packaged builds.");
  }
  const prototypeLayout = readText(
    errors,
    path.join(root, "src", "app", "prototype", "layout.tsx"),
    "src/app/prototype/layout.tsx",
  );
  if (prototypeLayout !== null && !prototypeLayout.includes("notFound()")) {
    errors.push("src/app/prototype/layout.tsx must resolve prototype routes to not-found in production.");
  }

  return errors;
}

function readText(errors, filePath, label) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    errors.push(`unreadable ${label}: ${error.message}`);
    return null;
  }
}

function main() {
  const errors = checkBoundaries();
  if (errors.length > 0) {
    console.error(`check-v2-boundaries: FAILED with ${errors.length} problem(s):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(OK_MESSAGE);
}

if (require.main === module) {
  main();
}

module.exports = {
  OK_MESSAGE,
  discoverV2PortRoots,
  isAllowedSpecifier,
  analyzeSource,
  listSourceFiles,
  scanBoundarySources,
  checkBoundaries,
};
