import { sql } from 'drizzle-orm';
import { blob, index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const files = sqliteTable('files', {
  id: text('id').primaryKey(),
  path: text('path').notNull().unique(),
  filename: text('filename').notNull(),
  libraryRoot: text('library_root'),
  directory: text('directory'),
  format: text('format'),
  codec: text('codec'),
  duration: real('duration'),
  sampleRate: integer('sample_rate'),
  bitDepth: integer('bit_depth'),
  channels: integer('channels'),
  fileSize: integer('file_size'),
  mtimeMs: integer('mtime_ms'),
  isFavorite: integer('is_favorite', { mode: 'boolean' }).default(false),
  removedAt: text('removed_at'),
  lastScannedAt: text('last_scanned_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Durable intent for permanent deletion (#269). Rows are written and
 * committed before the unlink and removed once the Library index agrees with
 * the filesystem; a crash between the two is reconciled from here.
 */
export const pendingDeletions = sqliteTable('pending_deletions', {
  path: text('path').primaryKey(),
  fileId: text('file_id').notNull(),
  fileSize: integer('file_size'),
  mtimeMs: integer('mtime_ms'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Move reconciliation that could not be decided (#274): a removed row whose
 * size+mtime identity matched more than one active file in the same root (or
 * one active file matched by more than one removed row). The row is recorded
 * instead of guessed, so a distinct recording never inherits another's tags,
 * embeddings or Collections. An explicit, user-initiated confirmation
 * resolves the entry; a scan never hashes content to break the tie.
 */
export const ambiguousMoves = sqliteTable('ambiguous_moves', {
  removedFileId: text('removed_file_id').primaryKey(),
  path: text('path').notNull(),
  libraryRoot: text('library_root'),
  fileSize: integer('file_size'),
  mtimeMs: integer('mtime_ms'),
  /** JSON array of the active file ids the removed identity matched. */
  candidateFileIds: text('candidate_file_ids').notNull().default('[]'),
  candidateCount: integer('candidate_count').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  color: text('color'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const fileTags = sqliteTable(
  'file_tags',
  {
    fileId: text('file_id').notNull().references(() => files.id),
    tagId: text('tag_id').notNull().references(() => tags.id),
    origin: text('origin').notNull().default('manual'),
    confidence: real('confidence'),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.fileId, table.tagId] }), index('idx_file_tags_tag_id').on(table.tagId)],
);

export const tagAliases = sqliteTable(
  'tag_aliases',
  {
    alias: text('alias').primaryKey(),
    tagId: text('tag_id').notNull().references(() => tags.id),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [index('idx_tag_aliases_tag_id').on(table.tagId)],
);

export const fileEmbeddings = sqliteTable(
  'file_embeddings',
  {
    fileId: text('file_id').notNull().references(() => files.id),
    model: text('model').notNull(),
    dim: integer('dim').notNull(),
    vec: blob('vec', { mode: 'buffer' }).notNull(),
    createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.fileId, table.model] })],
);

export const collections = sqliteTable('collections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  color: text('color'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  isSmart: integer('is_smart').notNull().default(0),
  filter: text('filter'),
});

export const fileCollections = sqliteTable(
  'file_collections',
  {
    fileId: text('file_id').notNull().references(() => files.id),
    collectionId: text('collection_id').notNull().references(() => collections.id),
  },
  (table) => [
    primaryKey({ columns: [table.fileId, table.collectionId] }),
    index('idx_file_collections_collection_id').on(table.collectionId),
    index('idx_file_collections_file_id').on(table.fileId),
  ],
);
