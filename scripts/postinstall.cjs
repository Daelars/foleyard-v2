const { execSync } = require("child_process");
const { existsSync, mkdirSync, unlinkSync, writeFileSync } = require("fs");
const { dirname, join } = require("path");
const https = require("https");
const http = require("http");

const BETTER_SQLITE3_VERSION = "12.9.0";
const NODE_MODULE_VERSION = "137";
const PLATFORM = process.platform;
const ARCH = process.arch;

function resolveBetterSqlite3() {
  try {
    const resolved = execSync(
      `node -e "console.log(require.resolve('better-sqlite3'))"`,
      { encoding: "utf-8", timeout: 10000, cwd: join(__dirname, "..") },
    ).trim();
    if (!resolved) return null;
    return resolved;
  } catch {
    return null;
  }
}

function findBinary(dir) {
  if (!dir) return null;
  const releaseDir = join(dir, "build", "Release");
  const binary = join(releaseDir, "better_sqlite3.node");
  return existsSync(binary) ? binary : null;
}

function downloadWithRedirects(url, redirectLimit = 10) {
  return new Promise((resolve, reject) => {
    const doRequest = (currentUrl, redirectsLeft) => {
      const isHttps = currentUrl.startsWith("https");
      const mod = isHttps ? https : http;

      mod.get(currentUrl, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400) {
          if (redirectsLeft <= 0) {
            reject(new Error(`Too many redirects`));
            return;
          }
          const location = res.headers.location;
          if (!location) {
            reject(new Error(`Redirect with no Location header`));
            return;
          }
          const nextUrl = location.startsWith("http") ? location : new URL(location, currentUrl).href;
          res.resume();
          doRequest(nextUrl, redirectsLeft - 1);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => resolve(Buffer.concat(chunks)));
      }).on("error", reject);
    };

    doRequest(url, redirectLimit);
  });
}

function tryDownload(dir) {
  const releaseDir = join(dir, "build", "Release");
  mkdirSync(releaseDir, { recursive: true });
  const url = `https://github.com/WiseLibs/better-sqlite3/releases/download/v${BETTER_SQLITE3_VERSION}/better-sqlite3-v${BETTER_SQLITE3_VERSION}-node-v${NODE_MODULE_VERSION}-${PLATFORM}-${ARCH}.tar.gz`;
  const tgz = join(releaseDir, ".tmp.tar.gz");

  console.log(`[postinstall] downloading better-sqlite3 prebuild:\n  ${url}`);

  return downloadWithRedirects(url)
    .then((buf) => {
      writeFileSync(tgz, buf);
      execSync(`tar -xzf "${tgz}" -C "${releaseDir}" --strip-components=2`, {
        stdio: "pipe",
      });
      unlinkSync(tgz);
      return true;
    })
    .catch((err) => {
      console.error(`[postinstall] prebuild download failed: ${err.message}`);
      return false;
    });
}

function tryBuildFromSource(dir) {
  console.log("[postinstall] trying to build better-sqlite3 from source...");
  try {
    execSync("npx --no-install node-gyp rebuild --release || npx node-gyp rebuild --release", {
      cwd: dir,
      stdio: "inherit",
      shell: true,
      timeout: 120000,
    });
    return true;
  } catch (e) {
    console.log(`[postinstall] node-gyp rebuild failed: ${e.message}`);
    return false;
  }
}

async function ensureBinary(dir) {
  const releaseDir = join(dir, "build", "Release");
  const binaryPath = join(releaseDir, "better_sqlite3.node");

  const ok = await tryDownload(dir);
  if (ok && existsSync(binaryPath)) return true;

  return await tryBuildFromSource(dir);
}

async function main() {
  const resolvedPath = resolveBetterSqlite3();
  if (!resolvedPath) {
    console.log("[postinstall] better-sqlite3 not found via require.resolve, skipping");
    return;
  }

  const pkgDir = dirname(dirname(resolvedPath));
  const binaryPath = findBinary(pkgDir);

  let needsRebuild = true;
  if (binaryPath) {
    try {
      execSync(
        `node -e "require(process.argv[1])" ${JSON.stringify(binaryPath)}`,
        { stdio: "pipe", timeout: 10000 },
      );
      needsRebuild = false;
    } catch {
      needsRebuild = true;
    }
  }

  if (!needsRebuild) {
    console.log("[postinstall] better-sqlite3 binary ok");
    return;
  }

  console.log("[postinstall] binary incompatible or missing, rebuilding...");
  const ok = await ensureBinary(pkgDir);

  if (!ok) {
    console.error("[postinstall] all attempts failed. The native module is missing.");
    return;
  }

  const finalBinary = findBinary(pkgDir);
  if (finalBinary) {
    try {
      execSync(
        `node -e "require(process.argv[1])" ${JSON.stringify(finalBinary)}`,
        { stdio: "pipe", timeout: 10000 },
      );
      console.log("[postinstall] better-sqlite3 binary ok");
    } catch {
      console.error("[postinstall] binary still incompatible after all attempts");
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { main };
