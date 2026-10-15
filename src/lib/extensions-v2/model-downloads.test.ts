import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ModelManifest } from "@/lib/audio-analysis/models";
import { ModelDownloadCoordinator } from "./model-downloads";

// Area: #289. A model download has one owner. Concurrent requests for
// one model route through a single active transfer — the second is told
// the transfer already exists rather than starting a competing one —
// and the owner is the process-wide runtime, so two route bundles agree.
// The lock always clears, on success, failure, and cancellation.

/** A fetch whose body stays open until `release()` is called. */
function controlledFetch(): {
  fetchImpl: typeof fetch;
  release: () => void;
  state: { requests: number; cancelled: number };
} {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const state = { requests: 0, cancelled: 0 };
  const fetchImpl: typeof fetch = async () => {
    state.requests += 1;
    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        await gate;
        controller.enqueue(new Uint8Array(16));
        controller.close();
      },
      cancel() {
        state.cancelled += 1;
      },
    });
    return new Response(body, { status: 200 });
  };
  return { fetchImpl, release: () => release(), state };
}

function manifest(id: string): ModelManifest {
  return {
    id,
    displayName: "Test model",
    source: "http://example.invalid",
    estimatedBytes: 16,
    files: [{ path: "model.bin", url: "http://example.invalid/model.bin" }],
  };
}

let roots: string[] = [];

function tmpRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "foleyard-downloads-"));
  roots.push(root);
  return root;
}

beforeEach(() => {
  roots = [];
});

afterEach(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  roots = [];
});

describe("single-flight model downloads", () => {
  it("rejects a second concurrent transfer for the same model", async () => {
    const root = tmpRoot();
    const coordinator = new ModelDownloadCoordinator();
    const { fetchImpl, release, state } = controlledFetch();

    const first = coordinator.download(manifest("single-flight"), {}, { root, fetchImpl });
    expect(coordinator.isDownloading("single-flight")).toBe(true);

    await expect(
      coordinator.download(manifest("single-flight"), {}, { root, fetchImpl }),
    ).rejects.toMatchObject({ code: "model-download-in-progress" });
    // The second request never started a competing transfer.
    expect(state.requests).toBe(1);

    release();
    await expect(first).resolves.toEqual({ bytes: 16 });
    expect(coordinator.isDownloading("single-flight")).toBe(false);
  });

  it("lets distinct models download at the same time", async () => {
    const root = tmpRoot();
    const coordinator = new ModelDownloadCoordinator();
    const { fetchImpl, release } = controlledFetch();

    const first = coordinator.download(manifest("model-a"), {}, { root, fetchImpl });
    const second = coordinator.download(manifest("model-b"), {}, { root, fetchImpl });
    expect(coordinator.isDownloading("model-a")).toBe(true);
    expect(coordinator.isDownloading("model-b")).toBe(true);

    release();
    await expect(first).resolves.toEqual({ bytes: 16 });
    await expect(second).resolves.toEqual({ bytes: 16 });
  });

  it("clears the lock after a failure so a retry can start", async () => {
    const root = tmpRoot();
    const coordinator = new ModelDownloadCoordinator();
    const failing: typeof fetch = async () => new Response("nope", { status: 500 });

    await expect(
      coordinator.download(manifest("retry-model"), {}, { root, fetchImpl: failing }),
    ).rejects.toThrow("HTTP 500");
    expect(coordinator.isDownloading("retry-model")).toBe(false);

    const { fetchImpl, release } = controlledFetch();
    const retry = coordinator.download(manifest("retry-model"), {}, { root, fetchImpl });
    release();
    await expect(retry).resolves.toEqual({ bytes: 16 });
  });

  it("clears the lock when the active transfer is cancelled", async () => {
    const root = tmpRoot();
    const coordinator = new ModelDownloadCoordinator();
    const { fetchImpl, release } = controlledFetch();
    let cancelling = false;

    const pending = coordinator.download(
      manifest("cancel-lock"),
      {
        onProgress: (done) => {
          if (done > 0) cancelling = true;
        },
        throwIfCancelled: () => {
          if (cancelling) throw new Error("cancelled");
        },
      },
      { root, fetchImpl },
    );
    release();
    await expect(pending).rejects.toThrow("cancelled");
    expect(coordinator.isDownloading("cancel-lock")).toBe(false);
  });

  it("shares one owner across route bundles through the process runtime", async () => {
    const root = tmpRoot();
    vi.resetModules();
    const firstBundle = await import("./runtime");
    vi.resetModules();
    const secondBundle = await import("./runtime");

    const firstCoordinator = firstBundle.getV2Runtime().modelDownloads;
    const secondCoordinator = secondBundle.getV2Runtime().modelDownloads;
    // Two route bundles resolve the same process-owned coordinator, so a
    // download begun in one bundle is the active transfer seen by the other.
    expect(secondCoordinator).toBe(firstCoordinator);

    const { fetchImpl, release } = controlledFetch();
    const pending = firstCoordinator.download(manifest("shared-model"), {}, { root, fetchImpl });

    await expect(
      secondCoordinator.download(manifest("shared-model"), {}, { root, fetchImpl }),
    ).rejects.toMatchObject({ code: "model-download-in-progress" });

    release();
    await expect(pending).resolves.toEqual({ bytes: 16 });
  });
});
