import { isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { normalizeDirectoryPath } from "@yard-core";

import { sqlite as defaultSqlite } from "./connection";
import * as schema from "@/lib/schema";

import type Database from "better-sqlite3";

export class SqliteBrowseRepository {
  private sqlite: Database;
  private db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(sqlite: Database) {
    this.sqlite = sqlite;
    this.db = drizzle(sqlite, { schema });
  }

  getUniqueDirectories(): string[] {
    const rows = this.db
      .select({ directory: schema.files.directory })
      .from(schema.files)
      .where(isNotNull(schema.files.directory))
      .all();

    const dirs = rows.map((r) => r.directory).filter(Boolean) as string[];
    return [...new Set(dirs)].sort();
  }

  getSubdirectories(parentDir: string | null): string[] {
    const allDirs = this.getUniqueDirectories();
    const subdirs = new Set<string>();

    for (const dir of allDirs) {
      if (parentDir === null) {
        const firstPart = dir.split(/[\\/]/)[0];
        if (firstPart) {
          subdirs.add(firstPart);
        }
        continue;
      }

      const normalizedParent = normalizeDirectoryPath(parentDir);
      const normalizedDir = normalizeDirectoryPath(dir);

      if (normalizedDir.startsWith(`${normalizedParent}/`)) {
        const remaining = normalizedDir.slice(normalizedParent.length + 1);
        const nextPart = remaining.split("/")[0];
        if (nextPart) {
          subdirs.add(`${parentDir}/${nextPart}`);
        }
      }
    }

    return Array.from(subdirs).sort();
  }
}

let _browseRepo: SqliteBrowseRepository | null = null;
function getBrowseRepo(): SqliteBrowseRepository {
  if (!_browseRepo) {
    _browseRepo = new SqliteBrowseRepository(defaultSqlite as unknown as Database);
  }
  return _browseRepo;
}

export const getUniqueDirectories = () => getBrowseRepo().getUniqueDirectories();
export const getSubdirectories = (parentDir: string | null) => getBrowseRepo().getSubdirectories(parentDir);
