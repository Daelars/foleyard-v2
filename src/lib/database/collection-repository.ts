import { and, asc, count, eq, sql } from "drizzle-orm";
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
    return this.db
      .select({
        id: schema.collections.id,
        name: schema.collections.name,
        createdAt: schema.collections.createdAt,
        fileCount: count(schema.files.id),
      })
      .from(schema.collections)
      .leftJoin(schema.fileCollections, eq(schema.fileCollections.collectionId, schema.collections.id))
      .leftJoin(schema.files, and(eq(schema.files.id, schema.fileCollections.fileId), sql`${schema.files.removedAt} IS NULL`))
      .groupBy(schema.collections.id)
      .orderBy(asc(schema.collections.name))
      .all() as Collection[];
  }

  createCollection(name: string): string {
    const id = uuid();
    this.db.insert(schema.collections).values({ id, name }).run();
    return id;
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
}

let _collectionRepo: SqliteCollectionRepository | null = null;
function getCollectionRepo(): SqliteCollectionRepository {
  if (!_collectionRepo) {
    _collectionRepo = new SqliteCollectionRepository(defaultSqlite as unknown as Database);
  }
  return _collectionRepo;
}

export const getAllCollections = () => getCollectionRepo().getAllCollections();
export const createCollection = (name: string) => getCollectionRepo().createCollection(name);
export const deleteCollection = (collectionId: string) => getCollectionRepo().deleteCollection(collectionId);
export const attachFileToCollection = (fileId: string, collectionId: string) => getCollectionRepo().attachFileToCollection(fileId, collectionId);
export const detachFileFromCollection = (fileId: string, collectionId: string) => getCollectionRepo().detachFileFromCollection(fileId, collectionId);
