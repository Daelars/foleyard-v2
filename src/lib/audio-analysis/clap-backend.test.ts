import { beforeEach, describe, expect, it, vi } from "vitest";

// The real runtime is injected: this suite counts how often each model
// directory is loaded, which is exactly what the bounded memo controls.
const loads = vi.hoisted(() => new Map<string, number>());

vi.mock("@huggingface/transformers", () => {
  const note = (modelId: string): void => {
    loads.set(modelId, (loads.get(modelId) ?? 0) + 1);
  };
  return {
    env: {},
    AutoProcessor: {
      from_pretrained: async (modelId: string) => {
        note(modelId);
        return async () => ({});
      },
    },
    AutoTokenizer: {
      from_pretrained: async (modelId: string) => {
        note(modelId);
        return () => ({});
      },
    },
    ClapAudioModelWithProjection: {
      from_pretrained: async (modelId: string) => {
        note(modelId);
        return async () => ({ audio_embeds: { data: new Float32Array([1, 0]) } });
      },
    },
    ClapTextModelWithProjection: {
      from_pretrained: async (modelId: string) => {
        note(modelId);
        return async () => ({ text_embeds: { data: new Float32Array([1, 0]), dims: [1, 2] } });
      },
    },
  };
});

import { createClapBackend, MAX_LOADED_MODEL_DIRECTORIES } from "./clap-backend";

// Area: #316. Loaded CLAP towers are the largest in-memory values the app
// holds, so the loader memo must not retain a bundle per model directory the
// process has ever seen: it keeps the most recent directories and reloads
// anything it evicted.

describe("createClapBackend loaded-model memo", () => {
  beforeEach(() => {
    loads.clear();
  });

  it("loads a model directory once and reuses it", async () => {
    await createClapBackend("dir-reuse");
    await createClapBackend("dir-reuse");
    // Four towers per directory: one load, not two.
    expect(loads.get("dir-reuse")).toBe(4);
  });

  it("bounds the memo and reloads an evicted directory", async () => {
    const first = "dir-first";
    await createClapBackend(first);
    expect(loads.get(first)).toBe(4);

    for (let index = 0; index < MAX_LOADED_MODEL_DIRECTORIES; index += 1) {
      await createClapBackend(`dir-${index}`);
    }

    // The first directory is now the least recently used and was evicted.
    await createClapBackend(first);
    expect(loads.get(first)).toBe(8);

    // The most recently loaded directory is still cached.
    const newest = `dir-${MAX_LOADED_MODEL_DIRECTORIES - 1}`;
    expect(loads.get(newest)).toBe(4);
    await createClapBackend(newest);
    expect(loads.get(newest)).toBe(4);
  });

  it("keeps memory bounded across many directories", async () => {
    for (let index = 0; index < 40; index += 1) {
      await createClapBackend(`dir-churn-${index}`);
    }
    // Only the newest directories are still memoized: the oldest reloads,
    // the newest does not.
    await createClapBackend("dir-churn-0");
    expect(loads.get("dir-churn-0")).toBe(8);
    await createClapBackend("dir-churn-39");
    expect(loads.get("dir-churn-39")).toBe(4);
  });
});
