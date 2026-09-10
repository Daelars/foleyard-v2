import type { ModelManifest } from "./models";

/**
 * CLAP inference seam (#195). File layout verified against the
 * HuggingFace file list for `Xenova/clap-htsat-unfused` (transformers.js
 * runtime, feature-extraction plus zero-shot-audio-classification):
 * the quantized audio/text towers keep CPU inference practical.
 *
 * The backend is an injected seam, not a bundled runtime: onnxruntime
 * ships no Electron-ABI rebuild in this repo, so bundling it would
 * break the packaged desktop build. `setClapBackendFactory` fills the
 * seam (tests and a future opt-in install step); until then every
 * inference call fails with a reason naming the install instead of
 * pretending.
 */

export const CLAP_MODEL_ID = "Xenova/clap-htsat-unfused";

/**
 * Rough size of the quantized manifest below. Re-verify against the
 * source file list if it drifts; the download confirms actual bytes
 * and reports them, so consent always names a real number before the
 * full fetch.
 */
export const CLAP_ESTIMATED_BYTES = 400_000_000;

/** Zero-shot prompt template (CLAP convention). */
export function clapPrompt(label: string): string {
  return `This is a sound of ${label}`;
}

/** Minimum cosine to attach a semantic tag. */
export const SEMANTIC_THRESHOLD = 0.5;

/** Most semantic tags one file earns per run. */
export const SEMANTIC_TOP_K = 3;

export function clapManifest(
  source = "https://huggingface.co/Xenova/clap-htsat-unfused/resolve/main",
): ModelManifest {
  return {
    id: "clap-htsat-unfused",
    displayName: "CLAP audio tagging model (quantized)",
    source,
    estimatedBytes: CLAP_ESTIMATED_BYTES,
    files: [
      { path: "config.json", url: `${source}/config.json` },
      { path: "preprocessor_config.json", url: `${source}/preprocessor_config.json` },
      { path: "tokenizer.json", url: `${source}/tokenizer.json` },
      { path: "tokenizer_config.json", url: `${source}/tokenizer_config.json` },
      { path: "onnx/audio_model_quantized.onnx", url: `${source}/onnx/audio_model_quantized.onnx` },
      { path: "onnx/text_model_quantized.onnx", url: `${source}/onnx/text_model_quantized.onnx` },
    ],
  };
}

export type ClapBackend = {
  /** Raw mono samples at any rate; the backend resamples to 48 kHz. */
  embedAudio(samples: Float32Array, sampleRate: number): Promise<Float32Array>;
  embedTexts(texts: string[]): Promise<Float32Array[]>;
  close?: () => Promise<void>;
};

export type ClapBackendFactory = (modelDir: string) => Promise<ClapBackend>;

let factory: ClapBackendFactory | null = null;

/** Fill the inference seam (tests, or a future opt-in install step). */
export function setClapBackendFactory(next: ClapBackendFactory | null): void {
  factory = next;
}

export function isClapBackendAvailable(): boolean {
  return factory !== null;
}

export async function loadClapBackend(modelDir: string): Promise<ClapBackend> {
  if (!factory) {
    throw new Error(
      "CLAP inference is not installed. Semantic tagging needs an inference runtime; see the auto-tag-v2 README for the install step.",
    );
  }
  return factory(modelDir);
}
