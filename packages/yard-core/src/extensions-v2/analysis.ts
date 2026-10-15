import {
  authorizeV2ReadableRecord,
  liveV2Record,
  V2OperationError,
  type V2LibraryReadPorts,
  type V2ReadableRootsPorts,
} from "./operations";

/**
 * Analysis backends for v2 handlers (#195, #268).
 *
 * Model files download through the app's model store; inference runs
 * through an injected backend. Yard-core carries no weights, no
 * network, and no model runtime: the backend is a seam the
 * application fills, and handlers fail with a reason naming the
 * install step while it is empty.
 *
 * Audio inference is a file-content read, so it takes the same guarded
 * path as every other read (`files.readFile`): the caller needs
 * `files:read` as well as the analysis `embeddings:read` permission,
 * the target must be a live index record, and its path must survive
 * Library-root containment. Only then does the backend see anything —
 * and what it sees is the canonical path the guard approved, never the
 * raw indexed path. Embedding access can therefore not be a second
 * route around Library-root or file-read authorization.
 */

export type V2ModelState = "ready" | "not-downloaded" | "downloading";

export type V2ModelStatus = {
  modelId: string;
  state: V2ModelState;
  downloadedBytes: number;
  totalBytes: number;
  backendAvailable: boolean;
};

/** One live sound resolved and authorized for reading by the core guard. */
export type V2AuthorizedAudioSource = {
  fileId: string;
  /** Canonical path already authorized against the current Library roots. */
  canonicalPath: string;
};

/** Narrow repository surface behind the analysis services. */
export type V2AnalysisPorts = {
  modelStatus(modelId: string): V2ModelStatus;
  downloadModel(
    modelId: string,
    callbacks?: {
      onProgress?: (downloadedBytes: number, totalBytes: number) => void;
      throwIfCancelled?: () => void;
    },
  ): Promise<{ bytes: number }>;
  /**
   * Infer an embedding for one authorized sound. The application
   * resolves nothing: it decodes `canonicalPath`, the path the core
   * read guard already approved, so a backend can never read a raw
   * indexed path the extension was not authorized to read.
   */
  embedAudio(source: V2AuthorizedAudioSource): Promise<{ dim: number; vec: number[] }>;
  embedTexts(texts: string[]): Promise<number[][]>;
  backendAvailable(): boolean;
};

export type V2AnalysisOperations = {
  modelStatus(modelId: string): V2ModelStatus;
  downloadModel(
    modelId: string,
    callbacks?: {
      onProgress?: (downloadedBytes: number, totalBytes: number) => void;
      throwIfCancelled?: () => void;
    },
  ): Promise<{ bytes: number }>;
  embedAudio(fileId: string): Promise<{ dim: number; vec: number[] }>;
  embedTexts(texts: string[]): Promise<number[][]>;
  backendAvailable(): boolean;
};

export type V2AnalysisFactoryArgs = {
  extensionId: string;
  effectivePermissions: readonly string[];
  /** Index reads used to resolve and liveness-check the inference target. */
  library: V2LibraryReadPorts;
  /** Readable Library roots + path primitives; hosts without them cannot analyze. */
  reads?: V2ReadableRootsPorts;
  analysis?: V2AnalysisPorts;
};

function denied(permission: string, extensionId: string): V2OperationError {
  return new V2OperationError(
    "permission-denied",
    `Extension "${extensionId}" lacks the "${permission}" permission for this operation; grant it to use the command.`,
  );
}

export function createV2AnalysisOperations(args: V2AnalysisFactoryArgs): V2AnalysisOperations {
  const extensionId = args.extensionId;
  const granted = new Set(args.effectivePermissions);
  const require = (permission: "embeddings:read" | "embeddings:write" | "files:read"): void => {
    if (!granted.has(permission)) throw denied(permission, extensionId);
  };
  const ports = (): V2AnalysisPorts => {
    if (!args.analysis) {
      throw new V2OperationError(
        "input-invalid",
        `Analysis is not supported by this host binding; extension "${extensionId}" cannot reach it here.`,
      );
    }
    return args.analysis;
  };
  const reads = (): V2ReadableRootsPorts => {
    if (!args.reads) {
      throw new V2OperationError(
        "input-invalid",
        `Analysis file reads are not supported by this host binding; extension "${extensionId}" cannot reach them here.`,
      );
    }
    return args.reads;
  };

  return {
    modelStatus(modelId: string): V2ModelStatus {
      require("embeddings:read");
      return ports().modelStatus(modelId);
    },
    async downloadModel(
      modelId: string,
      callbacks?: {
        onProgress?: (downloadedBytes: number, totalBytes: number) => void;
        isCancelled?: () => boolean;
      },
    ): Promise<{ bytes: number }> {
      require("embeddings:write");
      return ports().downloadModel(modelId, callbacks);
    },
    async embedAudio(fileId: string): Promise<{ dim: number; vec: number[] }> {
      // Inference decodes file content, so it needs the file-read
      // permission in addition to the analysis one.
      require("files:read");
      require("embeddings:read");
      // Resolve and authorize before touching the backend: a removed
      // sound or a path outside the current Library roots is rejected
      // here, and the backend only ever receives the approved path.
      const record = liveV2Record(args.library, fileId);
      const canonicalPath = await authorizeV2ReadableRecord(record, reads());
      return ports().embedAudio({ fileId: record.id, canonicalPath });
    },
    embedTexts(texts: string[]): Promise<number[][]> {
      require("embeddings:read");
      return ports().embedTexts(texts);
    },
    backendAvailable(): boolean {
      require("embeddings:read");
      return ports().backendAvailable();
    },
  };
}

/** Deny-closed analysis services for hosts without analysis ports. */
export function denyV2AnalysisOperations(extensionId: string): V2AnalysisOperations {
  const deny = (): never => {
    throw denied("embeddings:read", extensionId);
  };
  return {
    modelStatus: () => deny(),
    downloadModel: async () => deny(),
    embedAudio: async () => deny(),
    embedTexts: async () => deny(),
    backendAvailable: () => deny(),
  };
}
