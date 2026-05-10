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

function getWorkingTreeStatus() {
  return run("git", ["status", "--porcelain"]);
}

function assertCleanWorkingTree() {
  const status = getWorkingTreeStatus();

  if (status) {
    throw new Error(
      [
        "Working tree is not clean.",
        "Commit or stash your changes before preparing a release.",
        "Current changes:",
        status,
      ].join("\n"),
    );
  }
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
  const shouldPush = args.includes("--push");
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
    return;
  }

  if (nextVersion === previousVersion && !resumeVersionBump) {
    console.log(`[release] version is already ${nextVersion}; creating missing tag only`);
    run("git", ["tag", "-a", tagName, "-m", `Release ${nextVersion}`], { stdio: "inherit" });

    if (shouldPush) {
      run("git", ["push", "origin", "HEAD"], { stdio: "inherit" });
      run("git", ["push", "origin", tagName], { stdio: "inherit" });
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
    run("git", ["push", "origin", "HEAD"], { stdio: "inherit" });
    run("git", ["push", "origin", tagName], { stdio: "inherit" });
  }

  console.log(`[release] prepared ${tagName}`);
}

main();
