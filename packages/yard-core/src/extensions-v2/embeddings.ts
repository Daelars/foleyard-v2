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

/** Narrow repository surface behind the embedding services. */
export type V2EmbeddingPorts = {
  upsert(fileId: string, model: string, dim: number, vec: Uint8Array): void;
  get(fileId: string, model: string): { dim: number; vec: Uint8Array } | null;
  listIds(model: string): string[];
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
      const target = ports().get(fileId, model);
      if (!target) return [];
      const targetVec = bytesToFloats(target.vec);
      const scored: V2SimilarFile[] = [];
      for (const candidateId of ports().listIds(model)) {
        if (candidateId === fileId || !live(candidateId)) continue;
        const row = ports().get(candidateId, model);
        if (!row || row.dim !== target.dim) continue;
        scored.push({ fileId: candidateId, score: cosineSimilarity(targetVec, bytesToFloats(row.vec)) });
      }
      scored.sort((left, right) => right.score - left.score);
      return scored.slice(0, topN);
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
