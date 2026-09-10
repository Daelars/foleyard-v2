import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";

import { createDatabaseConnection } from "@/lib/database/connection";
import { initializeDatabaseSchema } from "@/lib/database/migrations";
import { createStatementCachingDatabase } from "@/lib/database/prepared-statements";
import * as schema from "@/lib/schema";

// Area: #254. The connection applies WAL-appropriate pragmas and every hot
// path reuses prepared statements instead of recompiling each execution.

describe("sqlite tuning", () => {
  it("applies the tuned pragmas after connect", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-pragmas-"));
    const dbPath = path.join(dir, "tuned.sqlite");
    const connection = createDatabaseConnection(dbPath);
    try {
      const read = (name: string) =>
        (
          connection.sqlite.pragma as unknown as (
            source: string,
            options?: { simple: boolean },
          ) => unknown
        )(name, { simple: true }) as number | string;
      expect(read("journal_mode")).toBe("wal");
      expect(read("synchronous")).toBe(1); // NORMAL
      expect(read("temp_store")).toBe(2); // MEMORY
      expect(read("busy_timeout")).toBe(5000);
      expect(read("foreign_keys")).toBe(1);
      expect(read("cache_size")).toBeLessThan(0);
    } finally {
      connection.sqlite.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("compiles repeated SQL once for raw and Drizzle paths", () => {
    const sqlite = new Database(":memory:");
    initializeDatabaseSchema(sqlite);

    let prepareCalls = 0;
    const originalPrepare = sqlite.prepare.bind(sqlite);
    (sqlite as unknown as { prepare: (sql: string) => Database.Statement }).prepare =
      (sql: string) => {
        prepareCalls += 1;
        return originalPrepare(sql);
      };

    const cached = createStatementCachingDatabase(sqlite);
    const first = cached.prepare("SELECT 1");
    const second = cached.prepare("SELECT 1");
    expect(second).toBe(first);
    expect(prepareCalls).toBe(1);

    const db = drizzle(cached, { schema });
    db.select().from(schema.tags).all();
    db.select().from(schema.tags).all();
    expect(prepareCalls, "Drizzle reuses the cached statement").toBe(2);

    // Other members still forward to the real handle.
    expect(cached.name).toBe(sqlite.name);
    sqlite.close();
  });
});
