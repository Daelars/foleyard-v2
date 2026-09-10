/**
 * Full-resolution peak count. Mirrors the server's WAVEFORM_PEAK_COUNT so
 * row/player peaks stay interchangeable with /api/waveform responses. Kept
 * local (not imported from waveform-generator) so node:fs / ffmpeg-static
 * never enter the browser bundle. Length checks on cache read catch drift.
 */
const PEAK_COUNT = 512;

/**
 * Browser-native waveform peaks. Rows and the player decode through the
 * Web Audio decoder in parallel instead of queueing behind the server's
 * ffmpeg slot, so lists feel instant with no disk-cache warmup. The server
 * /api/waveform route stays as a fallback for formats the browser rejects.
 */

const WAVEFORM_CACHE_DB = "foleyard-waveform-cache";
const WAVEFORM_CACHE_STORE = "peaks";
const DB_VERSION = 2;
/** Faint floor so near-silent sections still render a visible bar. */
const PEAK_FLOOR = 0.04;
/**
 * Long files above this size never stream through the renderer: the server
 * already generates peaks without transferring the body, so one small JSON
 * response replaces an unbounded download + decode (#232).
 */
const MAX_BROWSER_DECODE_BYTES = 32 * 1024 * 1024;
/** Bound simultaneous fetches/decodes so fast scrolling cannot pile work up. */
const MAX_CONCURRENT_PEAK_JOBS = 4;
let activePeakJobs = 0;
const peakJobWaiters: Array<() => void> = [];

async function withPeakJobSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activePeakJobs >= MAX_CONCURRENT_PEAK_JOBS) {
    await new Promise<void>((resolve) => peakJobWaiters.push(resolve));
  }
  activePeakJobs += 1;
  try {
    return await work();
  } finally {
    activePeakJobs -= 1;
    const next = peakJobWaiters.shift();
    if (next) next();
  }
}

const memory = new Map<string, number[]>();
const pending = new Map<string, Promise<number[]>>();

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WAVEFORM_CACHE_DB, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(WAVEFORM_CACHE_STORE)) {
        request.result.createObjectStore(WAVEFORM_CACHE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    // Another tab holding an older connection blocks the upgrade: never hang
    // the waveform pipeline on it, fall through to a live decode instead.
    request.onblocked = () => {
      try { request.result?.close(); } catch { /* best effort */ }
      reject(new Error("Waveform cache upgrade blocked"));
    };
  });
}

type CachedPeaks = { sourceVersion: string; peaks: number[] };

/** IndexedDB is a best-effort cache: bound the wait so rows always reach a live decode. */
const CACHE_READ_TIMEOUT_MS = 3000;

function cacheReadWithTimeout(fileId: string, sourceVersion: string): Promise<number[] | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (value: number[] | null) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }
    };
    const timer = setTimeout(() => done(null), CACHE_READ_TIMEOUT_MS);
    // Avoid keeping the process alive over a cache read in non-browser runtimes.
    (timer as unknown as { unref?: () => void }).unref?.();
    void getCachedPeaks(fileId, sourceVersion).then(
      (peaks) => done(peaks),
      () => done(null),
    );
  });
}

async function getCachedPeaks(fileId: string, sourceVersion: string): Promise<number[] | null> {
  try {
    const db = await openCacheDb();
    return await new Promise<number[] | null>((resolve) => {
      const tx = db.transaction(WAVEFORM_CACHE_STORE, "readonly");
      const req = tx.objectStore(WAVEFORM_CACHE_STORE).get(fileId);
      req.onsuccess = () => {
        const cached = req.result as CachedPeaks | undefined;
        // Any supported resolution is accepted and resampled, so a server
        // fallback written at another resolution is reused instead of
        // re-downloading on every remount (#232).
        resolve(
          cached?.sourceVersion === sourceVersion &&
            Array.isArray(cached.peaks) &&
            cached.peaks.length > 0 &&
            cached.peaks.every((peak) => typeof peak === "number" && Number.isFinite(peak))
            ? resamplePeaks(cached.peaks, PEAK_COUNT)
            : null,
        );
        db.close();
      };
      req.onerror = () => {
        resolve(null);
        db.close();
      };
    });
  } catch {
    return null;
  }
}

async function setCachedPeaks(fileId: string, sourceVersion: string, peaks: number[]): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(WAVEFORM_CACHE_STORE, "readwrite");
      tx.objectStore(WAVEFORM_CACHE_STORE).put({ sourceVersion, peaks }, fileId);
      tx.oncomplete = () => {
        resolve();
        db.close();
      };
      tx.onerror = () => {
        reject(tx.error);
        db.close();
      };
    });
  } catch {
    // Non-critical: peaks still returned, just decoded again next visit.
  }
}

/** One shared decoder: no per-row AudioContext construction, no hardware limit. */
let decoder: BaseAudioContext | null = null;

function getDecoder(): BaseAudioContext | null {
  if (decoder) return decoder;
  try {
    if (typeof OfflineAudioContext !== "undefined") {
      decoder = new OfflineAudioContext(1, 1, 44100);
    } else if (typeof AudioContext !== "undefined") {
      decoder = new AudioContext();
    }
  } catch {
    decoder = null;
  }
  return decoder;
}

/**
 * Mean absolute amplitude per bin, summing every channel. Mixing down to
 * mono first would erase audio with opposite stereo phases; channel 0 alone
 * would drop hard-panned sound. Summing keeps both.
 */
function peaksFromAudioBuffer(buffer: AudioBuffer): number[] {
  const frames = buffer.length;
  if (!frames || !buffer.numberOfChannels) return Array(PEAK_COUNT).fill(0);
  const channels: Float32Array[] = [];
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    channels.push(buffer.getChannelData(channel));
  }
  const peakCount = PEAK_COUNT;
  const peaks = Array<number>(peakCount).fill(0);
  for (let index = 0; index < peakCount; index++) {
    const start = Math.floor((index * frames) / peakCount);
    const end = Math.max(start + 1, Math.floor(((index + 1) * frames) / peakCount));
    let sum = 0;
    for (let frame = start; frame < end; frame++) {
      for (const channelData of channels) {
        const sample = channelData[frame];
        sum += Number.isFinite(sample) ? Math.abs(sample) : 0;
      }
    }
    peaks[index] = sum / ((end - start) * channels.length);
  }
  const maximum = Math.max(...peaks, 0.001);
  return peaks.map((peak) => Math.max(PEAK_FLOOR, peak / maximum));
}

/** Linear resample so cached peaks at any supported resolution render at PEAK_COUNT. */
function resamplePeaks(peaks: number[], count: number): number[] {
  if (peaks.length === count) return peaks;
  const out = Array<number>(count).fill(0);
  for (let index = 0; index < count; index += 1) {
    const position = (index * (peaks.length - 1)) / Math.max(1, count - 1);
    const lower = Math.floor(position);
    const upper = Math.min(peaks.length - 1, lower + 1);
    const mix = position - lower;
    out[index] = peaks[lower]! * (1 - mix) + peaks[upper]! * mix;
  }
  return out;
}

/** Server fallback for environments without Web Audio (tests, SSR) or rejected formats. */
async function fetchServerPeaks(fileId: string, sourceVersion: string, signal?: AbortSignal): Promise<number[]> {
  const response = await fetch(
    `/api/waveform?id=${encodeURIComponent(fileId)}&version=${encodeURIComponent(sourceVersion)}&peaks=${PEAK_COUNT}`,
    { signal, cache: "no-store" },
  );
  if (!response.ok) throw new Error(`Waveform request failed with ${response.status}`);
  const data: unknown = await response.json();
  const peaks = (data as { peaks?: unknown } | null)?.peaks;
  if (!Array.isArray(peaks) || peaks.length === 0 || !peaks.every((peak) => typeof peak === "number" && Number.isFinite(peak))) {
    throw new Error("Invalid waveform response");
  }
  // Any supported server resolution is accepted and normalized so the caller
  // and the cache always hold the row/player peak count (#232).
  return resamplePeaks(peaks, PEAK_COUNT);
}

/**
 * Decode with the browser's native audio stack; fall back to the server on
 * rejection. Files larger than MAX_BROWSER_DECODE_BYTES skip the renderer
 * entirely and read the server's generated peaks, so an hour-long recording
 * never streams its whole body per row (#232).
 */
async function decodePeaks(
  fileId: string,
  sourceVersion: string,
  sizeBytes?: number | null,
  signal?: AbortSignal,
): Promise<number[]> {
  const context = getDecoder();
  if (!context) return fetchServerPeaks(fileId, sourceVersion, signal);
  if (typeof sizeBytes === "number" && Number.isFinite(sizeBytes) && sizeBytes > MAX_BROWSER_DECODE_BYTES) {
    return fetchServerPeaks(fileId, sourceVersion, signal);
  }
  // No cache:no-store here: the <audio> element fetches the same URL, so the
  // browser HTTP cache shares bytes instead of downloading twice. A bounded
  // prefix keeps even unknown-size files from streaming indefinitely.
  const response = await fetch(`/api/audio?id=${encodeURIComponent(fileId)}`, {
    signal,
    headers: { Range: `bytes=0-${MAX_BROWSER_DECODE_BYTES - 1}` },
  });
  if (!response.ok && response.status !== 206) {
    throw new Error(`Audio request failed with ${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_BROWSER_DECODE_BYTES) {
    return fetchServerPeaks(fileId, sourceVersion, signal);
  }
  let buffer: AudioBuffer;
  try {
    buffer = await context.decodeAudioData(bytes);
  } catch {
    // Browser cannot decode this container (e.g. AIFF on Chromium): the
    // server's ffmpeg path covers it.
    return fetchServerPeaks(fileId, sourceVersion, signal);
  }
  return peaksFromAudioBuffer(buffer);
}

/** Wait for the shared task without letting this caller's unmount kill it for others. */
function abortableWait<T>(task: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException("Aborted", "AbortError"));
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    task.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/**
 * Run the peaks job detached from any single caller's lifetime. A row that
 * unmounts mid-decode (remount churn, folder switches) must not fail the
 * shared in-flight decode a remounted row is about to await — that sequence
 * left every row blank with no error and no retry.
 */
async function runPeaksTask(
  fileId: string,
  sourceVersion: string,
  key: string,
  sizeBytes?: number | null,
): Promise<number[]> {
  const cached = await cacheReadWithTimeout(fileId, sourceVersion);
  if (cached) {
    memory.set(key, cached);
    return cached;
  }
  const peaks = await withPeakJobSlot(() =>
    decodePeaks(fileId, sourceVersion, sizeBytes),
  );
  memory.set(key, peaks);
  await setCachedPeaks(fileId, sourceVersion, peaks);
  return peaks;
}

/**
 * Both list rows and the player read browser-decoded peaks with an IndexedDB
 * cache. `options.sizeBytes` lets rows hand long files to the server peaks
 * route instead of streaming them through the renderer.
 */
export async function computeAndCachePeaks(
  fileId: string,
  sourceVersion: string,
  signal?: AbortSignal,
  options?: { sizeBytes?: number | null },
): Promise<number[]> {
  const key = `${fileId}:${sourceVersion}`;
  const inMemory = memory.get(key);
  if (inMemory) return inMemory;
  let task = pending.get(key);
  if (!task) {
    task = runPeaksTask(fileId, sourceVersion, key, options?.sizeBytes);
    pending.set(key, task);
    const evict = () => {
      if (pending.get(key) === task) pending.delete(key);
    };
    task.then(evict, evict);
  }
  if (!signal) return task;
  return abortableWait(task, signal);
}
