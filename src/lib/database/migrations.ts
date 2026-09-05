// Database migrations live here and are hand-rolled against better-sqlite3.
// There is intentionally no drizzle.config.ts: drizzle-kit points at a
// database file that does not exist (./foleyard.db; the real file is
// foleyard.sqlite) with an output directory that was never generated, so it
// cannot do anything until it is wired up. Do not re-add the config without
// wiring it to this module's migration history.
import type Database from "better-sqlite3";
import path from "node:path";

function ensureColumn(
  sqlite: Database.Database,
  tableName: string,
  columnName: string,
  definition: string,
) {
  const columns = sqlite
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;

  if (!columns.some((column) => column.name === columnName)) {
    sqlite.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`);
  }
}

function readConfiguredRoots(sqlite: Database.Database) {
  const rows = sqlite
    .prepare("SELECT key, value FROM settings WHERE key IN ('libraryRoots', 'libraryRoot')")
    .all() as Array<{ key: string; value: string | null }>;
  const roots = new Set<string>();

  for (const row of rows) {
    if (!row.value) continue;
    if (row.key === "libraryRoots") {
      try {
        const parsed = JSON.parse(row.value);
        if (Array.isArray(parsed)) {
          for (const value of parsed) {
            if (typeof value === "string" && value) roots.add(path.resolve(value));
          }
        }
      } catch {}
    } else {
      roots.add(path.resolve(row.value));
    }
  }

  return Array.from(roots).sort((left, right) => right.length - left.length);
}

function backfillLibraryRoots(sqlite: Database.Database) {
  const roots = readConfiguredRoots(sqlite);
  if (roots.length === 0) return;

  const files = sqlite
    .prepare("SELECT id, path FROM files WHERE library_root IS NULL")
    .all() as Array<{ id: string; path: string }>;
  const update = sqlite.prepare("UPDATE files SET library_root = ? WHERE id = ?");
  const apply = sqlite.transaction(() => {
    for (const file of files) {
      const filePath = path.resolve(file.path);
      const owner = roots.find((root) => {
        const relative = path.relative(root, filePath);
        return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
      });
      if (owner) update.run(owner, file.id);
    }
  });
  apply();
}

export function initializeDatabaseSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      library_root TEXT,
      directory TEXT,
      format TEXT,
      codec TEXT,
      duration REAL,
      sample_rate INTEGER,
      bit_depth INTEGER,
      channels INTEGER,
      file_size INTEGER,
      mtime_ms INTEGER,
      is_favorite INTEGER DEFAULT 0,
      removed_at TEXT,
      last_scanned_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS file_tags (
      file_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (file_id, tag_id),
      FOREIGN KEY (file_id) REFERENCES files(id),
      FOREIGN KEY (tag_id) REFERENCES tags(id)
    );

    CREATE TABLE IF NOT EXISTS collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      color TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS file_collections (
      file_id TEXT NOT NULL,
      collection_id TEXT NOT NULL,
      PRIMARY KEY (file_id, collection_id),
      FOREIGN KEY (file_id) REFERENCES files(id),
      FOREIGN KEY (collection_id) REFERENCES collections(id)
    );
  `);

  ensureColumn(sqlite, "files", "mtime_ms", "mtime_ms INTEGER");
  ensureColumn(sqlite, "files", "removed_at", "removed_at TEXT");
  ensureColumn(sqlite, "files", "last_scanned_at", "last_scanned_at TEXT");
  ensureColumn(sqlite, "files", "directory", "directory TEXT");
  ensureColumn(sqlite, "files", "library_root", "library_root TEXT");
  ensureColumn(sqlite, "files", "codec", "codec TEXT");

  ensureColumn(sqlite, "collections", "is_smart", "is_smart INTEGER DEFAULT 0");
  ensureColumn(sqlite, "collections", "filter", "filter TEXT");
  ensureColumn(sqlite, "collections", "color", "color TEXT");
  ensureColumn(sqlite, "tags", "color", "color TEXT");

  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_filename ON files(filename)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_removed_at ON files(removed_at)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_is_favorite ON files(is_favorite)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_directory ON files(directory)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_library_root ON files(library_root)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_last_scanned_at ON files(last_scanned_at)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_file_tags_tag_id ON file_tags(tag_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_file_collections_collection_id ON file_collections(collection_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_file_collections_file_id ON file_collections(file_id)`);

  backfillLibraryRoots(sqlite);
}
