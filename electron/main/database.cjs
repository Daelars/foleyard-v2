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
};
