import { and, asc, count, eq, like, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { v4 as uuid } from "uuid";

import type { CollectionRepository } from "@yard-core";
import type { Collection } from "@yard-core";

import { sqlite as defaultSqlite } from "./connection";
import * as schema from "@/lib/schema";

import type Database from "better-sqlite3";

export class SqliteCollectionRepository implements CollectionRepository {
  private sqlite: Database;
  private db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(sqlite: Database) {
    this.sqlite = sqlite;
    this.db = drizzle(sqlite, { schema });
  }

  getAllCollections(): Collection[] {
    const collections = this.db
      .select({
        id: schema.collections.id,
        name: schema.collections.name,
        color: schema.collections.color,
        createdAt: schema.collections.createdAt,
        isSmart: schema.collections.isSmart,
        filter: schema.collections.filter,
        fileCount: count(schema.files.id),
      })
      .from(schema.collections)
      .leftJoin(schema.fileCollections, eq(schema.fileCollections.collectionId, schema.collections.id))
      .leftJoin(schema.files, and(eq(schema.files.id, schema.fileCollections.fileId), sql`${schema.files.removedAt} IS NULL`))
      .groupBy(schema.collections.id)
      .orderBy(asc(schema.collections.name))
      .all() as unknown as Collection[];

    for (const c of collections) {
      if (c.isSmart && c.filter) {
        try {
          const parsed = JSON.parse(c.filter) as { q?: string };
          if (parsed.q) {
            const result = this.db
              .select({ count: count() })
              .from(schema.files)
              .where(
                and(
                  sql`${schema.files.removedAt} IS NULL`,
                  like(schema.files.filename, `%${parsed.q}%`),
                ),
              )
              .get() as { count: number } | undefined;
            c.fileCount = result?.count ?? 0;
          }
        } catch {
          // Invalid filter JSON, leave fileCount as-is
        }
      }
    }

    return collections;
  }

  createCollection(name: string, isSmart?: boolean, filter?: string): string {
    const id = uuid();
    this.db.insert(schema.collections).values({ id, name, isSmart: isSmart ? 1 : 0, filter }).run();
    return id;
  }

  createSmartCollection(name: string, filter: string): string {
    return this.createCollection(name, true, filter);
  }

  renameCollection(id: string, name: string): void {
    this.db.update(schema.collections).set({ name }).where(eq(schema.collections.id, id)).run();
  }

  updateCollectionColor(id: string, color: string | null): void {
    this.db.update(schema.collections).set({ color }).where(eq(schema.collections.id, id)).run();
  }

  updateCollectionFilter(id: string, filter: string): void {
    this.db.update(schema.collections).set({ filter }).where(eq(schema.collections.id, id)).run();
  }

  deleteCollection(collectionId: string): void {
    this.db.delete(schema.fileCollections)
      .where(eq(schema.fileCollections.collectionId, collectionId))
      .run();
    this.db.delete(schema.collections).where(eq(schema.collections.id, collectionId)).run();
  }

  attachFileToCollection(fileId: string, collectionId: string): void {
    this.db.insert(schema.fileCollections)
      .values({ fileId, collectionId })
      .onConflictDoNothing()
      .run();
  }

  detachFileFromCollection(fileId: string, collectionId: string): void {
    this.db.delete(schema.fileCollections)
      .where(
        and(
          eq(schema.fileCollections.fileId, fileId),
          eq(schema.fileCollections.collectionId, collectionId),
        ),
      )
      .run();
  }

  convertToRegularCollection(collectionId: string): void {
    const collection = this.db
      .select({ filter: schema.collections.filter })
      .from(schema.collections)
      .where(eq(schema.collections.id, collectionId))
      .get() as { filter: string | null } | undefined;

    if (collection?.filter) {
      try {
        const parsed = JSON.parse(collection.filter) as { q?: string };
        if (parsed.q) {
          const files = this.db
            .select({ id: schema.files.id })
            .from(schema.files)
            .where(
              and(
                sql`${schema.files.removedAt} IS NULL`,
                like(schema.files.filename, `%${parsed.q}%`),
              ),
            )
            .all() as { id: string }[];

          const insertValues = files.map((f) => ({
            fileId: f.id,
            collectionId,
          }));

          if (insertValues.length > 0) {
            this.db.insert(schema.fileCollections).values(insertValues).onConflictDoNothing().run();
          }
        }
      } catch {
        // Invalid filter JSON, skip file attachment
      }
    }

    this.db
      .update(schema.collections)
      .set({ isSmart: 0, filter: null })
      .where(eq(schema.collections.id, collectionId))
      .run();
  }
}

let _collectionRepo: SqliteCollectionRepository | null = null;
function getCollectionRepo(): SqliteCollectionRepository {
  if (!_collectionRepo) {
    _collectionRepo = new SqliteCollectionRepository(defaultSqlite as unknown as Database);
  }
  return _collectionRepo;
}

export const getAllCollections = () => getCollectionRepo().getAllCollections();
export const createCollection = (name: string, isSmart?: boolean, filter?: string) => getCollectionRepo().createCollection(name, isSmart, filter);
export const createSmartCollection = (name: string, filter: string) => getCollectionRepo().createSmartCollection(name, filter);
export const renameCollection = (id: string, name: string) => getCollectionRepo().renameCollection(id, name);
export const updateCollectionColor = (id: string, color: string | null) => getCollectionRepo().updateCollectionColor(id, color);
export const updateCollectionFilter = (id: string, filter: string) => getCollectionRepo().updateCollectionFilter(id, filter);
export const deleteCollection = (collectionId: string) => getCollectionRepo().deleteCollection(collectionId);
export const attachFileToCollection = (fileId: string, collectionId: string) => getCollectionRepo().attachFileToCollection(fileId, collectionId);
export const detachFileFromCollection = (fileId: string, collectionId: string) => getCollectionRepo().detachFileFromCollection(fileId, collectionId);
export const convertToRegularCollection = (collectionId: string) => getCollectionRepo().convertToRegularCollection(collectionId);
