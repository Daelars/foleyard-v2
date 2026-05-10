const { execSync } = require("child_process");
const { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, rmSync } = require("fs");
const { join } = require("path");

function findTracedBetterSqlite3() {
  const tracedDir = join(__dirname, "..", ".next", "node_modules");
  if (!existsSync(tracedDir)) return null;

  const entries = readdirSync(tracedDir);
  const match = entries.find((e) => e.startsWith("better-sqlite3-"));

  if (!match) return null;
  return join(tracedDir, match);
}

function copyDirectory(source, destination) {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, {
    recursive: true,
    dereference: true,
    force: true,
  });
}

function materializeTracedPackage(tracedPkgDir) {
  const stat = lstatSync(tracedPkgDir);

  if (!stat.isSymbolicLink() && !stat.isDirectory()) {
    throw new Error(`Unexpected traced package entry: ${tracedPkgDir}`);
  }

  const realPath = realpathSync(tracedPkgDir);

  if (realPath !== tracedPkgDir) {
    console.log("[desktop-build] Materializing traced better-sqlite3 package...");
    copyDirectory(realPath, tracedPkgDir);
  }
}

function copyRuntimeDependency(packageName, tracedPkgDir) {
  const projectRoot = join(__dirname, "..");
  const packageJsonPath = require.resolve(`${packageName}/package.json`, {
    paths: [
      tracedPkgDir,
      join(projectRoot, "node_modules", ".bun", "node_modules"),
      join(projectRoot, "node_modules"),
    ],
  });
  const packageDir = join(packageJsonPath, "..");
  const targetDir = join(tracedPkgDir, "node_modules", packageName);

  if (existsSync(targetDir) && realpathSync(packageDir) === realpathSync(targetDir)) {
    return;
  }

  console.log(`[desktop-build] Copying runtime dependency ${packageName}...`);
  copyDirectory(packageDir, targetDir);
}

function copyRuntimeDependencies(tracedPkgDir) {
  copyRuntimeDependency("bindings", tracedPkgDir);
  copyRuntimeDependency("file-uri-to-path", tracedPkgDir);
}

function run() {
  const projectRoot = join(__dirname, "..");
  const tracedPkgDir = findTracedBetterSqlite3();
  if (!tracedPkgDir) {
    console.error("[desktop-build] No traced better-sqlite3 found in .next/node_modules/");
    console.error("[desktop-build] Run 'next build' first.");
    return false;
  }

  materializeTracedPackage(tracedPkgDir);
  copyRuntimeDependencies(tracedPkgDir);

  const binaryPath = join(tracedPkgDir, "build", "Release", "better_sqlite3.node");

  if (!existsSync(binaryPath)) {
    console.error("[desktop-build] No better_sqlite3.node in traced copy at:", binaryPath);
    return false;
  }

  console.log("[desktop-build] Rebuilding traced better-sqlite3 for Electron ABI...");
  console.log("[desktop-build]   Location:", tracedPkgDir);

  try {
    const electronPackageJson = require(join(projectRoot, "node_modules", "electron", "package.json"));
    const electronVersion = electronPackageJson.version;

    execSync(
      `npx node-gyp rebuild --release --runtime=electron --target=${electronVersion} --dist-url=https://electronjs.org/headers`,
      {
        cwd: tracedPkgDir,
        stdio: "inherit",
        timeout: 120000,
        shell: true,
      },
    );
    console.log("[desktop-build] Electron rebuild complete");
    return true;
  } catch (err) {
    console.error("[desktop-build] Electron ABI rebuild failed:", err.message);
    return false;
  }
}

if (require.main === module) {
  const ok = run();
  process.exit(ok ? 0 : 1);
}

module.exports = { run };
