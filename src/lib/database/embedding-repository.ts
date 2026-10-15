import { and, asc, eq, gt } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { sqlite as defaultSqlite } from "./connection";
import * as schema from "@/lib/schema";

import type Database from "better-sqlite3";

/**
 * Upper bound on one similarity page (#298). The repository clamps a
 * caller's `limit` to this, so no read can be widened into "every vector
 * for a model" through the paged API.
 */
export const MAX_EMBEDDING_PAGE_SIZE = 512;

/** Clamp a caller's page size into [1, MAX_EMBEDDING_PAGE_SIZE]. */
function clampPageSize(limit: number): number {
  if (!Number.isFinite(limit)) return MAX_EMBEDDING_PAGE_SIZE;
  return Math.max(1, Math.min(MAX_EMBEDDING_PAGE_SIZE, Math.floor(limit)));
}

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

  /**
   * One bounded page of a model's vectors, ordered by file id (#298).
   * Keyset paging over `(model, file_id)` serves `idx_file_embeddings_model`
   * without an `OFFSET` scan, and the one-extra-row probe makes `hasMore`
   * exact at the page boundary. The caller passes the last file id it saw
   * back as `after`; peak memory is one page of vectors, not the model.
   */
  listEmbeddingsPage(
    model: string,
    request: { after: string | null; limit: number },
  ): {
    rows: Array<{ fileId: string; dim: number; vec: Buffer }>;
    hasMore: boolean;
  } {
    const limit = clampPageSize(request.limit);
    const after = request.after;
    const rows = this.db
      .select({
        fileId: schema.fileEmbeddings.fileId,
        dim: schema.fileEmbeddings.dim,
        vec: schema.fileEmbeddings.vec,
      })
      .from(schema.fileEmbeddings)
      .where(
        after === null
          ? eq(schema.fileEmbeddings.model, model)
          : and(
              eq(schema.fileEmbeddings.model, model),
              gt(schema.fileEmbeddings.fileId, after),
            ),
      )
      .orderBy(asc(schema.fileEmbeddings.fileId))
      .limit(limit + 1)
      .all();
    return {
      rows: rows.slice(0, limit).map((entry) => ({
        fileId: entry.fileId,
        dim: entry.dim,
        vec: entry.vec as Buffer,
      })),
      hasMore: rows.length > limit,
    };
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
export const listEmbeddingsPage = (
  model: string,
  request: { after: string | null; limit: number },
) => getEmbeddingRepo().listEmbeddingsPage(model, request);
export const deleteEmbeddingsForFile = (fileId: string) =>
  getEmbeddingRepo().deleteEmbeddingsForFile(fileId);
