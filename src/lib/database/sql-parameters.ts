import { sql } from "drizzle-orm";
import * as schema from "@/lib/schema";

export const SQLITE_MAX_VARIABLES = 999;

export function chunkArray<T>(values: T[], size: number) {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

/**
 * Escape a user-supplied search string for use inside a SQL LIKE pattern.
 * `%`, `_`, and the escape character `\` match literally after escaping.
 * Pair with `ESCAPE '\'` on the LIKE predicate.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/** LIKE predicate on the filename with `%`/`_`/`\` treated literally. */
export function filenameLike(query: string) {
  return sql`${schema.files.filename} LIKE ${`%${escapeLikePattern(query)}%`} ESCAPE '\\'`;
}

