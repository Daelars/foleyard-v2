// Writes build provenance next to the Next build output so the packaged app
// can report the same identity the docs manifest carries:
// `.next/build-provenance.json` with sourceRevision, sourceDirty and buildId.
//
// Runs after `next build` (BUILD_ID exists) and before electron-builder.
// `SOURCE_REVISION` overrides git; `FOLEYARD_SOURCE_DIRTY=true|false`
// overrides the working-tree check. Usage:
//   node scripts/write-build-provenance.cjs
//
// The server runtime and desktop identity both read this file, so they report
// the same build id and revision (#241).

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");

function tryExec(cmd) {
  try {
    return execSync(cmd, { cwd: root, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

const sourceRevision =
  process.env.SOURCE_REVISION || tryExec("git rev-parse HEAD") || "unknown";
const statusOutput = tryExec("git status --porcelain");
const sourceDirty =
  process.env.FOLEYARD_SOURCE_DIRTY === "true"
    ? true
    : process.env.FOLEYARD_SOURCE_DIRTY === "false"
      ? false
      : statusOutput === null
        ? false
        : statusOutput.length > 0;

let buildId = null;
const buildIdPath = path.join(root, ".next", "BUILD_ID");
if (fs.existsSync(buildIdPath)) {
  buildId = fs.readFileSync(buildIdPath, "utf8").trim() || null;
}

const provenance = {
  productVersion: JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8"),
  ).version,
  buildId,
  sourceRevision,
  sourceDirty,
  generatedAt: new Date().toISOString(),
};

fs.mkdirSync(path.join(root, ".next"), { recursive: true });
fs.writeFileSync(
  path.join(root, ".next", "build-provenance.json"),
  `${JSON.stringify(provenance, null, 2)}\n`,
);

console.log(
  `write-build-provenance: build ${buildId ?? "none"}, revision ${sourceRevision}${sourceDirty ? " (dirty)" : ""}.`,
);
