import {
  CLAP_MODEL_ID,
  clapManifest,
  isClapBackendAvailable,
  loadClapBackend,
  setClapBackendFactory,
} from "@/lib/audio-analysis/clap";
import { createClapBackend } from "@/lib/audio-analysis/clap-backend";
import { downloadModel, getModelsDir, modelDirFor, modelStatus } from "@/lib/audio-analysis/models";
import type { V2AnalysisPorts, V2ModelStatus } from "@yard-core";

// `decode.ts` pulls `ffmpeg-static` into the static import graph, so it
// stays a dynamic import: catalog, availability, and status reads must
// never pay the audio-decode native chain. Only `embedAudio` loads it,
// on first inference.

/**
 * Application analysis ports for v2 operations (#195). Only the CLAP
 * model is known: any other model id fails with a reason. Downloads
 * stream through the model store with progress and cancellation;
 * inference resolves the injected backend, which fails naming the
 * install step until one is provided.
 *
 * Audio inference is a guarded file read (#268): core authorizes the
 * sound and passes the canonical, Library-contained path, so this
 * adapter never resolves the index or decodes a raw indexed path.
 */

export type V2AnalysisDeps = {
  analysis?: V2AnalysisPorts;
};

const downloading = new Set<string>();

// Composition owns the concrete runtime. Importing it does not load weights;
// the factory opens the local, consent-downloaded model on first inference.
setClapBackendFactory(createClapBackend);

function requireClap(modelId: string): void {
  if (modelId !== CLAP_MODEL_ID) {
    throw new Error(
      `Unknown analysis model ${JSON.stringify(modelId)}; this host serves ${CLAP_MODEL_ID}.`,
    );
  }
}

/** Repository-backed analysis ports; pass deps only in tests. */
export function createV2AnalysisPorts(deps: V2AnalysisDeps = {}): V2AnalysisPorts {
  const ports = deps.analysis;
  return {
    modelStatus: (modelId): V2ModelStatus => {
      if (ports) return ports.modelStatus(modelId);
      requireClap(modelId);
      const manifest = clapManifest();
      const status = modelStatus(manifest);
      return {
        modelId,
        state: status.ready ? "ready" : downloading.has(modelId) ? "downloading" : "not-downloaded",
        downloadedBytes: status.downloadedBytes,
        totalBytes: status.totalBytes,
        backendAvailable: isClapBackendAvailable(),
      };
    },
    downloadModel: async (modelId, callbacks) => {
      if (ports) return ports.downloadModel(modelId, callbacks);
      requireClap(modelId);
      downloading.add(modelId);
      try {
        return await downloadModel(clapManifest(), {
          onProgress: callbacks?.onProgress,
          throwIfCancelled: callbacks?.throwIfCancelled,
        });
      } finally {
        downloading.delete(modelId);
      }
    },
    // The backend never resolves the index or reads a raw path itself:
    // core authorizes the sound and hands over the canonical path the
    // read guard approved (#268).
    embedAudio: async (source) => {
      if (ports) return ports.embedAudio(source);
      const backend = await loadClapBackend(modelDirFor(clapManifest(), getModelsDir()));
      const { decodeToMono48k } = await import("@/lib/audio-analysis/decode");
      const samples = await decodeToMono48k(source.canonicalPath);
      const vec = await backend.embedAudio(samples, 48000);
      return { dim: vec.length, vec: [...vec] };
    },
    embedTexts: async (texts) => {
      if (ports) return ports.embedTexts(texts);
      const backend = await loadClapBackend(modelDirFor(clapManifest(), getModelsDir()));
      const vecs = await backend.embedTexts(texts);
      return vecs.map((vec) => [...vec]);
    },
    backendAvailable: () => (ports ? ports.backendAvailable() : isClapBackendAvailable()),
  };
}
