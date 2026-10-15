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

export const CURRENT_SCHEMA_VERSION = 3;

export type DatabaseVersionInfo = {
  state: "ready" | "not-initialized" | "unavailable";
  migration: "unversioned" | "versioned";
  appliedVersion?: number;
};

/**
 * Read-only version probe. Never initializes or migrates; absence of the
 * ledger means unversioned (pre-ledger) rather than version 0.
 */
export function getDatabaseVersionInfo(sqlite?: Database.Database): DatabaseVersionInfo {
  if (!sqlite) {
    try {
      // Only inspect an already-initialized owner; do not open the DB here.
      // The server route supplies no handle when unavailable.
      return { state: "not-initialized", migration: "unversioned" };
    } catch {
      return { state: "unavailable", migration: "unversioned" };
    }
  }
  try {
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'")
      .all() as Array<{ name: string }>;
    if (tables.length === 0) return { state: "ready", migration: "unversioned" };
    const rows = sqlite.prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").all() as Array<{ version: number }>;
    if (rows.length === 0) return { state: "ready", migration: "unversioned" };
    return { state: "ready", migration: "versioned", appliedVersion: rows[0].version };
  } catch {
    return { state: "unavailable", migration: "unversioned" };
  }
}

function recordSchemaVersion(sqlite: Database.Database, version: number) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  sqlite.prepare("INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)").run(version);
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
      origin TEXT NOT NULL DEFAULT 'manual',
      confidence REAL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (file_id, tag_id),
      FOREIGN KEY (file_id) REFERENCES files(id),
      FOREIGN KEY (tag_id) REFERENCES tags(id)
    );

    CREATE TABLE IF NOT EXISTS tag_aliases (
      alias TEXT PRIMARY KEY,
      tag_id TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tag_id) REFERENCES tags(id)
    );

    CREATE TABLE IF NOT EXISTS file_embeddings (
      file_id TEXT NOT NULL,
      model TEXT NOT NULL,
      dim INTEGER NOT NULL,
      vec BLOB NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (file_id, model),
      FOREIGN KEY (file_id) REFERENCES files(id)
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

    -- Durable intent for a Library root removal (#271): committed before the
    -- settings and index change, cleared once both agree, reconciled on the
    -- next scan after a crash.
    CREATE TABLE IF NOT EXISTS pending_root_changes (
      root TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  ensureColumn(sqlite, "files", "mtime_ms", "mtime_ms INTEGER");
  ensureColumn(sqlite, "files", "removed_at", "removed_at TEXT");
  ensureColumn(sqlite, "files", "detached_at", "detached_at TEXT");
  ensureColumn(sqlite, "files", "last_scanned_at", "last_scanned_at TEXT");
  ensureColumn(sqlite, "files", "directory", "directory TEXT");
  ensureColumn(sqlite, "files", "library_root", "library_root TEXT");
  ensureColumn(sqlite, "files", "codec", "codec TEXT");

  ensureColumn(sqlite, "collections", "is_smart", "is_smart INTEGER DEFAULT 0");
  ensureColumn(sqlite, "collections", "filter", "filter TEXT");
  ensureColumn(sqlite, "collections", "color", "color TEXT");
  ensureColumn(sqlite, "tags", "color", "color TEXT");
  ensureColumn(sqlite, "file_tags", "origin", "origin TEXT NOT NULL DEFAULT 'manual'");
  ensureColumn(sqlite, "file_tags", "confidence", "confidence REAL");
  ensureColumn(sqlite, "file_tags", "created_at", "created_at TEXT");

  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_filename ON files(filename)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_active_filename_id ON files(filename, id) WHERE removed_at IS NULL`);
  // Duration order including NULL placement (#255): non-null durations first
  // ascending (NULLS LAST) and last descending (NULLS FIRST). Tiebreakers
  // follow the duration direction so both directions are index-only.
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_active_duration ON files(duration, filename, id) WHERE removed_at IS NULL`);
  // Library-root plus directory lookups and the distinct-directory scan (#255).
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_active_root_directory ON files(library_root, directory) WHERE removed_at IS NULL`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_removed_at ON files(removed_at)`);
  // Root detachment (#271): the ownership predicate filters detached_at, and
  // root removal/reattach updates rows by (library_root, detached_at).
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_detached_at ON files(detached_at)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_root_detached ON files(library_root, detached_at)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_is_favorite ON files(is_favorite)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_directory ON files(directory)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_library_root ON files(library_root)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_files_last_scanned_at ON files(last_scanned_at)`);
  // Collection names are unique at the storage layer so create/rename
  // checks cannot race (#252).
  sqlite.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_collections_name ON collections(name)`);
  // Filename substring search index (#251). FTS5 may be unavailable in some
  // SQLite builds; failure leaves the LIKE fallback in place.
  try {
    sqlite.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(filename, content='files', content_rowid='rowid', tokenize='trigram')`,
    );
    sqlite.exec(
      `CREATE TRIGGER IF NOT EXISTS files_fts_ai AFTER INSERT ON files BEGIN INSERT INTO files_fts(rowid, filename) VALUES (new.rowid, new.filename); END`,
    );
    sqlite.exec(
      `CREATE TRIGGER IF NOT EXISTS files_fts_ad AFTER DELETE ON files BEGIN INSERT INTO files_fts(files_fts, rowid, filename) VALUES ('delete', old.rowid, old.filename); END`,
    );
    sqlite.exec(
      `CREATE TRIGGER IF NOT EXISTS files_fts_au AFTER UPDATE OF filename ON files BEGIN INSERT INTO files_fts(files_fts, rowid, filename) VALUES ('delete', old.rowid, old.filename); INSERT INTO files_fts(rowid, filename) VALUES (new.rowid, new.filename); END`,
    );
    // Backfill once for libraries that existed before the index. An
    // external-content FTS table reports its content rows before the index
    // is built, so the empty check reads the docsize shadow table, which is
    // populated only by an actual index.
    const indexed = (
      sqlite.prepare("SELECT COUNT(*) AS n FROM files_fts_docsize").get() as { n: number }
    ).n;
    const total = (
      sqlite.prepare("SELECT COUNT(*) AS n FROM files").get() as { n: number }
    ).n;
    if (indexed === 0 && total > 0) {
      sqlite.exec("INSERT INTO files_fts(files_fts) VALUES ('rebuild')");
    }
  } catch {
    // No FTS5: filename search stays on the LIKE path.
  }
  // Model-first vector reads for similarity search (#233).
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_file_embeddings_model ON file_embeddings(model, file_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_file_tags_tag_id ON file_tags(tag_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_file_tags_origin ON file_tags(origin)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_tag_aliases_tag_id ON tag_aliases(tag_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_file_collections_collection_id ON file_collections(collection_id)`);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_file_collections_file_id ON file_collections(file_id)`);

  backfillLibraryRoots(sqlite);

  // Record successful application transactionally; existing schemas are
  // safely baselined to CURRENT_SCHEMA_VERSION without data loss.
  try {
    const apply = sqlite.transaction(() => {
      recordSchemaVersion(sqlite, CURRENT_SCHEMA_VERSION);
    });
    apply();
  } catch {
    // Version recording is diagnostic; schema itself is already applied.
  }
}
