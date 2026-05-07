import type Database from "better-sqlite3";

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
  ensureColumn(sqlite, "files", "codec", "codec TEXT");

  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_filename ON files(filename)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_removed_at ON files(removed_at)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_is_favorite ON files(is_favorite)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_directory ON files(directory)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_last_scanned_at ON files(last_scanned_at)`);
}
