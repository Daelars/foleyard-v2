// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createMetadataQueue } from "./metadata-queue";
import type { MetadataSeam } from "./types";

const RESULT = {
  filename: "a.wav",
  format: "wav",
  codec: "pcm_s16le",
  duration: 1,
  sampleRate: 44100,
  bitDepth: 16,
  channels: 2,
  fileSize: 1024,
};

function gateExtractor() {
  const gates = new Map<string, () => void>();
  const extract: MetadataSeam["extract"] = (filePath) =>
    new Promise((resolve) => {
      gates.set(filePath, () => resolve({ ...RESULT, filename: filePath }));
    });
  return { extract, gates };
}

function releaseAll(gates: Map<string, () => void>) {
  for (const release of [...gates.values()]) release();
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

describe("createMetadataQueue", () => {
  it("bounds the waiting list while still draining", async () => {
    const extract: MetadataSeam["extract"] = async (filePath) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return { ...RESULT, filename: filePath };
    };
    const results: string[] = [];
    const queue = createMetadataQueue(2, (record) => results.push(record.path), { extract }, () => {}, { capacity: 3 });

    let maxPending = 0;
    for (let i = 0; i < 20; i++) {
      await queue.enqueue({ filePath: `f${i}.wav`, fileSize: 1, filename: `f${i}.wav`, format: "wav" });
      const { pending, active } = queue.getCounts();
      maxPending = Math.max(maxPending, pending + active);
    }

    // Waiting jobs plus active work never exceed the admission bound even
    // though the producer submitted twenty tasks back to back.
    expect(maxPending).toBeLessThanOrEqual(5);
    await queue.onIdle();
    expect(results).toHaveLength(20);
  });

  it("wakes blocked producers on cancel", async () => {
    const { extract, gates } = gateExtractor();
    const queue = createMetadataQueue(1, () => {}, { extract }, () => {}, { capacity: 1 });

    await queue.enqueue({ filePath: "a.wav", fileSize: 1, filename: "a.wav", format: "wav" });
    await queue.enqueue({ filePath: "b.wav", fileSize: 1, filename: "b.wav", format: "wav" });

    const blocked = queue.enqueue({ filePath: "c.wav", fileSize: 1, filename: "c.wav", format: "wav" });
    const outcome = await Promise.race([
      blocked.then(() => "admitted" as const),
      new Promise<"waiting">((resolve) => setTimeout(() => resolve("waiting"), 50)),
    ]);
    expect(outcome).toBe("waiting");

    queue.cancel();
    await expect(blocked).rejects.toThrow("Metadata queue cancelled");
    releaseAll(gates);
  });

  it("exposes pending and active counts", async () => {
    const { extract, gates } = gateExtractor();
    const queue = createMetadataQueue(1, () => {}, { extract }, () => {}, { capacity: 4 });

    await queue.enqueue({ filePath: "a.wav", fileSize: 1, filename: "a.wav", format: "wav" });
    await queue.enqueue({ filePath: "b.wav", fileSize: 1, filename: "b.wav", format: "wav" });
    expect(queue.getCounts()).toEqual({ active: 1, pending: 1 });

    while (queue.getCounts().pending + queue.getCounts().active > 0) {
      releaseAll(gates);
      await tick();
    }
    expect(queue.getCounts()).toEqual({ active: 0, pending: 0 });
  });

  it("reports extractor failures through onError without stalling the rest", async () => {
    const onError = vi.fn();
    const failing: MetadataSeam = {
      extract: async (filePath) => {
        if (filePath === "bad.wav") throw new Error("boom");
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { ...RESULT, filename: filePath };
      },
    };
    const results: string[] = [];
    const queue = createMetadataQueue(2, (record) => results.push(record.path), failing, onError, { capacity: 4 });
    await queue.enqueue({ filePath: "bad.wav", fileSize: 1, filename: "bad.wav", format: "wav" });
    await queue.enqueue({ filePath: "good.wav", fileSize: 1, filename: "good.wav", format: "wav" });
    await queue.onIdle();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(results).toEqual(["good.wav"]);
  });
});