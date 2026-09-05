const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { dirname, join } = require("node:path");
const { createHash } = require("node:crypto");
const https = require("node:https");

class IntegrityError extends Error {}
function verifyDigest(buffer, digest) {
  if (!/^sha256:[a-f0-9]{64}$/.test(digest ?? "")) throw new IntegrityError("Release asset has no valid SHA-256 digest");
  if ("sha256:" + createHash("sha256").update(buffer).digest("hex") !== digest) throw new IntegrityError("Native module checksum mismatch");
}
function downloadWithRedirects(url, redirectLimit = 10) {
  return new Promise((resolve, reject) => {
    const request = (currentUrl, redirectsLeft) => {
      const target = new URL(currentUrl);
      if (target.protocol !== "https:") { reject(new IntegrityError("Refusing a non-HTTPS download or redirect")); return; }
      const req = https.get(target, { headers: { "User-Agent": "Foleyard-postinstall", Accept: "application/vnd.github+json" } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400) {
          res.resume();
          if (!res.headers.location || redirectsLeft <= 0) { reject(new Error("Invalid or excessive redirects")); return; }
          request(new URL(res.headers.location, target).href, redirectsLeft - 1); return;
        }
        if (res.statusCode !== 200) { res.resume(); reject(new Error("HTTP " + res.statusCode)); return; }
        const chunks = []; let bytes = 0;
        res.on("data", chunk => { bytes += chunk.length; if (bytes > 128 * 1024 * 1024) req.destroy(new Error("Download exceeds size limit")); else chunks.push(chunk); });
        res.on("end", () => resolve(Buffer.concat(chunks)));
        res.on("error", reject);
        res.on("aborted", () => reject(new Error("Download interrupted")));
      });
      req.setTimeout(30000, () => req.destroy(new Error("Download timed out")));
      req.on("error", reject);
    };
    request(url, redirectLimit);
  });
}
async function tryDownload(dir) {
  const version = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")).version;
  const assetName = `better-sqlite3-v${version}-node-v${process.versions.modules}-${process.platform}-${process.arch}.tar.gz`;
  const release = JSON.parse((await downloadWithRedirects(`https://api.github.com/repos/WiseLibs/better-sqlite3/releases/tags/v${version}`)).toString("utf8"));
  const asset = release.assets?.find(candidate => candidate.name === assetName);
  if (!asset) throw new Error("No prebuild for " + assetName);
  const buffer = await downloadWithRedirects(asset.browser_download_url);
  verifyDigest(buffer, asset.digest);
  const releaseDir = join(dir, "build", "Release");
  mkdirSync(releaseDir, { recursive: true });
  const archive = join(releaseDir, ".verified-prebuild.tar.gz");
  try {
    writeFileSync(archive, buffer);
    execFileSync("tar", ["-xzf", archive, "-C", releaseDir, "--strip-components=2"], { stdio: "pipe" });
  } finally { rmSync(archive, { force: true }); }
}
function assertBinary(binary) {
  execFileSync(process.execPath, ["-e", "const Database = require(process.argv[1]);", binary], { stdio: "pipe", timeout: 10000 });
}
async function main() {
  const pkg = require.resolve("better-sqlite3/package.json");
  const dir = dirname(pkg);
  const binary = join(dir, "build", "Release", "better_sqlite3.node");
  if (existsSync(binary)) {
    try { assertBinary(binary); console.log("[postinstall] better-sqlite3 binary ok"); return; } catch {}
  }
  try { await tryDownload(dir); }
  catch (error) {
    if (error instanceof IntegrityError) throw error;
    console.error("[postinstall] prebuild unavailable, building from source:", error.message);
    const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js");
    execFileSync(process.execPath, [nodeGyp, "rebuild", "--release"], { cwd: dir, stdio: "inherit", timeout: 120000 });
  }
  assertBinary(binary);
  console.log("[postinstall] verified native module ready");
}
if (require.main === module) main().catch(error => { console.error("[postinstall]", error); process.exitCode = 1; });
module.exports = { main, downloadWithRedirects, verifyDigest, tryDownload };
