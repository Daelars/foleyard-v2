import { V2OperationError } from "./operations";

/**
 * Analysis backends for v2 handlers (#195).
 *
 * Model files download through the app's model store; inference runs
 * through an injected backend. Yard-core carries no weights, no
 * network, and no model runtime: the backend is a seam the
 * application fills, and handlers fail with a reason naming the
 * install step while it is empty.
 */

export type V2ModelState = "ready" | "not-downloaded" | "downloading";

export type V2ModelStatus = {
  modelId: string;
  state: V2ModelState;
  downloadedBytes: number;
  totalBytes: number;
  backendAvailable: boolean;
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
  embedAudio(fileId: string): Promise<{ dim: number; vec: number[] }>;
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
  const require = (permission: "embeddings:read" | "embeddings:write"): void => {
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
    embedAudio(fileId: string): Promise<{ dim: number; vec: number[] }> {
      require("embeddings:read");
      return ports().embedAudio(fileId);
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
