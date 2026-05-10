import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { createRequire } from "node:module";

import {
  ensureDesktopDatabaseInitialized,
  getDatabasePath,
} from "@/lib/database-path";
import * as schema from "@/lib/schema";

import { initializeDatabaseSchema } from "./migrations";

type SqliteDatabase = Database;
type DrizzleDatabase = ReturnType<typeof drizzle<typeof schema>>;

const loadNativeModule = createRequire(import.meta.url);

export function createDatabaseConnection(dbPath: string) {
  const BetterSqlite3 = loadNativeModule("better-sqlite3") as typeof import("better-sqlite3");
  const sqlite = new BetterSqlite3(dbPath);

  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  initializeDatabaseSchema(sqlite);

  return {
    sqlite,
    db: drizzle(sqlite, { schema }),
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
