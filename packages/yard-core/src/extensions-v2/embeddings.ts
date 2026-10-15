import type { V2LibraryReadPorts } from "./operations";
import { V2OperationError } from "./operations";

/**
 * Embedding vectors and similarity search for v2 handlers (#192).
 *
 * The store is model-keyed: one row per file per model, so a later
 * model (CLAP in #195) lands beside the stub vectors instead of
 * replacing them. Vectors are unit-agnostic float sequences; the app
 * adapter persists them as blobs and this module only does math.
 * Framework-free: no database handles, no v1 imports.
 */

/** Placeholder model until the CLAP job (#195) registers its own. */
export const STUB_EMBEDDING_MODEL = "audio-stub-v1";

/**
 * Candidate vectors per similarity page (#298). The ranking walk pulls
 * one page at a time and keeps only a bounded top-N, so its memory does
 * not grow with the Library.
 */
export const SIMILARITY_CHUNK_SIZE = 256;

/** Keyset request for one page of a model's vectors, ordered by file id. */
export type V2EmbeddingPageRequest = {
  /** Last file id of the previous page; null starts at the beginning. */
  after: string | null;
  /** Maximum rows wanted; the store clamps this to its own page bound. */
  limit: number;
};

/** One bounded page of a model's stored vectors. */
export type V2EmbeddingPage = {
  rows: Array<{ fileId: string; dim: number; vec: Uint8Array }>;
  /** True when more rows exist after this page. */
  hasMore: boolean;
};

/**
 * Narrow repository surface behind the embedding services.
 *
 * The batched reader is a page, not a full listing (#298): no method
 * hands back a model's whole vector set, so similarity ranking is bounded
 * by the page size rather than the Library.
 */
export type V2EmbeddingPorts = {
  upsert(fileId: string, model: string, dim: number, vec: Uint8Array): void;
  get(fileId: string, model: string): { dim: number; vec: Uint8Array } | null;
  listPage(model: string, request: V2EmbeddingPageRequest): V2EmbeddingPage;
  removeFile(fileId: string): void;
};

export type V2SimilarFile = { fileId: string; score: number };

export type V2EmbeddingOperations = {
  store(fileId: string, model: string, vec: ArrayLike<number>): { dim: number };
  get(fileId: string, model: string): { dim: number; vec: number[] } | null;
  findSimilar(
    fileId: string,
    options?: { model?: string; topN?: number },
  ): V2SimilarFile[];
};

export type V2EmbeddingFactoryArgs = {
  extensionId: string;
  effectivePermissions: readonly string[];
  embeddings?: V2EmbeddingPorts;
  /** Live index lookup so removed sounds never rank. */
  isLiveFile?(fileId: string): boolean;
  /** One batched liveness check for candidate ids (#233). */
  liveFileIds?(fileIds: string[]): string[];
};

function denied(permission: string, extensionId: string): V2OperationError {
  return new V2OperationError(
    "permission-denied",
    `Extension "${extensionId}" lacks the "${permission}" permission for this operation; grant it to use the command.`,
  );
}

/** Cosine similarity in [-1, 1]; zero when either side is silent. */
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    const x = a[index]!;
    const y = b[index]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function floatBytes(vec: ArrayLike<number>): Uint8Array {
  const buffer = new ArrayBuffer(vec.length * 4);
  const view = new DataView(buffer);
  for (let index = 0; index < vec.length; index += 1) {
    view.setFloat32(index * 4, vec[index]!, true);
  }
  return new Uint8Array(buffer);
}

function bytesToFloats(bytes: Uint8Array): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: number[] = [];
  for (let offset = 0; offset + 4 <= bytes.byteLength; offset += 4) {
    out.push(view.getFloat32(offset, true));
  }
  return out;
}

/** Float-32 view over the blob without boxing per element (#233). */
function bytesToFloat32(bytes: Uint8Array): Float32Array {
  const length = Math.floor(bytes.byteLength / 4);
  return new Float32Array(bytes.buffer, bytes.byteOffset, length);
}

/** Cosine similarity over typed arrays; same math as `cosineSimilarity`. */
function cosineSimilarityTyped(a: Float32Array, b: Float32Array): number {
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let index = 0; index < length; index += 1) {
    const x = a[index]!;
    const y = b[index]!;
    dot += x * y;
    normA += x * x;
    normB += y * y;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Total order for ranked matches: score descending, then file id
 * ascending. The id tiebreaker makes the result independent of the page
 * boundaries a candidate was read in (#298).
 */
function compareSimilar(left: V2SimilarFile, right: V2SimilarFile): number {
  if (right.score !== left.score) return right.score - left.score;
  return left.fileId < right.fileId ? -1 : left.fileId > right.fileId ? 1 : 0;
}

export function createV2EmbeddingOperations(args: V2EmbeddingFactoryArgs): V2EmbeddingOperations {
  const extensionId = args.extensionId;
  const granted = new Set(args.effectivePermissions);
  const require = (permission: "embeddings:read" | "embeddings:write"): void => {
    if (!granted.has(permission)) throw denied(permission, extensionId);
  };
  const ports = (): V2EmbeddingPorts => {
    if (!args.embeddings) {
      throw new V2OperationError(
        "input-invalid",
        `Embeddings are not supported by this host binding; extension "${extensionId}" cannot reach them here.`,
      );
    }
    return args.embeddings;
  };
  const live = (fileId: string): boolean => (args.isLiveFile ? args.isLiveFile(fileId) : true);

  return {
    store(fileId: string, model: string, vec: ArrayLike<number>): { dim: number } {
      require("embeddings:write");
      if (!live(fileId)) {
        throw new V2OperationError(
          "input-invalid",
          `Sound ${JSON.stringify(fileId)} is not in the Library index; refresh the selection and retry.`,
        );
      }
      if (vec.length === 0) {
        throw new V2OperationError("input-invalid", "Cannot store an empty embedding vector.");
      }
      ports().upsert(fileId, model, vec.length, floatBytes(vec));
      return { dim: vec.length };
    },
    get(fileId: string, model: string): { dim: number; vec: number[] } | null {
      require("embeddings:read");
      const row = ports().get(fileId, model);
      if (!row) return null;
      return { dim: row.dim, vec: bytesToFloats(row.vec) };
    },
    findSimilar(fileId: string, options?: { model?: string; topN?: number }): V2SimilarFile[] {
      require("embeddings:read");
      const model = options?.model ?? STUB_EMBEDDING_MODEL;
      const topN = Math.max(1, Math.min(50, Math.floor(options?.topN ?? 10)));
      const port = ports();
      const target = port.get(fileId, model);
      if (!target) return [];
      const targetVec = bytesToFloat32(target.vec);

      // Stream candidates in bounded pages (#298): only the current page,
      // one batched liveness check, and the running top-N are ever held, so
      // peak memory is a function of SIMILARITY_CHUNK_SIZE and topN, never
      // of how many vectors the model has stored.
      const best: V2SimilarFile[] = [];
      let after: string | null = null;
      for (;;) {
        const page = port.listPage(model, { after, limit: SIMILARITY_CHUNK_SIZE });
        if (page.rows.length === 0) break;

        // One batched liveness check per page instead of a lookup per candidate.
        const liveSet =
          args.liveFileIds !== undefined
            ? new Set(args.liveFileIds(page.rows.map((candidate) => candidate.fileId)))
            : null;
        const isLiveCandidate = (candidateId: string): boolean =>
          liveSet ? liveSet.has(candidateId) : live(candidateId);

        for (const candidate of page.rows) {
          if (candidate.fileId === fileId || !isLiveCandidate(candidate.fileId)) continue;
          if (candidate.dim !== target.dim) continue;
          best.push({
            fileId: candidate.fileId,
            score: cosineSimilarityTyped(targetVec, bytesToFloat32(candidate.vec)),
          });
        }

        // Trim to the bound before the next page, so it never accumulates.
        best.sort(compareSimilar);
        if (best.length > topN) best.length = topN;

        after = page.rows[page.rows.length - 1]!.fileId;
        if (!page.hasMore) break;
      }

      return best;
    },
  };
}

/** Deny-closed embedding services for hosts without embedding ports. */
export function denyV2EmbeddingOperations(extensionId: string): V2EmbeddingOperations {
  const deny = (): never => {
    throw denied("embeddings:read", extensionId);
  };
  return {
    store: () => deny(),
    get: () => deny(),
    findSimilar: () => deny(),
  };
}

/** Live-file check over library read ports, shared with the organization factory. */
export function liveFileViaLibrary(library: V2LibraryReadPorts): (fileId: string) => boolean {
  return (fileId) => {
    const record = library.getFileById(fileId);
    return record !== null && record.removedAt === null;
  };
}
