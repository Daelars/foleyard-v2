import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { normalizeDirectoryPath } from "@yard-core";

import { sqlite as defaultSqlite } from "./connection";
import * as schema from "@/lib/schema";

import type Database from "better-sqlite3";

export function immediateSubdirectories(directories: string[], parent: string | null): string[] {
  const result = new Set<string>();
  const normalizedParent = parent === null ? null : normalizeDirectoryPath(parent);
  for (const directory of directories) {
    const normalized = normalizeDirectoryPath(directory);
    if (normalizedParent === null) { const first = normalized.split("/")[0]; if (first) result.add(first); }
    else if (normalized.startsWith(normalizedParent + "/")) {
      const next = normalized.slice(normalizedParent.length + 1).split("/")[0];
      if (next) result.add(normalizedParent + "/" + next);
    }
  }
  return [...result].sort();
}

export class SqliteBrowseRepository {
  private sqlite: Database;
  private db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(sqlite: Database) {
    this.sqlite = sqlite;
    this.db = drizzle(sqlite, { schema });
  }

  getUniqueDirectories(): string[] {
    const rows = this.db
      .selectDistinct({ directory: schema.files.directory })
      .from(schema.files)
      .where(and(isNotNull(schema.files.directory), isNull(schema.files.removedAt)))
      .all();

    const dirs = rows.map((r) => r.directory).filter(Boolean) as string[];
    return [...new Set(dirs)].sort();
  }

  getDirectoriesForRoot(libraryRoot: string): string[] {
    const rows = this.db
      .selectDistinct({ directory: schema.files.directory })
      .from(schema.files)
      .where(
        and(
          eq(schema.files.libraryRoot, libraryRoot),
          isNotNull(schema.files.directory),
          isNull(schema.files.removedAt),
        ),
      )
      .all();

    return [...new Set(rows.map((row) => row.directory).filter(Boolean) as string[])].sort();
  }

  getSubdirectoriesForRoot(libraryRoot: string, parentDir: string | null): string[] { return immediateSubdirectories(this.getDirectoriesForRoot(libraryRoot), parentDir); }
}

let _browseRepo: SqliteBrowseRepository | null = null;
function getBrowseRepo(): SqliteBrowseRepository {
  if (!_browseRepo) {
    _browseRepo = new SqliteBrowseRepository(defaultSqlite as unknown as Database);
  }
  return _browseRepo;
}

export const getUniqueDirectories = () => getBrowseRepo().getUniqueDirectories();
export const getSubdirectoriesForRoot = (libraryRoot: string, parentDir: string | null) =>
  getBrowseRepo().getSubdirectoriesForRoot(libraryRoot, parentDir);
