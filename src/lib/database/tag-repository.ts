import { and, asc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { v4 as uuid } from "uuid";

import type { TagRepository } from "@yard-core";
import type { Tag } from "@yard-core";

import { sqlite as defaultSqlite } from "./connection";
import * as schema from "@/lib/schema";

import type Database from "better-sqlite3";

export class SqliteTagRepository implements TagRepository {
  private sqlite: Database;
  private db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(sqlite: Database) {
    this.sqlite = sqlite;
    this.db = drizzle(sqlite, { schema });
  }

  getAllTags(): Tag[] {
    return this.db.select().from(schema.tags).orderBy(asc(schema.tags.name)).all() as Tag[];
  }

  getTagsForFile(fileId: string): Tag[] {
    const rows = this.db
      .select({ tag: schema.tags })
      .from(schema.fileTags)
      .innerJoin(schema.tags, eq(schema.fileTags.tagId, schema.tags.id))
      .where(eq(schema.fileTags.fileId, fileId))
      .orderBy(asc(schema.tags.name))
      .all();

    return rows.map((row) => row.tag) as Tag[];
  }

  createTag(name: string): string {
    const id = uuid();
    this.db.insert(schema.tags).values({ id, name }).run();
    return id;
  }

  attachTagToFile(fileId: string, tagId: string): void {
    this.db.insert(schema.fileTags)
      .values({ fileId, tagId })
      .onConflictDoNothing()
      .run();
  }

  detachTagFromFile(fileId: string, tagId: string): void {
    this.db.delete(schema.fileTags)
      .where(and(eq(schema.fileTags.fileId, fileId), eq(schema.fileTags.tagId, tagId)))
      .run();
  }

  deleteTag(tagId: string) {
    this.sqlite.transaction(() => {
      this.db.delete(schema.fileTags).where(eq(schema.fileTags.tagId, tagId)).run();
      this.db.delete(schema.tags).where(eq(schema.tags.id, tagId)).run();
    })();
  }
}

let _tagRepo: SqliteTagRepository | null = null;
function getTagRepo(): SqliteTagRepository {
  if (!_tagRepo) {
    _tagRepo = new SqliteTagRepository(defaultSqlite as unknown as Database);
  }
  return _tagRepo;
}

export const getAllTags = () => getTagRepo().getAllTags();
export const getTagsForFile = (fileId: string) => getTagRepo().getTagsForFile(fileId);
export const createTag = (name: string) => getTagRepo().createTag(name);
export const attachTagToFile = (fileId: string, tagId: string) => getTagRepo().attachTagToFile(fileId, tagId);
export const detachTagFromFile = (fileId: string, tagId: string) => getTagRepo().detachTagFromFile(fileId, tagId);
export const deleteTag = (tagId: string) => getTagRepo().deleteTag(tagId);
