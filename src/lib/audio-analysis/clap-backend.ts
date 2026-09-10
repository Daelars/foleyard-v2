import type { ClapBackend } from "./clap";

/**
 * transformers.js CLAP backend (#195). Loads the quantized towers
 * through the runtime's own cache pointed at our model store, so one
 * downloader owns the layout: status probes local-only, download
 * streams with progress, inference reuses the loaded models.
 * Dynamically imported on first use: merely installing the package
 * costs nothing at boot, and tests never touch it.
 */

type TransformersRuntime = {
  env: { cacheDir: string; allowRemoteModels?: boolean; allowLocalModels?: boolean };
  AutoProcessor: {
    from_pretrained(
      modelId: string,
      options?: Record<string, unknown>,
    ): Promise<{
      (audio: Float32Array, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
    }>;
  };
  AutoTokenizer: {
    from_pretrained(
      modelId: string,
      options?: Record<string, unknown>,
    ): Promise<
      (
        texts: string[],
        options?: Record<string, unknown>,
      ) => { input_ids?: unknown; attention_mask?: unknown }
    >;
  };
  ClapAudioModelWithProjection: {
    from_pretrained(
      modelId: string,
      options?: Record<string, unknown>,
    ): Promise<(inputs: Record<string, unknown>) => Promise<{ audio_embeds: { data: Float32Array } }>>;
  };
  ClapTextModelWithProjection: {
    from_pretrained(
      modelId: string,
      options?: Record<string, unknown>,
    ): Promise<
      (inputs: Record<string, unknown>) => Promise<{ text_embeds: { data: Float32Array; dims: number[] } }>
    >;
  };
};

type LoadedModels = {
  processor: (audio: Float32Array) => Promise<Record<string, unknown>>;
  audioModel: (inputs: Record<string, unknown>) => Promise<{ audio_embeds: { data: Float32Array } }>;
  tokenizer: (
    texts: string[],
    options?: Record<string, unknown>,
  ) => { input_ids?: unknown; attention_mask?: unknown };
  textModel: (
    inputs: Record<string, unknown>,
  ) => Promise<{ text_embeds: { data: Float32Array; dims: number[] } }>;
};

const loadedByDirectory = new Map<string, Promise<LoadedModels>>();

function normalize(vector: Float32Array): Float32Array {
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm === 0) return vector;
  const out = new Float32Array(vector.length);
  for (let index = 0; index < vector.length; index += 1) out[index] = vector[index]! / norm;
  return out;
}

async function runtime(): Promise<TransformersRuntime> {
  try {
    return (await import("@huggingface/transformers")) as unknown as TransformersRuntime;
  } catch {
    throw new Error(
      "CLAP inference needs the @huggingface/transformers package; see the auto-tag-v2 README for the install step.",
    );
  }
}

async function ensureLoaded(modelDir: string): Promise<LoadedModels> {
  const cached = loadedByDirectory.get(modelDir);
  if (cached) return cached;
  const pending = (async () => {
    const transformers = await runtime();
    transformers.env.cacheDir = modelDir;
    transformers.env.allowRemoteModels = false;
    transformers.env.allowLocalModels = true;
    const options = { local_files_only: true };
    const [processor, audioModel, tokenizer, textModel] = await Promise.all([
      transformers.AutoProcessor.from_pretrained(modelDir, options),
      transformers.ClapAudioModelWithProjection.from_pretrained(modelDir, {
        dtype: "q8",
        ...options,
      }),
      transformers.AutoTokenizer.from_pretrained(modelDir, options),
      transformers.ClapTextModelWithProjection.from_pretrained(modelDir, {
        dtype: "q8",
        ...options,
      }),
    ]);
    return {
      processor: (audio: Float32Array) => processor(audio),
      audioModel,
      tokenizer: (texts: string[], tokenizerOptions?: Record<string, unknown>) => tokenizer(texts, tokenizerOptions),
      textModel,
    };
  })();
  loadedByDirectory.set(modelDir, pending);
  try {
    return await pending;
  } catch (error) {
    loadedByDirectory.delete(modelDir);
    throw error;
  }
}

/** Production CLAP factory. It only reads the explicitly downloaded local model directory. */
export async function createClapBackend(modelDir: string): Promise<ClapBackend> {
  const models = await ensureLoaded(modelDir);
  return {
    async embedAudio(samples: Float32Array): Promise<Float32Array> {
      const inputs = await models.processor(samples);
      const { audio_embeds } = await models.audioModel(inputs);
      return normalize(audio_embeds.data);
    },
    async embedTexts(texts: string[]): Promise<Float32Array[]> {
      const inputs = models.tokenizer(texts, { padding: true, truncation: true });
      const { text_embeds } = await models.textModel(inputs);
      const dim = text_embeds.dims[1] ?? 512;
      const out: Float32Array[] = [];
      for (let row = 0; row < texts.length; row += 1) {
        out.push(normalize(text_embeds.data.slice(row * dim, (row + 1) * dim)));
      }
      return out;
    },
  };
}
