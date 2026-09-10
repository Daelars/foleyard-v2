const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function run(command, args, options = {}) {
  const output = execFileSync(command, args, {
    cwd: root,
    encoding: "utf-8",
    stdio: options.stdio ?? "pipe",
  });

  return typeof output === "string" ? output.trim() : "";
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-.+)?$/.exec(version);

  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }

  return match.slice(1).map((part) => Number(part));
}

function incrementVersion(version, bump) {
  const [major, minor, patch] = parseVersion(version);

  if (/^\d+\.\d+\.\d+$/.test(bump)) {
    return bump;
  }

  if (bump === "major") {
    return `${major + 1}.0.0`;
  }

  if (bump === "minor") {
    return `${major}.${minor + 1}.0`;
  }

  if (bump === "patch") {
    return `${major}.${minor}.${patch + 1}`;
  }

  throw new Error(`Expected bump to be patch, minor, major, or x.y.z. Received: ${bump}`);
}

function isResumableVersionBumpStatus(status) {
  const lines = status.split("\n").filter(Boolean);
  const allowed = new Set(["package.json", "package-lock.json"]);

  return (
    lines.length > 0 &&
    lines.every((line) => {
      const filePath = line.slice(3);
      const indexStatus = line[0];
      const worktreeStatus = line[1];
      return allowed.has(filePath) && indexStatus === "M" && worktreeStatus === " ";
    })
  );
}

function assertCleanOrResumableWorkingTree() {
  const status = run("git", ["status", "--porcelain"]);

  if (!status) {
    return false;
  }

  if (isResumableVersionBumpStatus(status)) {
    return true;
  }

  throw new Error(
    [
      "Working tree is not clean.",
      "Commit or stash your changes before preparing a release.",
      "Current changes:",
      status,
    ].join("\n"),
  );
}

function tagExists(tagName) {
  try {
    run("git", ["rev-parse", "--verify", "--quiet", `refs/tags/${tagName}`]);
    return true;
  } catch {
    return false;
  }
}

function isAncestor(ancestor, descendant) {
  try {
    run("git", ["merge-base", "--is-ancestor", ancestor, descendant]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Push the release commit and tag. With `--cut` also fast-forward `main`
 * to the released commit so `main` records exactly what shipped, then
 * push the tag last so the release workflow builds from a commit that is
 * already on `main`. Aborts when `main` has diverged; always returns to
 * the original branch.
 */
function publishRelease(tagName, currentBranch, cut) {
  run("git", ["push", "origin", "HEAD"], { stdio: "inherit" });

  if (!cut) {
    run("git", ["push", "origin", tagName], { stdio: "inherit" });
    return;
  }

  run("git", ["fetch", "origin", "main"], { stdio: "inherit" });
  if (!isAncestor("origin/main", "HEAD")) {
    throw new Error(
      "origin/main has commits this release does not contain; merge or rebase main before cutting.",
    );
  }

  try {
    run("git", ["checkout", "main"], { stdio: "inherit" });
    run("git", ["merge", "--ff-only", currentBranch], { stdio: "inherit" });
    run("git", ["push", "origin", "main"], { stdio: "inherit" });
    run("git", ["push", "origin", tagName], { stdio: "inherit" });
  } finally {
    run("git", ["checkout", currentBranch], { stdio: "inherit" });
  }
}

function updatePackageLock(nextVersion) {
  const lockPath = path.join(root, "package-lock.json");

  if (!fs.existsSync(lockPath)) {
    return false;
  }

  const lock = readJson(lockPath);
  lock.version = nextVersion;

  if (lock.packages?.[""]) {
    lock.packages[""].version = nextVersion;
  }

  writeJson(lockPath, lock);
  return true;
}

function main() {
  const args = process.argv.slice(2);
  const bump = args.find((arg) => !arg.startsWith("--")) ?? "patch";
  const shouldCut = args.includes("--cut");
  const shouldPush = args.includes("--push") || shouldCut;
  const dryRun = args.includes("--dry-run");

  const resumeVersionBump = assertCleanOrResumableWorkingTree();

  const packagePath = path.join(root, "package.json");
  const packageJson = readJson(packagePath);
  const previousVersion = packageJson.version;
  const nextVersion = resumeVersionBump ? previousVersion : incrementVersion(previousVersion, bump);
  const tagName = `v${nextVersion}`;

  if (tagExists(tagName)) {
    throw new Error(`Tag already exists: ${tagName}`);
  }

  if (resumeVersionBump) {
    console.log(`[release] resuming prepared ${nextVersion}`);
  } else {
    console.log(`[release] ${previousVersion} -> ${nextVersion}`);
  }

  if (dryRun) {
    console.log(`[release] dry run; would commit and tag ${tagName}`);
    if (shouldPush) {
      console.log("[release] dry run; would push commit and tag");
    }
    if (shouldCut) {
      console.log("[release] dry run; would fast-forward main and push it");
    }
    return;
  }

  if (nextVersion === previousVersion && !resumeVersionBump) {
    console.log(`[release] version is already ${nextVersion}; creating missing tag only`);
    run("git", ["tag", "-a", tagName, "-m", `Release ${nextVersion}`], { stdio: "inherit" });

    if (shouldPush) {
      const currentBranch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
      publishRelease(tagName, currentBranch, shouldCut);
    }

    console.log(`[release] prepared ${tagName}`);
    return;
  }

  let updatedLock = fs.existsSync(path.join(root, "package-lock.json"));

  if (!resumeVersionBump) {
    packageJson.version = nextVersion;
    writeJson(packagePath, packageJson);
    updatedLock = updatePackageLock(nextVersion);
  }

  const filesToCommit = ["package.json"];
  if (updatedLock) {
    filesToCommit.push("package-lock.json");
  }

  run("git", ["add", ...filesToCommit], { stdio: "inherit" });
  run("git", ["commit", "-m", `Release ${nextVersion}`], { stdio: "inherit" });
  run("git", ["tag", "-a", tagName, "-m", `Release ${nextVersion}`], { stdio: "inherit" });

  if (shouldPush) {
    const currentBranch = run("git", ["rev-parse", "--abbrev-ref", "HEAD"]);
    publishRelease(tagName, currentBranch, shouldCut);
  }

  console.log(`[release] prepared ${tagName}`);
}

main();
