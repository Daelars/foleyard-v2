import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire, Module } from "node:module";

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  copyDatabaseSnapshot,
  ensureDesktopDatabaseInitialized,
} from "@/lib/database-path";

// Area: database migration (#270). A legacy or project database must migrate
// as one consistent SQLite snapshot. Committed transactions still held in the
// write-ahead log are part of the database; copying only the main file
// silently drops them, and any partial target suppresses the next attempt.

const WAL_ROWS = 6;

type OpenDatabase = InstanceType<typeof Database>;

/** A database whose committed rows live only in the -wal sidecar. */
function openWalDatabase(filePath: string, rows = WAL_ROWS): OpenDatabase {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const db = new Database(filePath);
  db.pragma("journal_mode = WAL");
  db.pragma("wal_autocheckpoint = 0");
  db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
  const insert = db.prepare("INSERT INTO t (v) VALUES (?)");
  for (let i = 0; i < rows; i += 1) {
    insert.run(`row-${i}`);
  }
  return db;
}

function countRows(filePath: string): number {
  const db = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    return (db.prepare("SELECT COUNT(*) AS c FROM t").get() as { c: number }).c;
  } finally {
    db.close();
  }
}

const cjsRequire = createRequire(import.meta.url);

type LoadFn = (this: unknown, request: string, ...rest: unknown[]) => unknown;
const ModuleWithLoad = Module as unknown as { _load: LoadFn };
const originalLoad = ModuleWithLoad._load;

interface FakeElectron {
  app: { getPath: (name: string) => string; getAppPath: () => string };
}

let electronFake: FakeElectron;
let electronUserDataDir: string;

function installLoadInterception() {
  ModuleWithLoad._load = function (request: string, ...rest: unknown[]) {
    if (request === "electron") return electronFake;
    return originalLoad.call(this, request, ...rest);
  };
}

function restoreLoadInterception() {
  ModuleWithLoad._load = originalLoad;
}

function dropElectronModulesFromCache() {
  for (const key of Object.keys(cjsRequire.cache)) {
    if (key.includes(`electron${path.sep}main`)) delete cjsRequire.cache[key];
  }
}

function requireElectronMain<T>(relativePath: string): T {
  return cjsRequire(`../../../electron/main/${relativePath}`) as T;
}

describe("legacy database migration is WAL-safe (#270)", () => {
  let scratch: string;
  let cwdDir: string;
  let appData: string;
  let legacyDir: string;
  let legacySource: string;
  let desktopTarget: string;
  let openDatabases: OpenDatabase[] = [];
  const savedEnv: Record<string, string | undefined> = {};

  function track(db: OpenDatabase): OpenDatabase {
    openDatabases.push(db);
    return db;
  }

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-wal-"));
    cwdDir = path.join(scratch, "cwd");
    appData = path.join(scratch, "appdata");
    legacyDir = path.join(appData, "SoundSlop");
    legacySource = path.join(legacyDir, "soundslop.sqlite");
    desktopTarget = path.join(appData, "Foleyard", "foleyard.sqlite");
    fs.mkdirSync(cwdDir, { recursive: true });
    fs.mkdirSync(legacyDir, { recursive: true });

    for (const key of ["APPDATA", "FOLEYARD_DESKTOP"]) {
      savedEnv[key] = process.env[key];
    }
    savedEnv.cwd = process.cwd();
    process.chdir(cwdDir);
    process.env.APPDATA = appData;
    process.env.FOLEYARD_DESKTOP = "1";

    electronUserDataDir = path.join(scratch, "userdata");
    electronFake = {
      app: {
        getPath: () => electronUserDataDir,
        getAppPath: () => process.cwd(),
      },
    };
    installLoadInterception();
    dropElectronModulesFromCache();
  });

  afterEach(() => {
    restoreLoadInterception();
    dropElectronModulesFromCache();
    for (const db of openDatabases) {
      try {
        db.close();
      } catch {
        /* already closed */
      }
    }
    openDatabases = [];
    process.chdir(savedEnv.cwd ?? process.cwd());
    for (const [key, value] of Object.entries(savedEnv)) {
      if (key === "cwd") continue;
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    try {
      fs.rmSync(scratch, { recursive: true, force: true });
    } catch {
      /* Windows can hold a handle briefly; the temp root is disposable. */
    }
    vi.restoreAllMocks();
  });

  it("project path migrates committed WAL rows into the target snapshot", () => {
    const source = track(openWalDatabase(legacySource));
    expect(fs.statSync(`${legacySource}-wal`).size).toBeGreaterThan(0);

    // Premise: a copy of the main file alone loses the committed rows.
    const naive = path.join(scratch, "naive.sqlite");
    fs.copyFileSync(legacySource, naive);
    expect(() => countRows(naive)).toThrow();

    ensureDesktopDatabaseInitialized();

    expect(fs.existsSync(desktopTarget)).toBe(true);
    expect(countRows(desktopTarget)).toBe(WAL_ROWS);
    source.close();
  });

  it("desktop runtime path migrates committed WAL rows into the target snapshot", () => {
    const source = track(openWalDatabase(legacySource));

    const { ensureDesktopDatabaseInitialized: ensureDesktop } =
      requireElectronMain<{ ensureDesktopDatabaseInitialized: () => string }>(
        "database.cjs",
      );

    const target = ensureDesktop();

    expect(target).toBe(path.join(electronUserDataDir, "foleyard.sqlite"));
    expect(fs.existsSync(target)).toBe(true);
    expect(countRows(target)).toBe(WAL_ROWS);
    expect(fs.existsSync(`${target}.migrating`)).toBe(false);
    source.close();
  });

  it("a failed migration leaves no target and a later attempt succeeds", () => {
    fs.writeFileSync(legacySource, "this is not a sqlite database");

    expect(() => ensureDesktopDatabaseInitialized()).toThrow();
    expect(fs.existsSync(desktopTarget)).toBe(false);
    expect(fs.existsSync(`${desktopTarget}.migrating`)).toBe(false);

    // The failed attempt must not suppress the next one: drop the corrupt
    // legacy file, leave a good one behind, and retry.
    fs.rmSync(legacySource, { force: true });

    const healed = track(openWalDatabase(legacySource));

    ensureDesktopDatabaseInitialized();

    expect(countRows(desktopTarget)).toBe(WAL_ROWS);
    healed.close();
  });

  it("repeated startup does not overwrite an already migrated target", () => {
    track(openWalDatabase(legacySource)).close();

    ensureDesktopDatabaseInitialized();
    expect(countRows(desktopTarget)).toBe(WAL_ROWS);

    // A second startup with freshly changed legacy data must not re-migrate
    // over the target that already exists.
    fs.writeFileSync(legacySource, "replaced with garbage");
    ensureDesktopDatabaseInitialized();

    expect(countRows(desktopTarget)).toBe(WAL_ROWS);
  });

  it("the shared snapshot helper rejects an unreadable source and leaves no partial target", () => {
    const target = path.join(scratch, "snapshot.sqlite");
    fs.writeFileSync(legacySource, "this is not a sqlite database");

    expect(() => copyDatabaseSnapshot(legacySource, target)).toThrow();

    expect(fs.existsSync(target)).toBe(false);
    expect(fs.existsSync(`${target}.migrating`)).toBe(false);
  });

  it("both migration paths produce the same WAL-safe snapshot", () => {
    const { copyDatabaseSnapshot: copyFromDesktopRuntime } =
      requireElectronMain<{
        copyDatabaseSnapshot: (sourcePath: string, targetPath: string) => void;
      }>("database.cjs");

    const source = track(openWalDatabase(legacySource));
    const projectSnapshot = path.join(scratch, "project.sqlite");
    const desktopSnapshot = path.join(scratch, "desktop.sqlite");

    copyDatabaseSnapshot(legacySource, projectSnapshot);
    copyFromDesktopRuntime(legacySource, desktopSnapshot);

    expect(countRows(projectSnapshot)).toBe(WAL_ROWS);
    expect(countRows(desktopSnapshot)).toBe(WAL_ROWS);

    // A snapshot is one self-contained file: no write-ahead log rides along.
    for (const snapshot of [projectSnapshot, desktopSnapshot]) {
      expect(fs.existsSync(`${snapshot}-wal`)).toBe(false);
      expect(fs.existsSync(`${snapshot}-shm`)).toBe(false);
    }

    source.close();
  });
});
