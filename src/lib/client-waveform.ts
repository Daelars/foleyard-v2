const WAVEFORM_CACHE_DB = "foleyard-waveform-cache";
const WAVEFORM_CACHE_STORE = "peaks";
const DB_VERSION = 1;
const PEAK_COUNT = 200;

function openCacheDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(WAVEFORM_CACHE_DB, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(WAVEFORM_CACHE_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

type CachedPeaks = { sourceVersion: string; peaks: number[] };

async function getCachedPeaks(
  fileId: string,
  sourceVersion: string,
): Promise<number[] | null> {
  try {
    const db = await openCacheDb();
    return await new Promise<number[] | null>((resolve) => {
      const tx = db.transaction(WAVEFORM_CACHE_STORE, "readonly");
      const req = tx.objectStore(WAVEFORM_CACHE_STORE).get(fileId);
      req.onsuccess = () => {
        const cached = req.result as CachedPeaks | number[] | undefined;
        resolve(
          !Array.isArray(cached) &&
          cached?.sourceVersion === sourceVersion &&
          Array.isArray(cached.peaks)
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

async function setCachedPeaks(
  fileId: string,
  sourceVersion: string,
  peaks: number[],
): Promise<void> {
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
    // Non-critical
  }
}

function computePeaksFromChannel(
  channelData: Float32Array,
  peakCount: number,
): number[] {
  const samplesPerPeak = Math.max(1, Math.floor(channelData.length / peakCount));
  const peaks: number[] = [];

  for (let i = 0; i < peakCount; i++) {
    const start = i * samplesPerPeak;
    const end = Math.min(channelData.length, start + samplesPerPeak);
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += Math.abs(channelData[j]);
    }
    peaks.push(end > start ? sum / (end - start) : 0);
  }

  const maxPeak = Math.max(...peaks, 0.001);
  return peaks.map((p) => Math.max(0.04, p / maxPeak));
}

export async function computeAndCachePeaks(
  fileId: string,
  sourceVersion: string,
  signal?: AbortSignal,
): Promise<number[]> {
  const cached = await getCachedPeaks(fileId, sourceVersion);
  if (cached) return cached;

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const url = `/api/audio?id=${encodeURIComponent(fileId)}`;
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Audio request failed with ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const ctx = new AudioContext();
  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
  } finally {
    await ctx.close();
  }

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const channelData = audioBuffer.getChannelData(0);
  const peaks = computePeaksFromChannel(channelData, PEAK_COUNT);

  if (!signal?.aborted) {
    await setCachedPeaks(fileId, sourceVersion, peaks);
  }

  return peaks;
}
