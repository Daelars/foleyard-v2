import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { sqlite as defaultSqlite } from "./connection";
import * as schema from "@/lib/schema";

import type Database from "better-sqlite3";

/**
 * SQLite vector store for similarity search (#192). One row per file
 * per model: a later model lands beside earlier ones instead of
 * replacing them. Vectors persist as float-32 blobs; all math lives
 * in yard-core so this module only moves bytes.
 */
export class SqliteEmbeddingRepository {
  private db: ReturnType<typeof drizzle<typeof schema>>;

  constructor(sqlite: Database) {
    this.db = drizzle(sqlite, { schema });
  }

  upsertEmbedding(fileId: string, model: string, dim: number, vec: Uint8Array): void {
    const bytes = Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
    this.db
      .insert(schema.fileEmbeddings)
      .values({ fileId, model, dim, vec: bytes })
      .onConflictDoUpdate({
        target: [schema.fileEmbeddings.fileId, schema.fileEmbeddings.model],
        set: { dim, vec: bytes },
      })
      .run();
  }

  getEmbedding(fileId: string, model: string): { dim: number; vec: Buffer } | null {
    const found = this.db
      .select()
      .from(schema.fileEmbeddings)
      .where(
        and(
          eq(schema.fileEmbeddings.fileId, fileId),
          eq(schema.fileEmbeddings.model, model),
        ),
      )
      .get();
    return found ? { dim: found.dim, vec: found.vec as Buffer } : null;
  }

  listEmbeddingIds(model: string): string[] {
    return this.db
      .select({ fileId: schema.fileEmbeddings.fileId })
      .from(schema.fileEmbeddings)
      .where(eq(schema.fileEmbeddings.model, model))
      .all()
      .map((entry) => entry.fileId);
  }

  deleteEmbeddingsForFile(fileId: string): void {
    this.db.delete(schema.fileEmbeddings).where(eq(schema.fileEmbeddings.fileId, fileId)).run();
  }
}

let _embeddingRepo: SqliteEmbeddingRepository | null = null;
function getEmbeddingRepo(): SqliteEmbeddingRepository {
  if (!_embeddingRepo) {
    _embeddingRepo = new SqliteEmbeddingRepository(defaultSqlite as unknown as Database);
  }
  return _embeddingRepo;
}

export const upsertFileEmbedding = (fileId: string, model: string, dim: number, vec: Uint8Array) =>
  getEmbeddingRepo().upsertEmbedding(fileId, model, dim, vec);
export const getFileEmbedding = (fileId: string, model: string) =>
  getEmbeddingRepo().getEmbedding(fileId, model);
export const listEmbeddingIds = (model: string) => getEmbeddingRepo().listEmbeddingIds(model);
export const deleteEmbeddingsForFile = (fileId: string) =>
  getEmbeddingRepo().deleteEmbeddingsForFile(fileId);
