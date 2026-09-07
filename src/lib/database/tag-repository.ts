import { and, asc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { v4 as uuid } from "uuid";

import type { TagRepository } from "@yard-core";
import type { FileTagAttachment, Tag, TagOrigin } from "@yard-core";

import { sqlite as defaultSqlite } from "./connection";
import { chunkArray, SQLITE_MAX_VARIABLES } from "./sql-parameters";
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

  renameTag(tagId: string, name: string): void {
    this.db.update(schema.tags).set({ name }).where(eq(schema.tags.id, tagId)).run();
  }

  updateTagColor(tagId: string, color: string | null): void {
    this.db.update(schema.tags).set({ color }).where(eq(schema.tags.id, tagId)).run();
  }

  attachTagToFile(fileId: string, tagId: string): void {
    this.attachTagToFileWithOrigin(fileId, tagId, "manual");
  }

  attachTagToFileWithOrigin(
    fileId: string,
    tagId: string,
    origin: TagOrigin,
    confidence: number | null = null,
  ): void {
    // Manual wins without a read: an incoming manual upgrades the row, an
    // incoming automatic never downgrades a stored manual.
    this.sqlite
      .prepare(
        `INSERT INTO file_tags (file_id, tag_id, origin, confidence)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (file_id, tag_id) DO UPDATE SET
           origin = CASE WHEN excluded.origin = 'manual' THEN 'manual' ELSE file_tags.origin END,
           confidence = CASE
             WHEN excluded.origin = 'manual' AND file_tags.origin != 'manual' THEN excluded.confidence
             ELSE file_tags.confidence
           END`,
      )
      .run(fileId, tagId, origin, confidence);
  }

  getAttachmentsForFile(fileId: string): FileTagAttachment[] {
    return this.db
      .select({
        fileId: schema.fileTags.fileId,
        tagId: schema.fileTags.tagId,
        origin: schema.fileTags.origin,
        confidence: schema.fileTags.confidence,
      })
      .from(schema.fileTags)
      .where(eq(schema.fileTags.fileId, fileId))
      .orderBy(asc(schema.fileTags.tagId))
      .all() as FileTagAttachment[];
  }

  detachAttachmentsByOrigin(origin: TagOrigin): number {
    const result = this.db
      .delete(schema.fileTags)
      .where(eq(schema.fileTags.origin, origin))
      .run();
    return result.changes ?? 0;
  }

  detachTagFromFile(fileId: string, tagId: string): void {
    this.db.delete(schema.fileTags)
      .where(and(eq(schema.fileTags.fileId, fileId), eq(schema.fileTags.tagId, tagId)))
      .run();
  }

  getTagsForFiles(fileIds: string[]): Map<string, Tag[]> {
    if (fileIds.length === 0) return new Map();

    const rows: Array<{ fileId: string; tag: Tag }> = [];
    const chunkSize = Math.max(1, SQLITE_MAX_VARIABLES - 1);

    for (const chunk of chunkArray(fileIds, chunkSize)) {
      rows.push(
        ...(this.db
          .select({
            fileId: schema.fileTags.fileId,
            tag: schema.tags,
          })
          .from(schema.fileTags)
          .innerJoin(schema.tags, eq(schema.fileTags.tagId, schema.tags.id))
          .where(inArray(schema.fileTags.fileId, chunk))
          .all() as Array<{ fileId: string; tag: Tag }>),
      );
    }

    const map = new Map<string, Tag[]>();
    for (const row of rows) {
      const tags = map.get(row.fileId) ?? [];
      tags.push(row.tag as Tag);
      map.set(row.fileId, tags);
    }
    return map;
  }

  addTagAlias(tagId: string, alias: string): void {
    const clean = alias.trim().toLowerCase();
    if (!clean) throw new Error("Alias must not be blank");
    this.db
      .insert(schema.tagAliases)
      .values({ tagId, alias: clean })
      .onConflictDoNothing()
      .run();
  }

  resolveTagAlias(alias: string): string | null {
    const row = this.db
      .select({ tagId: schema.tagAliases.tagId })
      .from(schema.tagAliases)
      .where(eq(schema.tagAliases.alias, alias.trim().toLowerCase()))
      .get();
    return row?.tagId ?? null;
  }

  deleteTag(tagId: string) {
    this.sqlite.transaction(() => {
      this.db.delete(schema.fileTags).where(eq(schema.fileTags.tagId, tagId)).run();
      this.db.delete(schema.tagAliases).where(eq(schema.tagAliases.tagId, tagId)).run();
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
export const getTagsForFiles = (fileIds: string[]) => getTagRepo().getTagsForFiles(fileIds);
export const createTag = (name: string) => getTagRepo().createTag(name);
export const renameTag = (tagId: string, name: string) => getTagRepo().renameTag(tagId, name);
export const updateTagColor = (tagId: string, color: string | null) => getTagRepo().updateTagColor(tagId, color);
export const attachTagToFile = (fileId: string, tagId: string) => getTagRepo().attachTagToFile(fileId, tagId);
export const detachTagFromFile = (fileId: string, tagId: string) => getTagRepo().detachTagFromFile(fileId, tagId);
export const deleteTag = (tagId: string) => getTagRepo().deleteTag(tagId);
