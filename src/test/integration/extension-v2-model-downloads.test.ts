import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLAP_MODEL_ID } from "@/lib/audio-analysis/clap";

// Area: #289. One owner per analysis model across route bundles, proved
// through the real application analysis ports. Next compiles each route
// into its own bundle, so a per-module `downloading` set used to fork: two
// concurrent download commands each started a transfer. The port now
// resolves the process runtime's coordinator, so the second bundle sees
// the first bundle's active transfer — status reports `downloading`, and
// the second request is rejected rather than racing.

/** A fetch whose every body stays open until `release()` is called. */
function controlledFetch(): {
  fetchImpl: typeof fetch;
  release: () => void;
  state: { requests: number };
} {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const state = { requests: 0 };
  const fetchImpl: typeof fetch = async () => {
    state.requests += 1;
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        await gate;
        controller.enqueue(new Uint8Array(16));
        controller.close();
      },
    });
    return new Response(body, { status: 200 });
  };
  return { fetchImpl, release: () => release(), state };
}

let root = "";
const previousModelsDir = process.env.FOLEYARD_MODELS_DIR;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-model-port-"));
  process.env.FOLEYARD_MODELS_DIR = root;
});

afterEach(() => {
  if (previousModelsDir === undefined) delete process.env.FOLEYARD_MODELS_DIR;
  else process.env.FOLEYARD_MODELS_DIR = previousModelsDir;
  vi.unstubAllGlobals();
  vi.resetModules();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("analysis model downloads through the process runtime", () => {
  it("rejects a competing download issued by a second route bundle", async () => {
    const { fetchImpl, release, state } = controlledFetch();
    vi.stubGlobal("fetch", fetchImpl);

    vi.resetModules();
    const firstBundle = await import("@/lib/extensions-v2/analysis");
    vi.resetModules();
    const secondBundle = await import("@/lib/extensions-v2/analysis");

    const first = firstBundle.createV2AnalysisPorts();
    const second = secondBundle.createV2AnalysisPorts();

    const pending = first.downloadModel(CLAP_MODEL_ID, {});
    expect(first.modelStatus(CLAP_MODEL_ID).state).toBe("downloading");
    expect(second.modelStatus(CLAP_MODEL_ID).state).toBe("downloading");

    await expect(second.downloadModel(CLAP_MODEL_ID, {})).rejects.toMatchObject({
      code: "model-download-in-progress",
    });
    // The competing request never opened a second transfer.
    expect(state.requests).toBe(1);

    release();
    // The manifest has six files; each body is sixteen bytes.
    await expect(pending).resolves.toEqual({ bytes: 6 * 16 });
    expect(first.modelStatus(CLAP_MODEL_ID).state).toBe("ready");
    expect(second.modelStatus(CLAP_MODEL_ID).state).toBe("ready");
  });

  it("reports progress that includes resumed bytes after a cancellation", async () => {
    const { fetchImpl, release } = controlledFetch();
    vi.stubGlobal("fetch", fetchImpl);

    vi.resetModules();
    const ports = (await import("@/lib/extensions-v2/analysis")).createV2AnalysisPorts();

    let cancelling = false;
    const firstProgress: number[] = [];
    const pending = ports.downloadModel(CLAP_MODEL_ID, {
      onProgress: (done) => {
        firstProgress.push(done);
        if (done > 0) cancelling = true;
      },
      throwIfCancelled: () => {
        if (cancelling) throw new Error("cancelled");
      },
    });
    release();
    await expect(pending).rejects.toThrow("cancelled");
    // A partial config.json survives; nothing was promoted to a model file.
    expect(firstProgress[0]).toBe(0);
    expect(firstProgress.some((bytes) => bytes > 0)).toBe(true);

    // A retry reports the resumed bytes immediately instead of starting at 0.
    const retry = controlledFetch();
    vi.stubGlobal("fetch", retry.fetchImpl);
    const resumed: number[] = [];
    const retryPending = ports.downloadModel(CLAP_MODEL_ID, {
      onProgress: (done) => resumed.push(done),
    });
    retry.release();
    await retryPending;
    expect(resumed[0]).toBeGreaterThan(0);
  });
});
