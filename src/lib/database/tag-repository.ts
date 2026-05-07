import { and, asc, eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";

import { db, sqlite } from "./connection";
import * as schema from "@/lib/schema";

export function getAllTags() {
  return db.select().from(schema.tags).orderBy(asc(schema.tags.name)).all();
}

export function getTagsForFile(fileId: string) {
  const rows = db
    .select({ tag: schema.tags })
    .from(schema.fileTags)
    .innerJoin(schema.tags, eq(schema.fileTags.tagId, schema.tags.id))
    .where(eq(schema.fileTags.fileId, fileId))
    .orderBy(asc(schema.tags.name))
    .all();

  return rows.map((row) => row.tag);
}

export function createTag(name: string) {
  const id = uuid();
  db.insert(schema.tags).values({ id, name }).run();
  return id;
}

export function attachTagToFile(fileId: string, tagId: string) {
  db.insert(schema.fileTags)
    .values({ fileId, tagId })
    .onConflictDoNothing()
    .run();
}

export function detachTagFromFile(fileId: string, tagId: string) {
  db.delete(schema.fileTags)
    .where(and(eq(schema.fileTags.fileId, fileId), eq(schema.fileTags.tagId, tagId)))
    .run();
}

export function deleteTag(tagId: string) {
  sqlite
    .transaction((id: string) => {
      sqlite.prepare("DELETE FROM file_tags WHERE tag_id = ?").run(id);
      sqlite.prepare("DELETE FROM tags WHERE id = ?").run(id);
    })(tagId);
}
