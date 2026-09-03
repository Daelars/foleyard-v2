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

async function getCachedPeaks(fileId: string): Promise<number[] | null> {
  try {
    const db = await openCacheDb();
    return await new Promise<number[] | null>((resolve) => {
      const tx = db.transaction(WAVEFORM_CACHE_STORE, "readonly");
      const req = tx.objectStore(WAVEFORM_CACHE_STORE).get(fileId);
      req.onsuccess = () => {
        resolve(req.result ?? null);
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

async function setCachedPeaks(fileId: string, peaks: number[]): Promise<void> {
  try {
    const db = await openCacheDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(WAVEFORM_CACHE_STORE, "readwrite");
      tx.objectStore(WAVEFORM_CACHE_STORE).put(peaks, fileId);
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

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
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
  signal?: AbortSignal,
): Promise<number[]> {
  const cached = await getCachedPeaks(fileId);
  if (cached) return cached;

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const url = `/api/audio?id=${encodeURIComponent(fileId)}`;
  const response = await fetch(url, { signal });
  const arrayBuffer = await response.arrayBuffer();

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const ctx = getAudioContext();
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const channelData = audioBuffer.getChannelData(0);
  const peaks = computePeaksFromChannel(channelData, PEAK_COUNT);

  if (!signal?.aborted) {
    setCachedPeaks(fileId, peaks);
  }

  return peaks;
}
