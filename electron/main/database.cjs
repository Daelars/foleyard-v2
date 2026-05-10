const fs = require("fs");
const os = require("os");
const path = require("path");

const { app } = require("electron");

const {
  APP_NAME,
  DATABASE_FILENAME,
  LEGACY_APP_NAMES,
  LEGACY_DATABASE_FILENAMES,
} = require("./constants.cjs");

function getLegacyDatabasePath() {
  return path.join(process.cwd(), DATABASE_FILENAME);
}

function getLegacyProjectDatabasePaths() {
  return LEGACY_DATABASE_FILENAMES.map((filename) =>
    path.join(process.cwd(), filename),
  );
}

function getDesktopUserDataDir() {
  return (
    app.getPath("userData") ||
    path.join(
      process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"),
      APP_NAME,
    )
  );
}

function getLegacyDesktopUserDataDirs() {
  const baseDir =
    process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  return LEGACY_APP_NAMES.map((name) => path.join(baseDir, name));
}

function getDatabasePath() {
  return path.join(getDesktopUserDataDir(), DATABASE_FILENAME);
}

function readPackageMetadata() {
  try {
    return require(path.join(app.getAppPath(), "package.json"));
  } catch {
    return {};
  }
}

function getPackagedBuildId() {
  try {
    return fs.readFileSync(path.join(app.getAppPath(), ".next", "BUILD_ID"), "utf-8").trim();
  } catch {
    return null;
  }
}

function removeDatabaseFiles(databasePath) {
  for (const filePath of [databasePath, `${databasePath}-shm`, `${databasePath}-wal`]) {
    try {
      fs.rmSync(filePath, { force: true });
    } catch {}
  }
}

function resetDesktopDatabaseForBuild() {
  const metadata = readPackageMetadata();

  if (metadata.foleyardResetDatabaseOnBuild !== true) {
    return;
  }

  const buildId = getPackagedBuildId();

  if (!buildId) {
    return;
  }

  const userDataDir = getDesktopUserDataDir();
  const markerPath = path.join(userDataDir, "database-reset-build-id");

  try {
    const previousBuildId = fs.existsSync(markerPath)
      ? fs.readFileSync(markerPath, "utf-8").trim()
      : null;

    if (previousBuildId === buildId) {
      return;
    }

    fs.mkdirSync(userDataDir, { recursive: true });
    const databasePath = getDatabasePath();
    removeDatabaseFiles(databasePath);
    fs.closeSync(fs.openSync(databasePath, "w"));
    fs.writeFileSync(markerPath, buildId);
  } catch (error) {
    console.warn("Failed to reset desktop database for build", error);
  }
}

function ensureDesktopDatabaseInitialized() {
  const databasePath = getDatabasePath();
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });

  if (fs.existsSync(databasePath)) {
    return databasePath;
  }

  const candidatePaths = [
    getLegacyDatabasePath(),
    ...getLegacyProjectDatabasePaths(),
    ...getLegacyDesktopUserDataDirs().flatMap((dir) => [
      path.join(dir, DATABASE_FILENAME),
      ...LEGACY_DATABASE_FILENAMES.map((filename) => path.join(dir, filename)),
    ]),
  ];

  for (const candidatePath of candidatePaths) {
    if (candidatePath !== databasePath && fs.existsSync(candidatePath)) {
      fs.copyFileSync(candidatePath, databasePath);
      return databasePath;
    }
  }

  return databasePath;
}

module.exports = {
  ensureDesktopDatabaseInitialized,
  getDatabasePath,
  getDesktopUserDataDir,
  resetDesktopDatabaseForBuild,
};
