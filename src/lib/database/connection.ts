import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import {
  ensureDesktopDatabaseInitialized,
  getDatabasePath,
} from "@/lib/database-path";
import * as schema from "@/lib/schema";

import { initializeDatabaseSchema } from "./migrations";

const databasePath = getDatabasePath();
ensureDesktopDatabaseInitialized(databasePath);

export const sqlite = new Database(databasePath);

sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

initializeDatabaseSchema(sqlite);

export const db = drizzle(sqlite, { schema });
