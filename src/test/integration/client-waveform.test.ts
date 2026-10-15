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
  expect(firstFetchUrl(fetchSpy)).toBe("/api/audio?id=file-1&recordRecent=0");
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

it("hands long files to the server peaks route without fetching the body (#232)", async () => {
  const decode = vi.fn();
  vi.stubGlobal(
    "OfflineAudioContext",
    class {
      async decodeAudioData() {
        decode();
        return stereoBuffer();
      }
    },
  );
  const fetchSpy = vi.fn(async (url: string) => {
    if (typeof url === "string" && url.startsWith("/api/waveform")) {
      return { ok: true, json: async () => ({ peaks: Array(180).fill(0.4) }) };
    }
    throw new Error(`unexpected fetch of ${url}`);
  });
  vi.stubGlobal("fetch", fetchSpy);
  const { computeAndCachePeaks } = await freshModule();

  const peaks = await computeAndCachePeaks("file-long", "v1", undefined, {
    sizeBytes: 64 * 1024 * 1024,
  });
  expect(peaks).toHaveLength(PEAKS);
  expect(String(firstFetchUrl(fetchSpy))).toContain("/api/waveform");
  expect(String(firstFetchUrl(fetchSpy))).toContain(`peaks=${PEAKS}`);
  expect(decode).not.toHaveBeenCalled();
});

it("caps simultaneous decode work (#232)", async () => {
  let active = 0;
  let peak = 0;
  vi.stubGlobal(
    "OfflineAudioContext",
    class {
      async decodeAudioData() {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return stereoBuffer();
      }
    },
  );
  const fetchSpy = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  vi.stubGlobal("fetch", fetchSpy);
  const { computeAndCachePeaks } = await freshModule();

  await Promise.all(
    Array.from({ length: 8 }, (_, index) => computeAndCachePeaks(`file-cap-${index}`, "v1")),
  );
  expect(peak).toBeLessThanOrEqual(4);
  expect(peak).toBeGreaterThan(1);
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

it("marks waveform byte reads so a row never records a Recent preview (#292)", async () => {
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

  await computeAndCachePeaks("file-marker", "v1");
  expect(firstFetchUrl(fetchSpy)).toBe("/api/audio?id=file-marker&recordRecent=0");
});

it("cancels the shared decode once its last subscriber leaves (#292)", async () => {
  vi.stubGlobal(
    "OfflineAudioContext",
    class {
      async decodeAudioData() {
        return stereoBuffer();
      }
    },
  );
  const signals: AbortSignal[] = [];
  // Never resolves on its own; rejects only when its signal aborts.
  const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
    const signal = init?.signal;
    if (signal) signals.push(signal);
    return await new Promise<never>((_resolve, reject) => {
      const onAbort = () => reject(new Error("aborted"));
      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  });
  vi.stubGlobal("fetch", fetchSpy);
  const { computeAndCachePeaks } = await freshModule();

  const first = new AbortController();
  const second = new AbortController();
  const firstRead = computeAndCachePeaks("file-shared", "v1", first.signal);
  const secondRead = computeAndCachePeaks("file-shared", "v1", second.signal);
  await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
  const sharedSignal = signals[0]!;
  expect(sharedSignal.aborted).toBe(false);

  // One row unmounting leaves a subscriber behind: the shared work continues.
  first.abort();
  await expect(firstRead).rejects.toThrow();
  expect(sharedSignal.aborted).toBe(false);

  // The last subscriber leaving cancels the abandoned decode.
  second.abort();
  await expect(secondRead).rejects.toThrow();
  expect(sharedSignal.aborted).toBe(true);
});

it("releases abandoned work so a later read starts fresh (#292)", async () => {
  vi.stubGlobal(
    "OfflineAudioContext",
    class {
      async decodeAudioData() {
        return stereoBuffer();
      }
    },
  );
  let calls = 0;
  const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
    calls += 1;
    if (calls === 1) {
      return await new Promise<never>((_resolve, reject) => {
        const signal = init?.signal;
        const onAbort = () => reject(new Error("aborted"));
        if (signal?.aborted) return onAbort();
        signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  });
  vi.stubGlobal("fetch", fetchSpy);
  const { computeAndCachePeaks } = await freshModule();

  const controller = new AbortController();
  const abandoned = computeAndCachePeaks("file-released", "v1", controller.signal);
  await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
  controller.abort();
  await expect(abandoned).rejects.toThrow();

  // The abandoned read left nothing behind: this read decodes again.
  const peaks = await computeAndCachePeaks("file-released", "v1");
  expect(peaks).toHaveLength(PEAKS);
  expect(fetchSpy).toHaveBeenCalledTimes(2);
});

it("bounds in-memory peak storage to the most recent rows (#292)", async () => {
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
  const { computeAndCachePeaks, MAX_MEMORY_ENTRIES } = await freshModule();

  const total = MAX_MEMORY_ENTRIES + 2;
  for (let index = 0; index < total; index++) {
    await computeAndCachePeaks(`memory-${index}`, "v1");
  }
  expect(fetchSpy).toHaveBeenCalledTimes(total);

  // The oldest entries fell out of the bound...
  await computeAndCachePeaks("memory-0", "v1");
  expect(fetchSpy).toHaveBeenCalledTimes(total + 1);

  // ...while the most recent entry is still served from memory.
  await computeAndCachePeaks(`memory-${total - 1}`, "v1");
  expect(fetchSpy).toHaveBeenCalledTimes(total + 1);
});

it("bounds the decode slot queue instead of growing it without limit (#292)", async () => {
  vi.stubGlobal(
    "OfflineAudioContext",
    class {
      async decodeAudioData() {
        // Hold every acquired slot open so the queue must fill up.
        return await new Promise<AudioBuffer>(() => {});
      }
    },
  );
  const fetchSpy = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  vi.stubGlobal("fetch", fetchSpy);
  const { computeAndCachePeaks, MAX_PEAK_JOB_WAITERS } = await freshModule();

  const outcomes: string[] = [];
  const total = MAX_PEAK_JOB_WAITERS + 5;
  for (let index = 0; index < total; index++) {
    computeAndCachePeaks(`queue-${index}`, "v1").then(
      () => outcomes.push("ok"),
      (error: Error) => outcomes.push(`error:${error.message}`),
    );
  }

  await vi.waitFor(() => {
    expect(outcomes.some((outcome) => outcome.startsWith("error:"))).toBe(true);
  });
  const failures = outcomes.filter((outcome) => outcome.startsWith("error:"));
  expect(failures).toEqual(["error:Too many waveform reads queued"]);
});

it("cancels abandoned rows during fast scrolling without leaving work running (#292)", async () => {
  vi.stubGlobal(
    "OfflineAudioContext",
    class {
      async decodeAudioData() {
        return stereoBuffer();
      }
    },
  );
  let passthrough = false;
  const signals: AbortSignal[] = [];
  const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
    const signal = init?.signal;
    if (signal) signals.push(signal);
    if (passthrough) return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    return await new Promise<never>((_resolve, reject) => {
      const onAbort = () => reject(new Error("aborted"));
      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  });
  vi.stubGlobal("fetch", fetchSpy);
  const { computeAndCachePeaks, MAX_PEAK_JOB_WAITERS: WAITERS } = await freshModule();

  // A viewport scrolls through more rows than can be decoded at once, then
  // every row unmounts before its decode completed.
  const controllers = Array.from(
    { length: WAITERS + 1 },
    () => new AbortController(),
  );
  const rows = controllers.map((controller, index) => {
    const row = computeAndCachePeaks(`scroll-${index}`, "v1", controller.signal);
    // Observe abandonment here so the rejection is never "unhandled"; the
    // assertions below still read the original promise's outcome.
    row.catch(() => {});
    return row;
  });
  await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(4));
  controllers.forEach((controller) => controller.abort());

  const outcomes = await Promise.allSettled(rows);
  expect(outcomes.every((outcome) => outcome.status === "rejected")).toBe(true);
  // Every decode that had started was cancelled, not left running.
  expect(signals).toHaveLength(4);
  expect(signals.every((signal) => signal.aborted)).toBe(true);

  // Nothing abandoned was retained: a returning row decodes freshly.
  passthrough = true;
  const peaks = await computeAndCachePeaks("scroll-0", "v1");
  expect(peaks).toHaveLength(PEAKS);
});
