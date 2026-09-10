import type Database from "better-sqlite3";

/**
 * Statement-caching database wrapper (#254).
 *
 * better-sqlite3 compiles SQL on every `prepare`, and Drizzle's driver
 * prepares per execution, so hot paths (browse pages, tag hydration,
 * settings reads, collection lookups, batch writes) recompiled identical
 * SQL thousands of times per request set. Wrapping the database memoizes
 * `prepare` by SQL text: the same statement object is reused with new
 * bound parameters. The cache is bounded and evicts oldest-first; all
 * other database members forward to the real handle.
 */

export const MAX_CACHED_STATEMENTS = 256;

export function createStatementCachingDatabase(sqlite: Database): Database {
  const cache = new Map<string, Database.Statement>();

  return new Proxy(sqlite, {
    get(target, property, receiver) {
      if (property === "prepare") {
        return (sql: string): Database.Statement => {
          const existing = cache.get(sql);
          if (existing) {
            // Re-insert to mark most-recently-used.
            cache.delete(sql);
            cache.set(sql, existing);
            return existing;
          }
          const prepared = target.prepare(sql);
          cache.set(sql, prepared);
          if (cache.size > MAX_CACHED_STATEMENTS) {
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) cache.delete(oldest);
          }
          return prepared;
        };
      }
      return Reflect.get(target, property, receiver);
    },
  });
}
