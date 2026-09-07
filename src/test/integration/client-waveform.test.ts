import { beforeEach, expect, it, vi } from "vitest";

const PEAKS = 512;

/** Quiet first half, loud second half, right channel phase-inverted. */
function stereoBuffer(frames = 44100): AudioBuffer {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / 44100) * (i < frames / 2 ? 0.02 : 0.7);
    left[i] = sample;
    right[i] = -sample;
  }
  return {
    length: frames,
    numberOfChannels: 2,
    getChannelData: (channel: number) => (channel === 0 ? left : right),
  } as AudioBuffer;
}

async function freshModule() {
  vi.resetModules();
  return import("@/lib/client-waveform");
}

function firstFetchUrl(fetchSpy: ReturnType<typeof vi.fn>) {
  return (fetchSpy.mock.calls[0] as unknown as unknown[])[0];
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("decodes real quiet-to-loud peaks in parallel without touching /api/waveform", async () => {
  vi.stubGlobal(
    "OfflineAudioContext",
    class {
      async decodeAudioData() {
        return stereoBuffer();
      }
    },
  );
  const fetchSpy = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  vi.stubGlobal("fetch", fetchSpy);
  const { computeAndCachePeaks } = await freshModule();

  const [row, player] = await Promise.all([
    computeAndCachePeaks("file-1", "v1"),
    computeAndCachePeaks("file-1", "v1"),
  ]);
  expect(row).toHaveLength(PEAKS);
  expect(player).toEqual(row);
  // One shared fetch/decode for both callers; the server ffmpeg route is untouched.
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(firstFetchUrl(fetchSpy)).toBe("/api/audio?id=file-1");
  const average = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
  expect(average(row.slice(0, 200))).toBeLessThan(0.15);
  // Opposite stereo phases survive: a mono downmix would cancel to near zero.
  expect(average(row.slice(300))).toBeGreaterThan(0.6);
  expect(Math.max(...row)).toBeCloseTo(1, 3);

  // Repeat visit serves the in-memory cache with no further fetching.
  await computeAndCachePeaks("file-1", "v1");
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});

it("falls back to the server route where Web Audio is unavailable", async () => {
  vi.stubGlobal("OfflineAudioContext", undefined);
  vi.stubGlobal("AudioContext", undefined);
  const fetchSpy = vi.fn(async (url: string) => {
    if (typeof url === "string" && url.startsWith("/api/waveform")) {
      return { ok: true, json: async () => ({ peaks: Array(PEAKS).fill(0.5) }) };
    }
    throw new Error(`unexpected fetch of ${url}`);
  });
  vi.stubGlobal("fetch", fetchSpy);
  const { computeAndCachePeaks } = await freshModule();

  const peaks = await computeAndCachePeaks("file-2", "v1");
  expect(peaks).toEqual(Array(PEAKS).fill(0.5));
  expect(String(firstFetchUrl(fetchSpy))).toContain("/api/waveform");
});

it("rejects a pre-aborted caller without blocking others", async () => {
  vi.stubGlobal(
    "OfflineAudioContext",
    class {
      async decodeAudioData() {
        return stereoBuffer();
      }
    },
  );
  const fetchSpy = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  vi.stubGlobal("fetch", fetchSpy);
  const { computeAndCachePeaks } = await freshModule();

  const controller = new AbortController();
  controller.abort();
  await expect(computeAndCachePeaks("file-3", "v1", controller.signal)).rejects.toThrow();
});

it("survives a remount: an aborted first waiter does not fail the shared decode", async () => {
  vi.stubGlobal(
    "OfflineAudioContext",
    class {
      async decodeAudioData() {
        return stereoBuffer();
      }
    },
  );
  let releaseAudio!: (response: { ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }) => void;
  const audioGate = new Promise<{ ok: boolean; arrayBuffer: () => Promise<ArrayBuffer> }>(
    (resolve) => {
      releaseAudio = resolve;
    },
  );
  const fetchSpy = vi.fn(async () => audioGate);
  vi.stubGlobal("fetch", fetchSpy);
  const { computeAndCachePeaks } = await freshModule();

  // First mount starts the shared decode; the remount attaches while the
  // audio bytes are still in flight; then the first row unmounts.
  const firstController = new AbortController();
  const first = computeAndCachePeaks("file-4", "v1", firstController.signal);
  const secondController = new AbortController();
  const second = computeAndCachePeaks("file-4", "v1", secondController.signal);
  firstController.abort();
  releaseAudio({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });

  await expect(first).rejects.toThrow();
  const peaks = await second;
  expect(peaks).toHaveLength(PEAKS);
  expect(Math.max(...peaks)).toBeCloseTo(1, 3);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
});
