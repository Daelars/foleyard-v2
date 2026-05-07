import { and, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

import { db, sqlite } from "./connection";
import * as schema from "@/lib/schema";

export function getAllCollections() {
  return sqlite
    .prepare(
      `SELECT
        collections.id,
        collections.name,
        collections.created_at as createdAt,
        COUNT(files.id) as fileCount
      FROM collections
      LEFT JOIN file_collections ON file_collections.collection_id = collections.id
      LEFT JOIN files ON files.id = file_collections.file_id AND files.removed_at IS NULL
      GROUP BY collections.id
      ORDER BY collections.name ASC`,
    )
    .all() as Array<{
      id: string;
      name: string;
      createdAt: string | null;
      fileCount: number;
    }>;
}

export function createCollection(name: string) {
  const id = uuid();
  db.insert(schema.collections).values({ id, name }).run();
  return id;
}

export function deleteCollection(collectionId: string) {
  db.delete(schema.fileCollections)
    .where(eq(schema.fileCollections.collectionId, collectionId))
    .run();
  db.delete(schema.collections).where(eq(schema.collections.id, collectionId)).run();
}

export function attachFileToCollection(fileId: string, collectionId: string) {
  db.insert(schema.fileCollections)
    .values({ fileId, collectionId })
    .onConflictDoNothing()
    .run();
}

export function detachFileFromCollection(fileId: string, collectionId: string) {
  db.delete(schema.fileCollections)
    .where(
      and(
        eq(schema.fileCollections.fileId, fileId),
        eq(schema.fileCollections.collectionId, collectionId),
      ),
    )
    .run();
}
