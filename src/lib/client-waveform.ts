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
        resolve(
          cached?.sourceVersion === sourceVersion &&
            Array.isArray(cached.peaks) &&
            cached.peaks.length === PEAK_COUNT &&
            cached.peaks.every((peak) => typeof peak === "number" && Number.isFinite(peak))
            ? cached.peaks
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

/** Server fallback for environments without Web Audio (tests, SSR) or rejected formats. */
async function fetchServerPeaks(fileId: string, sourceVersion: string, signal?: AbortSignal): Promise<number[]> {
  const response = await fetch(
    `/api/waveform?id=${encodeURIComponent(fileId)}&version=${encodeURIComponent(sourceVersion)}`,
    { signal, cache: "no-store" },
  );
  if (!response.ok) throw new Error(`Waveform request failed with ${response.status}`);
  const data: unknown = await response.json();
  const peaks = (data as { peaks?: unknown } | null)?.peaks;
  if (!Array.isArray(peaks) || !peaks.every((peak) => typeof peak === "number" && Number.isFinite(peak))) {
    throw new Error("Invalid waveform response");
  }
  return peaks;
}

/** Decode with the browser's native audio stack; fall back to the server on rejection. */
async function decodePeaks(fileId: string, sourceVersion: string): Promise<number[]> {
  const context = getDecoder();
  if (!context) return fetchServerPeaks(fileId, sourceVersion);
  // No cache:no-store here: the <audio> element fetches the same URL, so the
  // browser HTTP cache shares bytes instead of downloading twice.
  const response = await fetch(`/api/audio?id=${encodeURIComponent(fileId)}`);
  if (!response.ok) throw new Error(`Audio request failed with ${response.status}`);
  const bytes = await response.arrayBuffer();
  let buffer: AudioBuffer;
  try {
    buffer = await context.decodeAudioData(bytes);
  } catch {
    // Browser cannot decode this container (e.g. AIFF on Chromium): the
    // server's ffmpeg path covers it.
    return fetchServerPeaks(fileId, sourceVersion);
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
async function runPeaksTask(fileId: string, sourceVersion: string, key: string): Promise<number[]> {
  const cached = await cacheReadWithTimeout(fileId, sourceVersion);
  if (cached) {
    memory.set(key, cached);
    return cached;
  }
  const peaks = await decodePeaks(fileId, sourceVersion);
  memory.set(key, peaks);
  await setCachedPeaks(fileId, sourceVersion, peaks);
  return peaks;
}

/** Both list rows and the player read browser-decoded peaks with an IndexedDB cache. */
export async function computeAndCachePeaks(
  fileId: string,
  sourceVersion: string,
  signal?: AbortSignal,
): Promise<number[]> {
  const key = `${fileId}:${sourceVersion}`;
  const inMemory = memory.get(key);
  if (inMemory) return inMemory;
  let task = pending.get(key);
  if (!task) {
    task = runPeaksTask(fileId, sourceVersion, key);
    pending.set(key, task);
    const evict = () => {
      if (pending.get(key) === task) pending.delete(key);
    };
    task.then(evict, evict);
  }
  if (!signal) return task;
  return abortableWait(task, signal);
}
