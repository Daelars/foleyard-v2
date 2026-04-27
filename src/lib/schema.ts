import { sql } from 'drizzle-orm';
import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value'),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const files = sqliteTable('files', {
  id: text('id').primaryKey(),
  path: text('path').notNull().unique(),
  filename: text('filename').notNull(),
  directory: text('directory'),
  format: text('format'),
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

export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const fileTags = sqliteTable(
  'file_tags',
  {
    fileId: text('file_id').notNull().references(() => files.id),
    tagId: text('tag_id').notNull().references(() => tags.id),
  },
  (table) => [primaryKey({ columns: [table.fileId, table.tagId] })],
);

export const collections = sqliteTable('collections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
});

export const fileCollections = sqliteTable(
  'file_collections',
  {
    fileId: text('file_id').notNull().references(() => files.id),
    collectionId: text('collection_id').notNull().references(() => collections.id),
  },
  (table) => [primaryKey({ columns: [table.fileId, table.collectionId] })],
);

export type Setting = typeof settings.$inferSelect;
export type File = typeof files.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Collection = typeof collections.$inferSelect;
