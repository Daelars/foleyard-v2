import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { createRequire } from "node:module";

import {
  ensureDesktopDatabaseInitialized,
  getDatabasePath,
} from "@/lib/database-path";
import * as schema from "@/lib/schema";

import { initializeDatabaseSchema } from "./migrations";
import { createStatementCachingDatabase } from "./prepared-statements";

type SqliteDatabase = Database;
type DrizzleDatabase = ReturnType<typeof drizzle<typeof schema>>;

const loadNativeModule = createRequire(import.meta.url);

export function createDatabaseConnection(dbPath: string) {
  const BetterSqlite3 = loadNativeModule("better-sqlite3") as typeof import("better-sqlite3");
  const sqlite = new BetterSqlite3(dbPath);

  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  // WAL with synchronous=NORMAL: commits no longer fsync on every write.
  // A power loss can lose the last committed transactions but cannot
  // corrupt the database, and a process crash loses nothing (see
  // docs/database.md). temp_store/memory and bounded cache/mmap keep
  // sorts and pages off disk.
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("temp_store = MEMORY");
  sqlite.pragma("cache_size = -16384");
  sqlite.pragma("mmap_size = 268435456");

  // One statement cache for Drizzle and the raw repository paths (#254).
  const cached = createStatementCachingDatabase(sqlite);

  initializeDatabaseSchema(cached);

  return {
    sqlite: cached,
    db: drizzle(cached, { schema }),
  };
}

let connection:
  | {
      sqlite: SqliteDatabase;
      db: DrizzleDatabase;
    }
  | null = null;

function getConnection() {
  if (connection) {
    return connection;
  }

  const databasePath = getDatabasePath();
  ensureDesktopDatabaseInitialized(databasePath);

  connection = createDatabaseConnection(databasePath);

  return connection;
}

function bindProperty<T extends object>(target: T, property: string | symbol) {
  const value = Reflect.get(target, property);
  return typeof value === "function" ? value.bind(target) : value;
}

export const sqlite = new Proxy({} as SqliteDatabase, {
  get(_target, property) {
    return bindProperty(getConnection().sqlite, property);
  },
});

export const db = new Proxy({} as DrizzleDatabase, {
  get(_target, property) {
    return bindProperty(getConnection().db, property);
  },
});
