import fs from "fs";
import os from "os";
import path from "path";
import { createRequire } from "node:module";

const loadNativeModule = createRequire(import.meta.url);

const DATABASE_FILENAME = "foleyard.sqlite";
const LEGACY_DATABASE_FILENAMES = ["soundslop.sqlite"];
const DESKTOP_APP_NAME = "Foleyard";
const LEGACY_DESKTOP_APP_NAMES = ["SoundSlop"];
const DESKTOP_ENV_KEYS = ["FOLEYARD_DESKTOP", "SOUNDSLOP_DESKTOP"];

export function isDesktopDatabaseMode() {
  return DESKTOP_ENV_KEYS.some((key) => process.env[key] === "1");
}

function getProjectDatabasePath() {
  return path.join(process.cwd(), DATABASE_FILENAME);
}

function getLegacyProjectDatabasePaths() {
  return [path.join(process.cwd(), "soundslop.sqlite")];
}

export function getDesktopUserDataDir() {
  const appDataDir = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appDataDir, DESKTOP_APP_NAME);
}

function getLegacyDesktopUserDataDirs() {
  const appDataDir = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
  return LEGACY_DESKTOP_APP_NAMES.map((name) => path.join(appDataDir, name));
}

export function getDatabasePath() {
  if (isDesktopDatabaseMode()) {
    return path.join(getDesktopUserDataDir(), DATABASE_FILENAME);
  }

  return getProjectDatabasePath();
}

/**
 * Copies `sourcePath` into `targetPath` as one consistent SQLite snapshot.
 *
 * `VACUUM INTO` reads through the SQLite engine, so committed transactions
 * still held in the source's write-ahead log are included; a plain copy of
 * the main database file would silently drop them (#270). The snapshot is
 * written to a sibling temporary file and only renamed into place once it is
 * complete, so a failed copy leaves no partial target behind and the next
 * startup can retry.
 */
export function copyDatabaseSnapshot(sourcePath: string, targetPath: string) {
  const BetterSqlite3 = loadNativeModule(
    "better-sqlite3",
  ) as typeof import("better-sqlite3");
  const temporaryPath = `${targetPath}.migrating`;
  fs.rmSync(temporaryPath, { force: true });

  try {
    const source = new BetterSqlite3(sourcePath, {
      readonly: true,
      fileMustExist: true,
    });

    try {
      source.prepare("VACUUM INTO ?").run(temporaryPath);
    } finally {
      source.close();
    }

    fs.renameSync(temporaryPath, targetPath);
  } catch (error) {
    fs.rmSync(temporaryPath, { force: true });
    throw error;
  }
}

export function ensureDesktopDatabaseInitialized(databasePath = getDatabasePath()) {
  const isDesktopMode = isDesktopDatabaseMode();

  if (isDesktopMode) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  }

  if (fs.existsSync(databasePath)) {
    return;
  }

  const candidatePaths = isDesktopMode
    ? [
        getProjectDatabasePath(),
        ...getLegacyProjectDatabasePaths(),
        ...getLegacyDesktopUserDataDirs().flatMap((dir) => [
          path.join(dir, DATABASE_FILENAME),
          ...LEGACY_DATABASE_FILENAMES.map((filename) => path.join(dir, filename)),
        ]),
      ]
    : getLegacyProjectDatabasePaths();

  for (const candidatePath of candidatePaths) {
    if (candidatePath !== databasePath && fs.existsSync(candidatePath)) {
      copyDatabaseSnapshot(candidatePath, databasePath);
      return;
    }
  }
}
