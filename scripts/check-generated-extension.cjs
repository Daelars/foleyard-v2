#!/usr/bin/env node
/**
 * Prove a generated v2 extension package passes the CI gates (#310).
 *
 * The scaffold template (`scripts/scaffold-extension-v2.cjs`) used to
 * match the real v2 API only by luck: nothing ran its output through
 * typecheck, the dependency-boundary scan, or the generated test suite,
 * so a contract change (for example the operations port type, #265) could
 * leave the template generating code that no longer compiles. This script
 * scaffolds a fresh package and runs the documented verification path
 * against it:
 *
 *   1. typecheck  — `tsc --noEmit` over the generated sources
 *   2. boundaries — `check-v2-boundaries.cjs --scan-root <generated src>`
 *   3. tests      — the generated package's own vitest suite
 *
 * Usage:
 *   node scripts/check-generated-extension.cjs                # scaffold + verify
 *   node scripts/check-generated-extension.cjs --dir <path>   # verify an existing scaffold
 *   node scripts/check-generated-extension.cjs --keep         # keep the scaffolded dir
 *
 * The scaffold lands under the gitignored `.next/` build output and is
 * removed afterwards unless `--keep` is given. Exits non-zero, printing
 * the failing step's output, when any gate fails.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const PROBE_ROOT = path.join(root, ".next");
const SCAFFOLD = path.join(root, "scripts", "scaffold-extension-v2.cjs");
const BOUNDARIES = path.join(root, "scripts", "check-v2-boundaries.cjs");
const TSC = path.join(root, "node_modules", "typescript", "bin", "tsc");
const VITEST = path.join(root, "node_modules", "vitest", "vitest.mjs");

const GENERATED_FILES = [
  "package.json",
  "src/definition.ts",
  "src/handlers.ts",
  "src/index.ts",
  "src/handlers.test.ts",
  "README.md",
];

function fail(message) {
  console.error(`check-generated-extension: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { dir: null, keep: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--dir" && argv[i + 1]) args.dir = path.resolve(root, argv[++i]);
    else if (argv[i] === "--keep") args.keep = true;
    else fail(`unknown argument ${JSON.stringify(argv[i])} (see the header for usage)`);
  }
  return args;
}

function relativeToRoot(absolute) {
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    fail(`path must stay inside the repository: ${absolute}`);
  }
  return relative.split(path.sep).join("/");
}

/** Run a child process, returning captured output instead of throwing. */
function run(command, args, label) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  if (result.error) {
    console.error(output);
    fail(`${label} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    console.error(output);
    fail(`${label} FAILED (exit ${result.status ?? "?"})`);
  }
  return output;
}

function writeProbeTsconfig(dir) {
  // Explicit config (no `extends` path semantics): the probe resolves
  // `yard-core` from source exactly like the repository tsconfig does.
  const config = {
    compilerOptions: {
      target: "ES2017",
      lib: ["dom", "dom.iterable", "esnext"],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: "esnext",
      moduleResolution: "bundler",
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: "react-jsx",
      incremental: false,
      baseUrl: root,
      paths: { "yard-core": ["./packages/yard-core/src/index.ts"] },
      types: ["node"],
    },
    include: ["src/**/*.ts"],
    exclude: [],
  };
  const configPath = path.join(dir, "tsconfig.generated.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

function verify(dir) {
  for (const relative of GENERATED_FILES) {
    if (!fs.existsSync(path.join(dir, relative))) {
      fail(`generated package is missing ${relative} in ${relativeToRoot(dir)}`);
    }
  }
  const relativeDir = relativeToRoot(dir);

  console.log("check-generated-extension: typecheck");
  const configPath = writeProbeTsconfig(dir);
  run(process.execPath, [TSC, "--noEmit", "-p", configPath], "typecheck");

  console.log("check-generated-extension: boundaries");
  run(
    process.execPath,
    [BOUNDARIES, "--scan-root", `${relativeDir}/src`],
    "boundaries",
  );

  console.log("check-generated-extension: generated tests");
  run(
    process.execPath,
    [VITEST, "run", `${relativeDir}/src/handlers.test.ts`, "--no-coverage"],
    "generated tests",
  );
}

function scaffoldFresh() {
  fs.mkdirSync(PROBE_ROOT, { recursive: true });
  const dir = fs.mkdtempSync(path.join(PROBE_ROOT, "generated-extension-"));
  run(
    process.execPath,
    [SCAFFOLD, "--name", "scaffold-probe-v2", "--out", dir, "--force"],
    "scaffold",
  );
  return dir;
}

const args = parseArgs(process.argv.slice(2));
let dir = args.dir;
let fresh = false;

try {
  if (!dir) {
    dir = scaffoldFresh();
    fresh = true;
  } else if (!fs.existsSync(dir)) {
    fail(`--dir does not exist: ${dir}`);
  }
  verify(dir);
  console.log(
    "check-generated-extension: generated extension package: OK (typecheck, boundaries, tests).",
  );
} finally {
  if (fresh && !args.keep) fs.rmSync(dir, { recursive: true, force: true });
}
