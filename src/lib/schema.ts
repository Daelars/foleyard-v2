import { sql } from 'drizzle-orm';
import { blob, index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Durable intent for a Library root removal (#271). A row is written and
 * committed before the settings/index change, then cleared once both agree.
 * A crash in between is reconciled from here on the next scan: a root the
 * settings no longer own finishes detaching (or forgetting); a root still
 * owned drops the intent.
 */
export const pendingRootChanges = sqliteTable('pending_root_changes', {
  root: text('root').primaryKey(),
  mode: text('mode').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
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
  detachedAt: text('detached_at'),
  lastScannedAt: text('last_scanned_at'),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`),
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
